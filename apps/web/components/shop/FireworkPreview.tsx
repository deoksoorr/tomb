"use client";

import { useEffect, useRef } from "react";
import { itemById } from "@tomb/protocol";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { glow as glowTex, spark as sparkTex } from "@/game/sprites/fx";
import { cx } from "../ui/cx";
import { FEET, FireworkStage, STAGE_H, STAGE_W } from "./fireworkStage";
import styles from "./FireworkPreview.module.css";

/** 흰 텍스처를 색으로 물들인 사본 (Phaser tint처럼 곱하기). 색마다 한 번 */
const tintCache = new Map<string, HTMLCanvasElement>();
let base: { spark: HTMLCanvasElement; glow: HTMLCanvasElement } | null = null;

function tinted(kind: "spark" | "glow", color: number): HTMLCanvasElement {
  const key = `${kind}:${color}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  base ??= { spark: sparkTex(), glow: glowTex() };
  const src = base[kind];
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(src, 0, 0);
  tintCache.set(key, c);
  return c;
}

/** 하늘의 작은 별 (고정 자리) */
const STARS = Array.from({ length: 22 }, (_, i) => ({ x: (i * 97.3) % STAGE_W, y: ((i * 53.7) % (STAGE_H * 0.62)) + 3, a: 0.25 + ((i * 31) % 10) / 20 }));

function draw(ctx: CanvasRenderingContext2D, st: FireworkStage, k: number): void {
  const W = STAGE_W * k;
  const H = STAGE_H * k;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0a0c22");
  sky.addColorStop(0.75, "#1b1f44");
  sky.addColorStop(1, "#2a2a52");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  for (const s of STARS) {
    ctx.globalAlpha = s.a;
    ctx.fillRect(Math.round(s.x * k), Math.round(s.y * k), Math.max(1, Math.round(k * 0.6)), Math.max(1, Math.round(k * 0.6)));
  }
  // 터질 때 하늘이 밝아진다
  if (st.glow > 0.002) {
    ctx.globalAlpha = Math.min(0.22, st.glow * 0.3);
    ctx.fillStyle = "#ffe6c0";
    ctx.fillRect(0, 0, W, H);
  }
  // 땅과 묘비 실루엣, 쏘는 사람
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#14142a";
  ctx.fillRect(0, (FEET.y + 2) * k, W, H);
  for (const [x, w, h] of [[22, 8, 10], [48, 6, 7], [168, 8, 9], [196, 6, 7]] as const) ctx.fillRect(x * k, (FEET.y + 2 - h) * k, w * k, h * k);
  ctx.fillStyle = "#24243e";
  ctx.fillRect((FEET.x - 3) * k, (FEET.y - 11) * k, 6 * k, 6 * k);
  ctx.fillRect((FEET.x - 4) * k, (FEET.y - 5) * k, 8 * k, 7 * k);

  ctx.globalCompositeOperation = "lighter";
  ctx.imageSmoothingEnabled = true;
  for (const b of st.blooms) {
    const u = b.age / b.ms;
    const size = 64 * b.scale * (0.3 + 0.9 * u) * k;
    ctx.globalAlpha = 0.85 * (1 - u);
    ctx.drawImage(tinted("glow", b.color), b.x * k - size / 2, b.y * k - size / 2, size, size);
  }
  for (const h of st.heads) {
    const size = 64 * 0.2 * h.size * k;
    ctx.globalAlpha = h.alpha;
    ctx.drawImage(tinted("glow", h.color), h.x * k - size / 2, h.y * k - size / 2, size, size);
  }
  ctx.imageSmoothingEnabled = false;
  for (const p of st.sparks) {
    if (p.alpha <= 0.01) continue;
    const size = 5 * p.scale * k;
    ctx.globalAlpha = Math.min(1, p.alpha);
    ctx.drawImage(tinted("spark", p.color), p.x * k - size / 2, p.y * k - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/**
 * 폭죽 미리보기: 작은 밤하늘 무대에서 고른 폭죽이 어떻게 터지는지 반복 재생한다.
 * 게임과 같은 무늬 계산(fwShapes)과 불티 그림(fx.spark)을 쓴다. 소리는 없다.
 */
export default function FireworkPreview({ itemId, label = "", className }: { itemId: string; label?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const name = itemById(itemId)?.name ?? "폭죽";

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const stage = new FireworkStage(itemId, reduced, label);
    let k = 1;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || STAGE_W;
      k = (w * dpr) / STAGE_W;
      canvas.width = Math.round(STAGE_W * k);
      canvas.height = Math.round(STAGE_H * k);
    };
    fit();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    ro?.observe(canvas);
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      // 탭이 가려졌다 돌아오면 한꺼번에 몰아 계산하지 않는다
      const dt = Math.min(50, now - last);
      last = now;
      stage.step(dt);
      draw(ctx, stage, k);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [itemId, reduced, label]);

  return <canvas ref={ref} className={cx(styles.stage, className)} role="img" aria-label={`${name}이(가) 밤하늘에서 터지는 모습 미리보기`} />;
}
