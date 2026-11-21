"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { makeSplashView, ROAR_AT, SPLASH_STILL, type SplashMode, type SplashView } from "./splashArt";
import s from "./ChairEntry.module.css";

// 11/20 회장님 등장 컷 (하얀 섬광 위 이름 카드 자리): 화면을 꽉 채운 도트 회장님 + 이름판.
// 안경 번뜩 → 안경 잡기 → 집어던짐 → 빨간 눈 포효(이름판 쾅). 움직임 줄이기면 포효 한 장 + 짧은 페이드.
// freezeAt = 개발 확인용 (그 시각 한 장에 멈춘다)

type Props = { mode: SplashMode; reduced: boolean; freezeAt?: number };

// 11/21 포효 때 가운데 쾅 박히는 대사 (폰은 낱말마다 한 줄). 겉선 빨강 · 속선 검정 · 흰 글자를 세 겹으로 포갠다
const SLAM = ["사직서는", "반려다!!!"];
const SLAM_LAYERS = ["red", "ink", "face"] as const;

export default function ChairSplash({ mode, reduced, freezeAt }: Props) {
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    let view: SplashView;
    try {
      view = makeSplashView(el, mode, innerWidth, innerHeight);
    } catch {
      return;
    }
    el.style.transformOrigin = `${(view.focus[0] * 100).toFixed(1)}% ${(view.focus[1] * 100).toFixed(1)}%`;
    const still = reduced ? SPLASH_STILL : freezeAt;
    if (still != null) {
      el.style.transform = view.draw(still);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      try {
        el.style.transform = view.draw(Math.max(0, now - t0));
      } catch {
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, reduced, freezeAt]);

  const vars = { "--roar": `${ROAR_AT}ms`, "--t": `${-(freezeAt ?? 0)}ms` } as CSSProperties;
  return (
    <div className={s.splash} data-mode={mode} data-still={reduced || undefined} data-freeze={freezeAt != null || undefined} style={vars} data-testid="chair-namecard">
      <canvas ref={cv} className={s.splashCanvas} aria-label="안경을 집어던지고 눈이 빨개진 판교 회장님" />
      <div className={s.slamFlash} />
      <div className={s.slam} role="img" aria-label={SLAM.join(" ")}>
        <div className={s.slamIn}>
          {SLAM_LAYERS.map((k) => (
            <p key={k} className={s.slamL} data-k={k} aria-hidden>
              {SLAM.map((w, wi) => (
                <span key={wi} className={s.slamW}>
                  {[...w].map((ch, ci) => (
                    <span key={ci} className={s.slamC} style={{ "--i": wi * 5 + ci } as CSSProperties}>
                      {ch}
                    </span>
                  ))}
                </span>
              ))}
            </p>
          ))}
        </div>
      </div>
      {/* 11/21 사용자 「글자가 너무 많다」: 왼쪽 아래 이름판은 빼고 가운데 큰 대사 하나만 */}
      <div className={s.splashWhite} />
    </div>
  );
}
