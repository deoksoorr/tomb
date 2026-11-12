import type { DyeSpot } from "@/lib/dye/palette";

// 46번 염색 판 위 특수 색 무리(금빛 광택·반짝이·무지개·야광) 연출 — 캔버스 2D, 그리기만 (색 판정은 서버가 칸으로)

const unit = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * 금빛 광택 빛줄기의 색 멈춤 위치 3개 (모두 0~1). addColorStop은 0~1 밖이면 예외를 던진다 —
 * 예전엔 u-0.15가 1을 넘거나 u+0.15가 0보다 작은 순간이 있어, 금빛 무리가 화면에 들어오면(축소) 그리기 루프가 죽어 판이 멈췄다
 */
export function glintStops(t: number): [number, number, number] {
  const u = (((t * 0.6) % 1.6) + 1.6) % 1.6 - 0.3;
  return [unit(u - 0.15), unit(u), unit(u + 0.15)];
}

/** 화면 좌표·크기가 모두 유한한지 (그라디언트·arc는 NaN·무한대에 예외를 던진다) */
const finite = (...ns: number[]) => ns.every(Number.isFinite);

/** 판 위 특수 색 무리 연출 (그리기만 — 색 판정은 서버가 칸으로). 화면 밖 무리는 건너뛴다 */
export function drawSpots(ctx: CanvasRenderingContext2D, spots: readonly DyeSpot[], left0: number, top0: number, scale: number, w: number, h: number, now: number): void {
  if (!finite(left0, top0, scale, w, h, now) || scale <= 0) return;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const x = left0 + (s.x + 0.5) * scale;
    const y = top0 + (s.y + 0.5) * scale;
    const r = (s.r + 0.5) * scale;
    if (x + r * 2 < 0 || y + r * 2 < 0 || x - r * 2 > w || y - r * 2 > h) continue;
    const t = now / 1000 + i * 1.7;
    ctx.save();
    if (s.kind === "n") {
      // 야광: 둘레로 번지는 빛이 숨 쉬듯
      const glow = `#${s.glow.toString(16).padStart(6, "0")}`;
      const k = 0.35 + 0.25 * Math.sin(t * 2.4);
      const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2);
      g.addColorStop(0, glow);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = k;
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      if (s.kind === "r") {
        // 무지개: 색 조각이 천천히 돈다
        ctx.globalAlpha = 0.45;
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = `hsl(${Math.round((k * 60 + t * 90) % 360)}, 95%, 60%)`;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.arc(x, y, r, (k / 6) * Math.PI * 2 + t, ((k + 1) / 6) * Math.PI * 2 + t);
          ctx.fill();
        }
      } else if (s.kind === "g") {
        // 금빛 광택: 빛줄기가 비스듬히 지나간다
        const [s0, s1, s2] = glintStops(t);
        const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        g.addColorStop(s0, "rgba(255,255,255,0)");
        g.addColorStop(s1, "rgba(255,250,220,0.85)");
        g.addColorStop(s2, "rgba(255,255,255,0)");
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
      ctx.save();
    }
    if (s.kind === "s" || s.kind === "g") {
      // 반짝 별 (반짝이는 셋, 금빛은 하나)
      const n = s.kind === "s" ? 3 : 1;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#fffbe8";
      for (let k = 0; k < n; k++) {
        const ph = t * 1.3 + k * 2.1;
        const a = Math.max(0, Math.sin(ph * Math.PI));
        if (a < 0.05) continue;
        const cyc = Math.floor(ph);
        const ox = (((cyc * 37 + k * 11) % 13) / 13 - 0.5) * r * 1.2;
        const oy = (((cyc * 23 + k * 7) % 11) / 11 - 0.5) * r * 1.2;
        const len = Math.max(2, scale * 0.9) * (0.6 + a);
        ctx.globalAlpha = a;
        ctx.fillRect(x + ox - len, y + oy - 0.75, len * 2, 1.5);
        ctx.fillRect(x + ox - 0.75, y + oy - len, 1.5, len * 2);
      }
    }
    ctx.restore();
  }
}
