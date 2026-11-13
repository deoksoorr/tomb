import * as Phaser from "phaser";
import { BRANCH_INFO, type BranchId } from "@/lib/rpg/skillTree";

// 스킬 연출 엔진 (모닥불 · 서리 · 넋). 특정 게임 그림을 쓰지 않고 코드로 그린 빛·불꽃·얼음·넋 텍스처를 겹겹이 쌓는다.
//  - 입자는 풀(재사용 이미지)에서 꺼내 한 번의 update 루프로 움직인다 (트윈을 입자마다 만들지 않는다 → 휴대폰도 60fps 목표)
//    속도·중력·끌림·늘어남(속도 방향으로 길게 = 불티 줄)·궤도(소용돌이·회오리) 를 입자 하나가 다 한다
//  - 부드러운 빛(빛 덩어리·불꽃·안개·고리)은 선형 필터로 만들어 크게 키워도 계단이 지지 않는다 (게임은 pixelArt라 기본이 최근접)
//  - 화면 전체 연출: 테두리 어두워짐 → 전체 번쩍 → 큰 문양·이름 컷인 → 화면 가득 폭발/눈보라/넋 폭풍 (궁극기 동시에 1개)
// 움직임 줄이기면: 흔들림·번쩍·줌 없이 입자도 적게. 휴대폰(손가락 기기·작은 화면)은 입자 상한을 낮게.

export const DEPTH_FX = 1e5 + 50;
export const DEPTH_GROUND = -440;
const DEPTH_SCREEN = 2e6;
const FONT = '"Galmuri11", "Galmuri9", monospace';
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

