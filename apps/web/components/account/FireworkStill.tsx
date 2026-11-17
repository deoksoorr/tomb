"use client";

import { useEffect, useRef } from "react";
import { drawStage } from "../shop/FireworkPreview";
import { STAGE_H, STAGE_W, stillScene, type StageSnapshot } from "../shop/fireworkStage";
import { cx } from "../ui/cx";
import styles from "../shop/FireworkPreview.module.css";

// 폭죽 창 카드의 작은 정지 그림: 미리보기 무대와 같은 계산으로 한 번 터뜨려, 가장 활짝 핀 장면을 그린다.
// 계산은 카드마다 한 프레임씩 나눠서 (창을 열 때 한꺼번에 멈칫하지 않게), 결과는 폭죽·이름마다 기억한다.

const scenes = new Map<string, StageSnapshot>();
const queue: (() => void)[] = [];
let busy = false;

function pump(): void {
  const job = queue.shift();
  if (!job) {
    busy = false;
    return;
  }
  busy = true;
  job();
  requestAnimationFrame(pump);
}

function later(job: () => void): () => void {
  let live = true;
  queue.push(() => live && job());
  if (!busy) requestAnimationFrame(pump);
  return () => {
    live = false;
  };
}

/** 정지 그림에서 보여 줄 무대 영역 (무대와 같은 22:15) */
function stillView(scene: StageSnapshot): { x: number; y: number; w: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of scene.sparks) {
    if (p.alpha < 0.15) continue;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: STAGE_W };
  const a = STAGE_H / STAGE_W;
  const w = Math.min(STAGE_W, Math.max(STAGE_W / 2, (x1 - x0) * 1.3 + 16, ((y1 - y0) * 1.3 + 16) / a));
  const h = w * a;
  const x = Math.max(0, Math.min(STAGE_W - w, (x0 + x1) / 2 - w / 2));
  const y = Math.max(0, Math.min(STAGE_H - h, (y0 + y1) / 2 - h / 2));
  return { x, y, w };
}

export default function FireworkStill({ itemId, label = "", className }: { itemId: string; label?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const paint = (scene: StageSnapshot) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const k = ((canvas.clientWidth || STAGE_W / 2) * dpr) / STAGE_W;
      canvas.width = Math.round(STAGE_W * k);
      canvas.height = Math.round(STAGE_H * k);
      // 작은 카드에서도 무늬가 보이게 불꽃 둘레만 당겨 본다 (무대 밖으로는 넘지 않게, 최대 2배)
      const v = stillView(scene);
      const z = STAGE_W / v.w;
      ctx.setTransform(z, 0, 0, z, -v.x * k * z, -v.y * k * z);
      drawStage(ctx, scene, k);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
    const key = `${itemId}\n${label}`;
    const hit = scenes.get(key);
    if (hit) {
      paint(hit);
      return;
    }
    return later(() => {
      const scene = stillScene(itemId, label);
      scenes.set(key, scene);
      paint(scene);
    });
  }, [itemId, label]);

  return <canvas ref={ref} className={cx(styles.stage, className)} aria-hidden="true" />;
}
