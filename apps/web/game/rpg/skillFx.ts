import * as Phaser from "phaser";
import { BRANCH_INFO, type BranchId } from "@/lib/rpg/skillTree";
import { art } from "./skillArt";
import { shakeEnabled } from "@/lib/shakePref";

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
  pillar: "skfx-pillar",
  flame: "skfx-flame",
  streak: "skfx-streak",
  star: "skfx-star",
  cloud: "skfx-cloud",
  spike: "skfx-spike",
  ring: "skfx-ring",
  ringThin: "skfx-ring-thin",
  crack: "skfx-crack",
  log: "skfx-log",
  // 충격파 고리 (폭발 꽃 2단 이상)
  shock: "skfx-shock",
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




/** 화면 연출용 큰 텍스처 (색을 구워 둔다). 게임 텍스처 관리자에 한 번만 만들어 씬이 바뀌어도 재사용 */
function ensureBigTextures(scene: Phaser.Scene): void {
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

/** 바닥 범위 표시 모양 (판정과 같은 기하) */
export type Zone =
  | { kind: "circle"; x: number; y: number; r: number }
  | { kind: "cone"; x: number; y: number; ang: number; range: number; arcDeg: number }
  | { kind: "band"; x0: number; y0: number; x1: number; y1: number; w: number };

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
  /**
   * 단·랭크 강도 계수 (skillPower): 1단 1랭크 ≈ 0.75 (단정) ~ 5단 만랭크 ≈ 1.5 (화려).
   * 크기·층수·입자 수·광원·흔들림이 이 값을 따른다. 시전할 때 HuntScene이 정한다
   */
  pw = 1;

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
    return Math.max(1, Math.round(k * Phaser.Math.Clamp(this.pw, 0.6, 1.6) * (this.reduced ? 0.4 : this.mobile ? 0.7 : 1)));
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
  view(): { x: number; y: number; w: number; h: number } {
    const v = this.scene.cameras.main.worldView;
    return { x: v.x, y: v.y, w: v.width || 1, h: v.height || 1 };
  }

  /** 화면 크기 (px) · 대각선 · 큰 그림 밀도 */
  private frame(): { W: number; H: number; D: number; Hc: number; dens: number; a: number } {
    const cam = this.scene.cameras.main;
    const W = cam.width;
    const H = cam.height;
    // Hc: 큰 그림 높이 기준 (세로로 긴 휴대폰 화면에서 화면을 하얗게 덮지 않게 너비로 묶는다)
    return { W, H, D: Math.hypot(W, H), Hc: Math.min(H, W * 1.4), dens: (this.mobile ? 0.6 : 1) * (this.reduced ? 0.5 : 1), a: this.reduced ? 0.55 : 1 };
  }

  /** 암전: 배경이 어두워지고(inMs) 머물다 걷힌다. 빛(연출)은 어둠 위에서 빛난다. 움직임 줄이기면 아주 옅게 */
  private dim(alpha: number, inMs: number, holdMs: number, outMs: number, color = 0x03020a): void {
    const cam = this.scene.cameras.main;
    const r = this.scene.add
      .rectangle(cam.width / 2, cam.height / 2, cam.width * 3, cam.height * 3, color, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH_DIM)
      .setAlpha(0);
    const a = this.reduced ? alpha * 0.4 : alpha;
    this.scene.tweens.chain({
      targets: r,
      tweens: [
        { alpha: a, duration: inMs, ease: "Quad.easeOut" },
        { alpha: a, duration: holdMs },
        { alpha: 0, duration: outMs, ease: "Sine.easeInOut", onComplete: () => r.destroy() },
      ],
    });
  }

  // ── 범위·방향 표시 (실제 판정과 같은 모양) ──

  /**
   * 바닥 범위 표시: 시전 직전 ms 동안 테두리가 빛나며 안쪽이 차오르고, 끝(판정 순간)에 한 번 번쩍인 뒤 사라진다.
   * 판정과 똑같은 기하로 그린다 — 원(aoeAt: 중심 거리 < r), 부채꼴(inAttackArea: 시전자에서 range·arcDeg), 띠(선분 거리 < w).
   * 바닥은 납작하게 줄이지 않는다 (판정이 납작하지 않으니까).
   */
  zone(z: Zone, b: BranchId, ms: number): void {
    const p = PALETTES[b];
    const sc = this.scene;
    const g = sc.add.graphics().setDepth(DEPTH_GROUND + 5).setBlendMode(Phaser.BlendModes.ADD);
    const st = { t: 0, a: 1 };
    const lw = 1 + (this.pw > 1.2 ? 0.5 : 0);
    const shape = (k: number) => {
      if (z.kind === "circle") g.beginPath().arc(z.x, z.y, z.r * k, 0, TAU).closePath();
      else if (z.kind === "cone") {
        const half = (z.arcDeg / 2) * (Math.PI / 180);
        g.beginPath().moveTo(z.x, z.y).arc(z.x, z.y, z.range * k, z.ang - half, z.ang + half, false).closePath();
      } else {
        const ang = Math.atan2(z.y1 - z.y0, z.x1 - z.x0);
        const nx = -Math.sin(ang) * z.w;
        const ny = Math.cos(ang) * z.w;
        g.beginPath().moveTo(z.x0 + nx, z.y0 + ny).lineTo(z.x1 + nx, z.y1 + ny).arc(z.x1, z.y1, z.w, ang + Math.PI / 2, ang - Math.PI / 2, true).lineTo(z.x0 - nx, z.y0 - ny).arc(z.x0, z.y0, z.w, ang - Math.PI / 2, ang + Math.PI / 2, true).closePath();
      }
    };
    const draw = () => {
      g.clear();
      const pulse = 0.75 + 0.25 * Math.sin(st.t * 18);
      // 안쪽: 판정까지 남은 시간만큼 차오른다
      g.fillStyle(p.main, (0.1 + 0.12 * st.t) * st.a);
      shape(z.kind === "band" ? 1 : Math.max(0.05, st.t));
      g.fillPath();
      // 테두리: 판정 범위 그대로 (밝게 깜빡인다)
      g.lineStyle(lw + 1.5, p.main, 0.35 * st.a * pulse);
      shape(1);
      g.strokePath();
      g.lineStyle(lw, 0xffffff, 0.85 * st.a * pulse);
      shape(1);
      g.strokePath();
      // 부채꼴은 가운데 방향선 + 끝 화살촉 (어느 쪽으로 나가는지)
      if (z.kind === "cone") {
        const ex = z.x + Math.cos(z.ang) * z.range;
        const ey = z.y + Math.sin(z.ang) * z.range;
        g.lineStyle(lw, p.light, 0.8 * st.a).lineBetween(z.x, z.y, ex, ey);
        this.chevron(g, ex, ey, z.ang, 5, p.light, 0.9 * st.a);
      }
    };
    draw();
    sc.tweens.add({
      targets: st,
      t: 1,
      duration: Math.max(120, ms),
      onUpdate: draw,
      onComplete: () => {
        // 판정 순간: 테두리가 확 밝아졌다가 사라진다
        g.setAlpha(1);
        sc.tweens.add({ targets: st, a: 0, duration: 260, ease: "Quad.easeIn", onUpdate: draw, onComplete: () => g.destroy() });
      },
    });
  }

  /** 화살촉 하나 (ang 방향) */
  private chevron(g: Phaser.GameObjects.Graphics, x: number, y: number, ang: number, s: number, color: number, alpha: number): void {
    const l = ang + Math.PI * 0.8;
    const r = ang - Math.PI * 0.8;
    g.fillStyle(color, alpha).fillTriangle(x + Math.cos(ang) * s, y + Math.sin(ang) * s, x + Math.cos(l) * s, y + Math.sin(l) * s, x + Math.cos(r) * s, y + Math.sin(r) * s);
  }

  /**
   * 방향 표시: 시전 순간 발밑에서 바라보는 쪽으로 화살표 + 투사체가 지나갈 궤적(점선)이 len까지 짧게 빛난다.
   * 투사체 여러 발이면 angs마다 한 줄씩.
   */
  aim(x: number, y: number, angs: number[], len: number, b: BranchId, ms = 320): void {
    const p = PALETTES[b];
    const sc = this.scene;
    const g = sc.add.graphics().setDepth(DEPTH_GROUND + 6).setBlendMode(Phaser.BlendModes.ADD);
    const st = { t: 0 };
    const draw = () => {
      g.clear();
      const a = 1 - st.t;
      for (const ang of angs) {
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        // 궤적: 점선이 앞으로 흘러간다
        const dash = 6;
        const off = (st.t * 24) % (dash * 2);
        for (let d = 8 + off; d < len; d += dash * 2) {
          const e = Math.min(len, d + dash);
          g.lineStyle(1, p.light, 0.7 * a * (1 - d / len) + 0.15 * a).lineBetween(x + dx * d, y + dy * d, x + dx * e, y + dy * e);
        }
        this.chevron(g, x + dx * len, y + dy * len, ang, 4, p.light, 0.7 * a);
      }
      // 발밑 큰 화살표 (첫 방향)
      const ang = angs[Math.floor(angs.length / 2)];
      this.chevron(g, x + Math.cos(ang) * 14, y + Math.sin(ang) * 14, ang, 7, 0xffffff, 0.9 * a);
      this.chevron(g, x + Math.cos(ang) * 9, y + Math.sin(ang) * 9, ang, 5, p.main, 0.7 * a);
    };
    draw();
    sc.tweens.add({ targets: st, t: 1, duration: ms, ease: "Quad.easeIn", onUpdate: draw, onComplete: () => g.destroy() });
  }

  /** 지점 조준: 시전자 → 목표 점선 + 목표에 범위 원 (낙하·소용돌이 스킬) */
  aimAt(from: { x: number; y: number }, to: { x: number; y: number }, r: number, b: BranchId, ms: number): void {
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const len = Math.max(10, Math.hypot(to.x - from.x, to.y - from.y) - r);
    this.aim(from.x, from.y, [ang], len, b, Math.min(ms, 420));
    this.zone({ kind: "circle", x: to.x, y: to.y, r }, b, ms);
  }

  /** 화면 전체 범위 표시 (궁극기): 화면 테두리가 갈래 색으로 빛났다가 사라진다 */
  screenZone(b: BranchId, ms: number): void {
    const p = PALETTES[b];
    const cam = this.scene.cameras.main;
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_SCREEN - 5).setBlendMode(Phaser.BlendModes.ADD);
    const st = { t: 0 };
    const draw = () => {
      g.clear();
      const z = this.zoom;
      const o = this.screenPos(0, 0);
      const w = cam.width / z;
      const h = cam.height / z;
      const a = st.t < 0.15 ? st.t / 0.15 : 1 - (st.t - 0.15) / 0.85;
      const pulse = 0.7 + 0.3 * Math.sin(st.t * 30);
      for (let i = 0; i < 3; i++) {
        const ins = (2 + i * 3) / z;
        g.lineStyle((4 - i) / z, i === 0 ? 0xffffff : p.main, (0.8 - i * 0.22) * a * pulse).strokeRect(o.x + ins, o.y + ins, w - ins * 2, h - ins * 2);
      }
    };
    draw();
    this.scene.tweens.add({ targets: st, t: 1, duration: ms, onUpdate: draw, onComplete: () => g.destroy() });
  }

  // ── 범위기 강조 (단 3 이상, 스킬마다 고유 그림) ──

  /**
   * 범위기 강조 (단 3 이상): 짧은 암전 + 스킬 고유 그림의 잔상이 판정 범위(반지름 r) 크기에서 한 번 더 번지며 사라진다
   * (같은 그림을 돌려 쓰지 않고, 판정보다 크게 부풀려 범위를 속이지 않는다). 강도는 단·랭크 계수(pw)를 따른다.
   * 다른 강조나 궁극기가 돌고 있으면 건너뛴다.
   */
  accent(at: { x: number; y: number }, b: BranchId, artName: string, r: number, o: { vr?: number; ms?: number; oy?: number } = {}): boolean {
    const now = performance.now();
    if (now < this.cineUntil) return false;
    const ms = o.ms ?? 700;
    this.cineUntil = now + ms * 0.8;
    const k = Phaser.Math.Clamp((this.pw - 0.8) / 0.7, 0, 1);
    this.dim(0.2 + 0.25 * k, 90, ms * 0.35, ms * 0.5);
    const tex = art(this.scene, artName);
    const sc = (r * 2) / this.texSize(tex);
    this.big({ tex, x: at.x, y: at.y, oy: o.oy ?? 0.5, life: ms, s0: sc * 0.92, s1: sc * 1.12, vr: o.vr ?? 0.4, alpha: 0.35 + 0.25 * k, fadeOut: 0.8, depth: DEPTH_FX + 1 });
    this.glow(at.x, at.y - 6, r * (1.2 + 0.5 * k), PALETTES[b].main, ms * 0.7, 0.4, 0.35 + 0.2 * k);
    if (k > 0.5) this.screenFlash(PALETTES[b].light, 0.1 + 0.12 * k, 160);
    return true;
  }

  // ── 궁극기 (화면 전체, 1.5~2.5초 연속 동작) ──

  /**
   * 궁극기 연출: 준비 → 기 모으기 → 발사/폭발 → 여파. castMs 동안 이어지는 하나의 애니메이션이다.
   * 실제 피해는 HuntScene이 SKILL_FX.hitAt 박자마다 넣고, 그 순간의 화면 연출은 ultBeat(b, i, last)가 한다.
   * 동시에 1개만 (이미 돌고 있으면 false — 판정은 그대로, 화면 연출만 건너뛴다)
   */
  ultimate(b: BranchId, at: { x: number; y: number }, castMs: number, hitAt: readonly number[]): boolean {
    if (this.ultBusy) return false;
    this.ultUntil = performance.now() + castMs;
    this.cineUntil = this.ultUntil;
    this.screenZone(b, hitAt[0] + 260);
    if (b === "ember") this.ultEmber(at, castMs, hitAt);
    else if (b === "frost") this.ultFrost(at, castMs, hitAt);
    else this.ultSoul(at, castMs, hitAt);
    return true;
  }

  /** 큰 모닥불: 해 바퀴 문양이 깔리고 불씨가 감겨 들어 장작더미에 불이 붙는다 → 거대한 불기둥 폭발 → 박자마다 화염 벽이 화면 아래에서 번갈아 휩쓴다 → 재가 내린다 */
  private ultEmber(at: { x: number; y: number }, castMs: number, hitAt: readonly number[]): void {
    const { D, a } = this.frame();
    const E = PALETTES.ember;
    const v = this.view();
    const t0 = hitAt[0];
    const tEnd = hitAt[hitAt.length - 1];
    this.dim(0.62, 260, tEnd - 100, castMs - tEnd + 200);
    // 준비 (0~350): 바닥 해 바퀴 + 감겨 드는 불씨
    const sunS = (Math.min(v.w, v.h) * 0.62) / 256;
    this.big({ tex: art(this.scene, "bonfire-sun"), x: at.x, y: at.y, depth: DEPTH_GROUND + 2, life: castMs - 150, s0: sunS * 0.1, s1: sunS, grow: "back", vr: 0.5, alpha: 0.85 * a, fadeIn: 0.1, fadeOut: 0.25 });
    for (let i = 0; i < this.n(30); i++) {
      const ang = (i / 30) * TAU;
      this.emit({ x: at.x, y: at.y, tex: SKT.ember, tint: pick(E.parts), orb: { ox: at.x, oy: at.y - 6, r: Math.min(v.w, v.h) * 0.45, a: ang, v: 4, dr: -Math.min(v.w, v.h) * 0.6, flat: 0.7 }, life: 700, delay: (i % 6) * 40, s0: 1.6, s1: 0.4, fade: 2 });
    }
    // 기 모으기 (250~t0): 장작더미가 솟고 불이 붙어 커진다 + 땅울림
    const pyre = art(this.scene, "bonfire-pyre");
    const ph = v.h * 0.42;
    this.big({ tex: pyre, x: at.x, y: at.y + 4, oy: 1, depth: DEPTH_FX + 3, life: castMs - 250, delay: 250, s0: (ph * 0.3) / 200, s1: ph / 200, grow: "out", alpha: a, fadeIn: 0.1, fadeOut: 0.3, flick: 0.05, sway: 0.03, swayHz: 3 });
    this.later(260, () => {
      if (!this.reduced && shakeEnabled()) this.scene.cameras.main.shake(t0 - 260, 0.0016);
    });
    for (let k = 0; k < 4; k++) this.ring(at.x, at.y, Math.min(v.w, v.h) * (0.5 - k * 0.08), E.light, 260, 2, 250 + k * 130, DEPTH_GROUND + 6, 1.4);
    this.screenTint(0xff5a1a, 0.1, t0, tEnd - t0, castMs - tEnd, true);
    // 폭발 (t0): 고유 불살 섬광 + 거대한 나선 불기둥
    const s = this.toScreen(at.x, at.y - 20);
    this.big({ screen: true, tex: art(this.scene, "bonfire-flare"), x: s.x, y: s.y, delay: t0 - 40, life: 620, s0: (D * 0.08) / 256, s1: (D * 0.75) / 256, vr: 0.8, alpha: 0.6 * a, fadeOut: 0.75 });
    this.big({ tex: art(this.scene, "bonfire-pillar"), x: at.x, y: at.y + 6, oy: 1, depth: DEPTH_FX + 6, delay: t0 - 30, life: tEnd - t0 + 500, s0: (v.h * 0.3) / 256, s1: (v.h * 0.95) / 256, grow: "back", sx: 0.9, alpha: 0.85 * a, fadeIn: 0.05, fadeOut: 0.3, flick: 0.06 });
    this.later(t0 - 20, () => this.screenFlash(0xffd27a, 0.32, 200));
    // 여파: 재가 화면에 내린다 + 연기
    const ash = art(this.scene, "bonfire-ash");
    for (let i = 0; i < this.n(40); i++)
      this.emit({ x: v.x + rnd(-0.1, 1) * v.w, y: v.y - rnd(0, v.h * 0.3), tex: ash, add: false, vx: rnd(-10, 25), vy: rnd(30, 70), life: rnd(1200, 1800), delay: tEnd - 200 + rnd(0, 500), s0: rnd(0.35, 0.6), s1: 0.25, vr: rnd(-4, 4), fade: 2.5, fadeIn: 0.15, depth: DEPTH_FX + 40 });
    for (let i = 0; i < this.n(10); i++)
      this.emit({ x: at.x + rnd(-1, 1) * v.w * 0.35, y: at.y + rnd(-0.2, 0.3) * v.h, tex: SKT.cloud, tint: 0x2a1610, add: false, vx: rnd(-12, 12), vy: rnd(-24, -8), life: 1400, delay: tEnd + rnd(0, 300), s0: 1, s1: 2.6, alpha: 0.45, fadeIn: 0.2 });
  }

  /** 한겨울 눈보라: 화면 가장자리에 서리가 끼고 거대한 눈 결정 만다라가 모여든다 → 박자마다 눈보라 돌풍이 화면을 가로지르고 → 만다라가 깨져 눈송이로 흩어진다 */
  private ultFrost(at: { x: number; y: number }, castMs: number, hitAt: readonly number[]): void {
    const { W, H, a } = this.frame();
    const v = this.view();
    const t0 = hitAt[0];
    const tEnd = hitAt[hitAt.length - 1];
    this.dim(0.5, 220, tEnd - 60, castMs - tEnd + 200, 0x020818);
    // 준비: 서리 액자 (가장자리부터 얼어붙는다)
    this.big({ screen: true, tex: art(this.scene, "blizzard-frame"), x: W / 2, y: H / 2, life: castMs, s0: 1, s1: 1, sx: (W * 1.06) / 256, sy: (H * 1.06) / 256, alpha: 0.85 * a, fadeIn: 0.15, fadeOut: 0.3, depth: DEPTH_CINE - 2 });
    // 기 모으기: 만다라가 화면 크기에서 시전자 둘레로 오므라들며 돈다
    const mS = (Math.min(v.w, v.h) * 0.7) / 256;
    this.big({ tex: art(this.scene, "blizzard-mandala"), x: at.x, y: at.y - 4, depth: DEPTH_GROUND + 3, life: tEnd + 120, delay: 120, s0: mS * 2.2, s1: mS, grow: "out", vr: 1.4, alpha: 0.9 * a, fadeIn: 0.15, fadeOut: 0.1 });
    const flake = art(this.scene, "blizzard-flake");
    for (let i = 0; i < this.n(26); i++)
      this.emit({ x: at.x, y: at.y, tex: flake, orb: { ox: at.x, oy: at.y - 6, r: Math.min(v.w, v.h) * rnd(0.4, 0.6), a: (i / 26) * TAU, v: 5, dr: -Math.min(v.w, v.h) * 0.55, flat: 0.8 }, life: t0 - 100, delay: 100 + (i % 5) * 30, s0: 0.7, s1: 0.3, vr: 3, fade: 2 });
    this.screenTint(0xcfefff, 0.1, 200, tEnd - 200, castMs - tEnd, true);
    // 여파: 마지막 박자에 만다라가 깨진다 (흰 번쩍 + 눈송이가 사방으로)
    this.later(tEnd, () => {
      this.screenFlash(0xffffff, 0.3, 200);
      for (let i = 0; i < this.n(30); i++) {
        const ang = Math.random() * TAU;
        const sp = rnd(80, 220);
        this.emit({ x: at.x + Math.cos(ang) * mS * 100, y: at.y - 4 + Math.sin(ang) * mS * 70, tex: flake, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.7, drag: 2, ay: 30, life: rnd(900, 1400), s0: rnd(0.6, 1.1), s1: 0.3, vr: rnd(-6, 6), fade: 2 });
      }
      for (let i = 0; i < this.n(24); i++)
        this.emit({ x: v.x + rnd(0, v.w), y: v.y + rnd(-0.2, 0.6) * v.h, tex: flake, add: false, vx: rnd(-8, 8), vy: rnd(14, 34), life: rnd(1100, 1600), delay: rnd(0, 300), s0: rnd(0.4, 0.8), s1: 0.3, vr: rnd(-2, 2), fade: 2, fadeIn: 0.2 });
    });
  }

  /** 별빛 행렬: 하늘이 보랏빛으로 어두워지고 별이 돋는다 → 오로라가 드리우고 시전자 위 큰 별이 차오른다 → 박자마다 넋 순례자 행렬이 화면을 가로지른다 → 넋불이 올라간다 */
  private ultSoul(at: { x: number; y: number }, castMs: number, hitAt: readonly number[]): void {
    const { W, H, a } = this.frame();
    const v = this.view();
    const t0 = hitAt[0];
    const tEnd = hitAt[hitAt.length - 1];
    this.dim(0.66, 300, tEnd - 100, castMs - tEnd + 200, 0x0c0420);
    // 준비: 화면 곳곳에 별이 돋는다
    const starT = art(this.scene, "proc-star");
    for (let i = 0; i < this.n(22); i++)
      this.emit({ x: v.x + rnd(0, v.w), y: v.y + rnd(0, v.h * 0.85), tex: starT, life: rnd(1200, 1900), delay: rnd(0, 500), s0: 0.02, s1: rnd(0.08, 0.16), vr: rnd(-1, 1), fade: 3, fadeIn: 0.3, depth: DEPTH_FX + 30 });
    // 기 모으기: 오로라 커튼이 위에서 드리운다
    const aur = art(this.scene, "proc-aurora");
    const n = Math.max(2, Math.ceil(W / 256 / Math.max(0.6, H / 2 / 128)) + 1);
    const ak = (H * 0.55) / 128;
    for (let i = 0; i < n; i++) this.big({ screen: true, tex: aur, x: (i + 0.5) * (W / n), y: -H * 0.25, y1: 0, path: "out", oy: 0, life: castMs - 200, delay: 200 + i * 60, s0: ak, s1: ak, sx: (W / n / 256 / ak) * 1.25 * (i % 2 ? -1 : 1), alpha: 0.85 * a, fadeIn: 0.2, fadeOut: 0.3, depth: DEPTH_CINE - 3 });
    // 시전자 위 큰 별이 차오른다 → 첫 박자에 터진다
    const sk = (Math.min(v.w, v.h) * 0.5) / 128;
    this.big({ tex: starT, x: at.x, y: at.y - 24, depth: DEPTH_FX + 8, life: t0 + 200, delay: 250, s0: sk * 0.15, s1: sk, grow: "out", vr: 1.2, alpha: a, fadeIn: 0.2, fadeOut: 0.25 });
    this.later(t0 - 20, () => this.screenFlash(0xfff3c8, 0.3, 200));
    this.screenTint(0x3a1a6a, 0.12, 250, tEnd - 250, castMs - tEnd, true);
    // 여파: 넋불이 하늘로 올라간다
    const wisp = art(this.scene, "wisp-orb");
    for (let i = 0; i < this.n(26); i++)
      this.emit({ x: v.x + rnd(0, v.w), y: v.y + v.h * rnd(0.5, 1), tex: wisp, vx: rnd(-8, 8), vy: rnd(-70, -35), life: rnd(1100, 1600), delay: tEnd - 100 + rnd(0, 400), s0: rnd(0.25, 0.4), s1: 0.08, fade: 1.6, fadeIn: 0.2 });
  }

  /**
   * 궁극기 박자 하나 (화면): 모닥불은 화면 아래에서 화염 벽이 번갈아 휩쓸고, 서리는 눈보라 돌풍이 비스듬히 가로지르고,
   * 넋은 순례자 행렬이 한 줄 지나간다. i: 몇 번째 박자, last: 마지막
   */
  ultBeat(b: BranchId, i: number, last: boolean): void {
    const { W, H, Hc, dens, a } = this.frame();
    const dir = i % 2 ? -1 : 1;
    if (b === "ember") {
      const wall = art(this.scene, "bonfire-wall");
      const th = Hc * (last ? 0.62 : 0.42 + i * 0.03);
      const k = th / 128;
      const tw = 256 * k;
      const n = Math.max(2, Math.ceil(W / (tw * 0.8)) + 1);
      for (let j = 0; j < n; j++) {
        const x = dir > 0 ? j * tw * 0.8 : W - j * tw * 0.8;
        this.big({ screen: true, tex: wall, x, y: H + th, y1: H + th * 0.04, path: "out", oy: 1, life: last ? 780 : 560, delay: j * 45, s0: k * 0.9, s1: k, sx: j % 2 ? -1 : 1, alpha: 0.85 * a, fadeIn: 0.08, fadeOut: 0.45, flick: 0.05 });
      }
      if (last) this.big({ screen: true, tex: art(this.scene, "bonfire-flare"), x: W / 2, y: H * 1.05, life: 640, s0: (W * 0.3) / 256, s1: (W * 1.1) / 256, vr: -0.6, alpha: 0.5 * a, fadeOut: 0.7 });
    } else if (b === "frost") {
      const gust = art(this.scene, "blizzard-gust");
      const rows = last ? 3 : 2;
      for (let r = 0; r < rows; r++) {
        const y = H * (0.2 + (r + (i % 2) * 0.5) * (0.6 / rows));
        const k = (W * 0.9) / 256;
        this.big({ screen: true, tex: gust, x: -W * 0.5, y: y - H * 0.1, x1: W * 1.5, y1: y + H * 0.12, path: "lin", rot: 0.22, life: 520, delay: r * 70, s0: k, s1: k, sy: 1.4, alpha: 0.9 * a, fadeIn: 0.1, fadeOut: 0.25 });
      }
      const v = this.view();
      for (let j = 0; j < this.n(24) * dens; j++) {
        const sp = rnd(380, 600);
        this.emit({ x: v.x + rnd(-v.w * 0.3, v.w), y: v.y + rnd(-v.h * 0.3, v.h * 0.8), tex: SKT.streak, tint: pick([0xffffff, 0xd8f4ff, 0x9fdcff]), vx: sp, vy: sp * 0.3, life: rnd(300, 500), delay: rnd(0, 150), s0: rnd(0.4, 0.7), s1: 0.3, sy: 1.6, stretch: 0.0035, alpha: 0.85 });
      }
    } else {
      const pil = art(this.scene, "proc-pilgrim");
      const y = H * (0.42 + ((i % 3) - 1) * 0.17);
      const gk = (Hc * 0.16) / 96;
      const n = Math.max(3, Math.round((last ? 7 : 5) * dens));
      for (let j = 0; j < n; j++) {
        const x0 = dir > 0 ? -W * 0.08 - j * W * 0.09 : W * 1.08 + j * W * 0.09;
        this.big({ screen: true, tex: pil, x: x0, y: y + Math.sin(j * 1.7) * H * 0.03, x1: x0 + dir * W * 1.35, path: "lin", life: 900, s0: gk, s1: gk, sx: dir, alpha: 0.95 * a, fadeIn: 0.1, fadeOut: 0.15, sway: 0.06, swayHz: 2.5 });
      }
      if (last) this.big({ screen: true, tex: art(this.scene, "proc-star"), x: W / 2, y: H * 0.35, life: 700, s0: (W * 0.1) / 128, s1: (W * 0.9) / 128, vr: 0.5, alpha: 0.7 * a, fadeOut: 0.6 });
    }
  }

  /**
   * 폭발 꽃 (월드 좌표, 맞는 지점): 스킬 고유 섬광 그림(flare) → 흰 핵 → (power 2+) 충격파 → 고유 꽃잎(petal)이 사방으로 → 바닥 광원.
   * flare·petal은 skillArt 이름 (스킬마다 다르다). spin=false면 돌리지 않고 oy 기준으로 세운다 (튀어 오르는 모양). power 1~3
   */
  bloom(x: number, y: number, r: number, b: BranchId, power: number, look: { flare?: string; petal?: string; spin?: boolean; oy?: number; face?: number }): void {
    const p = PALETTES[b];
    const d = DEPTH_FX + 5;
    const k = Phaser.Math.Clamp(this.pw, 0.7, 1.6);
    if (look.flare) {
      const ft = art(this.scene, look.flare);
      const fs = (r * 2.2 * k) / this.texSize(ft);
      const spin = look.spin !== false;
      this.big({ tex: ft, x, y, oy: look.oy ?? 0.5, life: 300 + power * 70, s0: fs * 0.25, s1: fs, grow: "back", rot: spin ? Math.random() * TAU : 0, vr: spin ? 1.2 : 0, alpha: 0.95, fadeOut: 0.55, depth: d });
    }
    if (power >= 2) this.big({ tex: SKT.shock, x, y, tint: p.main, life: 320 + power * 60, delay: 40, s0: (r / 128) * 0.3, s1: (r / 128) * (1.7 + power * 0.25) * k, alpha: 0.75, fadeOut: 0.8, depth: d });
    this.glow(x, y, r * 0.5, 0xffffff, 160, 0.4, 0.8, d + 2);
    this.glow(x, y, r * 1.3 * k, p.main, 320 + power * 60, 0.3, 0.5);
    this.light(x, y + r * 0.35, r * 1.7 * k, p.main, 600 + power * 100, 0.85);
    if (!look.petal) return;
    const pt = art(this.scene, look.petal);
    const n = Math.round((this.reduced ? 3 : this.mobile ? 5 : 7) * Math.min(1.3, k));
    const pk = (r * 0.7 * k) / this.texSize(pt);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.2, 0.2);
      const far = r * rnd(0.7, 1.1) * k;
      this.big({ tex: pt, x, y, x1: x + Math.cos(a) * far, y1: y + Math.sin(a) * far * 0.75, oy: 0.8, rot: a + (look.face ?? Math.PI / 2), life: 340 + power * 60, s0: pk * 0.3, s1: pk, alpha: 0.95, fadeOut: 0.55, depth: d });
    }
  }

  /** 텍스처의 긴 변 (px) */
  texSize(key: string): number {
    const src = this.scene.textures.get(key).getSourceImage() as { width: number; height: number };
    return Math.max(1, src.width, src.height);
  }

  private later(ms: number, fn: () => void): void {
    this.scene.time.delayedCall(ms, fn);
  }

  /**
   * 화면 손맛: 1 = 살짝 흔들림, 2 = 흔들림 + 줌 펀치, 3 = 강한 흔들림 + 줌 펀치 + 번쩍, 4 = 궁극기 (더 세게).
   * 움직임 줄이기면 아무것도 안 한다. 번쩍은 초당 3번 이하.
   */
  punch(level: 1 | 2 | 3 | 4, b: BranchId): void {
    if (this.reduced) return;
    const cam = this.scene.cameras.main;
    // 단·랭크 계수만큼 흔들림이 세진다 (1단 스킬은 단정하게)
    const pw = Phaser.Math.Clamp(this.pw, 0.7, 1.6);
    const ms = [0, 100, 170, 260, 380][level] * (0.8 + 0.2 * pw);
    const k = [0, 0.003, 0.0055, 0.009, 0.013][level] * pw;
    cam.shake(ms, k);
    if (level >= 2) {
      // 줌 펀치: 살짝 당겼다가 되돌린다 (겹쳐도 원래 배율로 돌아오게 기준을 기억해 둔다)
      if (!this.scene.tweens.isTweening(cam)) this.baseZoom = cam.zoom;
      const z = this.baseZoom || cam.zoom;
      this.scene.tweens.killTweensOf(cam);
      cam.setZoom(z * (1 + ([0, 0, 0.045, 0.08, 0.11][level] * (0.6 + 0.4 * pw))));
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
