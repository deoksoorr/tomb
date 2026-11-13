"use client";

import { useEffect, useRef, useState } from "react";
import { bridge, type ForageRodPhase } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { AUTO_SYNC_MS, autoNextLabel } from "@/lib/forage/auto";
import { DAILY_CATCH_MAX, speciesById } from "@/lib/forage/catalog";
import { forageApi } from "@/lib/forage/client";
import { sunkenText } from "@/lib/forage/sunken";
import type { AutoFishResponse, AutoFishStatus, CastResponse, CatchResult, SunkenCatch } from "@/lib/forage/types";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { showToast } from "@/lib/hooks/useToasts";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { toastAutoCatch } from "./autoToast";
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
  onSunken,
  onLeave,
}: {
  spot: string;
  water: "lake" | "river";
  onCatch: (r: CatchResult) => void;
  /** 물에 빠진 꾸미기를 건졌을 때 (영구 소장) */
  onSunken: (c: SunkenCatch) => void;
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
  // 자동 낚시: 상태(서버가 준 값)와 다음 한 마리 예상 시각(performance.now 기준, 보이는 동안 표시용)
  const [auto, setAuto] = useState<AutoFishStatus | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const autoRef = useRef<AutoFishStatus | null>(null);
  const [nextAt, setNextAt] = useState(0);
  const [clock, setClock] = useState(0);

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
        if (r.gear) {
          // 물고기 대신 물에 빠진 꾸미기 (아주 드물게, 영구 소장). 다 가졌으면 대신 받은 희귀 물고기(result)
          const text = sunkenText(r.gear, (id) => speciesById(id)?.name ?? id);
          setMsg({ text, tone: "hot" });
          showToast(text, 6_000);
          if (r.gear.kept) {
            bridge.emit("forage:pop", { itemId: r.gear.id, sparkle: true });
            onSunken(r.gear);
          } else if (r.result) {
            bridge.emit("forage:pop", { itemId: r.result.id, sparkle: true });
            onCatch(r.result);
          }
          return;
        }
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
    if (autoRef.current) return;
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

  /** 서버 응답 반영 (켜짐·꺼짐·정산) */
  function applyAuto(r: AutoFishResponse, away: boolean) {
    forageStore.set(r.state);
    toastAutoCatch(r, away);
    const won = r.gear.find((g) => g.kept);
    if (won) {
      bridge.emit("forage:pop", { itemId: won.id, sparkle: true });
      onSunken(won);
    } else for (const it of r.items.slice(0, 3)) bridge.emit("forage:pop", { itemId: it.id });
    autoRef.current = r.auto;
    setAuto(r.auto);
    if (r.auto?.nextInMs != null) {
      const now = performance.now();
      setClock(now);
      setNextAt(now + r.auto.nextInMs);
    }
    if (!r.auto) {
      rod("idle");
      go("ready");
      if (r.ended === "time") setMsg({ text: "자동 낚시 시간이 다 됐어요 (한 번에 최대 6시간)" });
      else setMsg({ text: "자동 낚시를 껐어요. 찌를 던져 보세요" });
    }
  }

  function toggleAuto() {
    if (autoBusy) return;
    const p = phaseRef.current;
    if (!autoRef.current && p !== "ready" && p !== "done") return;
    setAutoBusy(true);
    if (autoRef.current) {
      forageApi
        .autoStop()
        .then((r) => applyAuto(r, false))
        .catch((e) => setMsg({ text: errorMessage(e), tone: "bad" }))
        .finally(() => setAutoBusy(false));
      return;
    }
    if (doneTimer.current) clearTimeout(doneTimer.current);
    rod("cast");
    forageApi
      .autoStart(spot, bridge.last("net:status")?.channel ?? null)
      .then((r) => {
        applyAuto(r, false);
        if (!r.auto) return;
        go("ready");
        rod("wait");
        setMsg({ text: "자동 낚시 중… 움직이거나 일어나면 꺼져요", tone: "good" });
      })
      .catch((e) => {
        rod("idle");
        setMsg({ text: errorMessage(e), tone: "bad" });
      })
      .finally(() => setAutoBusy(false));
  }

  // 자동 낚시 정산: 보이는 동안 AUTO_SYNC_MS마다, 숨었다가 돌아오면 바로. 숨은 동안은 부르지 않는다 (서버가 접속 시간으로 센다)
  const autoOn = auto !== null;
  useEffect(() => {
    if (!autoOn) return;
    let hiddenSince = document.hidden ? Date.now() : 0;
    const sync = (away: boolean) =>
      forageApi
        .autoSync()
        .then((r) => applyAuto(r, away))
        .catch(() => {
          // 다음 주기에 다시
        });
    const timer = setInterval(() => {
      if (!document.hidden) void sync(false);
    }, AUTO_SYNC_MS);
    const tick = setInterval(() => setClock(performance.now()), 5_000);
    const onVis = () => {
      if (document.hidden) hiddenSince = Date.now();
      else if (hiddenSince) {
        hiddenSince = 0;
        void sync(true);
      }
    };
    // 탭·창을 닫으면 끈다 (응답은 못 받는다 — 다음에 들어오면 ForageLayer가 남은 세션을 정산한다)
    const onHide = (e: PageTransitionEvent) => {
      if (!e.persisted && autoRef.current) forageApi.autoStopBeacon();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
    // applyAuto는 ref·setter만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOn]);

  // 창이 닫히면(움직임·일어남·배 젓기·장면 떠남) 자동 낚시를 끄고 그때까지 낚은 것을 정산한다
  useEffect(
    () => () => {
      if (!autoRef.current) return;
      autoRef.current = null;
      forageApi
        .autoStop()
        .then((r) => {
          forageStore.set(r.state);
          toastAutoCatch(r, false);
        })
        .catch(() => {
          // 다음에 들어오면 ForageLayer가 정산한다
        });
    },
    [],
  );

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

  const busy = phase === "casting" || phase === "sending" || autoBusy || auto !== null;
  const label = auto ? "자동 낚시 중" : phase === "bite" ? "지금 당기기!" : phase === "reel" ? "누르고 있으면 감기" : phase === "wait" ? "기다리는 중…" : busy ? "…" : "찌 던지기";
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
      {auto && (
        <p className={s.keys} role="status">
          {auto.limited
            ? `자동 낚시 중 · 오늘 ${auto.today}/${auto.cap} · 오늘 한도를 다 채웠어요`
            : `자동 낚시 중 · 오늘 ${auto.today}/${auto.cap} · 다음 한 마리까지 ${auto.nextInMs == null ? "—" : autoNextLabel(Math.max(0, nextAt - clock))}`}
        </p>
      )}
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
        <button
          type="button"
          className={cx(ui.button, auto ? ui.primary : ui.quiet)}
          onClick={toggleAuto}
          disabled={autoBusy || (!auto && phase !== "ready" && phase !== "done")}
          aria-pressed={auto !== null}
          title="자리를 비워도 접속해 있는 동안 천천히 낚아요"
        >
          {auto ? "자동 낚시 끄기" : "자동 낚시 켜기"}
        </button>
        <button type="button" className={cx(ui.button, ui.quiet)} onClick={onLeave} disabled={phase === "reel"}>
          일어나기
        </button>
      </div>
      <p className={s.keys}>Space·E 던지기/당기기 (감을 땐 누르고 있기) · Esc·방향키 일어나기</p>
    </div>
  );
}
