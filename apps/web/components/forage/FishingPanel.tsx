"use client";

import { useEffect, useRef, useState } from "react";
import { bridge, type ForageRodPhase } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { DAILY_CATCH_MAX } from "@/lib/forage/catalog";
import { forageApi } from "@/lib/forage/client";
import type { CastResponse, CatchResult } from "@/lib/forage/types";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { forageStore, useForage } from "./forageStore";
import s from "./forage.module.css";

// 낚시 창 (낚시 자리에 앉아 있는 동안 화면 아래). 여는 동안 월드 키 입력을 막고 이 창이 조작을 맡는다.
//  ready → (Space/E/버튼) 던지기 → 기다림(가끔 톡톡 — 속임수) → 입질! → (제때 누르면) 챔질 → 줄다리기 → 잡았다/놓쳤다
// 줄다리기: 누르고 있으면 감기(진행↑, 장력↑), 떼면 장력이 풀린다. 물고기가 당길 때(꾹!) 계속 감으면 장력이 빨리 올라 끊어진다.
// 무엇이 걸렸는지는 서버만 안다 (끝내면 알려 준다). 진행 속도의 상한 = 서버가 준 reelMs (그보다 빨리 끝낼 수 없다).

type Phase = "ready" | "casting" | "wait" | "bite" | "reel" | "sending" | "done";
type Tone = "hot" | "good" | "bad" | undefined;

const KEYS = new Set(["Space", "KeyE", "KeyJ", "Enter"]);
/** 장력이 이 위로 올라가면 줄이 끊어진다 */
const SNAP_AT = 1;
/** 손을 놓고 이만큼 지나면 물고기가 도망간다 */
const SLACK_MS = 3_200;

