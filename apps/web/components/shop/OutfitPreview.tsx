"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DIR, type DirId } from "@tomb/protocol";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { FITTING_VIEWS, rotateView } from "./fitting";
import { OutfitStage, STAGE_H, STAGE_W } from "./outfitStage";
import styles from "./OutfitPreview.module.css";

type Props = {
  color: string;
  body: string;
  /** 미리보기에 입힐 꾸미기 (fittingLook 결과) */
  look: readonly string[];
  /** 스크린리더용 설명 (무엇을 입어 본 모습인지) */
  label: string;
};

const VIEW_NAMES: Partial<Record<DirId, string>> = { [DIR.down]: "앞모습", [DIR.right]: "옆모습", [DIR.up]: "뒷모습" };

/** 상점 입어 보기: 내 아바타가 고른 꾸미기를 입은 모습 (게임과 같은 그림, 정수 배율 캔버스) */
export default function OutfitPreview({ color, body, look, label }: Props) {
  const [dir, setDir] = useState<DirId>(DIR.down);
  const [walking, setWalking] = useState(true);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<OutfitStage | null>(null);
  const hintId = useId();
  const lookKey = look.join(",");

  // 고른 것·방향·자세가 바뀌면 루프를 새로 건다 (무대 상태는 이어져서 유령 친구가 자연스럽게 따라온다)
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const stage = (stageRef.current ??= new OutfitStage());
    const wear = lookKey ? lookKey.split(",") : [];
    const pose = { dir, walking };
    const l = { color, body, look: wear };
    if (reduced) {
      stage.draw(ctx, performance.now(), pose, l, true);
      return;
    }
    let raf = 0;
    const loop = (now: number) => {
      stage.draw(ctx, now, pose, l, false);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [color, body, lookKey, dir, walking, reduced]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setDir((d) => rotateView(d, e.key === "ArrowRight" ? 1 : -1));
  }

  const flowersIdle = look.includes("feet_flowers") && !walking;

  return (
    <div className={styles.preview} role="group" aria-label="입어 보기" onKeyDown={onKeyDown}>
      <canvas
        ref={canvasRef}
        className={styles.stage}
        width={STAGE_W}
        height={STAGE_H}
        tabIndex={0}
        role="img"
        aria-label={`${label} · ${VIEW_NAMES[dir] ?? ""} · ${walking ? "걷는 중" : "서 있는 중"}`}
        aria-describedby={hintId}
      />
      <div className={styles.controls}>
        <div className={styles.segment} role="group" aria-label="보는 방향">
          {FITTING_VIEWS.map((v) => (
            <button
              key={v.dir}
              type="button"
              className={cx(ui.button, styles.seg)}
              aria-pressed={dir === v.dir}
              aria-label={VIEW_NAMES[v.dir]}
              onClick={() => setDir(v.dir)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className={styles.segment} role="group" aria-label="자세">
          <button type="button" className={cx(ui.button, styles.seg)} aria-pressed={!walking} onClick={() => setWalking(false)}>
            서 있기
          </button>
          <button type="button" className={cx(ui.button, styles.seg)} aria-pressed={walking} onClick={() => setWalking(true)}>
            걷기
          </button>
        </div>
      </div>
      <p id={hintId} className={styles.hint} data-keys={flowersIdle ? undefined : ""}>
        {flowersIdle ? "걷기로 바꾸면 발자국마다 꽃이 피어요." : "← → 키로 돌려 볼 수 있어요."}
      </p>
    </div>
  );
}
