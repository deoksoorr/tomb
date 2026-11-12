"use client";

import { useEffect, useRef, useState } from "react";
import { bgm } from "@/components/bgm/engine";
import { bridge } from "@/game/bridge";
import { formatHauntTime } from "@/game/haunt/maze";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import s from "../rpg/rpg.module.css";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import h from "./haunt.module.css";
import { isBetter, readBest, saveBest, type HauntBest } from "./record";

// 귀신의집 (월드의 귀신의집 문 앞 E → portal:open {kind:"haunt"}). 혼자 하는 공포 미로 — 포인트 보상 없음.
// 들어가기 전 경고 → haunt:play(시드) → 미로 동안 위 작은 HUD·나가기·조이스틱 → haunt:ended → 결과(걸린 시간·놀란 횟수·내 최고 기록).
// 미로 안에서는 BGM을 잠시 멈춘다(무서운 정적) — 켜 두었던 경우만 나온 뒤 다시 튼다.

type Phase = "intro" | "playing" | "result";
type Outcome = { escaped: boolean; ms: number; scares: number; record: boolean };

function newSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
  }
}

/** 왼쪽 아래 가상 조이스틱 (손가락 조작 기기에서만 보인다) */
function Joystick() {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const R = r.width / 2;
    let x = (e.clientX - (r.left + R)) / R;
    let y = (e.clientY - (r.top + R)) / R;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    setKnob({ x, y });
    bridge.emit("haunt:joystick", { x, y });
  };
  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== id.current) return;
    id.current = null;
    setKnob({ x: 0, y: 0 });
    bridge.emit("haunt:joystick", { x: 0, y: 0 });
  };
  useEffect(() => () => bridge.emit("haunt:joystick", { x: 0, y: 0 }), []);
  return (
    <div
      ref={ref}
      className={cx(s.joystick, s.touchOnly)}
      aria-hidden="true"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (id.current !== null) return;
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => id.current === e.pointerId && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <span className={s.knob} style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }} />
    </div>
  );
}

function Hud({ onQuit }: { onQuit: () => void }) {
  const [hud, setHud] = useState<{ ms: number; scares: number } | null>(null);
  const [hint, setHint] = useState(true);
  useBridgeEvent("haunt:hud", setHud);
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 6000);
    return () => clearTimeout(t);
  }, []);
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div className={s.capture}>
      <div className={s.hudTop}>
        <div className={h.bar}>
          <span className={h.stat} aria-live="off">
            귀신의집 <strong>{formatHauntTime(hud?.ms ?? 0)}</strong> · 놀람 <strong>{hud?.scares ?? 0}</strong>
          </span>
          <button type="button" className={cx(ui.button, h.quit)} onPointerDown={stop} onClick={onQuit}>
            나가기
          </button>
        </div>
        {hint && (
          <p className={h.hint} role="status">
            어둠 속에서 출구(달빛이 새는 문)를 찾으세요
            <span className={s.keysHint}> · WASD/방향키 걷기 · Shift 뛰기 · Esc 나가기</span>
          </p>
        )}
      </div>
      <div className={s.hudBottom}>
        <Joystick />
      </div>
    </div>
  );
}

export default function HauntDialog({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [best, setBest] = useState<HauntBest | null>(readBest);
  const phaseRef = useRef<Phase>("intro");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  /** 들어갈 때 BGM이 켜져 있었는지 (나오면 다시 튼다) */
  const bgmWas = useRef(false);

  useBlockingLayer(phase === "playing");

  const restoreBgm = () => {
    if (!bgmWas.current) return;
    bgmWas.current = false;
    if (!bgm.getSnapshot().playing) bgm.play();
  };

  // 미로 도중 창이 내려가면 나가기로 끝낸다
  useEffect(
    () => () => {
      if (phaseRef.current === "playing") bridge.emit("haunt:quit");
      if (bgmWas.current && !bgm.getSnapshot().playing) bgm.play();
    },
    [],
  );

  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      bridge.emit("haunt:quit");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  function enter() {
    bgmWas.current = bgm.getSnapshot().playing;
    if (bgmWas.current) bgm.pause();
    setOutcome(null);
    phaseRef.current = "playing";
    setPhase("playing");
    bridge.emit("haunt:play", { seed: newSeed() });
  }

  useBridgeEvent("haunt:ended", ({ escaped, ms, scares }) => {
    if (phaseRef.current !== "playing") return;
    phaseRef.current = "result";
    restoreBgm();
    const prev = readBest();
    const record = escaped && isBetter(prev, { ms, scares });
    if (record) {
      const b = { ms, scares, at: Date.now() };
      saveBest(b);
      setBest(b);
    }
    setOutcome({ escaped, ms, scares, record });
    setPhase("result");
  });

  if (phase === "playing") return <Hud onQuit={() => bridge.emit("haunt:quit")} />;

  if (phase === "result" && outcome) {
    return (
      <Dialog title="귀신의집" onClose={onClose}>
        <div className={s.result}>
          <p className={s.resultBig}>{outcome.escaped ? "살아서 빠져나왔어요!" : "중간에 도망쳐 나왔어요"}</p>
          <div className={h.stats}>
            <div>
              <strong>{formatHauntTime(outcome.ms)}</strong>걸린 시간
            </div>
            <div>
              <strong>{outcome.scares}번</strong>놀람
            </div>
          </div>
          {outcome.record && <p className={h.record}>내 최고 기록이에요!</p>}
          {best && !outcome.record && (
            <p className={ui.hint}>
              내 최고 기록: {formatHauntTime(best.ms)} (놀람 {best.scares}번)
            </p>
          )}
          <div className={s.buttons}>
            <button type="button" className={cx(ui.button, ui.primary)} onClick={enter}>
              다시 들어가기
            </button>
            <button type="button" className={ui.button} onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="귀신의집" onClose={onClose}>
      <div className={s.result}>
        <p>
          낡은 집 안은 촛불 하나로는 앞이 잘 보이지 않는 미로예요. 들어갈 때마다 길이 조금씩 바뀌고,
          어둠 속 어딘가에 귀신들이 숨어 있어요. 혼자 출구를 찾아 빠져나와 보세요.
        </p>
        <div className={h.warn} role="note">
          <strong>주의</strong> 깜짝 놀라는 장면·큰 소리·번쩍임이 있어요.
          <br />
          기기의 &lsquo;동작 줄이기(움직임 줄이기)&rsquo;를 켜 두면 화면이 흔들리거나 번쩍이지 않고 귀신이 나타나기만 해요. 소리 크기는 설정의 효과음 음량을 따라요.
        </div>
        <p className={ui.hint}>
          포인트 보상은 없어요. {best ? `내 최고 기록: ${formatHauntTime(best.ms)} (놀람 ${best.scares}번)` : "아직 빠져나온 기록이 없어요."}
        </p>
        <div className={s.buttons}>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={enter}>
            들어가기
          </button>
          <button type="button" className={ui.button} onClick={onClose}>
            그만두기
          </button>
        </div>
      </div>
    </Dialog>
  );
}
