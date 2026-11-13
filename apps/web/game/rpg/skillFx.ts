import * as Phaser from "phaser";
import { BRANCH_INFO, type BranchId } from "@/lib/rpg/skillTree";

// 스킬 연출 엔진 (모닥불 · 서리 · 넋). 특정 게임 그림을 쓰지 않고 코드로 그린 빛·불꽃·얼음·넋 텍스처를 겹겹이 쌓는다.
//  - 입자는 풀(재사용 이미지)에서 꺼내 한 번의 update 루프로 움직인다 (트윈을 입자마다 만들지 않는다 → 휴대폰도 60fps 목표)
//    속도·중력·끌림·늘어남(속도 방향으로 길게 = 불티 줄)·궤도(소용돌이·회오리) 를 입자 하나가 다 한다
//  - 부드러운 빛(빛 덩어리·불꽃·안개·고리)은 선형 필터로 만들어 크게 키워도 계단이 지지 않는다 (게임은 pixelArt라 기본이 최근접)
//  - 화면 전체 연출 (궁극기·범위기, 글자 없음): 암전 → 대형 광원 플래시 → 화면을 가로지르는 큰 그림(불기둥 벽·얼음 결정·넋 소용돌이) → 가루 → 밝기 복귀
//    큰 그림은 런타임에 캔버스로 한 번 그려 캐시한 텍스처(색을 구워 둠)를 크기·회전·흔들림으로 움직인다 (bigs 층)
// 움직임 줄이기면: 흔들림·번쩍·줌 없이 입자도 적게. 휴대폰(손가락 기기·작은 화면)은 입자 상한을 낮게.

export const DEPTH_FX = 1e5 + 50;
export const DEPTH_GROUND = -440;
const DEPTH_SCREEN = 2e6;
/** 번쩍임 사이 최소 간격 (초당 3번 이하) */
const FLASH_GAP_MS = 340;

export const SKT = {
  glow: "skfx-glow",
  ember: "skfx-ember",
  shard: "skfx-shard",
  wisp: "skfx-wisp",
  rune: "skfx-rune",
  pillar: "skfx-pillar",
  flame: "skfx-flame",
  streak: "skfx-streak",
  star: "skfx-star",
  cloud: "skfx-cloud",
  icicle: "skfx-icicle",
  spike: "skfx-spike",
  ring: "skfx-ring",
  ringThin: "skfx-ring-thin",
  flower: "skfx-flower",
  crack: "skfx-crack",
  crescent: "skfx-crescent",
  vignette: "skfx-vignette",
  band: "skfx-band",
  tomb: "skfx-tomb",
  hand: "skfx-hand",
  log: "skfx-log",
  emEmber: "skfx-emblem-ember",
  emFrost: "skfx-emblem-frost",
  emSoul: "skfx-emblem-soul",
  // 큰 그림 텍스처 (색을 구워 둔다 · 한 번만 그려 캐시): 화면 전체 연출·폭발 꽃
  bigFlame: "skfx-big-flame",
  bigFlame2: "skfx-big-flame-2",
  flameWave: "skfx-flame-wave",
  crystal: "skfx-crystal",
  cluster: "skfx-crystal-cluster",
  ghost: "skfx-ghost",
  rays: "skfx-rays",
  streakH: "skfx-streak-h",
  shock: "skfx-shock",
  swirl: "skfx-swirl",
  smoke: "skfx-smoke",
  vigW: "skfx-vignette-white",
} as const;

type Pal = { main: number; light: number; dark: number; parts: number[]; tex: string; blend: boolean };

export const PALETTES: Record<BranchId, Pal> = {
  ember: { main: BRANCH_INFO.ember.color, light: BRANCH_INFO.ember.light, dark: BRANCH_INFO.ember.dark, parts: [0xffe8a0, 0xffb040, 0xff6a1e, 0xe8401a], tex: SKT.ember, blend: true },
  frost: { main: BRANCH_INFO.frost.color, light: BRANCH_INFO.frost.light, dark: BRANCH_INFO.frost.dark, parts: [0xffffff, 0xd8f4ff, 0x9fdcff, 0x6ab8f0], tex: SKT.shard, blend: false },
  soul: { main: BRANCH_INFO.soul.color, light: BRANCH_INFO.soul.light, dark: BRANCH_INFO.soul.dark, parts: [0xd8c0ff, 0xb98aff, 0x9ff0dc, 0xf2ecff], tex: SKT.wisp, blend: true },
};

export const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d");
  if (!c) return null;
  draw(c);
  return cv;
}

/** 텍스처 하나 (이미 있으면 그대로). smooth면 선형 필터 (크게 키워도 부드러운 빛) */
function ensure(scene: Phaser.Scene, key: string, cv: () => HTMLCanvasElement | null, smooth = true): void {
  if (scene.textures.exists(key)) return;
  const c = cv();
  if (!c) return;
  const tex = scene.textures.addCanvas(key, c);
  if (tex && smooth) tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/** 불꽃 한 가닥 (위로 뾰족한 물방울) 경로 */
function flamePath(c: CanvasRenderingContext2D, cx: number, base: number, w: number, h: number): void {
  c.beginPath();
  c.moveTo(cx, base - h);
  c.bezierCurveTo(cx + w * 0.15, base - h * 0.6, cx + w * 0.55, base - h * 0.45, cx + w * 0.5, base - h * 0.2);
  c.arc(cx, base - w * 0.5, w * 0.5, 0, Math.PI, false);
  c.bezierCurveTo(cx - w * 0.55, base - h * 0.45, cx - w * 0.15, base - h * 0.6, cx, base - h);
  c.closePath();
}

/** 네 갈래 별 (빛살) 경로 */
function starPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner: number, k = 4, rot = -Math.PI / 2): void {
  c.beginPath();
  for (let i = 0; i <= k * 2; i++) {
    const a = rot + (i / (k * 2)) * TAU;
    const rr = i % 2 ? inner : r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

/** 바닥이 둥글고 끝이 휘는 불꽃 혀 경로 (bend: 끝이 옆으로 휘는 정도) */
function tonguePath(c: CanvasRenderingContext2D, cx: number, base: number, w: number, h: number, bend: number): void {
  c.beginPath();
  c.moveTo(cx + bend, base - h);
  c.bezierCurveTo(cx + bend * 0.3 + w * 0.22, base - h * 0.62, cx + w * 0.62, base - h * 0.42, cx + w * 0.5, base - w * 0.5);
  c.arc(cx, base - w * 0.5, w * 0.5, 0, Math.PI, false);
  c.bezierCurveTo(cx - w * 0.62, base - h * 0.42, cx + bend * 0.3 - w * 0.22, base - h * 0.62, cx + bend, base - h);
  c.closePath();
}

/** 세 겹 불꽃 혀 (바깥 붉은 혀 → 주황 → 노랑·흰 심지). 색을 구워 넣어 가산 섞기로 겹치면 뜨겁게 보인다 */
function fireTongue(c: CanvasRenderingContext2D, cx: number, base: number, w: number, h: number, bend: number): void {
  const layers: [number, number, number, string[]][] = [
    [1, 1, 1, ["rgba(190,30,8,0)", "rgba(225,60,14,0.75)", "rgba(255,105,28,0.95)"]],
    [0.68, 0.74, 0.7, ["rgba(255,130,30,0)", "rgba(255,160,50,0.85)", "rgba(255,200,80,1)"]],
    [0.38, 0.44, 0.4, ["rgba(255,236,150,0)", "rgba(255,246,200,0.9)", "rgba(255,255,240,1)"]],
  ];
  for (const [kw, kh, kb, cols] of layers) {
    const g = c.createLinearGradient(0, base - h * kh, 0, base);
    g.addColorStop(0, cols[0]);
    g.addColorStop(0.45, cols[1]);
    g.addColorStop(1, cols[2]);
    c.fillStyle = g;
    tonguePath(c, cx, base, w * kw, h * kh, bend * kb);
    c.fill();
  }
}

/** 얼음 결정 하나 (바닥 base, 끝이 뾰족한 육각 기둥): 남색 테두리 + 밝은 왼쪽 면 / 어두운 오른쪽 면 + 반짝 줄 */
function iceCrystal(c: CanvasRenderingContext2D, cx: number, base: number, w: number, h: number): void {
  const sh = w * 0.85;
  const path = () => {
    c.beginPath();
    c.moveTo(cx, base - h);
    c.lineTo(cx + w * 0.5, base - h + sh);
    c.lineTo(cx + w * 0.4, base);
    c.lineTo(cx - w * 0.4, base);
    c.lineTo(cx - w * 0.5, base - h + sh);
    c.closePath();
  };
  path();
  c.lineWidth = Math.max(2, w * 0.07);
  c.strokeStyle = "#14325a";
  c.stroke();
  const g = c.createLinearGradient(0, base - h, 0, base);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, "#dcf5ff");
  g.addColorStop(0.75, "rgba(120,190,240,0.92)");
  g.addColorStop(1, "rgba(70,140,215,0.8)");
  c.fillStyle = g;
  path();
  c.fill();
  // 어두운 오른쪽 면
  c.fillStyle = "rgba(36,92,160,0.5)";
  c.beginPath();
  c.moveTo(cx, base - h);
  c.lineTo(cx + w * 0.5, base - h + sh);
  c.lineTo(cx + w * 0.4, base);
  c.lineTo(cx + w * 0.06, base);
  c.closePath();
  c.fill();
  // 반짝 줄 (왼쪽 모서리 · 가운데 능선)
  c.strokeStyle = "rgba(255,255,255,0.95)";
  c.lineWidth = Math.max(1.5, w * 0.06);
  c.beginPath();
  c.moveTo(cx - w * 0.1, base - h + sh * 0.5);
  c.lineTo(cx - w * 0.3, base - h * 0.2);
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,0.55)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(cx, base - h + 2);
  c.lineTo(cx + w * 0.06, base);
  c.stroke();
  // 안쪽 금 두 줄
  c.strokeStyle = "rgba(255,255,255,0.4)";
  c.beginPath();
  c.moveTo(cx - w * 0.3, base - h * 0.45);
  c.lineTo(cx + w * 0.15, base - h * 0.32);
  c.moveTo(cx - w * 0.2, base - h * 0.18);
  c.lineTo(cx + w * 0.25, base - h * 0.1);
  c.stroke();
}