export default function FishingPanel({
  spot,
  water,
  onCatch,
  onLeave,
}: {
  spot: string;
  water: "lake" | "river";
  onCatch: (r: CatchResult) => void;
  onLeave: () => void;
}) {
  useBlockingLayer(true);
  const { state } = useForage();
  const [phase, setPhase] = useState<Phase>("ready");
  const [msg, setMsg] = useState<{ text: string; tone?: Tone }>({ text: "찌를 던져 보세요" });
  const [view, setView] = useState({ progress: 0, tension: 0, surge: false });
  const phaseRef = useRef<Phase>("ready");
  const cast = useRef<(CastResponse & { biteAt: number; hookUntil: number; nibbleAt: number }) | null>(null);
  const holding = useRef(false);
  const reel = useRef({ progress: 0, tension: 0, last: 0, slackSince: 0, surgeUntil: 0, nextSurge: 0, sentAt: 0 });
  const raf = useRef(0);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const rod = (phase: ForageRodPhase, tension?: number) => bridge.emit("forage:rod", { phase, tension });

  /** 결과 보내기 (ok=false면 놓침 처리만) */
  function finish(ok: boolean, text: string, tone: Tone, rodPhase: ForageRodPhase) {
    const c = cast.current;
    cast.current = null;
    holding.current = false;
    rod(rodPhase);
    setMsg({ text, tone });
    go("sending");
    const done = () => {
      go("done");
      doneTimer.current = setTimeout(() => {
        if (phaseRef.current !== "done") return;
        go("ready");
        rod("idle");
        setMsg({ text: "한 번 더 던져 볼까요?" });
      }, 1_400);
    };
    if (!c) return done();
    forageApi
      .reel(c.ticket, ok)
      .then((r) => {
        forageStore.set(r.state);
        if (r.result) {
          onCatch(r.result);
          bridge.emit("forage:pop", { itemId: r.result.id });
        }
      })
      .catch((e) => setMsg({ text: errorMessage(e), tone: "bad" }))
      .finally(done);
  }

  function throwLine() {
    if (phaseRef.current !== "ready" && phaseRef.current !== "done") return;
    if (doneTimer.current) clearTimeout(doneTimer.current);
    go("casting");
    setMsg({ text: "휙—" });
    rod("cast");
    forageApi
      .cast(spot)
      .then((c) => {
        const now = performance.now();
        cast.current = { ...c, biteAt: now + c.biteInMs, hookUntil: now + c.biteInMs + c.hookMs * 0.8, nibbleAt: now + 1_500 + Math.random() * 2_500 };
        go("wait");
        rod("wait");
        setMsg({ text: "기다리는 중… 찌가 쑥 들어가면 당기세요" });
      })
      .catch((e) => {
        go("ready");
        rod("idle");
        setMsg({ text: errorMessage(e), tone: "bad" });
      });
  }

  /** 누름 (키 down / 버튼 down) */
  function press() {
    const p = phaseRef.current;
    if (p === "ready" || p === "done") return throwLine();
    if (p === "wait") return finish(false, "너무 일찍 당겼어요. 물고기가 놀라 도망갔어요", "bad", "escape");
    if (p === "bite") {
      const r = reel.current;
      const now = performance.now();
      r.progress = 0.08;
      r.tension = 0.25;
      r.last = now;
      r.slackSince = 0;
      r.surgeUntil = 0;
      r.nextSurge = now + 900 + Math.random() * 900;
      holding.current = true;
      go("reel");
      rod("reel", r.tension);
      setMsg({ text: "감아요! 물고기가 당기면 잠깐 놓아 주세요", tone: "good" });
      return;
    }
    if (p === "reel") holding.current = true;
  }
  function release() {
    holding.current = false;
  }

  // 키보드 (월드 키는 막혀 있다)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (e.code === "Escape" || e.code === "ArrowUp" || e.code === "ArrowDown" || e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "KeyW" || e.code === "KeyA" || e.code === "KeyS" || e.code === "KeyD") {
        // 줄다리기 중에는 실수로 일어나지 않게 Esc만
        if (phaseRef.current === "reel" && e.code !== "Escape") return;
        e.preventDefault();
        onLeave();
        return;
      }
      if (!KEYS.has(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      press();
    };
    const up = (e: KeyboardEvent) => {
      if (KEYS.has(e.code)) release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
    };
  });

  // 진행 루프: 입질 시각·속임수 톡톡·챔질 창·줄다리기
  useEffect(() => {
    const tick = () => {
      raf.current = requestAnimationFrame(tick);
      const now = performance.now();
      const p = phaseRef.current;
      const c = cast.current;
      if (p === "wait" && c) {
        if (now >= c.biteAt) {
          go("bite");
          rod("bite");
          setMsg({ text: "입질! 지금 당겨요!", tone: "hot" });
        } else if (now >= c.nibbleAt && c.biteAt - now > 900) {
          c.nibbleAt = now + 2_000 + Math.random() * 3_000;
          rod("nibble");
          setTimeout(() => phaseRef.current === "wait" && rod("wait"), 450);
        }
      } else if (p === "bite" && c && now > c.hookUntil) {
        finish(false, "놓쳤어요… 조금 더 빨리 당겨 봐요", "bad", "escape");
      } else if (p === "reel" && c) {
        const r = reel.current;
        const dt = Math.min(0.1, (now - r.last) / 1000);
        r.last = now;
        const power = c.power;
        if (now >= r.nextSurge && now >= r.surgeUntil) {
          r.surgeUntil = now + 500 + power * 120;
          r.nextSurge = r.surgeUntil + 900 + Math.random() * (1_800 - power * 150);
        }
        const surge = now < r.surgeUntil;
        if (holding.current) {
          r.progress += (dt * 1000) / c.reelMs - (surge ? dt * (0.05 + 0.025 * power) : 0);
          r.tension += dt * (0.22 + 0.08 * power) * (surge ? 2.6 : 1);
          r.slackSince = 0;
        } else {
          r.tension -= dt * 0.75;
          r.progress -= dt * 0.012 * power;
          r.slackSince ||= now;
        }
        r.progress = Math.max(0, Math.min(1, r.progress));
        r.tension = Math.max(0, r.tension);
        if (now - r.sentAt > 90) {
          r.sentAt = now;
          rod("reel", Math.min(1, r.tension));
          setView({ progress: r.progress, tension: Math.min(1, r.tension), surge });
        }
        if (r.tension >= SNAP_AT) finish(false, "툭… 줄이 끊어졌어요. 물고기가 당길 땐 놓아 주세요", "bad", "snap");
        else if (r.slackSince && now - r.slackSince > SLACK_MS) finish(false, "줄이 너무 느슨해서 물고기가 빠져나갔어요", "bad", "escape");
        else if (r.progress >= 1) finish(true, "잡았다!", "good", "catch");
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // finish·rod는 ref만 쓰는 함수라 매 렌더 새로 만들어져도 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 창이 닫히면 낚싯대를 거둔다
  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
      bridge.emit("forage:rod", { phase: "idle" });
    },
    [],
  );

  const busy = phase === "casting" || phase === "sending";
  const label = phase === "bite" ? "지금 당기기!" : phase === "reel" ? "누르고 있으면 감기" : phase === "wait" ? "기다리는 중…" : busy ? "…" : "찌 던지기";
  const caught = state?.today.fish ?? 0;

  return (
    <div className={s.dock} role="region" aria-label="낚시">
      <div className={s.dockHead}>
        <strong>낚시 · {water === "lake" ? "호수" : "강"}</strong>
        <span>
          오늘 {caught}/{DAILY_CATCH_MAX.fish}마리
        </span>
      </div>
      <p className={s.status} data-tone={msg.tone} role="status" aria-live="polite">
        {msg.text}
      </p>
      {phase === "reel" && (
        <>
          <div className={s.meter}>
            <span>끌어오기</span>
            <div className={s.track} role="meter" aria-label="끌어오기" aria-valuenow={Math.round(view.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${view.progress * 100}%` }} />
            </div>
          </div>
          <div className={s.meter}>
            <span style={view.surge ? { color: "#ffb070" } : undefined}>{view.surge ? "꾹!" : "장력"}</span>
            <div className={s.track} data-kind="tension" role="meter" aria-label="줄 장력" aria-valuenow={Math.round(view.tension * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${Math.min(100, view.tension * 100)}%` }} />
            </div>
          </div>
        </>
      )}
      <div className={s.actions}>
        <button
          type="button"
          className={cx(ui.button, ui.primary, s.big)}
          data-hot={phase === "bite"}
          disabled={busy || phase === "wait"}
          onPointerDown={(e) => {
            e.preventDefault();
            press();
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={release}
          onContextMenu={(e) => e.preventDefault()}
        >
          {label}
        </button>
        <button type="button" className={cx(ui.button, ui.quiet)} onClick={onLeave} disabled={phase === "reel"}>
          일어나기
        </button>
      </div>
      <p className={s.keys}>Space·E 던지기/당기기 (감을 땐 누르고 있기) · Esc·방향키 일어나기</p>
    </div>
  );
}
