"use client";

import { useEffect, useRef, useState } from "react";
import type { ChairMode } from "@/lib/chairman/rules";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import ChairSplash from "./ChairSplash";
import { buildIntroArt, makeIntroView } from "./introArt";
import { IntroSound } from "./introSound";
import { bolts, DOOR, FLASH_AT, FLASH_PEAK, heartTimes, INTRO_END, lineAt, lines, SPOT, STILL_AT, WALK_MS } from "./introTime";
import { SPLASH_MS } from "./splashArt";
import s from "./ChairEntry.module.css";

// 11/20 입장 연출 「지옥으로 가는 길」 (약 5.3초 · 클릭/E/Esc/스페이스/엔터로 건너뛰기 · 움직임 줄이기면 들킨 순간 한 장 + 짧은 페이드).
// 밤 돌길 → 피빛 폭풍·붉은 번개·빨간 빛줄기에 들킴 → 탑이 덮쳐 오고 문이 삐걱 열림 (introTime 시간표, introArt 그림, introSound 소리).
// 가장 하얄 때 회장님 등장 컷 (ChairSplash, 약 2.5초) → onEnter (chairman:enter — 회장실이 뜰 때까지 기다리는 약속)
// → 회장실이 뜨면 하얀빛이 걷히고 onEnd (내린다). 카드 중에 누르면 바로 onEnter.
// freezeAt = 개발 확인용 (그 시각 한 장에 멈춘다, 소리·진행 없음)

type Props = { me: { body: string; color: string; look: readonly string[] }; mode: ChairMode; onEnter: () => Promise<void>; onEnd: () => void; freezeAt?: number };

const REDUCED_HOLD = 1400;
/** 등장 컷 보이는 시간 (움직임 줄이기면 짧게) */
const CARD_MS = SPLASH_MS;
const CARD_REDUCED_MS = 1300;

export default function ChairIntro({ me, mode, onEnter, onEnd, freezeAt }: Props) {
  useBlockingLayer();
  const cv = useRef<HTMLCanvasElement>(null);
  const vig = useRef<HTMLDivElement>(null);
  const [reduced] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [line, setLine] = useState(() => (reduced ? 1 : freezeAt != null ? lineAt(freezeAt, mode) : -1));
  const [flash, setFlash] = useState<"off" | "in" | "out">("off");
  const [card, setCard] = useState(false);
  const skip = useRef<() => void>(() => undefined);

  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const portrait = innerHeight > innerWidth;
    const beats = heartTimes(mode);
    const view = makeIntroView(el, buildIntroArt(me), mode, portrait ? 200 : 427, portrait ? 300 : 240, beats);
    const paint = (ms: number, still: boolean) => {
      const f = view.draw(ms, still);
      el.style.transform = f.tf;
      const v = vig.current;
      if (v) {
        v.style.opacity = f.vig.toFixed(3);
        v.style.setProperty("--hot", f.hot.toFixed(3));
      }
    };
    if (freezeAt != null) {
      paint(freezeAt, false);
      // 글꼴(도장 글씨)이 늦게 오면 한 번 더
      void document.fonts?.ready.then(() => paint(freezeAt, false));
      return;
    }
    const snd = reduced ? null : new IntroSound();
    let raf = 0;
    let entered = false;
    let alive = true;
    const timers: number[] = [];
    let carding = false;
    const go = (fade: number) => {
      if (entered) return;
      entered = true;
      void onEnter().then(() => {
        if (!alive) return;
        setFlash("out");
        timers.push(window.setTimeout(onEnd, fade));
      });
    };
    /** 하얀 섬광 위 등장 컷 → 싸움. 컷 중 다시 누르면 바로 싸움 */
    const finish = (fade: number) => {
      if (entered) return;
      if (carding) return go(fade);
      carding = true;
      setFlash("in");
      setCard(true);
      snd?.stop(1.2);
      skip.current = () => go(fade);
      timers.push(window.setTimeout(() => go(fade), reduced ? CARD_REDUCED_MS : CARD_MS));
    };
    if (reduced) {
      paint(STILL_AT, true);
      timers.push(window.setTimeout(() => finish(300), REDUCED_HOLD));
      skip.current = () => finish(300);
    } else {
      // 소리 시간표 (지나가면 한 번씩)
      const cues: { at: number; fire: () => void }[] = [
        { at: 0, fire: () => snd?.start(WALK_MS / 1000, mode === "hell") },
        ...beats.map((b) => ({ at: b, fire: () => snd?.heart(b / WALK_MS) })),
        ...bolts(mode).map((b, i) => ({ at: b, fire: () => snd?.thunder(i === 0 ? 1 : 0.8) })),
        { at: SPOT.from + 120, fire: () => snd?.sting() },
        { at: DOOR.from, fire: () => snd?.creak((DOOR.open - DOOR.from) / 1000 + 0.25) },
        { at: FLASH_AT, fire: () => snd?.thunder(1.1) },
      ].sort((a, b) => a.at - b.at);
      let cue = 0;
      let shown = -1;
      const t0 = performance.now();
      let stage = 0;
      const loop = (now: number) => {
        // rAF 시각은 이 프레임 시작이라 t0보다 이를 수 있다
        const ms = Math.max(0, now - t0);
        try {
          paint(Math.min(ms, FLASH_PEAK), false);
        } catch {
          // 그리다 깨져도 갇히지 않게 바로 싸움으로
          stage = 3;
          snd?.stop(0.2);
          go(0);
          return;
        }
        while (cue < cues.length && ms >= cues[cue].at) {
          try {
            cues[cue].fire();
          } catch {
            // 소리는 없어도 된다
          }
          cue++;
        }
        const ln = lineAt(ms, mode);
        if (ln !== shown) {
          shown = ln;
          setLine(ln);
        }
        if (stage === 0 && ms >= FLASH_AT) {
          stage = 2;
          setFlash("in");
        }
        if (stage === 2 && ms >= FLASH_PEAK) {
          stage = 3;
          finish(INTRO_END - FLASH_PEAK);
          return;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      // 건너뛰기: 바로 하얗게 → 싸움
      skip.current = () => {
        if (stage >= 2) return;
        cancelAnimationFrame(raf);
        stage = 2;
        setFlash("in");
        setLine(-1);
        snd?.thunder(1);
        timers.push(
          window.setTimeout(() => {
            stage = 3;
            cancelAnimationFrame(raf);
            finish(INTRO_END - FLASH_PEAK);
          }, 220),
        );
      };
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyE" || e.code === "Escape" || e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        skip.current();
      }
    };
    addEventListener("keydown", onKey, true);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      removeEventListener("keydown", onKey, true);
      snd?.stop(0.15);
    };
    // 한 번만 (내 모습은 연출 동안 바뀌지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ls = lines(mode);
  return (
    <div className={s.intro} role="presentation" onPointerDown={() => skip.current()} data-out={flash === "out" || undefined} data-mode={mode} data-testid="chair-intro">
      <canvas ref={cv} className={s.introCanvas} aria-label="붉은 폭풍 속 판교의 등대로 걸어가는 내 캐릭터" />
      <div ref={vig} className={s.introVig} />
      {ls.map((l, i) => (
        <div key={i} className={s.introLine} data-on={line === i || undefined} data-big={l.big || undefined} data-k={i}>
          {l.text}
        </div>
      ))}
      <span className={s.introSkip}>눌러서 건너뛰기</span>
      <div className={s.flash} data-state={flash} />
      {card && <ChairSplash mode={mode} reduced={reduced} />}
    </div>
  );
}