/** 화면 연출용 큰 텍스처 (색을 구워 둔다). 게임 텍스처 관리자에 한 번만 만들어 씬이 바뀌어도 재사용 */
function ensureBigTextures(scene: Phaser.Scene): void {
  // 큰 불꽃 혀 (양옆 작은 혀 + 가운데 큰 혀)
  ensure(scene, SKT.bigFlame, () =>
    canvas(96, 192, (c) => {
      fireTongue(c, 24, 190, 26, 86, -12);
      fireTongue(c, 74, 190, 28, 104, 12);
      fireTongue(c, 34, 190, 40, 140, -10);
      fireTongue(c, 62, 190, 40, 128, 9);
      fireTongue(c, 48, 190, 60, 182, 6);
    }),
  );
  // 다른 모양 (두 갈래로 갈라진 큰 혀): 불기둥 벽이 한 그림처럼 반복돼 보이지 않게
  ensure(scene, SKT.bigFlame2, () =>
    canvas(96, 192, (c) => {
      fireTongue(c, 20, 190, 24, 70, -8);
      fireTongue(c, 78, 190, 24, 80, 10);
      fireTongue(c, 36, 190, 46, 172, -14);
      fireTongue(c, 60, 190, 46, 150, 13);
      fireTongue(c, 48, 190, 40, 110, 0);
    }),
  );
  // 불꽃 파도 (가로로 이어진 불꽃 혀 줄 + 아래 달아오른 띠)
  ensure(scene, SKT.flameWave, () =>
    canvas(256, 128, (c) => {
      const band = c.createLinearGradient(0, 40, 0, 128);
      band.addColorStop(0, "rgba(255,80,20,0)");
      band.addColorStop(0.6, "rgba(255,110,30,0.55)");
      band.addColorStop(1, "rgba(255,170,60,0.95)");
      c.fillStyle = band;
      c.fillRect(0, 40, 256, 88);
      let seed = 11;
      const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 9; i++) {
        const x = 8 + i * 30 + r() * 8;
        fireTongue(c, x, 128, 30 + r() * 16, 62 + r() * 62, (r() - 0.5) * 14);
      }
    }),
  );
  // 얼음 결정 하나 · 결정 무리 (여러 개가 부채꼴로 돋은 덩어리)
  ensure(scene, SKT.crystal, () => canvas(72, 220, (c) => iceCrystal(c, 36, 218, 62, 214)));
  ensure(scene, SKT.cluster, () =>
    canvas(256, 256, (c) => {
      const glow = c.createRadialGradient(128, 240, 0, 128, 240, 120);
      glow.addColorStop(0, "rgba(200,240,255,0.55)");
      glow.addColorStop(1, "rgba(200,240,255,0)");
      c.fillStyle = glow;
      c.fillRect(0, 100, 256, 156);
      for (const [dx, ang, w, h] of [
        [-58, -0.62, 38, 120],
        [60, 0.6, 40, 128],
        [-30, -0.3, 48, 176],
        [34, 0.32, 46, 166],
        [-8, -0.08, 60, 236],
        [16, 0.14, 34, 140],
      ] as const) {
        c.save();
        c.translate(128 + dx * 0.4, 252);
        c.rotate(ang);
        iceCrystal(c, 0, 0, w, h);
        c.restore();
      }
    }),
  );
  // 넋 (둥근 머리 + 물결 꼬리 + 뚫린 눈): 머리가 위
  ensure(scene, SKT.ghost, () =>
    canvas(96, 160, (c) => {
      const g = c.createLinearGradient(0, 10, 0, 160);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.3, "rgba(225,255,250,0.95)");
      g.addColorStop(0.62, "rgba(159,240,220,0.62)");
      g.addColorStop(1, "rgba(185,138,255,0)");
      c.shadowColor = "rgba(200,255,245,0.9)";
      c.shadowBlur = 10;
      c.fillStyle = g;
      c.beginPath();
      c.arc(48, 48, 32, Math.PI, 0);
      c.bezierCurveTo(82, 92, 76, 122, 72, 156);
      c.quadraticCurveTo(64, 132, 56, 150);
      c.quadraticCurveTo(49, 126, 41, 152);
      c.quadraticCurveTo(34, 130, 24, 156);
      c.bezierCurveTo(20, 122, 14, 92, 16, 48);
      c.closePath();
      c.fill();
      c.shadowBlur = 0;
      c.globalCompositeOperation = "destination-out";
      c.fillStyle = "rgba(0,0,0,0.85)";
      for (const ex of [36, 60]) {
        c.beginPath();
        c.ellipse(ex, 46, 6, 9, 0, 0, TAU);
        c.fill();
      }
      c.fillStyle = "rgba(0,0,0,0.6)";
      c.beginPath();
      c.ellipse(48, 68, 5, 6, 0, 0, TAU);
      c.fill();
    }),
  );
  // 방사선 빛줄기 (폭발 꽃 · 광원 플래시)
  ensure(scene, SKT.rays, () =>
    canvas(256, 256, (c) => {
      c.translate(128, 128);
      let seed = 5;
      const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * TAU + r() * 0.2;
        const len = 64 + r() * 62;
        const wd = 0.03 + r() * 0.05;
        const g = c.createRadialGradient(0, 0, 0, 0, 0, len);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.5, "rgba(255,255,255,0.45)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(Math.cos(a - wd) * len, Math.sin(a - wd) * len);
        c.lineTo(Math.cos(a + wd) * len, Math.sin(a + wd) * len);
        c.closePath();
        c.fill();
      }
      const core = c.createRadialGradient(0, 0, 0, 0, 0, 44);
      core.addColorStop(0, "rgba(255,255,255,1)");
      core.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = core;
      c.fillRect(-44, -44, 88, 88);
    }),
  );
  // 가로 빛살 (렌즈 번짐)
  ensure(scene, SKT.streakH, () =>
    canvas(256, 32, (c) => {
      c.translate(128, 16);
      c.scale(1, 0.12);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 128);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(-128, -134, 256, 268);
    }),
  );
  // 충격파 (안쪽 가장자리가 밝은 두꺼운 고리)
  ensure(scene, SKT.shock, () =>
    canvas(256, 256, (c) => {
      const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.6, "rgba(255,255,255,0.06)");
      g.addColorStop(0.8, "rgba(255,255,255,0.45)");
      g.addColorStop(0.9, "rgba(255,255,255,1)");
      g.addColorStop(0.96, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
    }),
  );
  // 소용돌이 (휘감기는 팔 세 개): 눈보라 휘몰이 · 넋 소용돌이
  ensure(scene, SKT.swirl, () =>
    canvas(256, 256, (c) => {
      c.translate(128, 128);
      c.lineCap = "round";
      for (let arm = 0; arm < 3; arm++) {
        const steps = 48;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const pt = (t: number) => {
            const a = (arm / 3) * TAU + t * 3.4;
            const rr = 8 + t * 114;
            return [Math.cos(a) * rr, Math.sin(a) * rr] as const;
          };
          const [x0, y0] = pt(t0);
          const [x1, y1] = pt(t1);
          const k = Math.sin(t0 * Math.PI);
          c.strokeStyle = `rgba(255,255,255,${(0.95 * Math.pow(k, 0.6)).toFixed(3)})`;
          c.lineWidth = 2 + 13 * k;
          c.beginPath();
          c.moveTo(x0, y0);
          c.lineTo(x1, y1);
          c.stroke();
        }
      }
    }),
  );
  // 연기 뭉치
  ensure(scene, SKT.smoke, () =>
    canvas(128, 128, (c) => {
      let seed = 3;
      const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 10; i++) {
        const x = 34 + r() * 60;
        const y = 34 + r() * 60;
        const rr = 18 + r() * 26;
        const g = c.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, `rgba(255,255,255,${(0.28 + r() * 0.2).toFixed(2)})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 128);
      }
    }),
  );
  // 하얀 테두리 빛 (틴트로 갈래 색 · 가산): 서리가 화면 가장자리를 덮는다
  ensure(scene, SKT.vigW, () =>
    canvas(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 30, 64, 64, 92);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.6, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,1)");
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    }),
  );
}

/** 연출 텍스처 (흰색으로 그리고 색은 틴트로) */
export function ensureSkillTextures(scene: Phaser.Scene): void {
  ensureBigTextures(scene);
  ensure(scene, SKT.glow, () =>
    canvas(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,255,255,0.7)");
      g.addColorStop(0.6, "rgba(255,255,255,0.18)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    }),
  );
  ensure(
    scene,
    SKT.ember,
    () =>
      canvas(4, 4, (c) => {
        c.fillStyle = "rgba(255,255,255,0.6)";
        c.fillRect(0, 1, 4, 2);
        c.fillRect(1, 0, 2, 4);
        c.fillStyle = "#fff";
        c.fillRect(1, 1, 2, 2);
      }),
    false,
  );
  ensure(
    scene,
    SKT.shard,
    () =>
      canvas(5, 7, (c) => {
        c.fillStyle = "#fff";
        c.beginPath();
        c.moveTo(2.5, 0);
        c.lineTo(5, 3.5);
        c.lineTo(2.5, 7);
        c.lineTo(0, 3.5);
        c.closePath();
        c.fill();
        c.fillStyle = "rgba(160,200,230,0.9)";
        c.fillRect(2, 3, 1, 3);
      }),
    false,
  );
  ensure(scene, SKT.wisp, () =>
    canvas(16, 16, (c) => {
      const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.45, "rgba(255,255,255,0.75)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 16, 16);
    }),
  );
  // 바닥 마법진: 두 겹 원 + 눈금 + 안쪽 별(오각) + 점 (이 게임 고유의 등불 무늬)
  ensure(scene, SKT.rune, () =>
    canvas(128, 128, (c) => {
      const k = 128 / 96;
      c.scale(k, k);
      c.strokeStyle = "#fff";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(48, 48, 45, 0, TAU);
      c.stroke();
      c.lineWidth = 1;
      c.beginPath();
      c.arc(48, 48, 38, 0, TAU);
      c.stroke();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        const r0 = i % 3 === 0 ? 38 : 41;
        c.beginPath();
        c.moveTo(48 + Math.cos(a) * r0, 48 + Math.sin(a) * r0);
        c.lineTo(48 + Math.cos(a) * 45, 48 + Math.sin(a) * 45);
        c.stroke();
      }
      c.lineWidth = 1.5;
      c.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + ((i * 2) % 5) * (TAU / 5);
        const x = 48 + Math.cos(a) * 30;
        const y = 48 + Math.sin(a) * 30;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.beginPath();
      c.arc(48, 48, 12, 0, TAU);
      c.stroke();
      c.fillStyle = "#fff";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.26;
        c.fillRect(48 + Math.cos(a) * 34 - 1, 48 + Math.sin(a) * 34 - 1, 2, 2);
      }
    }),
  );
  ensure(scene, SKT.pillar, () =>
    canvas(32, 96, (c) => {
      const g = c.createLinearGradient(0, 0, 32, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.3, "rgba(255,255,255,0.5)");
      g.addColorStop(0.5, "rgba(255,255,255,1)");
      g.addColorStop(0.7, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 32, 96);
      const v = c.createLinearGradient(0, 0, 0, 96);
      v.addColorStop(0, "rgba(0,0,0,1)");
      v.addColorStop(0.5, "rgba(0,0,0,0)");
      v.addColorStop(0.92, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.7)");
      c.globalCompositeOperation = "destination-out";
      c.fillStyle = v;
      c.fillRect(0, 0, 32, 96);
    }),
  );
  // 불꽃 한 가닥: 바깥은 옅고 안쪽 심지는 하얗게 (틴트로 주황·보라·청록)
  ensure(scene, SKT.flame, () =>
    canvas(32, 48, (c) => {
      const g = c.createLinearGradient(0, 4, 0, 46);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.35, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0.9)");
      flamePath(c, 16, 46, 22, 44);
      c.fillStyle = g;
      c.fill();
      const core = c.createRadialGradient(16, 36, 0, 16, 36, 10);
      core.addColorStop(0, "rgba(255,255,255,1)");
      core.addColorStop(1, "rgba(255,255,255,0)");
      flamePath(c, 16, 45, 11, 26);
      c.fillStyle = core;
      c.fill();
    }),
  );
  // 빛줄 (오른쪽 끝이 밝은 꼬리): 속도 방향으로 늘여 불티·눈보라·잔상 줄
  ensure(scene, SKT.streak, () =>
    canvas(32, 8, (c) => {
      const g = c.createLinearGradient(0, 0, 32, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.75, "rgba(255,255,255,0.7)");
      g.addColorStop(1, "rgba(255,255,255,1)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 4);
      c.lineTo(28, 1);
      c.arc(28, 4, 3, -Math.PI / 2, Math.PI / 2);
      c.closePath();
      c.fill();
    }),
  );
  // 반짝 별 (네 갈래 빛살)
  ensure(scene, SKT.star, () =>
    canvas(24, 24, (c) => {
      const g = c.createRadialGradient(12, 12, 0, 12, 12, 12);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0.3)");
      c.fillStyle = g;
      starPath(c, 12, 12, 12, 2.2);
      c.fill();
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(12, 12, 2.5, 0, TAU);
      c.fill();
    }),
  );
  // 안개 구름 (입김·눈보라·연기)
  ensure(scene, SKT.cloud, () =>
    canvas(48, 48, (c) => {
      for (const [x, y, r, a] of [
        [24, 26, 18, 0.5],
        [16, 22, 11, 0.4],
        [32, 20, 12, 0.4],
        [26, 32, 12, 0.35],
      ] as const) {
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 48, 48);
      }
    }),
  );
  // 고드름 (오른쪽이 뾰족): 투사체·고드름 비
  ensure(scene, SKT.icicle, () =>
    canvas(32, 10, (c) => {
      const g = c.createLinearGradient(0, 0, 32, 0);
      g.addColorStop(0, "rgba(200,235,255,0.5)");
      g.addColorStop(0.6, "rgba(235,250,255,0.95)");
      g.addColorStop(1, "rgba(255,255,255,1)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 2);
      c.lineTo(8, 0);
      c.lineTo(32, 5);
      c.lineTo(8, 10);
      c.lineTo(0, 8);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(255,255,255,1)";
      c.fillRect(8, 4, 20, 1);
    }),
  );
  // 얼음 가시 (위로 솟는 결정, 색 그대로): 짙은 남색 테두리 + 밝은 면/어두운 면 → 밝은 바닥·빛 위에서도 읽힌다
  ensure(scene, SKT.spike, () =>
    canvas(18, 42, (c) => {
      const path = () => {
        c.beginPath();
        c.moveTo(9, 1);
        c.lineTo(16, 31);
        c.lineTo(9, 41);
        c.lineTo(2, 31);
        c.closePath();
      };
      path();
      c.fillStyle = "#1c4a7e";
      c.lineWidth = 2.5;
      c.strokeStyle = "#163a66";
      c.stroke();
      const g = c.createLinearGradient(0, 0, 0, 42);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.5, "#bfe8ff");
      g.addColorStop(1, "#6ab4ea");
      c.fillStyle = g;
      path();
      c.fill();
      // 어두운 오른쪽 면
      c.fillStyle = "rgba(42,106,168,0.55)";
      c.beginPath();
      c.moveTo(9, 1);
      c.lineTo(16, 31);
      c.lineTo(9, 41);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(8, 4);
      c.lineTo(4.5, 30);
      c.stroke();
    }),
  );
  // 고리 (부드러운 두께) · 얇은 고리
  ensure(scene, SKT.ring, () =>
    canvas(96, 96, (c) => {
      const g = c.createRadialGradient(48, 48, 30, 48, 48, 48);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.55, "rgba(255,255,255,0.35)");
      g.addColorStop(0.8, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 96, 96);
    }),
  );
  ensure(scene, SKT.ringThin, () =>
    canvas(96, 96, (c) => {
      c.strokeStyle = "rgba(255,255,255,1)";
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(48, 48, 45, 0, TAU);
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.35)";
      c.lineWidth = 6;
      c.beginPath();
      c.arc(48, 48, 42, 0, TAU);
      c.stroke();
    }),
  );
  // 서리꽃 (여섯 꽃잎 결정)
  ensure(scene, SKT.flower, () =>
    canvas(128, 128, (c) => {
      c.translate(64, 64);
      for (let i = 0; i < 6; i++) {
        c.save();
        c.rotate((i / 6) * TAU);
        const g = c.createLinearGradient(0, 0, 0, -60);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(1, "rgba(255,255,255,0.25)");
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(0, -4);
        c.quadraticCurveTo(18, -30, 0, -62);
        c.quadraticCurveTo(-18, -30, 0, -4);
        c.fill();
        c.strokeStyle = "rgba(255,255,255,1)";
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(0, -6);
        c.lineTo(0, -58);
        for (const d of [22, 36]) {
          c.moveTo(0, -d);
          c.lineTo(8, -d - 8);
          c.moveTo(0, -d);
          c.lineTo(-8, -d - 8);
        }
        c.stroke();
        c.restore();
      }
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(0, 0, 7, 0, TAU);
      c.fill();
    }),
  );
  // 서리 금 (바닥에 퍼지는 얼음 균열 + 육각 무늬)
  ensure(scene, SKT.crack, () =>
    canvas(128, 128, (c) => {
      c.translate(64, 64);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 64);
      g.addColorStop(0, "rgba(255,255,255,0.45)");
      g.addColorStop(0.75, "rgba(255,255,255,0.15)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(-64, -64, 128, 128);
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = 1.2;
      let seed = 7;
      const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < 11; i++) {
        let a = (i / 11) * TAU + r() * 0.3;
        let x = 0;
        let y = 0;
        c.beginPath();
        c.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
          a += (r() - 0.5) * 0.7;
          const len = 6 + r() * 7;
          x += Math.cos(a) * len;
          y += Math.sin(a) * len;
          c.lineTo(x, y);
          if (s === 2 || s === 4) {
            c.moveTo(x, y);
            c.lineTo(x + Math.cos(a + 1) * 7, y + Math.sin(a + 1) * 7);
            c.moveTo(x, y);
          }
        }
        c.stroke();
      }
      c.strokeStyle = "rgba(255,255,255,0.4)";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        c.beginPath();
        for (let k = 0; k <= 6; k++) {
          const b = (k / 6) * TAU;
          const x = Math.cos(a) * 34 + Math.cos(b) * 9;
          const y = Math.sin(a) * 34 + Math.sin(b) * 9;
          if (k === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
    }),
  );
  // 초승달 휩쓸기 (부채·베기 자국)
  ensure(scene, SKT.crescent, () =>
    canvas(64, 64, (c) => {
      const g = c.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, "rgba(255,255,255,0.1)");
      g.addColorStop(1, "rgba(255,255,255,1)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(20, 32, 40, -1.15, 1.15, false);
      c.arc(6, 32, 40, 1.0, -1.0, true);
      c.closePath();
      c.fill();
    }),
  );
  // 화면 테두리 어둠 (가운데 투명 → 가장자리 검정, 틴트 안 함)
  ensure(scene, SKT.vignette, () =>
    canvas(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 22, 64, 64, 92);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.55, "rgba(0,0,0,0.45)");
      g.addColorStop(1, "rgba(0,0,0,1)");
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    }),
  );
  // 컷인 띠 (가운데 진하고 위아래로 사라짐)
  ensure(scene, SKT.band, () =>
    canvas(8, 64, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.2, "rgba(255,255,255,0.85)");
      g.addColorStop(0.5, "rgba(255,255,255,1)");
      g.addColorStop(0.8, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 8, 64);
    }),
  );
  // 묘비 (도트, 색 그대로)
  ensure(
    scene,
    SKT.tomb,
    () =>
      canvas(14, 18, (c) => {
        c.fillStyle = "#2a2838";
        c.fillRect(1, 3, 12, 15);
        c.fillRect(2, 1, 10, 2);
        c.fillRect(4, 0, 6, 1);
        c.fillStyle = "#8a8aa0";
        c.fillRect(2, 3, 10, 14);
        c.fillRect(3, 2, 8, 1);
        c.fillRect(5, 1, 4, 1);
        c.fillStyle = "#b8b8cc";
        c.fillRect(3, 3, 2, 12);
        c.fillStyle = "#4a4a5e";
        c.fillRect(6, 5, 2, 7);
        c.fillRect(4, 7, 6, 2);
        c.fillStyle = "#5a7a4a";
        c.fillRect(1, 16, 12, 2);
      }),
    false,
  );
  // 유령 손 (위로 뻗은 손바닥)
  ensure(scene, SKT.hand, () =>
    canvas(16, 24, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 24);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(3, 24);
      c.lineTo(3, 12);
      for (const [x, top] of [
        [3, 5],
        [6, 1],
        [9, 0],
        [12, 3],
      ] as const) {
        c.lineTo(x, top + 2);
        c.quadraticCurveTo(x + 1.2, top, x + 2.4, top + 2);
        c.lineTo(x + 2.4, 11);
      }
      c.lineTo(15, 9);
      c.lineTo(13, 15);
      c.lineTo(13, 24);
      c.closePath();
      c.fill();
    }),
  );
  // 불붙은 장작 토막 (도트)
  ensure(
    scene,
    SKT.log,
    () =>
      canvas(10, 5, (c) => {
        c.fillStyle = "#3a1e10";
        c.fillRect(0, 0, 10, 5);
        c.fillStyle = "#7a4424";
        c.fillRect(1, 1, 8, 3);
        c.fillStyle = "#ffb040";
        c.fillRect(7, 1, 2, 3);
        c.fillStyle = "#fff0b0";
        c.fillRect(8, 2, 1, 1);
      }),
    false,
  );
  // 궁극기 문양 세 가지 (이 게임 고유: 모닥불 바퀴 · 여섯 갈래 서리 결정 · 별에 둘러싸인 등불)
  ensure(scene, SKT.emEmber, () =>
    canvas(160, 160, (c) => {
      c.translate(80, 80);
      c.strokeStyle = "#fff";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 74, 0, TAU);
      c.stroke();
      c.lineWidth = 1;
      c.beginPath();
      c.arc(0, 0, 66, 0, TAU);
      c.stroke();
      for (let i = 0; i < 10; i++) {
        c.save();
        c.rotate((i / 10) * TAU);
        c.translate(0, -26);
        c.rotate(0.35);
        const g = c.createLinearGradient(0, 0, 0, -40);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(1, "rgba(255,255,255,0.15)");
        c.fillStyle = g;
        flamePath(c, 0, 4, 16, 42);
        c.fill();
        c.restore();
      }
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 22, 0, TAU);
      c.stroke();
      c.fillStyle = "#fff";
      for (const a of [0.55, -0.55]) {
        c.save();
        c.rotate(a);
        c.fillRect(-16, -3, 32, 6);
        c.restore();
      }
      flamePath(c, 0, 6, 12, 22);
      c.fill();
    }),
  );
  ensure(scene, SKT.emFrost, () =>
    canvas(160, 160, (c) => {
      c.translate(80, 80);
      c.strokeStyle = "#fff";
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        if (i === 0) c.moveTo(Math.cos(a) * 76, Math.sin(a) * 76);
        else c.lineTo(Math.cos(a) * 76, Math.sin(a) * 76);
      }
      c.stroke();
      for (let i = 0; i < 6; i++) {
        c.save();
        c.rotate((i / 6) * TAU);
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(0, -10);
        c.lineTo(0, -64);
        c.stroke();
        c.lineWidth = 2.5;
        for (const [d, l] of [
          [28, 14],
          [44, 11],
          [56, 7],
        ] as const) {
          c.beginPath();
          c.moveTo(0, -d);
          c.lineTo(l, -d - l);
          c.moveTo(0, -d);
          c.lineTo(-l, -d - l);
          c.stroke();
        }
        c.fillStyle = "#fff";
        c.beginPath();
        c.moveTo(0, -74);
        c.lineTo(4, -68);
        c.lineTo(0, -62);
        c.lineTo(-4, -68);
        c.closePath();
        c.fill();
        c.restore();
      }
      c.fillStyle = "#fff";
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * TAU;
        if (i === 0) c.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
        else c.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
      }
      c.fill();
    }),
  );
  ensure(scene, SKT.emSoul, () =>
    canvas(160, 160, (c) => {
      c.translate(80, 80);
      c.strokeStyle = "#fff";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 72, 0, TAU);
      c.stroke();
      c.lineWidth = 1.5;
      c.setLineDash([6, 5]);
      c.beginPath();
      c.arc(0, 0, 62, 0, TAU);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = "#fff";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        starPath(c, Math.cos(a) * 52, Math.sin(a) * 52, i % 2 ? 5 : 8, 1.5);
        c.fill();
      }
      // 등불: 고리 + 지붕 + 몸통 + 안쪽 불꽃
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(0, -36, 5, 0, TAU);
      c.stroke();
      c.beginPath();
      c.moveTo(-16, -24);
      c.lineTo(16, -24);
      c.lineTo(10, -31);
      c.lineTo(-10, -31);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(-14, -22);
      c.quadraticCurveTo(-22, 2, -12, 24);
      c.lineTo(12, 24);
      c.quadraticCurveTo(22, 2, 14, -22);
      c.closePath();
      c.stroke();
      c.fillRect(-14, 24, 28, 4);
      const g = c.createRadialGradient(0, 6, 0, 0, 6, 16);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0.1)");
      c.fillStyle = g;
      flamePath(c, 0, 18, 14, 30);
      c.fill();
    }),
  );
}

function coarse(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720);
  } catch {
    return false;
  }
}

/** 입자 하나를 띄우는 설정. 속도는 px/초 (월드 좌표) */
export type Emit = {
  x: number;
  y: number;
  tex: string;
  tint?: number;
  /** 가산 섞기 (빛). 기본 true */
  add?: boolean;
  vx?: number;
  vy?: number;
  /** 세로 가속 (+면 떨어짐) */
  ay?: number;
  /** 초당 속도 감쇠 비율 (0~) */
  drag?: number;
  life: number;
  delay?: number;
  /** 크기 처음 → 끝 */
  s0?: number;
  s1?: number;
  /** 세로 배율 (바닥 고리는 0.62) */
  sy?: number;
  alpha?: number;
  /** 사라지는 곡선 (클수록 끝까지 밝다) */
  fade?: number;
  /** 처음 이 비율 동안 서서히 나타남 */
  fadeIn?: number;
  rot?: number;
  /** 초당 회전 (rad) */
  vr?: number;
  /** 속도 방향으로 늘이기 (속도 × stretch 배) → 불티 줄 */
  stretch?: number;
  depth?: number;
  /** 궤도 (소용돌이·회오리): 중심 (ox,oy) 둘레를 각속도 orbV로 돌고 반지름이 orbDR만큼 변한다 */
  orb?: { ox: number; oy: number; r: number; a: number; v: number; dr?: number; lift?: number; flat?: number };
  originY?: number;
};

type Part = {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 그리는 방향 (늘이기용) */
  dx: number;
  dy: number;
  ay: number;
  drag: number;
  life: number;
  age: number;
  delay: number;
  s0: number;
  s1: number;
  sy: number;
  a0: number;
  fade: number;
  fadeIn: number;
  rot: number;
  vr: number;
  stretch: number;
  orb: Emit["orb"] | null;
};

/** 큰 그림 하나 (불기둥·결정·넋·빛줄기). screen이면 화면 px 좌표(카메라에 고정), 아니면 월드 좌표 */
export type BigOpts = {
  tex: string;
  x: number;
  y: number;
  /** 도착점: 수명 동안 path 곡선으로 (x,y) → (x1,y1) */
  x1?: number;
  y1?: number;
  path?: Ease;
  screen?: boolean;
  tint?: number;
  /** 가산 섞기 (기본 true) */
  add?: boolean;
  depth?: number;
  life: number;
  delay?: number;
  /** 크기 처음 → 끝 (grow 곡선) */
  s0: number;
  s1: number;
  grow?: Ease;
  /** 가로·세로 배율 */
  sx?: number;
  sy?: number;
  alpha?: number;
  /** 처음 이 비율 동안 나타나고, 마지막 이 비율 동안 사라진다 */
  fadeIn?: number;
  fadeOut?: number;
  rot?: number;
  /** 초당 회전 (rad) */
  vr?: number;
  /** 좌우 흔들림 (rad) · 초당 횟수 */
  sway?: number;
  swayHz?: number;
  /** 크기 일렁임 비율 (불꽃) */
  flick?: number;
  ox?: number;
  oy?: number;
  /** 궤도: (x,y) 둘레를 반지름 r0 → r1, 각 a0에서 초당 v rad로 돈다 */
  orbit?: { r0: number; r1: number; a0: number; v: number; flat?: number };
  /** 움직이는 쪽을 보게 돌린다 (그림이 위를 보면 PI/2) */
  face?: number;
};

type Ease = "out" | "back" | "in" | "lin" | "inout";

const ease = (k: Ease | undefined, t: number): number => {
  switch (k) {
    case "in":
      return t * t;
    case "lin":
      return t;
    case "back": {
      const u = t - 1;
      return 1 + 2.4 * u * u * u + 1.4 * u * u;
    }
    case "inout":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:
      return 1 - (1 - t) * (1 - t) * (1 - t);
  }
};

type Big = { img: Phaser.GameObjects.Image; o: BigOpts; age: number; delay: number; seed: number; px: number; py: number };

/** 화면 연출 층: 어둠은 월드 연출 바로 아래(빛은 어둠 위에서 빛난다), 큰 그림은 연출 위 · 피해 숫자(1e6) 아래 */
const DEPTH_DIM = DEPTH_FX - 60;
const DEPTH_CINE = 5e5;

export class SkillFx {
  /** 동시에 떠 있는 입자 수 상한 (휴대폰은 낮게, 움직임 줄이기면 더 낮게) */
  readonly cap: number;
  readonly mobile: boolean;
  private parts: Part[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  /** 큰 그림 (화면 연출·폭발 꽃). 상한: 휴대폰 50 · 데스크톱 120 */
  private bigs: Big[] = [];
  private readonly bigCap: number;
  private lastFlash = -1e9;
  private baseZoom = 0;
  /** 궁극기 화면 연출이 도는 중 (동시에 1개) */
  private ultUntil = 0;
  /** 범위기 화면 연출이 도는 중 (겹치면 화면 층만 건너뛴다) */
  private cineUntil = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly reduced: boolean,
  ) {
    ensureSkillTextures(scene);
    this.mobile = coarse();
    this.cap = Math.round((this.mobile ? 150 : 380) * (reduced ? 0.4 : 1));
    this.bigCap = Math.round((this.mobile ? 50 : 120) * (reduced ? 0.5 : 1));
  }

  /** 큰 그림 하나 (상한을 넘으면 그리지 않는다) */
  big(o: BigOpts): boolean {
    if (this.bigs.length >= this.bigCap) return false;
    const img = this.scene.add.image(0, 0, o.tex).setOrigin(o.ox ?? 0.5, o.oy ?? 0.5);
    img.setTint(o.tint ?? 0xffffff).setBlendMode(o.add === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    img.setDepth(o.depth ?? (o.screen ? DEPTH_CINE : DEPTH_FX + 4)).setAlpha(0).setVisible(false);
    if (o.screen) img.setScrollFactor(0);
    const b: Big = { img, o, age: 0, delay: o.delay ?? 0, seed: Math.random() * 100, px: o.x, py: o.y };
    this.bigs.push(b);
    this.stepBig(b, 0);
    return true;
  }

  /** 큰 그림 한 프레임 (false면 끝) */
  private stepBig(b: Big, dms: number): boolean {
    if (b.delay > 0) {
      b.delay -= dms;
      if (b.delay > 0) return true;
      dms = 0;
    }
    b.age += dms;
    const o = b.o;
    const t = Math.min(1, b.age / o.life);
    if (b.age >= o.life || !b.img.scene) return false;
    let x = o.x;
    let y = o.y;
    if (o.orbit) {
      const r = o.orbit.r0 + (o.orbit.r1 - o.orbit.r0) * ease("inout", t);
      const a = o.orbit.a0 + (o.orbit.v * b.age) / 1000;
      x += Math.cos(a) * r;
      y += Math.sin(a) * r * (o.orbit.flat ?? 1);
    } else if (o.x1 !== undefined || o.y1 !== undefined) {
      const k = ease(o.path, t);
      x += ((o.x1 ?? o.x) - o.x) * k;
      y += ((o.y1 ?? o.y) - o.y) * k;
    }
    const sec = b.age / 1000;
    let rot = (o.rot ?? 0) + (o.vr ?? 0) * sec;
    if (o.face !== undefined && Math.hypot(x - b.px, y - b.py) > 0.01) rot = Math.atan2(y - b.py, x - b.px) + o.face;
    if (o.sway) rot += Math.sin(sec * TAU * (o.swayHz ?? 2) + b.seed) * o.sway;
    b.px = x;
    b.py = y;
    let s = o.s0 + (o.s1 - o.s0) * ease(o.grow, t);
    if (o.flick) s *= 1 + o.flick * (Math.sin(sec * 31 + b.seed) * 0.6 + Math.sin(sec * 53 + b.seed * 2) * 0.4);
    const fi = o.fadeIn ? Math.min(1, t / o.fadeIn) : 1;
    const fo = o.fadeOut ? Math.min(1, (1 - t) / o.fadeOut) : 1;
    const img = b.img;
    img.setVisible(true).setAlpha(Math.max(0, (o.alpha ?? 1) * fi * fo));
    img.setRotation(rot);
    if (o.screen) {
      const z = this.zoom;
      const p = this.screenPos(x, y);
      img.setPosition(p.x, p.y).setScale((s * (o.sx ?? 1)) / z, (s * (o.sy ?? 1)) / z);
    } else img.setPosition(x, y).setScale(s * (o.sx ?? 1), s * (o.sy ?? 1));
    return true;
  }

  private get zoom(): number {
    return this.scene.cameras.main.zoom || 1;
  }

  /** 입자 개수 보정 (움직임 줄이기면 줄이고, 휴대폰은 조금 줄인다) */
  n(k: number): number {
    return Math.max(1, Math.round(k * (this.reduced ? 0.4 : this.mobile ? 0.7 : 1)));
  }

  /** 떠 있는 입자 수 (검수용) */
  get liveCount(): number {
    return this.parts.length;
  }

  // ── 입자 엔진 (풀 + 한 루프) ──

  /** 입자 하나 (상한을 넘으면 그리지 않는다) */
  emit(o: Emit): boolean {
    if (this.parts.length >= this.cap) return false;
    const img = this.pool.pop() ?? this.scene.add.image(0, 0, o.tex);
    img.setTexture(o.tex).setActive(true).setVisible(!(o.delay && o.delay > 0));
    img.setOrigin(0.5, o.originY ?? 0.5);
    img.setTint(o.tint ?? 0xffffff);
    img.setBlendMode(o.add === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    img.setDepth(o.depth ?? DEPTH_FX + 2);
    img.setRotation(o.rot ?? 0);
    const s0 = o.s0 ?? 1;
    img.setScale(s0, s0 * (o.sy ?? 1)).setAlpha(o.fadeIn ? 0 : (o.alpha ?? 1));
    // 궤도 입자는 처음부터 궤도 위에서 시작한다 (가운데에서 첫 프레임에 튀어 나가면 늘이기가 화면을 가로지르는 긴 줄이 된다)
    const sx0 = o.orb ? o.orb.ox + Math.cos(o.orb.a) * o.orb.r : o.x;
    const sy0 = o.orb ? o.orb.oy + Math.sin(o.orb.a) * o.orb.r * (o.orb.flat ?? 0.62) : o.y;
    img.setPosition(sx0, sy0);
    this.parts.push({
      img,
      x: sx0,
      y: sy0,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      dx: o.vx ?? 0,
      dy: o.vy ?? 0,
      ay: o.ay ?? 0,
      drag: o.drag ?? 0,
      life: Math.max(16, o.life),
      age: 0,
      delay: o.delay ?? 0,
      s0,
      s1: o.s1 ?? s0,
      sy: o.sy ?? 1,
      a0: o.alpha ?? 1,
      fade: o.fade ?? 1.4,
      fadeIn: o.fadeIn ?? 0,
      rot: o.rot ?? 0,
      vr: o.vr ?? 0,
      stretch: o.stretch ?? 0,
      orb: o.orb ? { ...o.orb } : null,
    });
    return true;
  }

  /** 매 프레임 (실시간 ms). 씬의 update에서 부른다 — 히트스톱 중에도 빛은 흐른다 */
  update(deltaMs: number): void {
    const dms = Math.min(deltaMs, 50);
    const dt = dms / 1000;
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      if (p.delay > 0) {
        p.delay -= dms;
        if (p.delay > 0) continue;
        p.img.setVisible(true);
      }
      p.age += dms;
      const t = p.age / p.life;
      if (t >= 1 || !p.img.scene) {
        p.img.setVisible(false).setActive(false);
        if (p.img.scene) this.pool.push(p.img);
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.ay * dt;
      if (p.orb) {
        const o = p.orb;
        o.a += o.v * dt;
        o.r = Math.max(0, o.r + (o.dr ?? 0) * dt);
        o.oy -= (o.lift ?? 0) * dt;
        o.ox += p.vx * dt;
        o.oy += p.vy * dt;
        const nx = o.ox + Math.cos(o.a) * o.r;
        const ny = o.oy + Math.sin(o.a) * o.r * (o.flat ?? 0.62);
        // 궤도 입자는 실제로 움직인 방향으로 늘인다 (중심의 흐름 속도와 따로)
        p.dx = (nx - p.x) / Math.max(dt, 1e-3);
        p.dy = (ny - p.y) / Math.max(dt, 1e-3);
        p.x = nx;
        p.y = ny;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.dx = p.vx;
        p.dy = p.vy;
      }
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      const s = p.s0 + (p.s1 - p.s0) * e;
      let sx = s;
      if (p.stretch) {
        const sp = Math.hypot(p.dx, p.dy);
        sx = s * Math.min(8, Math.max(1, sp * p.stretch));
        if (sp > 1) p.img.setRotation(Math.atan2(p.dy, p.dx));
      } else if (p.vr) {
        p.rot += p.vr * dt;
        p.img.setRotation(p.rot);
      }
      const fin = p.fadeIn > 0 && t < p.fadeIn ? t / p.fadeIn : 1;
      p.img
        .setPosition(p.x, p.y)
        .setScale(sx, s * p.sy)
        .setAlpha(p.a0 * fin * (1 - Math.pow(t, p.fade)));
    }
    const bs = this.bigs;
    for (let i = bs.length - 1; i >= 0; i--) {
      if (this.stepBig(bs[i], dms)) continue;
      if (bs[i].img.scene) bs[i].img.destroy();
      bs[i] = bs[bs.length - 1];
      bs.pop();
    }
  }

  /** 떠 있는 큰 그림 수 (검수용) */
  get bigCount(): number {
    return this.bigs.length;
  }

  /** 씬이 끝날 때 */
  clear(): void {
    for (const p of this.parts) if (p.img.scene) p.img.destroy();
    for (const img of this.pool) if (img.scene) img.destroy();
    for (const b of this.bigs) if (b.img.scene) b.img.destroy();
    this.parts = [];
    this.pool = [];
    this.bigs = [];
  }

  // ── 기본 조각 ──

  /** 옛 입자 호출 (날아가 (dx,dy) 만큼 가고, rise만큼 위로) */
  particle(x: number, y: number, b: BranchId, dx: number, dy: number, ms: number, opts: { rise?: number; scale?: number; tint?: number; spin?: boolean; tex?: string; delay?: number } = {}): void {
    const p = PALETTES[b];
    const tex = opts.tex ?? p.tex;
    const k = 1000 / ms;
    this.emit({
      x,
      y,
      tex,
      tint: opts.tint ?? pick(p.parts),
      add: p.blend || tex === SKT.wisp || tex === SKT.glow,
      vx: dx * k * 1.6,
      vy: (dy - (opts.rise ?? 0)) * k * 1.6,
      drag: 3,
      life: ms,
      delay: opts.delay,
      s0: (opts.scale ?? 1 + Math.random() * 0.8) * (tex === SKT.wisp ? 0.5 : 1),
      s1: (opts.scale ?? 1) * 0.3,
      rot: opts.spin ? Math.random() * Math.PI : 0,
      vr: opts.spin ? rnd(-9, 9) : 0,
    });
  }

  /** 빛 덩어리 (번쩍임·오라·광원). 크기 r(px) */
  glow(x: number, y: number, r: number, tint: number, ms: number, from = 0.3, alpha = 1, depth = DEPTH_FX, delay = 0): void {
    this.emit({ x, y, tex: SKT.glow, tint, life: ms, s0: (r / 32) * from, s1: r / 32, alpha, depth, fade: 1, delay });
  }

  /** 바닥 광원 (가산, 납작한 타원) — 폭발이 바닥을 비춘다 */
  light(x: number, y: number, r: number, tint: number, ms: number, alpha = 0.8, delay = 0): void {
    this.emit({ x, y, tex: SKT.glow, tint, life: ms, s0: r / 32, s1: (r / 32) * 1.15, sy: 0.6, alpha, depth: DEPTH_GROUND + 3, fade: 1.2, delay });
  }

  /** 퍼지는 고리 하나 (바닥은 납작하게) */
  ring(x: number, y: number, r: number, color: number, ms: number, w = 3, delay = 0, depth = DEPTH_FX - 1, from = 0.15): void {
    const tex = w >= 3 ? SKT.ring : SKT.ringThin;
    this.emit({ x, y, tex, tint: color, life: ms, s0: (r * from) / 46, s1: r / 46, sy: 0.62, delay, depth, fade: 1.1 });
  }

  /** 오므라드는 고리 (기 모으기·빨아들이기) */
  implode(x: number, y: number, r: number, color: number, ms: number, delay = 0): void {
    this.emit({ x, y, tex: SKT.ringThin, tint: color, life: ms, s0: r / 46, s1: 0.05, sy: 0.62, delay, alpha: 0.9, fade: 3, fadeIn: 0.2 });
  }

  /** 불티 줄 (속도 방향으로 늘어나는 빛): 사방 또는 ang±spread 방향 */
  sparks(x: number, y: number, n: number, tints: readonly number[], speed: number, o: { ang?: number; spread?: number; ay?: number; life?: number; s?: number; delay?: number; flat?: number } = {}): void {
    const k = this.n(n);
    for (let i = 0; i < k; i++) {
      const a = o.ang === undefined ? Math.random() * TAU : o.ang + (Math.random() - 0.5) * (o.spread ?? 1);
      const v = speed * rnd(0.5, 1.15);
      this.emit({
        x,
        y,
        tex: SKT.streak,
        tint: pick(tints),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * (o.flat ?? 0.75),
        ay: o.ay ?? 0,
        drag: 2.6,
        life: (o.life ?? 380) * rnd(0.7, 1.2),
        s0: o.s ?? 0.5,
        s1: (o.s ?? 0.5) * 0.4,
        stretch: 0.012,
        delay: o.delay,
        fade: 2,
      });
    }
  }

  /** 반짝 별 몇 개 (치명타·결정·별빛) */
  twinkle(x: number, y: number, n: number, r: number, tint: number, life = 420, s = 0.5): void {
    for (let i = 0; i < this.n(n); i++) {
      const a = Math.random() * TAU;
      const d = Math.random() * r;
      this.emit({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, tex: SKT.star, tint, life: life * rnd(0.7, 1.2), s0: s * rnd(0.6, 1.3), s1: 0.05, vy: -12, vr: rnd(-3, 3), delay: Math.random() * 120, fade: 1 });
    }
  }

  /** 바닥 자국 (그을음·서리·넋 얼룩, 보통 섞기) */
  scar(x: number, y: number, r: number, color: number, ms: number, alpha = 0.55, delay = 200): void {
    this.emit({ x, y, tex: SKT.glow, tint: color, add: false, life: ms, s0: r / 26, s1: r / 24, sy: 0.6, alpha, depth: DEPTH_GROUND - 2, fade: 3, delay });
  }

  /** 시전 컷인: 몸 둘레 오라 번쩍 + 위로 솟는 빛 기둥(big) + 둘레에서 모여드는 입자 */
  cutIn(x: number, y: number, b: BranchId, big = false): void {
    const p = PALETTES[b];
    this.glow(x, y - 8, big ? 40 : 26, p.main, big ? 380 : 260, 0.2, 0.7);
    this.glow(x, y - 8, big ? 18 : 12, 0xffffff, 160, 0.4, 0.5);
    this.light(x, y, big ? 34 : 22, p.main, 420, 0.7);
    if (big) this.emit({ x, y: y + 2, tex: SKT.pillar, tint: p.light, life: 440, s0: 0.6, s1: 1.1, sy: 0.3, originY: 1, alpha: 0.95 });
    if (big) this.emit({ x, y: y + 2, tex: SKT.pillar, tint: p.light, life: 440, s0: 1.0, s1: 0.6, sy: 1.6, originY: 1, alpha: 0.9 });
    const n = this.n(big ? 16 : 9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r = big ? 30 : 20;
      this.emit({ x: x + Math.cos(a) * r, y: y - 6 + Math.sin(a) * r * 0.6, tex: SKT.streak, tint: pick(p.parts), vx: -Math.cos(a) * r * 4, vy: -Math.sin(a) * r * 2.4 - 20, life: 240, s0: 0.5, s1: 0.2, stretch: 0.02, fade: 2 });
    }
    this.ring(x, y, big ? 34 : 22, p.light, 300, 2);
  }

  /** 바닥 마법진 (원형 경고): ms 동안 돌며 차오른다 */
  circle(x: number, y: number, r: number, b: BranchId, ms: number): void {
    const p = PALETTES[b];
    const sc = this.scene;
    const rune = sc.add.image(x, y, SKT.rune).setDepth(DEPTH_GROUND).setTint(p.main).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    const k = (r * 2) / 128;
    rune.setScale(k, k * 0.62);
    const st = { t: 0 };
    sc.tweens.add({
      targets: st,
      t: 1,
      duration: ms,
      onUpdate: () => rune.setAlpha(Math.min(1, st.t * 3) * 0.95).setRotation(st.t * 1.6),
      onComplete: () => {
        sc.tweens.add({ targets: rune, alpha: 0, scaleX: k * 1.2, scaleY: k * 0.62 * 1.2, duration: 220, onComplete: () => rune.destroy() });
      },
    });
    // 안쪽이 차오르는 빛
    this.emit({ x, y, tex: SKT.glow, tint: p.main, life: ms + 120, s0: 0.05, s1: (r * 1.3) / 32, sy: 0.6, alpha: 0.55, depth: DEPTH_GROUND - 1, fade: 4 });
    this.implode(x, y, r * 1.1, p.light, ms);
  }

  /**
   * 폭발 (겹겹이): 번쩍 핵 → 충격파 고리 → 불티 줄 → 잔불·파편·넋 빛 → 바닥 광원·그을음. power 1~3
   */
  burst(x: number, y: number, r: number, b: BranchId, power = 2): void {
    const p = PALETTES[b];
    this.glow(x, y - 6, r * 1.1, p.main, 300 + power * 70, 0.25, 0.6);
    this.glow(x, y - 6, r * 0.45, 0xffffff, 170, 0.3, 0.45);
    this.light(x, y, r * 1.2, p.main, 500 + power * 120, 0.8);
    for (let i = 0; i <= power; i++) this.ring(x, y, r * (1 + i * 0.18), i === 0 ? p.light : i % 2 ? p.main : p.dark, 300 + i * 90, i === 0 ? 3 : 2, i * 55, DEPTH_GROUND + 4);
    this.sparks(x, y - 6, 8 + power * 6, p.parts, r * 5, { life: 360 + power * 40, ay: b === "frost" ? 120 : -40 });
    const m = this.n(4 + power * 4);
    for (let i = 0; i < m; i++) {
      const ox = (Math.random() - 0.5) * r * 1.4;
      const oy = (Math.random() - 0.5) * r * 0.8;
      if (b === "ember") this.emit({ x: x + ox, y: y + oy, tex: SKT.ember, tint: pick(p.parts), vx: rnd(-10, 10), vy: rnd(-60, -30), drag: 0.5, life: rnd(700, 1200), delay: rnd(80, 280), s0: 1.2, s1: 0.4 });
      else if (b === "frost") this.emit({ x: x + ox, y: y + oy - 16, tex: SKT.shard, add: false, tint: 0xffffff, vx: rnd(-20, 20), vy: -40, ay: 200, life: rnd(500, 800), delay: rnd(60, 220), s0: 1.1, s1: 0.6, vr: rnd(-8, 8) });
      else this.emit({ x: x + ox, y: y + oy, tex: SKT.wisp, tint: pick(p.parts), vx: Math.sin(i) * 20, vy: -45, drag: 0.6, life: rnd(800, 1200), delay: rnd(80, 300), s0: 0.6, s1: 0.2 });
    }
    this.scar(x, y, r * 0.9, b === "ember" ? 0x1a0a04 : b === "frost" ? 0xd8f4ff : 0x2a1a4a, 1100, b === "frost" ? 0.35 : 0.5);
  }

  /** 맞은 자리 빛 (모든 스킬 타격): 갈래 색 번쩍 + 짧은 불티. crit이면 금빛 별 */
  hitSpark(x: number, y: number, b: BranchId, crit: boolean, heavy = false): void {
    const p = PALETTES[b];
    this.glow(x, y, crit ? 20 : heavy ? 13 : 9, crit ? 0xffb02e : p.main, crit ? 220 : 150, 0.4, crit ? 0.75 : 0.5);
    this.sparks(x, y, crit ? 9 : heavy ? 6 : 3, crit ? [0xffffff, 0xffe39a, 0xff9a3c] : p.parts, crit ? 230 : 160, { life: crit ? 300 : 220, s: crit ? 0.6 : 0.45 });
    if (crit) {
      this.emit({ x, y, tex: SKT.star, tint: 0xfff3c8, life: 260, s0: 0.4, s1: 2.0, vr: 4, fade: 1 });
      this.twinkle(x, y - 4, 5, 18, 0xffe39a, 460, 0.45);
    }
  }

  /** 부채꼴 경고 + 휩쓸기 (ang: 바라보는 각도) — 지금은 바닥 빛만 */
  cone(x: number, y: number, ang: number, range: number, arcDeg: number, b: BranchId, ms = 120): void {
    const p = PALETTES[b];
    const sc = this.scene;
    const g = sc.add.graphics().setDepth(DEPTH_GROUND).setBlendMode(Phaser.BlendModes.ADD);
    const half = (arcDeg / 2) * (Math.PI / 180);
    const st = { t: 0, a: 1 };
    const draw = () => {
      g.clear();
      g.fillStyle(p.main, 0.3 * st.a).slice(x, y, range * Math.min(1, st.t), ang - half, ang + half, false).fillPath();
      g.lineStyle(2, p.light, 0.9 * st.a).beginPath().arc(x, y, range * Math.min(1, st.t), ang - half, ang + half, false).strokePath();
    };
    sc.tweens.add({
      targets: st,
      t: 1,
      duration: ms,
      ease: "Quad.easeOut",
      onUpdate: draw,
      onComplete: () => sc.tweens.add({ targets: st, a: 0, duration: 260, onUpdate: draw, onComplete: () => g.destroy() }),
    });
  }

  /** 잔상: 스프라이트를 갈래 색으로 한 장 남겨 흐려지게 */
  ghost(sprite: Phaser.GameObjects.Sprite, b: BranchId, alpha = 0.5, ms = 320, tint?: number): void {
    if (this.reduced || !sprite.texture) return;
    const g = this.scene.add
      .image(sprite.x, sprite.y, sprite.texture.key, sprite.frame?.name)
      .setOrigin(sprite.originX, sprite.originY)
      .setFlipX(sprite.flipX)
      .setDepth(sprite.depth - 1)
      .setTintFill(tint ?? PALETTES[b].main)
      .setAlpha(alpha)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: g, alpha: 0, scaleX: 1.12, duration: ms, onComplete: () => g.destroy() });
  }

  /** 두 점 사이 빛줄기 (넋 사슬·순간이동 자국). jag>0이면 번개처럼 꺾이며 떨린다 */
  beam(x0: number, y0: number, x1: number, y1: number, b: BranchId, ms = 260, w = 2, jag = 0, delay = 0): void {
    const p = PALETTES[b];
    const g = this.scene.add.graphics().setDepth(DEPTH_FX).setBlendMode(Phaser.BlendModes.ADD).setVisible(delay <= 0);
    const st = { a: 1 };
    const segs = jag > 0 ? Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 10)) : 1;
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const nl = Math.hypot(nx, ny) || 1;
    const draw = () => {
      g.clear();
      const pts: [number, number][] = [[x0, y0]];
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const off = (Math.random() - 0.5) * jag * 2;
        pts.push([x0 + (x1 - x0) * t + (nx / nl) * off, y0 + (y1 - y0) * t + (ny / nl) * off]);
      }
      pts.push([x1, y1]);
      for (const [lw, col, al] of [
        [w + 4, p.dark, 0.35],
        [w + 1.5, p.main, 0.7],
        [Math.max(1, w - 0.5), 0xffffff, 1],
      ] as const) {
        g.lineStyle(lw, col, al * st.a).beginPath().moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.strokePath();
      }
    };
    this.scene.tweens.add({ targets: st, a: 0, delay, duration: ms, onStart: () => g.setVisible(true), onUpdate: draw, onComplete: () => g.destroy() });
  }

  // ── 화면 전체 ──

  /** 화면 좌표 (sx,sy: 화면 px) → 화면에 고정된 객체 위치 (카메라 확대를 되돌린다) */
  screenPos(sx: number, sy: number): { x: number; y: number } {
    const cam = this.scene.cameras.main;
    const z = this.zoom;
    return { x: cam.width / 2 + (sx - cam.width / 2) / z, y: cam.height / 2 + (sy - cam.height / 2) / z };
  }

  /** 화면 전체 번쩍 (초당 3번 이하, 움직임 줄이기면 안 함) */
  screenFlash(color: number, alpha = 0.3, ms = 140): boolean {
    if (this.reduced) return false;
    const now = performance.now();
    if (now - this.lastFlash < FLASH_GAP_MS) return false;
    this.lastFlash = now;
    const cam = this.scene.cameras.main;
    const f = this.scene.add
      .rectangle(cam.width / 2, cam.height / 2, cam.width * 2, cam.height * 2, color, alpha)
      .setScrollFactor(0)
      .setDepth(DEPTH_SCREEN)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: f, alpha: 0, duration: ms, ease: "Quad.easeOut", onComplete: () => f.destroy() });
    return true;
  }

  /** 화면에 깔리는 색 (어둡게·물들이기). ms 동안 머물다 걷힌다 */
  screenTint(color: number, alpha: number, inMs: number, holdMs: number, outMs: number, add = false): void {
    const cam = this.scene.cameras.main;
    const r = this.scene.add
      .rectangle(cam.width / 2, cam.height / 2, cam.width * 2, cam.height * 2, color, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH_SCREEN - 20)
      .setAlpha(0)
      .setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    this.scene.tweens.chain({
      targets: r,
      tweens: [
        { alpha, duration: inMs, ease: "Quad.easeOut" },
        { alpha, duration: holdMs },
        { alpha: 0, duration: outMs, ease: "Quad.easeIn", onComplete: () => r.destroy() },
      ],
    });
  }

  /** 화면 테두리 어두워짐 */
  vignette(inMs: number, holdMs: number, outMs: number, alpha = 0.9): void {
    const cam = this.scene.cameras.main;
    const v = this.scene.add
      .image(cam.width / 2, cam.height / 2, SKT.vignette)
      .setScrollFactor(0)
      .setDepth(DEPTH_SCREEN - 10)
      .setDisplaySize(cam.width * 1.15, cam.height * 1.15)
      .setAlpha(0);
    this.scene.tweens.chain({
      targets: v,
      tweens: [
        { alpha, duration: inMs, ease: "Quad.easeOut" },
        { alpha, duration: holdMs },
        { alpha: 0, duration: outMs, onComplete: () => v.destroy() },
      ],
    });
  }

  /** 궁극기 연출이 도는 중인가 */
  get ultBusy(): boolean {
    return performance.now() < this.ultUntil;
  }

  /** 월드 좌표 → 화면 px */
  toScreen(wx: number, wy: number): { x: number; y: number } {
    const v = this.scene.cameras.main.worldView;
    const z = this.zoom;
    return { x: (wx - v.x) * z, y: (wy - v.y) * z };
  }

  /** 지금 화면(월드 좌표)에 보이는 범위 */
  private view(): { x: number; y: number; w: number; h: number } {
    const v = this.scene.cameras.main.worldView;
    return { x: v.x, y: v.y, w: v.width || 1, h: v.height || 1 };
  }

  /** 화면 크기 (px) · 대각선 · 큰 그림 밀도 */
  private frame(): { W: number; H: number; D: number; Hc: number; dens: number; a: number } {
    const cam = this.scene.cameras.main;
    const W = cam.width;
    const H = cam.height;
    // Hc: 큰 그림 높이 기준 (세로로 긴 휴대폰 화면에서 불기둥·결정이 화면을 하얗게 덮지 않게 너비로 묶는다)
    return { W, H, D: Math.hypot(W, H), Hc: Math.min(H, W * 1.4), dens: (this.mobile ? 0.6 : 1) * (this.reduced ? 0.6 : 1), a: this.reduced ? 0.5 : 1 };
  }

  /** 암전: 배경이 어두워지고(inMs) 머물다 걷힌다. 빛(연출)은 어둠 위에서 빛난다. 움직임 줄이기면 안 함 */
  private dim(alpha: number, inMs: number, holdMs: number, outMs: number): void {
    if (this.reduced) return;
    const cam = this.scene.cameras.main;
    const r = this.scene.add
      .rectangle(cam.width / 2, cam.height / 2, cam.width * 3, cam.height * 3, 0x03020a, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH_DIM)
      .setAlpha(0);
    this.scene.tweens.chain({
      targets: r,
      tweens: [
        { alpha, duration: inMs, ease: "Quad.easeOut" },
        { alpha, duration: holdMs },
        { alpha: 0, duration: outMs, ease: "Sine.easeInOut", onComplete: () => r.destroy() },
      ],
    });
  }

  /** 대형 광원 플래시 (화면 px): 방사선 빛줄기 두 겹 + 흰 핵 + 갈래 색 후광 + 가로 빛살 + 충격파 */
  private flare(sx: number, sy: number, b: BranchId, k = 1, delay = 0): void {
    const p = PALETTES[b];
    const { W, D, a } = this.frame();
    const base = { screen: true, x: sx, y: sy, delay } as const;
    // 움직임 줄이기: 번쩍이는 빛줄기·충격파 없이 은은한 후광만
    if (this.reduced) {
      this.big({ ...base, tex: SKT.glow, tint: p.main, life: 700, s0: (D * 0.1 * k) / 64, s1: (D * 0.4 * k) / 64, alpha: 0.35, fadeIn: 0.3, fadeOut: 0.7 });
      return;
    }
    this.big({ ...base, tex: SKT.rays, tint: p.light, life: 620, s0: (D * 0.12 * k) / 256, s1: (D * 0.9 * k) / 256, rot: Math.random() * TAU, vr: 0.9, alpha: 0.8 * a, fadeOut: 0.6 });
    this.big({ ...base, tex: SKT.rays, tint: p.main, life: 760, delay: delay + 40, s0: (D * 0.2 * k) / 256, s1: (D * 1.25 * k) / 256, rot: Math.random() * TAU, vr: -0.5, alpha: 0.6 * a, fadeOut: 0.7 });
    this.big({ ...base, tex: SKT.glow, tint: 0xffffff, life: 220, s0: (D * 0.04 * k) / 64, s1: (D * 0.14 * k) / 64, alpha: 0.85 * a, fadeOut: 0.8 });
    this.big({ ...base, tex: SKT.glow, tint: p.dark, life: 700, s0: (D * 0.1 * k) / 64, s1: (D * 0.6 * k) / 64, alpha: 0.5 * a, fadeOut: 0.75 });
    this.big({ ...base, tex: SKT.streakH, tint: p.light, life: 400, s0: (W * 0.3) / 256, s1: (W * 1.7 * k) / 256, sy: 2.6, alpha: 0.9 * a, fadeOut: 0.7 });
    this.big({ ...base, tex: SKT.shock, tint: p.light, life: 560, delay: delay + 30, s0: (D * 0.04) / 256, s1: (D * 1.1 * k) / 256, sy: 0.72, alpha: 0.9 * a, fadeOut: 0.8 });
  }

  /** 잔불·서리·빛 가루가 화면 전체에 흩날린다 (월드 입자, from ms 뒤부터 span ms에 걸쳐) */
  private dust(b: BranchId, n: number, from: number, span: number): void {
    const v = this.view();
    const p = PALETTES[b];
    for (let i = 0; i < this.n(n); i++) {
      const x = v.x + rnd(0, v.w);
      const y = v.y + rnd(0, v.h);
      const delay = from + rnd(0, span);
      if (b === "ember") this.emit({ x, y: y + v.h * 0.2, tex: i % 3 ? SKT.ember : SKT.streak, tint: pick(p.parts), vx: rnd(-25, 25), vy: rnd(-110, -40), drag: 0.4, life: rnd(900, 1600), delay, s0: i % 3 ? rnd(1.2, 2.2) : 0.6, s1: 0.3, stretch: i % 3 ? 0 : 0.01, fade: 1.6 });
      else if (b === "frost") this.emit({ x: x - v.w * 0.2, y: y - v.h * 0.2, tex: i % 4 ? SKT.shard : SKT.star, add: i % 4 === 0, tint: 0xffffff, vx: rnd(50, 110), vy: rnd(35, 70), life: rnd(1200, 1800), delay, s0: rnd(0.8, 1.4), s1: 0.5, vr: rnd(-4, 4), fade: 2, fadeIn: 0.15 });
      else this.emit({ x, y, tex: i % 3 ? SKT.wisp : SKT.star, tint: pick([0xfff3c8, 0x9ff0dc, 0xd8c0ff, 0xffffff]), vx: rnd(-14, 14), vy: rnd(-45, -15), life: rnd(1100, 1800), delay, s0: i % 3 ? rnd(0.4, 0.8) : 0.45, s1: 0.1, vr: 2, fade: 1.4, fadeIn: 0.2 });
    }
  }

  /**
   * 궁극기 화면 연출 (약 1.8초, 글자 없음): 암전(0.15초) → 갈래 색 대형 광원 플래시 → 화면을 가로지르는 거대한 형태
   * (모닥불: 불기둥 벽 + 용솟음 화염 파도 / 서리: 화면 가득 얼음 결정이 돋아 깨짐 + 눈보라 휘몰이 / 넋: 넋들이 소용돌이치며 휩쓰는 행렬)
   * → 잔불·서리·빛 가루 → 서서히 원래 밝기. 동시에 1개만 (이미 돌고 있으면 false — 판정은 그대로, 화면 연출만 건너뛴다)
   */
  ultimate(b: BranchId, at: { x: number; y: number }): boolean {
    if (this.ultBusy) return false;
    this.ultUntil = performance.now() + 1700;
    this.cineUntil = this.ultUntil;
    const o = this.toScreen(at.x, at.y - 10);
    this.dim(0.62, 150, 950, 650);
    this.scene.time.delayedCall(130, () => this.screenFlash(PALETTES[b].light, 0.38, 240));
    this.flare(o.x, o.y, b, 1, 120);
    if (b === "ember") this.emberWall(o, true);
    else if (b === "frost") this.frostBloom(o, true);
    else this.soulVortex(o, true);
    return true;
  }

  /**
   * 범위기 화면 연출 (약 1초): full = 궁극기처럼 암전 + 플래시 + 화면을 덮는 형태(조금 짧고 가볍게),
   * sweep = 짧은 부채꼴 스킬용 (암전 없이 바라보는 쪽으로 화면 끝까지 휩쓸기). 다른 화면 연출이 돌고 있으면 건너뛴다
   */
  areaCine(b: BranchId, at: { x: number; y: number }, mode: "full" | "sweep" = "full", ang = 0): boolean {
    const now = performance.now();
    if (now < this.cineUntil) return false;
    const o = this.toScreen(at.x, at.y - 8);
    if (mode === "sweep") {
      this.cineUntil = now + 450;
      this.flare(o.x, o.y, b, 0.4);
      this.sweep(o, b, ang);
      return true;
    }
    this.cineUntil = now + 1000;
    this.dim(0.5, 150, 420, 480);
    this.scene.time.delayedCall(110, () => this.screenFlash(PALETTES[b].light, 0.32, 200));
    this.flare(o.x, o.y, b, 0.7, 100);
    if (b === "ember") this.emberWall(o, false);
    else if (b === "frost") this.frostBloom(o, false);
    else this.soulVortex(o, false);
    return true;
  }

  /** 모닥불: 화면 아래에서 불기둥 벽이 시전자부터 바깥으로 차례로 솟고, 화염 파도가 용솟음친다 */
  private emberWall(o: { x: number; y: number }, ult: boolean): void {
    const { W, H, Hc, dens, a } = this.frame();
    const K = Math.max(4, Math.round((ult ? 11 : 8) * dens));
    // 불기둥은 늘 화면 아래 가장자리에서 솟는다 (중간에서 솟으면 바닥이 잘린 띠처럼 보인다)
    const baseY = H * 1.04;
    const life = ult ? 1050 : 820;
    for (let i = 0; i < K; i++) {
      const x = ((i + 0.5) / K) * W + rnd(-0.02, 0.02) * W;
      const near = 1 - Math.min(1, Math.abs(x - o.x) / W);
      const h = Hc * (ult ? 0.72 + 0.42 * near : 0.5 + 0.32 * near) * rnd(0.88, 1.06);
      const d = 150 + (Math.abs(x - o.x) / W) * (ult ? 420 : 260);
      const k = h / 192;
      const sx = Phaser.Math.Clamp(((W / K) * 2.1) / (96 * k), 0.6, 1.25) * (Math.random() < 0.5 ? -1 : 1);
      const tex = i % 2 ? SKT.bigFlame : SKT.bigFlame2;
      // 뒤 붉은 층 (반 칸 어긋나게 · 더 크고 어둡게)
      this.big({ screen: true, tex: i % 2 ? SKT.bigFlame2 : SKT.bigFlame, x: x + (W / K) * 0.5, y: baseY, oy: 1, tint: 0xff3a10, life: life + 60, delay: d + 50, s0: k * 0.12, s1: k * rnd(1.0, 1.2), grow: "back", sx: -sx * 1.15, alpha: 0.6 * a, fadeIn: 0.1, fadeOut: 0.45, sway: 0.07, swayHz: 2.2, flick: 0.09 });
      this.big({ screen: true, tex, x, y: baseY, oy: 1, life, delay: d, s0: k * 0.12, s1: k, grow: "back", sx, alpha: 0.88 * a, fadeIn: 0.08, fadeOut: 0.42, sway: 0.05, swayHz: 2.8, flick: 0.08 });
      this.big({ screen: true, tex: SKT.glow, x, y: baseY - h * 0.15, tint: 0xff6a1e, life: life * 0.9, delay: d, s0: W / K / 64, s1: ((W / K) * 3) / 64, sy: 1.4, alpha: 0.4 * a, fadeOut: 0.6 });
      // 불길 위로 피어오르는 검붉은 연기 (보통 섞기: 밝은 불 사이에 깊이를 준다)
      if (i % 2 === 0) this.big({ screen: true, tex: SKT.smoke, add: false, x: x + rnd(-0.3, 0.3) * (W / K), y: baseY - h * 0.85, y1: baseY - h * 1.25, tint: 0x2a0c06, life: life + 300, delay: d + 200, s0: (h * 0.3) / 128, s1: (h * 0.75) / 128, vr: rnd(-0.6, 0.6), alpha: 0.55 * a, fadeIn: 0.25, fadeOut: 0.5, depth: DEPTH_CINE - 1 });
    }
    // 용솟음 화염 파도: 화면 아래에서 솟구쳐 화면 아래쪽을 덮었다가 가라앉는다
    const th = Hc * (ult ? 0.6 : 0.4);
    const ks = th / 128;
    const tw = 256 * ks;
    const n = Math.ceil(W / (tw * 0.75)) + 1;
    for (let i = 0; i < n; i++) {
      const x = i * tw * 0.75;
      const flip = i % 2 ? -1 : 1;
      this.big({ screen: true, tex: SKT.flameWave, x, y: baseY + th, y1: baseY + th * 0.02, x1: x + W * 0.06 * flip, path: "out", oy: 1, life: ult ? 950 : 700, delay: (ult ? 360 : 230) + i * 45, s0: ks * 0.85, s1: ks * 1.05, sx: flip, alpha: 0.7 * a, fadeIn: 0.1, fadeOut: 0.45, flick: 0.05 });
    }
    // 위로 솟는 굵은 불티 줄
    const v = this.view();
    for (let i = 0; i < this.n(ult ? 60 : 30) * dens; i++)
      this.emit({ x: v.x + rnd(0, v.w), y: v.y + v.h + 6, tex: SKT.streak, tint: pick(PALETTES.ember.parts), vx: rnd(-40, 40), vy: rnd(-420, -220), drag: 0.6, life: rnd(600, 1000), delay: rnd(150, 800), s0: rnd(0.8, 1.4), s1: 0.3, stretch: 0.012 });
    this.screenTint(0xff5a1a, ult ? 0.14 : 0.08, 160, ult ? 650 : 350, 600, true);
    this.dust("ember", ult ? 70 : 36, ult ? 500 : 300, ult ? 1200 : 700);
  }

  /** 서리: 화면 가득 얼음 결정 무리가 돋아나(아래 · 위에서) 산산이 깨지고, 눈보라가 휘몰아친다 */
  private frostBloom(o: { x: number; y: number }, ult: boolean): void {
    const { W, H, D, Hc, dens, a } = this.frame();
    const F = PALETTES.frost;
    const K = Math.max(4, Math.round((ult ? 10 : 7) * dens));
    const baseY = ult ? H * 1.03 : Math.min(H * 1.03, o.y + H * 0.3);
    const grow = ult ? 640 : 460;
    const rows: { y: number; rot: number; hk: number; n: number }[] = [{ y: baseY, rot: 0, hk: ult ? 1 : 0.7, n: K }];
    if (ult) rows.push({ y: -H * 0.03, rot: Math.PI, hk: 0.5, n: Math.max(3, K - 3) });
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const x = ((i + 0.5) / row.n) * W + rnd(-0.03, 0.03) * W;
        const near = 1 - Math.min(1, Math.abs(x - o.x) / W);
        const h = Hc * (0.36 + 0.3 * near) * row.hk * rnd(0.88, 1.08);
        const d = 130 + (Math.abs(x - o.x) / W) * (ult ? 380 : 240);
        const k = h / 256;
        const end = d + grow;
        // 결정 뒤 차가운 빛
        this.big({ screen: true, tex: SKT.glow, x, y: row.y + (row.rot ? h * 0.3 : -h * 0.3), tint: F.main, life: grow + 260, delay: d, s0: (h * 0.3) / 64, s1: (h * 1.3) / 64, alpha: 0.6 * a, fadeOut: 0.5 });
        // 결정 무리 (돋아남 → 끝에 살짝 부풀며 깨짐)
        this.big({ screen: true, tex: SKT.cluster, add: false, x, y: row.y, oy: 1, rot: row.rot + rnd(-0.08, 0.08), life: grow, delay: d, s0: k * 0.08, s1: k * 1.05, grow: "back", sx: rnd(0.85, 1.15) * (i % 2 ? -1 : 1), alpha: 0.98 * a, fadeIn: 0.06, fadeOut: 0.12 });
        // 깨지는 순간: 흰 번쩍 + 큰 얼음 조각이 튄다
        this.big({ screen: true, tex: SKT.glow, x, y: row.y + (row.rot ? h * 0.45 : -h * 0.45), tint: 0xffffff, life: 260, delay: end - 30, s0: (h * 0.4) / 64, s1: (h * 1.4) / 64, alpha: 0.9 * a, fadeOut: 0.9 });
        const m = Math.max(2, Math.round((this.mobile ? 3 : 5) * (this.reduced ? 0.5 : 1)));
        for (let j = 0; j < m; j++) {
          const sy0 = row.y + (row.rot ? 1 : -1) * h * rnd(0.15, 0.85);
          const s = (h * rnd(0.1, 0.2)) / 220;
          this.big({ screen: true, tex: SKT.crystal, add: false, x: x + rnd(-0.15, 0.15) * h, y: sy0, x1: x + rnd(-1, 1) * W * 0.14, y1: sy0 + rnd(-0.08, 0.3) * H, path: "out", rot: rnd(0, TAU), vr: rnd(-9, 9), life: rnd(420, 620), delay: end - 20, s0: s, s1: s * 0.6, alpha: a, fadeOut: 0.5 });
        }
      }
    }
    // 화면 가장자리에 서리가 낀다
    this.big({ screen: true, tex: SKT.vigW, x: W / 2, y: H / 2, tint: F.main, life: ult ? 1900 : 1100, s0: 1, s1: 1, sx: (W * 1.12) / 128, sy: (H * 1.12) / 128, alpha: (ult ? 0.85 : 0.6) * a, fadeIn: 0.15, fadeOut: 0.45, depth: DEPTH_CINE - 2 });
    // 눈보라 휘몰이 (시전자를 중심으로 소용돌이 두 겹)
    const sw = { screen: true, tex: SKT.swirl, x: o.x, y: o.y, fadeIn: 0.2, fadeOut: 0.45 } as const;
    this.big({ ...sw, tint: 0xe8f8ff, life: ult ? 1600 : 1000, delay: 200, s0: (D * 0.3) / 256, s1: (D * (ult ? 1.15 : 0.8)) / 256, vr: 3.4, sy: 0.75, alpha: 0.5 * a });
    if (ult) this.big({ ...sw, tint: F.main, life: 1400, delay: 320, s0: (D * 0.5) / 256, s1: (D * 1.4) / 256, vr: 2.4, rot: 1, sy: 0.7, alpha: 0.4 * a });
    // 비스듬한 눈보라 줄
    const v = this.view();
    for (let i = 0; i < this.n(ult ? 100 : 50) * dens; i++) {
      const sp = rnd(320, 560);
      this.emit({ x: v.x + rnd(-v.w * 0.3, v.w), y: v.y + rnd(-v.h * 0.4, v.h * 0.8), tex: SKT.streak, tint: pick([0xffffff, 0xd8f4ff, 0x9fdcff]), vx: sp, vy: sp * 0.4, life: rnd(500, 900), delay: rnd(200, ult ? 1200 : 700), s0: rnd(0.4, 0.7), s1: 0.3, sy: 1.6, stretch: 0.0035, alpha: 0.85 });
    }
    if (!this.reduced) this.scene.time.delayedCall(ult ? 780 : 600, () => this.screenFlash(0xffffff, ult ? 0.35 : 0.22, 180));
    this.screenTint(0xcfefff, ult ? 0.12 : 0.07, 160, ult ? 700 : 350, 600, true);
    this.dust("frost", ult ? 60 : 30, ult ? 700 : 450, ult ? 1100 : 600);
  }

  /** 넋: 넋들이 시전자를 중심으로 소용돌이치며 화면을 휩쓸고(궁극기), 두 줄 행렬로 가로지른다(범위기). 하늘에서 빛기둥 */
  private soulVortex(o: { x: number; y: number }, ult: boolean): void {
    const { W, H, D, Hc, dens, a } = this.frame();
    const S = PALETTES.soul;
    const gh = (Hc * (ult ? 0.22 : 0.17)) / 160;
    const tints = [0xffffff, 0x9ff0dc, 0xd8c0ff, 0xf2ecff];
    if (ult) {
      // 넋 소용돌이: 화면 밖에서부터 감아 들어와 시전자에게 모인다
      const N = Math.max(8, Math.round(22 * dens));
      for (let i = 0; i < N; i++) {
        this.big({ screen: true, tex: SKT.ghost, x: o.x, y: o.y, orbit: { r0: D * rnd(0.5, 0.72), r1: D * 0.03, a0: (i / N) * TAU, v: 3.3, flat: 0.72 }, face: Math.PI / 2, tint: pick(tints), life: rnd(1150, 1350), delay: 150 + (i % 5) * 50, s0: gh * rnd(0.8, 1.05), s1: gh * 0.4, alpha: 0.95 * a, fadeIn: 0.15, fadeOut: 0.22, flick: 0.04 });
      }
      // 모인 넋이 터진다
      this.flare(o.x, o.y, "soul", 0.8, 1300);
      if (!this.reduced) this.scene.time.delayedCall(1300, () => this.screenFlash(S.light, 0.3, 200));
    } else {
      // 넋 행렬: 위 줄은 왼쪽→오른쪽, 아래 줄은 오른쪽→왼쪽으로 물결치며 가로지른다
      const n = Math.max(4, Math.round(8 * dens));
      for (const [ry, dir] of [
        [o.y - H * 0.17, 1],
        [o.y + H * 0.15, -1],
      ] as const) {
        for (let j = 0; j < n; j++) {
          const x0 = dir > 0 ? -W * 0.1 : W * 1.1;
          const yy = ry + Math.sin(j * 1.3) * H * 0.04;
          this.big({ screen: true, tex: SKT.ghost, x: x0, y: yy, x1: x0 + dir * W * 1.25, y1: yy + rnd(-0.05, 0.05) * H, path: "lin", face: Math.PI / 2, tint: pick(tints), life: 760, delay: 120 + j * 55, s0: gh, s1: gh * 0.85, alpha: 0.95 * a, fadeIn: 0.1, fadeOut: 0.2, flick: 0.05 });
        }
      }
    }
    // 소용돌이 두 겹
    const sw = { screen: true, tex: SKT.swirl, x: o.x, y: o.y, fadeIn: 0.2, fadeOut: 0.4 } as const;
    this.big({ ...sw, tint: S.main, life: ult ? 1500 : 900, delay: 150, s0: (D * 0.25) / 256, s1: (D * (ult ? 1.0 : 0.6)) / 256, vr: 3, sy: 0.72, alpha: 0.55 * a });
    this.big({ ...sw, tint: S.light, life: ult ? 1300 : 800, delay: 260, s0: (D * 0.4) / 256, s1: (D * (ult ? 1.3 : 0.8)) / 256, vr: -2.2, rot: 2, sy: 0.7, alpha: 0.35 * a });
    // 하늘에서 내리꽂히는 빛기둥
    const P = Math.max(3, Math.round((ult ? 8 : 4) * dens));
    for (let i = 0; i < P; i++) {
      const x = ((i + 0.5) / P) * W + rnd(-0.04, 0.04) * W;
      const gy = H * rnd(0.55, 0.95);
      const s = (gy * 1.5) / 96;
      this.big({ screen: true, tex: SKT.pillar, x, y: gy, oy: 1, tint: pick([0xfff3c8, 0x9ff0dc, 0xd8c0ff]), life: 620, delay: (ult ? 350 : 200) + rnd(0, ult ? 700 : 300), s0: s * 0.9, s1: s, sx: (W * 0.05) / (32 * s), alpha: 0.85 * a, fadeIn: 0.12, fadeOut: 0.6 });
      this.big({ screen: true, tex: SKT.glow, x, y: gy, tint: S.light, life: 700, delay: (ult ? 350 : 200) + 60, s0: (W * 0.04) / 64, s1: (W * 0.14) / 64, sy: 0.5, alpha: 0.7 * a, fadeOut: 0.7 });
    }
    this.screenTint(0x3a1a6a, ult ? 0.16 : 0.09, 140, ult ? 750 : 350, 600, true);
    this.dust("soul", ult ? 60 : 30, ult ? 500 : 300, ult ? 1300 : 700);
  }

  /** 짧은 부채꼴 범위기: 바라보는 쪽으로 화면 끝까지 큰 형태가 휩쓸고 지나간다 (암전 없음) */
  private sweep(o: { x: number; y: number }, b: BranchId, ang: number): void {
    const { D, a, dens } = this.frame();
    const dx = Math.cos(ang);
    const dy = Math.sin(ang) * 0.75;
    const n = Math.max(3, Math.round(5 * dens));
    for (let i = 0; i < n; i++) {
      const spread = (i / (n - 1) - 0.5) * 0.8;
      const ca = Math.atan2(dy, dx) + spread;
      const far = D * rnd(0.45, 0.65);
      const tx = o.x + Math.cos(ca) * far;
      const ty = o.y + Math.sin(ca) * far;
      if (b === "ember") {
        // 화염 방사: 뿌리는 시전자에 두고 혀끝이 화면 끝까지 뻗는다
        this.big({ screen: true, tex: i % 2 ? SKT.bigFlame2 : SKT.bigFlame, x: o.x + Math.cos(ca) * D * 0.02, y: o.y + Math.sin(ca) * D * 0.02, oy: 1, rot: ca + Math.PI / 2, life: 480, delay: i * 22, s0: (D * 0.06) / 192, s1: far / 192, grow: "out", sx: 0.75 * (i % 2 ? -1 : 1), alpha: 0.9 * a, fadeIn: 0.05, fadeOut: 0.5, flick: 0.08, sway: 0.04, swayHz: 4 });
        this.big({ screen: true, tex: SKT.glow, x: (o.x + tx) / 2, y: (o.y + ty) / 2, tint: 0xff6a1e, life: 420, delay: i * 22, s0: (far * 0.2) / 64, s1: (far * 0.7) / 64, alpha: 0.35 * a, fadeOut: 0.6 });
      }
      else if (b === "frost") {
        this.big({ screen: true, tex: SKT.smoke, x: o.x, y: o.y, x1: tx, y1: ty, tint: 0xd8f4ff, life: 520, delay: i * 25, s0: (D * 0.05) / 128, s1: (D * 0.32) / 128, vr: rnd(-2, 2), alpha: 0.75 * a, fadeOut: 0.6 });
        this.big({ screen: true, tex: SKT.crystal, add: false, x: o.x + Math.cos(ca) * far * 0.35, y: o.y + Math.sin(ca) * far * 0.35, oy: 1, rot: ca + Math.PI / 2, life: 420, delay: 60 + i * 30, s0: 0.05, s1: (D * 0.14) / 220, grow: "back", alpha: a, fadeOut: 0.35 });
      } else this.big({ screen: true, tex: SKT.ghost, x: o.x, y: o.y, x1: tx, y1: ty, face: Math.PI / 2, tint: pick([0xffffff, 0x9ff0dc, 0xd8c0ff]), life: 520, delay: i * 30, s0: (D * 0.04) / 160, s1: (D * 0.12) / 160, alpha: a, fadeOut: 0.5 });
    }
  }

  /**
   * 폭발 꽃 (월드 좌표, 맞는 지점): 방사선 빛줄기 → 흰 핵 → 겹겹 충격파 → 가로 빛살 → 갈래 모양
   * (모닥불: 바깥으로 뻗는 불꽃 혀 / 서리: 사방으로 돋는 얼음 결정 / 넋: 퍼져 오르는 넋) → 바닥 광원. power 1~3
   */
  bloom(x: number, y: number, r: number, b: BranchId, power = 1): void {
    const p = PALETTES[b];
    const k = r / 128;
    const d = DEPTH_FX + 5;
    this.big({ tex: SKT.rays, x, y, tint: p.light, life: 260 + power * 70, s0: k * 0.3, s1: k * (1.5 + power * 0.35), rot: Math.random() * TAU, vr: 1.5, alpha: 0.95, fadeOut: 0.6, depth: d });
    this.big({ tex: SKT.shock, x, y, tint: 0xffffff, life: 220 + power * 40, s0: k * 0.2, s1: k * 1.4, sy: 0.8, alpha: 0.9, fadeOut: 0.8, depth: d });
    this.big({ tex: SKT.shock, x, y, tint: p.main, life: 340 + power * 60, delay: 50, s0: k * 0.3, s1: k * (1.9 + power * 0.25), sy: 0.72, alpha: 0.85, fadeOut: 0.8, depth: d });
    if (power >= 2) this.big({ tex: SKT.shock, x, y, tint: p.dark, life: 460 + power * 60, delay: 110, s0: k * 0.4, s1: k * (2.4 + power * 0.3), sy: 0.65, alpha: 0.7, fadeOut: 0.8, depth: d });
    this.big({ tex: SKT.streakH, x, y, tint: p.light, life: 200 + power * 30, s0: k * 0.8, s1: k * (2.2 + power * 0.5), sy: 0.8, alpha: 0.9, fadeOut: 0.9, depth: d + 1 });
    this.glow(x, y, r * 0.5, 0xffffff, 160, 0.4, 0.8, d + 2);
    this.glow(x, y, r * 1.4, p.main, 340 + power * 60, 0.3, 0.55);
    this.light(x, y + r * 0.35, r * 1.8, p.main, 600 + power * 100, 0.9);
    const n = this.reduced ? 3 : this.mobile ? 5 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.25, 0.25);
      const far = r * rnd(0.7, 1.1);
      const tx = x + Math.cos(a) * far;
      const ty = y + Math.sin(a) * far * 0.7;
      if (b === "ember") this.big({ tex: SKT.bigFlame, x, y, x1: tx, y1: ty, oy: 0.9, rot: a + Math.PI / 2, life: 320 + power * 50, s0: (r * 0.2) / 192, s1: (r * 0.9) / 192, sx: 0.8, alpha: 0.95, fadeOut: 0.6, flick: 0.1, depth: d });
      else if (b === "frost") this.big({ tex: SKT.crystal, add: false, x: x + Math.cos(a) * r * 0.1, y: y + Math.sin(a) * r * 0.07, oy: 1, rot: a + Math.PI / 2, life: 380 + power * 60, s0: 0.02, s1: (r * rnd(0.55, 0.85)) / 220, grow: "back", alpha: 1, fadeOut: 0.3, depth: d - 1 });
      else this.big({ tex: SKT.ghost, x, y, x1: tx, y1: ty - r * 0.5, face: Math.PI / 2, tint: pick([0xffffff, 0x9ff0dc, 0xd8c0ff]), life: 420 + power * 60, s0: (r * 0.15) / 160, s1: (r * 0.45) / 160, alpha: 0.95, fadeOut: 0.5, depth: d });
    }
  }

  /**
   * 화면 손맛: 1 = 살짝 흔들림, 2 = 흔들림 + 줌 펀치, 3 = 강한 흔들림 + 줌 펀치 + 번쩍, 4 = 궁극기 (더 세게).
   * 움직임 줄이기면 아무것도 안 한다. 번쩍은 초당 3번 이하.
   */
  punch(level: 1 | 2 | 3 | 4, b: BranchId): void {
    if (this.reduced) return;
    const cam = this.scene.cameras.main;
    const ms = [0, 100, 170, 260, 380][level];
    const k = [0, 0.003, 0.0055, 0.009, 0.013][level];
    cam.shake(ms, k);
    if (level >= 2) {
      // 줌 펀치: 살짝 당겼다가 되돌린다 (겹쳐도 원래 배율로 돌아오게 기준을 기억해 둔다)
      if (!this.scene.tweens.isTweening(cam)) this.baseZoom = cam.zoom;
      const z = this.baseZoom || cam.zoom;
      this.scene.tweens.killTweensOf(cam);
      cam.setZoom(z * [1, 1, 1.045, 1.08, 1.11][level]);
      this.scene.tweens.add({ targets: cam, zoom: z, duration: level >= 3 ? 280 : 180, ease: "Quad.easeOut" });
    }
    if (level >= 3) this.screenFlash(PALETTES[b].light, level === 4 ? 0.3 : 0.24, 140);
  }

  /** 줌 펀치 중 화면 크기가 바뀌면 (applyZoom) 기준 배율을 다시 잡는다 */
  resetZoom(z: number): void {
    this.scene.tweens.killTweensOf(this.scene.cameras.main);
    this.baseZoom = z;
  }
}
