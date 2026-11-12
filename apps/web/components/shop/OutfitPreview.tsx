"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DIR, type DirId } from "@tomb/protocol";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { FITTING_VIEWS, rotateView } from "./fitting";
import { OutfitStage, STAGE_H, STAGE_W } from "./outfitStage";
import styles from "./OutfitPreview.module.css";

type Look = {
  color: string;
  body: string;
  /** 입힐 꾸미기 (fittingLook·currentLook 결과) */
  look: readonly string[];
};

type Props = Look & {
  /** 스크린리더용 설명 (무엇을 입어 본 모습인지) */
  label: string;
};

const VIEW_NAMES: Partial<Record<DirId, string>> = { [DIR.down]: "앞모습", [DIR.right]: "옆모습", [DIR.up]: "뒷모습" };

/** 무대 캔버스만 (가방 장비창은 칸 사이에 이것만 놓고, 버튼은 따로 둔다) */
export function OutfitCanvas({
  color,
  body,
  look,
  label,
  dir,
  walking,
  onRotate,
  describedBy,
  className,
}: Props & { dir: DirId; walking: boolean; onRotate?: (step: number) => void; describedBy?: string; className?: string }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<OutfitStage | null>(null);
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

  function onKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    if (!onRotate || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    onRotate(e.key === "ArrowRight" ? 1 : -1);
  }

  return (
    <canvas
      ref={canvasRef}
      className={cx(styles.stage, className)}
      width={STAGE_W}
      height={STAGE_H}
      tabIndex={onRotate ? 0 : undefined}
      role="img"
      aria-label={`${label} · ${VIEW_NAMES[dir] ?? ""} · ${walking ? "걷는 중" : "서 있는 중"}`}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
    />
  );
}

/** 방향(앞·옆·뒤)·자세(서 있기·걷기) 버튼 */
export function ViewControls({
  dir,
  walking,
  onDir,
  onWalking,
  className,
}: {
  dir: DirId;
  walking: boolean;
  onDir: (d: DirId) => void;
  onWalking: (w: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cx(styles.controls, className)}>
      <div className={styles.segment} role="group" aria-label="보는 방향">
        {FITTING_VIEWS.map((v) => (
          <button
            key={v.dir}
            type="button"
            className={cx(ui.button, styles.seg)}
            aria-pressed={dir === v.dir}
            aria-label={VIEW_NAMES[v.dir]}
            onClick={() => onDir(v.dir)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className={styles.segment} role="group" aria-label="자세">
        <button type="button" className={cx(ui.button, styles.seg)} aria-pressed={!walking} onClick={() => onWalking(false)}>
          서 있기
        </button>
        <button type="button" className={cx(ui.button, styles.seg)} aria-pressed={walking} onClick={() => onWalking(true)}>
          걷기
        </button>
      </div>
    </div>
  );
}

/** 방향·자세 상태 (무대와 버튼이 같이 쓴다) */
export function useOutfitView(initialWalking = true) {
  const [dir, setDir] = useState<DirId>(DIR.down);
  const [walking, setWalking] = useState(initialWalking);
  const rotate = (step: number) => setDir((d) => rotateView(d, step));
  return { dir, setDir, walking, setWalking, rotate };
}

/**
 * 상점 입어 보기: 내 아바타가 고른 꾸미기를 입은 모습 (게임과 같은 그림, 정수 배율 캔버스).
 * compact(기본) = 무대는 크게 두고 방향·자세 버튼은 한 줄에 작게 (상점 자세히 보기가 스크롤 없이 들어가게)
 */
export default function OutfitPreview({ color, body, look, label, className, compact = true }: Props & { className?: string; compact?: boolean }) {
  const { dir, setDir, walking, setWalking, rotate } = useOutfitView();
  const hintId = useId();
  const flowersIdle = look.includes("feet_flowers") && !walking;

  return (
    <div className={cx(styles.preview, className)} role="group" aria-label="입어 보기" data-compact={compact || undefined}>
      <OutfitCanvas color={color} body={body} look={look} label={label} dir={dir} walking={walking} onRotate={rotate} describedBy={hintId} />
      <ViewControls dir={dir} walking={walking} onDir={setDir} onWalking={setWalking} />
      <p id={hintId} className={styles.hint} data-keys={flowersIdle ? undefined : ""}>
        {flowersIdle ? "걷기로 바꾸면 발자국마다 꽃이 피어요." : "← → 키로 돌려 볼 수 있어요."}
      </p>
    </div>
  );
}