/** 연출 텍스처 (흰색으로 그리고 색은 틴트로) */
export function ensureSkillTextures(scene: Phaser.Scene): void {
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

export class SkillFx {
  /** 동시에 떠 있는 입자 수 상한 (휴대폰은 낮게, 움직임 줄이기면 더 낮게) */
  readonly cap: number;
  readonly mobile: boolean;
  private parts: Part[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private lastFlash = -1e9;
  private baseZoom = 0;
  /** 궁극기 화면 연출이 도는 중 (동시에 1개) */
  private ultUntil = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly reduced: boolean,
  ) {
    ensureSkillTextures(scene);
    this.mobile = coarse();
    this.cap = Math.round((this.mobile ? 150 : 380) * (reduced ? 0.4 : 1));
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
    img.setPosition(o.x, o.y);
    this.parts.push({
      img,
      x: o.x,
      y: o.y,
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
        sx = s * Math.max(1, sp * p.stretch);
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
  }

  /** 씬이 끝날 때 */
  clear(): void {
    for (const p of this.parts) if (p.img.scene) p.img.destroy();
    for (const img of this.pool) if (img.scene) img.destroy();
    this.parts = [];
    this.pool = [];
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

  /**
   * 궁극기 화면 연출 (약 1.4초): 테두리 어두워짐 → 전체 색 번쩍 → 큰 문양 + 이름 띠 컷인 → 화면 가득 폭풍.
   * 동시에 1개만 (이미 돌고 있으면 false — 판정은 그대로, 화면 연출만 건너뛴다)
   */
  ultimate(b: BranchId, title: string, sub = "궁극기"): boolean {
    if (this.ultBusy) return false;
    this.ultUntil = performance.now() + 1500;
    const sc = this.scene;
    const p = PALETTES[b];
    const cam = sc.cameras.main;
    const z = this.zoom;
    const W = cam.width;
    const H = cam.height;
    // 1) 어두워짐 + 테두리
    this.screenTint(0x05040a, this.reduced ? 0.25 : 0.42, 120, 900, 380);
    this.vignette(140, 950, 400, 0.95);
    // 2) 전체 번쩍 (갈래 색)
    sc.time.delayedCall(70, () => this.screenFlash(p.light, 0.55, 220));
    // 3) 큰 문양 (화면 가운데, 돌며 커졌다가 크게 번져 사라짐)
    const emKey = b === "ember" ? SKT.emEmber : b === "frost" ? SKT.emFrost : SKT.emSoul;
    const c = this.screenPos(W / 2, H * 0.44);
    const size = Math.min(W, H) * 0.62;
    const k = size / 160 / z;
    const halo = sc.add.image(c.x, c.y, SKT.glow).setScrollFactor(0).setDepth(DEPTH_SCREEN - 5).setTint(p.main).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(((size / 64) * 0.4) / z);
    const em = sc.add.image(c.x, c.y, emKey).setScrollFactor(0).setDepth(DEPTH_SCREEN - 4).setTint(p.light).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(k * 0.25).setRotation(-0.6);
    const em2 = sc.add.image(c.x, c.y, emKey).setScrollFactor(0).setDepth(DEPTH_SCREEN - 4).setTint(p.main).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(k * 1.6).setRotation(0.4);
    sc.tweens.add({ targets: halo, alpha: 0.8, scale: ((size / 64) * 1.1) / z, duration: 260, delay: 60, ease: "Cubic.easeOut" });
    sc.tweens.add({ targets: halo, alpha: 0, duration: 400, delay: 820, onComplete: () => halo.destroy() });
    sc.tweens.add({ targets: em, alpha: 1, scale: k, rotation: 0, duration: 300, delay: 80, ease: "Back.easeOut" });
    sc.tweens.add({ targets: em, rotation: 0.35, duration: 700, delay: 380 });
    sc.tweens.add({ targets: em, alpha: 0, scale: k * 2.6, duration: 320, delay: 820, ease: "Cubic.easeIn", onComplete: () => em.destroy() });
    sc.tweens.add({ targets: em2, alpha: 0.45, scale: k * 1.05, rotation: 0, duration: 380, delay: 100, ease: "Cubic.easeOut" });
    sc.tweens.add({ targets: em2, alpha: 0, rotation: -0.4, duration: 420, delay: 760, onComplete: () => em2.destroy() });
    // 4) 이름 띠 컷인 (띠가 펼쳐지고 글자가 미끄러져 들어왔다 나간다)
    const by = this.screenPos(W / 2, H * 0.74);
    const bandH = Math.max(46, Math.min(84, H * 0.13));
    const band = sc.add.image(by.x, by.y, SKT.band).setScrollFactor(0).setDepth(DEPTH_SCREEN - 3).setTint(p.dark).setAlpha(0.88).setDisplaySize(1, bandH / z);
    const edge = sc.add.image(by.x, by.y, SKT.band).setScrollFactor(0).setDepth(DEPTH_SCREEN - 2).setTint(p.light).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9).setDisplaySize(1, (bandH * 0.12) / z);
    sc.tweens.add({ targets: band, displayWidth: (W * 1.2) / z, duration: 200, delay: 90, ease: "Cubic.easeOut" });
    sc.tweens.add({ targets: edge, displayWidth: (W * 1.2) / z, duration: 260, delay: 60, ease: "Cubic.easeOut" });
    sc.tweens.add({ targets: [band, edge], alpha: 0, duration: 260, delay: 1050, onComplete: () => (band.destroy(), edge.destroy()) });
    const fs = Math.round(Math.max(24, Math.min(46, W * 0.05)));
    const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
    const name = sc.add
      .text(by.x + W / z, by.y + 4 / z, title, { fontFamily: FONT, fontSize: `${fs}px`, fontStyle: "bold", color: "#ffffff", stroke: hex(p.dark), strokeThickness: Math.round(fs / 6), resolution: 1 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_SCREEN)
      .setScale(1 / z)
      .setShadow(0, 3, "#000000", 0, true, true);
    const subT = sc.add
      .text(by.x - W / z, by.y - (fs * 0.72) / z, sub, { fontFamily: FONT, fontSize: `${Math.round(fs * 0.42)}px`, color: hex(p.light), stroke: "#000000", strokeThickness: 3, resolution: 1 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_SCREEN)
      .setScale(1 / z);
    sc.tweens.add({ targets: name, x: by.x, duration: 240, delay: 110, ease: "Cubic.easeOut" });
    sc.tweens.add({ targets: subT, x: by.x, duration: 240, delay: 150, ease: "Cubic.easeOut" });
    sc.tweens.add({ targets: name, x: by.x - 18 / z, duration: 650, delay: 350 });
    sc.tweens.add({ targets: [name, subT], x: `-=${W / z}`, alpha: 0, duration: 220, delay: 1000, ease: "Cubic.easeIn", onComplete: () => (name.destroy(), subT.destroy()) });
    // 5) 화면 가득 폭풍
    sc.time.delayedCall(260, () => this.storm(b));
    return true;
  }

  /** 지금 화면(월드 좌표)에 보이는 범위 */
  private view(): { x: number; y: number; w: number; h: number } {
    const v = this.scene.cameras.main.worldView;
    return { x: v.x, y: v.y, w: v.width || 1, h: v.height || 1 };
  }

  /** 화면 가득 폭풍 (궁극기 뒤 약 1초): 모닥불 = 불기둥이 사방에서 솟고 불티 비 / 서리 = 비스듬한 눈보라 줄 / 넋 = 넋 행렬이 화면을 가로지르고 별이 반짝 */
  storm(b: BranchId): void {
    const v = this.view();
    const p = PALETTES[b];
    const dens = this.mobile ? 0.55 : 1;
    if (b === "ember") {
      this.screenTint(0xff5a1a, 0.16, 120, 700, 400, true);
      const cols = Math.round(14 * dens);
      for (let i = 0; i < cols; i++) {
        const x = v.x + rnd(0, v.w);
        const y = v.y + rnd(v.h * 0.15, v.h);
        const d = rnd(0, 700);
        this.emit({ x, y, tex: SKT.flame, tint: pick([0xff7a2e, 0xffb040, 0xff5a1a]), life: 560, delay: d, s0: 0.6, s1: 1.6, sy: 2.4, originY: 1, vy: -30, fade: 1.6, alpha: 0.95 });
        this.emit({ x, y, tex: SKT.flame, tint: 0xfff0b0, life: 420, delay: d, s0: 0.3, s1: 0.8, sy: 2.2, originY: 1, vy: -30, fade: 1.6 });
        this.light(x, y, 30, 0xff7a2e, 600, 0.6, d);
        this.sparks(x, y - 20, 4, p.parts, 220, { ang: -Math.PI / 2, spread: 1.2, delay: d, life: 500 });
      }
      for (let i = 0; i < this.n(60) * dens; i++)
        this.emit({ x: v.x + rnd(0, v.w), y: v.y + v.h + 4, tex: SKT.streak, tint: pick(p.parts), vx: rnd(-30, 30), vy: rnd(-260, -140), life: rnd(700, 1100), delay: rnd(0, 800), s0: 0.6, s1: 0.2, stretch: 0.01 });
    } else if (b === "frost") {
      this.screenTint(0xe8f6ff, 0.22, 160, 700, 500);
      const n = this.n(110) * dens;
      for (let i = 0; i < n; i++) {
        const x = v.x + rnd(-v.w * 0.3, v.w);
        const y = v.y + rnd(-v.h * 0.4, v.h * 0.8);
        const sp = rnd(320, 520);
        this.emit({ x, y, tex: SKT.streak, tint: pick([0xffffff, 0xd8f4ff, 0x9fdcff]), vx: sp, vy: sp * 0.42, life: rnd(500, 900), delay: rnd(0, 900), s0: rnd(0.5, 1), s1: 0.4, stretch: 0.006, alpha: 0.9 });
      }
      for (let i = 0; i < this.n(26) * dens; i++)
        this.emit({ x: v.x + rnd(0, v.w), y: v.y + rnd(0, v.h), tex: SKT.cloud, tint: 0xffffff, add: false, vx: rnd(120, 200), vy: rnd(30, 60), life: rnd(800, 1200), delay: rnd(0, 600), s0: rnd(1, 1.8), s1: 2.6, alpha: 0.5, fadeIn: 0.25 });
      for (let i = 0; i < this.n(18) * dens; i++) this.twinkle(v.x + rnd(0, v.w), v.y + rnd(0, v.h), 1, 4, 0xffffff, 700, 0.7);
    } else {
      this.screenTint(0x3a1a6a, 0.22, 120, 750, 450, true);
      const rows = 5;
      for (let r = 0; r < rows; r++) {
        const y0 = v.y + ((r + 0.5) / rows) * v.h;
        const dir = r % 2 ? -1 : 1;
        const n = Math.round(this.n(16) * dens);
        for (let i = 0; i < n; i++) {
          const x = dir > 0 ? v.x - 20 - i * 14 : v.x + v.w + 20 + i * 14;
          this.emit({ x, y: y0, tex: SKT.flame, tint: i % 3 ? 0x9ff0dc : 0xd8c0ff, vx: dir * rnd(260, 340), orb: { ox: x, oy: y0, r: 6, a: i, v: 9, flat: 1 }, life: 1100, delay: r * 90, s0: 0.5, s1: 0.35, sy: 1.2, rot: dir > 0 ? Math.PI / 2 : -Math.PI / 2 });
          this.emit({ x, y: y0, tex: SKT.wisp, tint: 0xf2ecff, vx: dir * rnd(260, 340), life: 1100, delay: r * 90 + 30, s0: 0.7, s1: 0.4 });
        }
      }
      for (let i = 0; i < this.n(30) * dens; i++) this.twinkle(v.x + rnd(0, v.w), v.y + rnd(0, v.h), 1, 4, pick([0xfff3c8, 0x9ff0dc, 0xd8c0ff]), 900, 0.7);
      for (let i = 0; i < Math.round(8 * dens); i++) {
        const x = v.x + rnd(0, v.w);
        const y = v.y + rnd(v.h * 0.3, v.h);
        this.emit({ x, y, tex: SKT.pillar, tint: pick([0xfff3c8, 0x9ff0dc]), life: 600, delay: rnd(0, 700), s0: 0.5, s1: 1, sy: 2.6, originY: 1, alpha: 0.85 });
      }
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
    if (level >= 3) this.screenFlash(PALETTES[b].light, level === 4 ? 0.4 : 0.3, 140);
  }

  /** 줌 펀치 중 화면 크기가 바뀌면 (applyZoom) 기준 배율을 다시 잡는다 */
  resetZoom(z: number): void {
    this.scene.tweens.killTweensOf(this.scene.cameras.main);
    this.baseZoom = z;
  }
}
