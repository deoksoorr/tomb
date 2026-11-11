import { isAvatarBody, type AvatarBody } from "@tomb/protocol";
import { darken, Grid, lighten, mix, parseHex, type Color } from "./pixel";

// 방문자 아바타 6종 (모두 오리지널 디자인, 같은 색 팔레트 규칙):
//  hood  두건 쓴 작은 순례자 (두건 끝이 새싹처럼 접힘, 어두운 얼굴 구멍에 눈 두 점)
//  cat   고양이 유령 (세모 귀, 밝은 주둥이, 꼬리)
//  bun   토끼 유령 (긴 귀 — 오른쪽 귀 끝이 살짝 접힘, 동그란 꼬리)
//  sheet 이불 유령 (머리와 몸이 한 덩어리, 물결치는 밑단, 발 없음)
//  tall  키다리 유령 (가늘고 길쭉, 뾰족한 두건 끝)
//  round 동글 유령 (공처럼 둥근 몸, 얼굴 구멍, 머리 위 새싹)
// 프레임 20×28, 발바닥(원점) y=27. 시트 = 4행(DIR: down,left,right,up) × AV_COLS열.

export const AV_W = 20;
export const AV_H = 28;
/** 스프라이트 원점 (발바닥) */
export const AV_ORIGIN_Y = (AV_H - 1) / AV_H;

export const AV_ANIM = {
  idle: { col: 0, frames: 2, fps: 2 },
  walk: { col: 2, frames: 4, fps: 8 },
  run: { col: 6, frames: 6, fps: 13 },
  sitGround: { col: 12, frames: 1, fps: 1 },
  sitChair: { col: 13, frames: 1, fps: 1 },
  /** 점프: 다리를 웅크린 프레임 (그림자 없음 — 높이는 그리는 쪽에서 띄우고 그림자는 바닥에 따로) */
  jump: { col: 14, frames: 1, fps: 1 },
  /** 나무에 매달리기: 두 팔을 위로, 발이 흔들린다 (들어 올리는 높이는 AvatarView.HANG_LIFT) */
  hang: { col: 15, frames: 2, fps: 2 },
  /** 수영: 머리·어깨만 물 위, 팔을 젓는다 */
  swim: { col: 17, frames: 2, fps: 4 },
  /** 잠수: 머리 끝과 눈만 물 위 */
  dive: { col: 19, frames: 2, fps: 2 },
  /** 그네: 앉은 자세 + 줄 두 가닥 + 발판 (앞뒤로 다리를 굴린다) */
  swing: { col: 21, frames: 2, fps: 1.25 },
} as const;

/** 한 번 하는 동작 애니메이션 (act) */
export const AV_ACT_ANIM = {
  wave: { col: 23, frames: 2, fps: 5 },
  cheer: { col: 25, frames: 2, fps: 5 },
} as const;
export type AvatarActAnim = keyof typeof AV_ACT_ANIM;

export const AV_COLS = 27;

/** 몸마다 머리 꼭대기·어깨 높이 (발바닥에서 위로 px). 이름표·날개·후광 위치에 쓴다 */
export const BODY_METRICS: Record<AvatarBody, { top: number; shoulder: number }> = {
  hood: { top: 18, shoulder: 7 },
  cat: { top: 19, shoulder: 7 },
  bun: { top: 23, shoulder: 7 },
  sheet: { top: 18, shoulder: 9 },
  tall: { top: 24, shoulder: 12 },
  round: { top: 16, shoulder: 9 },
};

export function bodyOf(body: string | null | undefined): AvatarBody {
  return isAvatarBody(body) ? body : "hood";
}

type View = "down" | "side" | "up";
type Arms = "none" | "up" | "wave0" | "wave1" | "cheer0" | "cheer1" | "paddle0" | "paddle1" | "rope";
type Pose = {
  /** 윗몸 세로 흔들림 */
  bob: number;
  /** 옆모습 달리기: 앞으로 기울기 */
  lean: number;
  /** 두 발 오프셋 [dx,dy] (side: 0=뒷발, 1=앞발) */
  f0: [number, number];
  f1: [number, number];
  sit: 0 | 1 | 2; // 0 서기, 1 바닥, 2 의자
  /** 공중 (점프·매달리기): 발밑 그림자를 그리지 않는다 */
  air?: boolean;
  arms?: Arms;
  /** 물에 잠긴 깊이 (px) */
  sink?: number;
  /** 이불 유령 밑단 물결 위상 */
  hem: number;
  /** 팔 없는 몸(동글이·이불 유령)의 몸짓: 몸 전체를 좌우로 기울인다 (-1 왼쪽, 1 오른쪽) */
  tilt?: number;
};

type Pal = {
  hoodHi: Color;
  hood: Color;
  hoodLo: Color;
  cloak: Color;
  cloakLo: Color;
  line: Color;
  face: Color;
  eye: Color;
  scarf: Color;
  scarfLo: Color;
  feet: Color;
  muzzle: Color;
  /** 손 흔들기·환호 때 보이는 손 (몸보다 밝게) */
  hand: Color;
  handLo: Color;
};

/** 시트에 그려지는 꾸미기 (같은 조합이면 텍스처를 같이 쓴다) */
const SHEET_COSMETICS = ["hat_straw", "hat_cat", "hat_flower", "hat_halo", "hand_lantern", "neck_scarf"] as const;
/** 아바타가 그리는 꾸미기 전체: 시트에 그려지는 것 + AvatarView가 따로 붙이는 것(날개·유령 친구·발자국 꽃·안개) */
export const SPRITE_COSMETICS = [...SHEET_COSMETICS, "back_wings", "pet_ghost", "feet_flowers", "aura_fog"] as const;
type Gear = { hat: "hat_straw" | "hat_cat" | "hat_flower" | "hat_halo" | null; lantern: boolean; scarf: boolean };

export function gearOf(look: readonly string[]): Gear {
  const hat = look.find((id) => id === "hat_straw" || id === "hat_cat" || id === "hat_flower" || id === "hat_halo") as Gear["hat"] | undefined;
  return { hat: hat ?? null, lantern: look.includes("hand_lantern"), scarf: look.includes("neck_scarf") };
}

/** 시트 키에 들어가는 꾸미기 부분 (같은 조합이면 텍스처를 같이 쓴다) */
export function lookKey(look: readonly string[]): string {
  return (SHEET_COSMETICS as readonly string[]).filter((id) => look.includes(id)).join(".");
}

function palette(base: Color, body: AvatarBody): Pal {
  // 이불 유령은 천처럼 밝게
  const b = body === "sheet" ? lighten(base, 0.3) : base;
  return {
    hoodHi: lighten(b, 0.28),
    hood: b,
    hoodLo: darken(b, 0.22),
    cloak: darken(b, 0.12),
    cloakLo: darken(b, 0.34),
    line: mix(darken(base, 0.72), 0x15141b, 0.5),
    face: 0x17161d,
    eye: 0xf6efd4,
    scarf: 0xd9ceb2,
    scarfLo: 0xb0a589,
    feet: 0x2a2520,
    muzzle: lighten(base, 0.62),
    hand: mix(lighten(b, 0.5), 0xfff4dc, 0.45),
    handLo: darken(mix(lighten(b, 0.5), 0xfff4dc, 0.45), 0.14),
  };
}

const P = (bob = 0, f0: [number, number] = [0, 0], f1: [number, number] = [0, 0], lean = 0, sit: 0 | 1 | 2 = 0, hem = 0): Pose => ({
  bob,
  lean,
  f0,
  f1,
  sit,
  hem,
});

function framesFor(view: View): Pose[] {
  const side = view === "side";
  const idle = [P(0, [0, 0], [0, 0], 0, 0, 0), P(1, [0, 0], [0, 0], 0, 0, 1)];
  const walk = side
    ? [P(0, [-2, 0], [2, 0], 0, 0, 0), P(1, [0, -1], [0, 0], 0, 0, 1), P(0, [2, 0], [-2, 0], 0, 0, 2), P(1, [0, 0], [0, -1], 0, 0, 0)]
    : [P(0, [0, -1], [0, 0], 0, 0, 0), P(1, [0, 0], [0, 0], 0, 0, 1), P(0, [0, 0], [0, -1], 0, 0, 2), P(1, [0, 0], [0, 0], 0, 0, 0)];
  const run: Pose[] = [];
  for (let i = 0; i < 6; i++) {
    const s = Math.sin((i / 6) * Math.PI * 2);
    const bob = i % 3 === 1 ? 1 : 0;
    if (side) run.push(P(bob, [Math.round(-3 * s), s < -0.3 ? -1 : 0], [Math.round(3 * s), s > 0.3 ? -1 : 0], 1, 0, i % 3));
    else run.push(P(bob, [0, s > 0.3 ? -2 : 0], [0, s < -0.3 ? -2 : 0], 0, 0, i % 3));
  }
  const jump: Pose = side ? { ...P(0, [-2, -1], [2, -2]), air: true } : { ...P(0, [0, -1], [0, -1]), air: true };
  const hang: Pose[] = [
    { ...P(0, [0, 1], [0, 1], 0, 0, 0), air: true, arms: "up" },
    { ...P(0, side ? [-1, 1] : [0, 0], side ? [1, 0] : [0, 1], 0, 0, 1), air: true, arms: "up" },
  ];
  const swim: Pose[] = [
    { ...P(0), arms: "paddle0", sink: 2, air: true },
    { ...P(1, [0, 0], [0, 0], 0, 0, 1), arms: "paddle1", sink: 2, air: true },
  ];
  const dive: Pose[] = [
    { ...P(0), sink: 6, air: true },
    { ...P(1, [0, 0], [0, 0], 0, 0, 1), sink: 6, air: true },
  ];
  const swing: Pose[] = [
    { ...P(0, [0, 0], [2, -1], 0, 2, 0), arms: "rope" },
    { ...P(0, [0, 0], [-1, 1], 0, 2, 1), arms: "rope" },
  ];
  const wave: Pose[] = [
    { ...P(0, [0, 0], [0, 0], 0, 0, 0), arms: "wave0", tilt: -1 },
    { ...P(0, [0, 0], [0, 0], 0, 0, 1), arms: "wave1", tilt: 1 },
  ];
  const cheer: Pose[] = [
    { ...P(0, [0, 0], [0, 0], 0, 0, 0), arms: "cheer0", tilt: -1 },
    { ...P(-1, [0, -1], [0, -1], 0, 0, 1), arms: "cheer1", air: true, tilt: 1 },
  ];
  return [...idle, ...walk, ...run, P(0, [0, 0], [0, 0], 0, 1), P(0, [0, 0], [0, 0], 0, 2), jump, ...hang, ...swim, ...dive, ...swing, ...wave, ...cheer];
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color, a = 255): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.set(x0, y0, c, a);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** 몸 종류·자세에 따른 기준점 */
type M = {
  cx: number;
  /** 머리 중심 */
  hy: number;
  rx: number;
  ry: number;
  /** 머리 윗면 (모자 자리) */
  top: number;
  /** 귀·꼭지를 포함한 맨 위 */
  crown: number;
  /** 목 (목도리 줄) */
  neck: number;
  /** 어깨 (팔이 시작하는 줄과 좌우 x) */
  shY: number;
  shL: number;
  shR: number;
  /** 손등불 자리 */
  hx: number;
  hY: number;
};

function metrics(body: AvatarBody, view: View, pose: Pose): M {
  const sitDrop = pose.sit === 1 ? 3 : pose.sit === 2 ? 2 : 0;
  const by = pose.bob + sitDrop;
  const cx = 10 + (view === "side" ? pose.lean : 0);
  const side = view === "side";
  switch (body) {
    case "tall": {
      const hy = 11 + by;
      return { cx, hy, rx: 4, ry: 4.5, top: hy - 5, crown: hy - 8, neck: 15 + by, shY: 16 + by, shL: cx - 3, shR: cx + 2, hx: side ? cx + 3 : cx + 4, hY: 17 + by };
    }
    case "round": {
      const yb = 19 + pose.bob + (pose.sit ? 2 : 0);
      return { cx, hy: yb, rx: 6.5, ry: 6, top: yb - 6, crown: yb - 8, neck: yb + 1, shY: yb, shL: cx - 7, shR: cx + 6, hx: side ? cx + 5 : cx + 7, hY: yb + 1 };
    }
    case "sheet": {
      const hy = 15 + by;
      return { cx, hy, rx: 6, ry: 6, top: hy - 6, crown: hy - 6, neck: hy + 4, shY: hy + 4, shL: cx - 7, shR: cx + 6, hx: side ? cx + 5 : cx + 7, hY: hy + 5 };
    }
    case "cat":
    case "bun":
    case "hood":
    default: {
      const hy = 15 + by;
      const crown = body === "bun" ? hy - 11 : body === "cat" ? hy - 8 : hy - 6;
      return { cx, hy, rx: 5, ry: 5, top: hy - 5, crown, neck: 20 + by, shY: 21 + by, shL: cx - 4, shR: cx + 3, hx: side ? cx + 4 : cx + 5, hY: 21 + by };
    }
  }
}

/**
 * 물에 잠기는 깊이 (px): 수영은 목까지, 잠수는 눈만 수면 위에 남도록 몸마다 다르다.
 * AvatarView가 이름표를 같은 만큼 내린다.
 */
export function waterSink(body: string, state: "swim" | "dive"): number {
  switch (bodyOf(body)) {
    case "tall":
      return state === "swim" ? 6 : 10;
    case "sheet":
      return state === "swim" ? 2 : 6;
    case "round":
      return state === "swim" ? 1 : 4;
    case "cat":
    case "bun":
      return state === "swim" ? 1 : 6;
    default:
      return state === "swim" ? 1 : 5;
  }
}

/** 프레임 하나를 그린다 (오른쪽을 보는 옆모습 기준, 왼쪽은 좌우 반전) */
function drawFrame(body: AvatarBody, view: View, pose: Pose, pal: Pal, gear: Gear): Grid {
  let g = new Grid(AV_W, AV_H);
  if (gear.scarf) pal = { ...pal, scarf: 0xc8463c, scarfLo: 0x8e2a25 };
  const m = metrics(body, view, pose);
  const { cx, hy } = m;
  const side = view === "side";
  const sitDrop = pose.sit === 1 ? 3 : pose.sit === 2 ? 2 : 0;

  // ── 발 (망토 밑단 아래로 살짝). 이불 유령은 발이 없다 ──
  const footY = 25;
  if (pose.sit === 0 && body !== "sheet") {
    const w = body === "round" ? 2 : 2;
    const lx = body === "round" ? 6 : 7;
    const rx = body === "round" ? 12 : 11;
    g.rect(lx + pose.f0[0], footY + pose.f0[1], w, 2, side ? darken(pal.feet, 0.2) : pal.feet);
    g.rect(rx + pose.f1[0], footY + pose.f1[1], w, 2, pal.feet);
  }

  // ── 몸 뒤에 있는 꼬리 (옆·앞모습) ──
  if (body === "cat") {
    if (side) {
      line(g, cx - 4, 23, cx - 7, 21, pal.cloak);
      line(g, cx - 7, 21, cx - 7, 18, pal.cloak);
      g.set(cx - 6, 17, pal.hoodHi);
    } else if (view === "down") {
      line(g, cx + 4, 23, cx + 6, 21, pal.cloak);
      g.set(cx + 6, 20, pal.cloak);
      g.set(cx + 5, 19, pal.hoodHi);
    }
  } else if (body === "bun" && side) {
    g.ellipse(cx - 5, 22, 1.6, 1.6, 0xf4efe6);
  }

  // ── 몸통 ──
  if (body === "sheet") {
    // 머리와 몸이 한 덩어리인 천: 둥근 윗머리 + 아래로 살짝 퍼지는 자락 + 물결 밑단
    const hemY = pose.sit === 1 ? 26 : pose.sit === 2 ? 24 : 25;
    g.ellipse(cx, hy, 6, 6, pal.hood);
    for (let y = hy; y < hemY; y++) {
      const flare = y >= hemY - 3 ? 1 + (pose.sit === 1 ? 1 : 0) : 0;
      for (let x = cx - 6 - flare; x < cx + 6 + flare; x++) g.set(x, y, x >= cx + 4 + flare ? pal.cloakLo : pal.hood);
    }
    const flare = 1 + (pose.sit === 1 ? 1 : 0);
    for (let x = cx - 6 - flare; x < cx + 6 + flare; x++) if ((x + pose.hem + 9) % 3 !== 2) g.set(x, hemY, pal.cloakLo);
    g.recolor((x, y) => x - cx + (y - hy) < -5 && y < hy + 2, pal.hoodHi);
    g.recolor((x, y) => y === hemY - 1 && (x + pose.hem) % 3 === 0, pal.hoodLo);
    // 천 주름
    if (view !== "side") {
      g.vline(cx - 3, hy + 6, hemY - 2, pal.hoodLo);
      g.vline(cx + 2, hy + 7, hemY - 1, pal.hoodLo);
    } else g.vline(cx - 2, hy + 6, hemY - 1, pal.hoodLo);
  } else if (body === "round") {
    const ry = pose.sit ? 5.5 : 6;
    g.ellipse(cx, hy, 6.5, ry, pal.hood);
    g.recolor((x, y) => x - cx + (y - hy) < -6, pal.hoodHi);
    g.recolor((x, y) => x - cx - (y - hy) > 3.5 || y >= hy + ry - 1, pal.hoodLo);
    if (view === "down") g.ellipse(cx, hy + 3, 3.4, 2.2, pal.hoodHi);
  } else {
    // 망토 (사다리꼴)
    const tall = body === "tall";
    const cloakTop = (tall ? 13 : 18) + sitDrop;
    const cloakBot = pose.sit === 1 ? 26 : 24 + (pose.sit === 2 ? 1 : 0);
    const spread = pose.sit === 1 ? (tall ? 0.55 : 0.75) : tall ? 0.3 : 0.5;
    const hw0 = tall ? 2.5 : 3;
    for (let y = cloakTop; y <= cloakBot; y++) {
      const hw = hw0 + (y - cloakTop) * spread;
      for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++) {
        const shade = x >= cx + hw - 2 || y === cloakBot;
        g.set(x, y, shade ? pal.cloakLo : pal.cloak);
      }
    }
    if (view !== "side") {
      g.set(cx - 2, cloakBot - 1, pal.cloakLo);
      g.set(cx + 1, cloakBot - 2, pal.cloakLo);
      if (tall) g.vline(cx - 1, cloakTop + 3, cloakBot - 3, pal.cloakLo);
    } else {
      g.set(cx - 1, cloakBot - 1, pal.cloakLo);
    }
  }

  // ── 팔 (머리보다 먼저: 머리와 겹치는 곳은 머리가 덮는다) ──
  drawArms(g, view, pose, m, pal, false);

  // ── 목도리 (두건·키다리는 기본 천 목도리, 나머지는 목도리를 했을 때만) ──
  const plainNeck = body === "hood" || body === "tall";
  if (plainNeck || gear.scarf) {
    const sy = m.neck;
    const half = body === "round" ? 6 : body === "sheet" ? 6 : body === "tall" ? 3 : 4;
    for (let x = cx - half; x < cx + half; x++) if (g.filled(x, sy) || x >= cx - half + 1) g.set(x, sy, pal.scarf);
    if (view === "down") {
      g.set(cx + 2, sy + 1, pal.scarfLo);
      g.set(cx + 2, sy + 2, pal.scarfLo);
    } else if (side) {
      g.set(cx - half, sy + 1, pal.scarfLo);
      if (pose.lean) g.set(cx - half - 1, sy + 1, pal.scarfLo);
    } else {
      g.set(cx - 2, sy + 1, pal.scarfLo);
      g.set(cx - 2, sy + 2, pal.scarfLo);
    }
  }

  // ── 머리 ──
  if (body === "hood" || body === "tall" || body === "cat" || body === "bun") {
    g.ellipse(cx, hy, m.rx, m.ry, pal.hood);
    g.recolor((x, y) => x - cx + (y - hy) < -m.rx + 1 && y < hy + m.ry, pal.hoodHi);
    g.recolor((x, y) => x - cx - (y - hy) > m.rx / 2 && y < hy + m.ry && y > hy - m.ry, pal.hoodLo);
    if (body === "hood" || body === "tall") g.recolor((x, y) => y === Math.floor(hy + m.ry - 1) && Math.abs(x + 0.5 - cx) < m.rx - 1, pal.hoodLo);
  }

  const hatCovers = gear.hat === "hat_straw" || gear.hat === "hat_cat";
  if (body === "hood" && !hatCovers) {
    // 두건 끝: 새싹처럼 접힌 꼭지
    if (view === "down") {
      g.set(cx + 2, hy - 5, pal.hood);
      g.set(cx + 3, hy - 6, pal.hoodHi);
      g.set(cx + 4, hy - 6, pal.hood);
      g.set(cx + 5, hy - 5, pal.hoodLo);
    } else {
      g.set(cx - 3, hy - 5, pal.hood);
      g.set(cx - 4, hy - 6, pal.hoodHi);
      g.set(cx - 5, hy - 6, pal.hood);
      g.set(cx - 6, hy - 5, pal.hoodLo);
    }
    if (view === "up") g.vline(cx, hy - 3, hy + 2, pal.hoodLo);
  } else if (body === "tall" && !hatCovers) {
    // 뾰족한 두건 끝 (뒤로 살짝 휜다)
    const d = view === "down" ? 1 : -1;
    g.rect(cx - 1, hy - 6, 2, 2, pal.hood);
    g.set(cx - 1 + (d > 0 ? 1 : 0), hy - 7, pal.hoodHi);
    g.set(cx + d, hy - 8, pal.hood);
    if (view === "up") g.vline(cx, hy - 2, hy + 2, pal.hoodLo);
  } else if (body === "round" && !hatCovers) {
    // 머리 위 새싹 (모자를 쓰면 모자 속에)
    g.set(cx, hy - 7, 0x6f9a4c);
    g.set(cx, hy - 8, 0x6f9a4c);
    g.set(cx + 1, hy - 8, 0x9cc46a);
    g.set(cx - 1, hy - 8, 0x86b25a);
  }

  // ── 얼굴 ──
  drawFace(g, body, view, m, pal);

  drawGear(g, view, gear, m, pal, body);

  // 귀는 모자 위로 튀어나오게 모자 다음에
  if (body === "cat") drawCatEars(g, view, m, pal);
  else if (body === "bun") drawBunEars(g, view, m, pal);

  // 뒷모습 꼬리 (몸 앞에 보인다)
  if (view === "up") {
    if (body === "cat") {
      line(g, cx, 24, cx + 2, 21, pal.cloak);
      line(g, cx + 2, 21, cx + 2, 18, pal.cloak);
      g.set(cx + 1, 17, pal.hoodHi);
    } else if (body === "bun") g.ellipse(cx, 22, 1.6, 1.6, 0xf4efe6);
  }

  // ── 앉은 자세의 발 ──
  if (body !== "sheet") {
    if (pose.sit === 1) {
      if (view === "down") {
        g.set(cx - 3, 26, pal.feet);
        g.set(cx + 2, 26, pal.feet);
      } else if (side) {
        g.rect(cx + 3, 25, 2, 1, pal.feet);
        g.set(cx + 5, 25, pal.feet);
      }
    } else if (pose.sit === 2) {
      const swing = pose.arms === "rope" ? pose.f1[0] : 0;
      if (view === "down") {
        g.set(cx - 2, 26, pal.feet);
        g.set(cx + 1, 26, pal.feet);
        g.set(cx - 2, 27, pal.feet);
        g.set(cx + 1, 27, pal.feet);
      } else if (side) {
        g.rect(cx + 3, 24, 2 + Math.max(0, swing), 1, pal.cloakLo);
        g.set(cx + 5 + swing, 25 + pose.f1[1], pal.feet);
        g.set(cx + 5 + swing, 26 + pose.f1[1], pal.feet);
      }
    }
  }

  g.outline(pal.line);
  // 등불 창은 외곽선 뒤에도 밝게 (빛나는 점)
  if (gear.lantern && view !== "up") g.set(m.hx, m.hY + 1, 0xfff0b0);
  if (gear.hat === "hat_halo") drawHalo(g, m, view);
  // 손 흔들기·환호: 팔 없는 몸은 몸 전체를 기울이고, 손은 밝은 색 + 외곽선으로 몸 밖에 크게 그린다
  const tilt = (body === "round" || body === "sheet") && pose.tilt ? pose.tilt : 0;
  if (tilt) g = shear(g, tilt);
  for (const h of actHands(view, pose.arms, m)) drawHand(g, h, tilt, m, view, pal);
  if (pose.arms === "rope") drawRopes(g, view, m, pose);

  // ── 물 ── 몸을 가라앉히고 수면 아래는 지운다
  if (pose.sink) {
    const wl = 22;
    const sunk = new Grid(AV_W, AV_H);
    sunk.draw(g, 0, waterSink(body, pose.sink > 2 ? "dive" : "swim"));
    for (let y = wl; y < AV_H; y++) for (let x = 0; x < AV_W; x++) sunk.px[y * AV_W + x] = 0;
    // 몸이 수면을 가르는 자리에 밝은 물결 줄
    let x0 = AV_W;
    let x1 = -1;
    for (let x = 0; x < AV_W; x++)
      if (sunk.filled(x, wl - 1)) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
    if (x1 >= 0) for (let x = x0 - 2; x <= x1 + 2; x++) sunk.set(x, wl, 0xcfe8f4, x === x0 - 2 || x === x1 + 2 ? 90 : 170);
    g = sunk;
    drawArms(g, view, pose, m, pal, true);
  }

  // 발밑 그림자 (외곽선 뒤, 투명한 곳에만). 공중·물·의자에서는 그리지 않는다
  if (pose.sit !== 2 && !pose.air) {
    for (let x = 5; x < 15; x++) if (!g.filled(x, 27)) g.set(x, 27, 0x000000, x === 5 || x === 14 ? 40 : 80);
  }
  return g;
}

function drawArms(g: Grid, view: View, pose: Pose, m: M, pal: Pal, water: boolean): void {
  const arms = pose.arms ?? "none";
  if (arms === "none") return;
  const { cx, shY, shL, shR, top } = m;
  const c = pal.cloak;
  const hand = pal.hoodHi;
  const side = view === "side";
  if (water) {
    if (arms !== "paddle0" && arms !== "paddle1") return;
    // 수면에서 팔 젓기 (외곽선 없이 가늘게)
    const wl = 22;
    const a = arms === "paddle0";
    if (side) {
      line(g, cx + 2, wl, cx + 6, a ? wl - 2 : wl, c);
      g.set(cx + 6, a ? wl - 2 : wl, hand);
    } else {
      line(g, cx - 4, wl, cx - 8, a ? wl - 2 : wl, c);
      line(g, cx + 3, wl, cx + 7, a ? wl : wl - 2, c);
      g.set(cx - 8, a ? wl - 2 : wl, hand);
      g.set(cx + 7, a ? wl : wl - 2, hand);
    }
    return;
  }
  if (arms === "paddle0" || arms === "paddle1") return;
  const arm = (x0: number, y0: number, x1: number, y1: number) => {
    line(g, x0, y0, x1, y1, c);
    g.set(x1, y1, hand);
  };
  if (arms === "up") {
    if (side) arm(cx + 1, shY, cx + 2, top - 3);
    else {
      arm(shL, shY, cx - 5, top - 3);
      arm(shR, shY, cx + 4, top - 3);
    }
  } else if (arms === "rope") {
    // 줄을 잡은 손 (줄은 외곽선 뒤에 그린다)
    if (side) g.set(cx + 1, shY + 1, hand);
    else {
      g.set(shL - 1, shY + 1, hand);
      g.set(shR + 1, shY + 1, hand);
    }
  }
}

type Hand = { x: number; y: number; back?: boolean };

/**
 * 손 흔들기·환호 때 손 자리 (2×2 손의 왼쪽 위, 기울이기 전 좌표). 머리 옆·위로 몸 밖에 크게:
 *  wave0 머리 옆으로 쭉 뻗음 → wave1 머리 위로 올려 안쪽으로 (좌우 2~5px, 위아래 4px 흔들림)
 *  cheer0 두 팔을 비스듬히 → cheer1 두 팔을 머리 위로 곧게 (옆모습은 뒷손이 머리 뒤로 보인다)
 */
function actHands(view: View, arms: Arms | undefined, m: M): Hand[] {
  const { cx, rx, top } = m;
  const R = Math.round(cx + rx);
  const L = Math.round(cx - rx) - 2;
  const side = view === "side";
  switch (arms) {
    case "wave0":
      return [{ x: R + 1, y: top }];
    case "wave1":
      return [{ x: side ? cx + 1 : R - 1, y: top - 4 }];
    case "cheer0":
      return side
        ? [
            { x: L + 1, y: top - 1, back: true },
            { x: R, y: top - 2 },
          ]
        : [
            { x: L, y: top - 1 },
            { x: R + 1, y: top - 1 },
          ];
    case "cheer1":
      return side
        ? [
            { x: cx - 4, y: top - 5, back: true },
            { x: cx + 2, y: top - 5 },
          ]
        : [
            { x: L + 1, y: top - 5 },
            { x: R, y: top - 5 },
          ];
    default:
      return [];
  }
}

/** 기울이기: 발바닥(26줄)은 그대로, 위로 갈수록 tilt 쪽으로 밀린다 (8줄마다 1px) */
const shearDx = (tilt: number, y: number) => Math.round((tilt * Math.max(0, 26 - y)) / 8);

function shear(g: Grid, tilt: number): Grid {
  const out = new Grid(g.w, g.h);
  for (let y = 0; y < g.h; y++) {
    const dx = shearDx(tilt, y);
    for (let x = 0; x < g.w; x++) {
      const v = g.px[y * g.w + x];
      const nx = x + dx;
      if (v && nx >= 0 && nx < g.w) out.px[y * g.w + nx] = v;
    }
  }
  return out;
}

/**
 * 팔 + 2×2 밝은 손 (외곽선 뒤에 그린다). 팔은 몸 밖으로 나온 부분만 칠하고 따로 외곽선을 두른다.
 * 손 둘레는 몸 위에 겹쳐도 테두리가 보이게 외곽선 색으로 덮는다.
 */
function drawHand(g: Grid, h: Hand, tilt: number, m: M, view: View, pal: Pal): void {
  const x = Math.max(1, Math.min(AV_W - 3, h.x + shearDx(tilt, h.y)));
  const y = Math.max(1, h.y);
  // 팔: 어깨 → 손목. 비었거나 외곽선인 칸에만 (몸 안쪽은 몸이 가린다)
  const side = view === "side";
  const ax = (side ? (h.back ? m.cx - 2 : m.cx + 1) : h.x < m.cx ? m.shL : m.shR) + shearDx(tilt, m.shY);
  const armC = h.back ? pal.cloakLo : pal.cloak;
  const drawn: number[] = [];
  const wx = x + (h.x < m.cx ? 1 : 0);
  const wy = y + 1;
  {
    let x0 = Math.round(ax);
    let y0 = Math.round(m.shY);
    const dx = Math.abs(wx - x0);
    const dy = -Math.abs(wy - y0);
    const sx = x0 < wx ? 1 : -1;
    const sy = y0 < wy ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      const v = g.get(x0, y0);
      if (!(v & 255) || v >>> 8 === pal.line) {
        g.set(x0, y0, armC);
        drawn.push(x0, y0);
      }
      if (x0 === wx && y0 === wy) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  for (let i = 0; i < drawn.length; i += 2)
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      if (!g.filled(drawn[i] + ox, drawn[i + 1] + oy)) g.set(drawn[i] + ox, drawn[i + 1] + oy, pal.line);
  for (let j = -1; j <= 2; j++)
    for (let i = -1; i <= 2; i++) {
      const inside = i >= 0 && i <= 1 && j >= 0 && j <= 1;
      if (inside) continue;
      // 모서리는 둥글게 (대각선 칸은 비어 있을 때 칠하지 않는다)
      const corner = (i === -1 || i === 2) && (j === -1 || j === 2);
      if (corner && !g.filled(x + i, y + j)) continue;
      g.set(x + i, y + j, pal.line);
    }
  const c = h.back ? darken(pal.hand, 0.18) : pal.hand;
  const lo = h.back ? darken(pal.handLo, 0.18) : pal.handLo;
  g.set(x, y, c);
  g.set(x + 1, y, c);
  g.set(x, y + 1, lo);
  g.set(x + 1, y + 1, h.back ? lo : c);
}

function drawRopes(g: Grid, view: View, m: M, pose: Pose): void {
  const rope = 0x9a7a4c;
  const plank = 0x6b4f32;
  const handY = m.shY + 1;
  const seatY = 25;
  if (view === "side") {
    for (let y = 0; y < handY; y++) if (!g.filled(m.cx + 1, y) || y < m.crown - 1) g.set(m.cx + 1, y, rope);
    g.hline(m.cx - 4, m.cx + 4 + Math.max(0, pose.f1[0]), seatY, plank);
  } else {
    for (const x of [m.shL - 1, m.shR + 1]) for (let y = 0; y < handY; y++) if (!g.filled(x, y)) g.set(x, y, rope);
    g.hline(m.shL - 2, m.shR + 2, seatY, plank);
    g.set(m.shL - 2, seatY + 1, darken(plank, 0.3));
    g.set(m.shR + 2, seatY + 1, darken(plank, 0.3));
  }
}

function drawFace(g: Grid, body: AvatarBody, view: View, m: M, pal: Pal): void {
  const { cx, hy } = m;
  if (view === "up") return;
  const side = view === "side";
  switch (body) {
    case "cat":
    case "bun": {
      // 밝은 주둥이 + 까만 눈 + 분홍 코
      if (side) {
        g.ellipse(cx + 3, hy + 2, 2, 1.6, pal.muzzle);
        g.set(cx + 2, hy, pal.face);
        if (body === "bun") g.set(cx + 2, hy - 1, pal.face);
        g.set(cx + 4, hy + 1, 0xe68a9a);
      } else {
        g.ellipse(cx, hy + 2, 3, 1.8, pal.muzzle);
        g.set(cx - 3, hy, pal.face);
        g.set(cx + 2, hy, pal.face);
        if (body === "bun") {
          g.set(cx - 3, hy - 1, pal.face);
          g.set(cx + 2, hy - 1, pal.face);
          g.set(cx - 4, hy + 2, 0xf0a0ae);
          g.set(cx + 3, hy + 2, 0xf0a0ae);
          g.set(cx - 1, hy + 1, 0xe68a9a);
        } else {
          g.set(cx - 1, hy + 1, 0xe68a9a);
          g.set(cx, hy + 1, 0xe68a9a);
        }
      }
      break;
    }
    case "sheet": {
      // 뚫린 눈 구멍 두 개 + 작은 입
      if (side) {
        g.rect(cx + 3, hy - 1, 1, 2, pal.face);
        g.set(cx + 4, hy + 3, pal.face);
      } else {
        g.rect(cx - 3, hy - 1, 1, 2, pal.face);
        g.rect(cx + 2, hy - 1, 1, 2, pal.face);
        g.rect(cx - 1, hy + 2, 2, 1, pal.face);
      }
      break;
    }
    case "round": {
      const fy = hy - 1.5;
      if (side) {
        g.ellipse(cx + 3.5, fy, 2.2, 2.3, pal.face);
        g.set(cx + 4, fy - 0.5, pal.eye);
      } else {
        g.ellipse(cx, fy, 3.2, 2.4, pal.face);
        g.set(cx - 2, fy - 0.5, pal.eye);
        g.set(cx + 1, fy - 0.5, pal.eye);
      }
      break;
    }
    case "tall": {
      if (side) {
        g.ellipse(cx + 2, hy + 1, 1.8, 2.3, pal.face);
        g.set(cx + 2, hy, pal.eye);
      } else {
        g.ellipse(cx, hy + 1, 2.6, 2.6, pal.face);
        g.set(cx - 2, hy, pal.eye);
        g.set(cx + 1, hy, pal.eye);
      }
      break;
    }
    default: {
      if (side) {
        g.ellipse(cx + 2.6, hy + 1.5, 2.2, 2.3, pal.face);
        g.set(cx + 3, hy + 1, pal.eye);
      } else {
        g.ellipse(cx, hy + 1.5, 3.2, 2.4, pal.face);
        g.set(cx - 2, hy + 1, pal.eye);
        g.set(cx + 1, hy + 1, pal.eye);
      }
    }
  }
}

function drawCatEars(g: Grid, view: View, m: M, pal: Pal): void {
  const { cx, hy } = m;
  const inner = view === "up" ? pal.hoodLo : 0xe6a3b0;
  const ear = (x0: number, d: 1 | -1) => {
    g.set(x0, hy - 7, pal.hood);
    g.set(x0, hy - 6, pal.hood);
    g.set(x0 + d, hy - 6, pal.hood);
    g.set(x0, hy - 5, pal.hood);
    g.set(x0 + d, hy - 5, inner);
    g.set(x0 + 2 * d, hy - 5, pal.hood);
  };
  if (view === "side") {
    ear(cx - 1, 1);
    g.set(cx - 3, hy - 6, pal.hoodLo);
    g.set(cx - 3, hy - 5, pal.hoodLo);
  } else {
    ear(cx - 4, 1);
    ear(cx + 3, -1);
  }
}

function drawBunEars(g: Grid, view: View, m: M, pal: Pal): void {
  const { cx, hy } = m;
  const inner = view === "up" ? pal.hoodLo : 0xeaa6b4;
  if (view === "side") {
    g.rect(cx - 4, hy - 9, 2, 5, pal.hoodLo);
    g.rect(cx - 2, hy - 11, 2, 7, pal.hood);
    g.vline(cx - 1, hy - 10, hy - 6, inner);
    return;
  }
  // 왼쪽 귀는 곧게, 오른쪽 귀는 끝이 살짝 접힌다
  g.rect(cx - 4, hy - 11, 2, 7, pal.hood);
  g.vline(cx - 3, hy - 10, hy - 6, inner);
  g.rect(cx + 2, hy - 9, 2, 5, pal.hood);
  g.vline(cx + 2, hy - 8, hy - 6, inner);
  g.rect(cx + 3, hy - 11, 2, 2, pal.hoodLo);
}

function drawHalo(g: Grid, m: M, view: View): void {
  const y0 = Math.max(0, m.crown - 4);
  const cx = m.cx + (view === "side" ? -1 : 0);
  const gold = 0xffe27a;
  const hi = 0xfffbe0;
  g.hline(cx - 3, cx + 2, y0, hi);
  g.set(cx - 4, y0 + 1, gold);
  g.set(cx + 3, y0 + 1, gold);
  g.hline(cx - 3, cx + 2, y0 + 2, gold);
}

/** 머리·손 꾸미기 (외곽선 전에 그려 같이 테두리를 두른다) */
function drawGear(g: Grid, view: View, gear: Gear, m: M, pal: Pal, body: AvatarBody): void {
  const { cx } = m;
  // 동글이는 얼굴이 머리 위쪽까지 올라와 있어 모자를 조금 더 얹는다
  const top = body === "round" ? m.top - 1 : m.top;
  if (gear.hat === "hat_straw") {
    const straw = 0xe2c27a;
    const shade = 0xb8964f;
    g.hline(cx - 6, cx + 5, top + 2, straw);
    g.hline(cx - 5, cx + 4, top + 3, shade);
    g.rect(cx - 3, top - 1, 6, 3, straw);
    g.hline(cx - 3, cx + 2, top + 1, 0x8c4a32);
    g.set(cx - 2, top - 1, 0xf0d898);
  } else if (gear.hat === "hat_cat") {
    const inner = 0xe6a3b0;
    const ear = (x: number, mirror: boolean) => {
      const d = mirror ? -1 : 1;
      g.set(x, top - 2, pal.hood);
      g.set(x, top - 1, pal.hood);
      g.set(x + d, top - 1, pal.hood);
      g.set(x, top, pal.hood);
      g.set(x + d, top, view === "up" ? pal.hood : inner);
      g.set(x + 2 * d, top, pal.hood);
    };
    if (view === "side") {
      ear(cx - 2, false);
      g.set(cx + 1, top - 1, pal.hoodLo);
      g.set(cx + 1, top, pal.hoodLo);
    } else {
      ear(cx - 4, false);
      ear(cx + 3, true);
    }
  } else if (gear.hat === "hat_flower") {
    // 꽃 머리핀: 3×3 꽃잎 + 노란 꽃술 + 잎 (멀리서도 보이게 밝은 분홍)
    const fx = view === "side" ? cx - 3 : cx + 3;
    const fy = top;
    const petal = 0xff9fc0;
    const petalHi = 0xffd6e4;
    g.rect(fx - 1, fy - 1, 3, 3, petal);
    g.set(fx - 2, fy, petal);
    g.set(fx + 2, fy, petal);
    g.set(fx, fy - 2, petal);
    g.set(fx, fy + 2, petal);
    g.set(fx - 1, fy - 1, petalHi);
    g.set(fx, fy, 0xffe066);
    g.set(fx + (view === "side" ? 2 : -2), fy + 2, 0x7fbf5a);
  }
  if (gear.lantern && view !== "up") {
    // 손에 든 작은 등불 (아래·옆모습에서 보인다)
    const lx = m.hx;
    const ly = m.hY;
    g.set(lx, ly - 1, 0x3a3127);
    g.rect(lx - 1, ly, 3, 3, 0x6b4f32);
    g.set(lx, ly + 1, 0xffd77a);
  }
}

/** 프레임 하나의 픽셀 (테스트·머리 위 높이 계산용). col = 시트 열, view = 앞·옆·뒤 */
export function avatarFrameGrid(body: string, view: "down" | "side" | "up", col: number, color = "#9fb8d8", look: readonly string[] = []): Grid {
  const b = bodyOf(body);
  return drawFrame(b, view, framesFor(view)[col], palette(parseHex(color), b), gearOf(look));
}

const artTopCache = new Map<string, number>();

/**
 * 발바닥(원점)에서 그림 맨 위까지 높이 (px): 귀·모자·후광 같은 머리 꾸미기까지 포함해 서 있는 프레임(앞·옆·뒤) 중 가장 높은 곳.
 * 이름표는 이 위에 놓는다 (머리 꾸미기 → 이름표 → 말풍선 순으로 쌓기). 몸·꾸미기 조합마다 한 번만 계산한다.
 */
export function avatarArtTop(body: string, look: readonly string[] = []): number {
  const b = bodyOf(body);
  const key = `${b}|${lookKey(look)}`;
  const hit = artTopCache.get(key);
  if (hit !== undefined) return hit;
  let top = BODY_METRICS[b].top;
  for (const view of ["down", "side", "up"] as const)
    for (let col = AV_ANIM.idle.col; col < AV_ANIM.idle.col + AV_ANIM.idle.frames; col++) {
      const g = avatarFrameGrid(b, view, col, "#9fb8d8", look);
      for (let y = 0; y < AV_H; y++) {
        let found = false;
        for (let x = 0; x < AV_W; x++)
          if ((g.get(x, y) & 255) >= 128) {
            found = true;
            break;
          }
        if (found) {
          top = Math.max(top, AV_H - 1 - y);
          break;
        }
      }
    }
  artTopCache.set(key, top);
  return top;
}

const VIEWS: readonly [number, View, boolean][] = [
  [0, "down", false],
  [1, "side", true], // left = 오른쪽 옆모습 반전
  [2, "side", false],
  [3, "up", false],
];

/** 색 + 꾸미기 + 몸 조합에 대한 전체 스프라이트 시트 (4행 × AV_COLS열) */
export function buildAvatarSheet(color: string, look: readonly string[] = [], body: string = "hood"): HTMLCanvasElement {
  const b = bodyOf(body);
  const pal = palette(parseHex(color), b);
  const gear = gearOf(look);
  const sheet = new Grid(AV_W * AV_COLS, AV_H * 4);
  for (const [row, view, flip] of VIEWS) {
    if (flip) continue;
    framesFor(view).forEach((pose, col) => {
      const f = drawFrame(b, view, pose, pal, gear);
      sheet.draw(f, col * AV_W, row * AV_H);
      // 왼쪽(1행)은 오른쪽 옆모습을 좌우 반전해서 그대로 쓴다
      if (view === "side") sheet.draw(f.mirrored(), col * AV_W, AV_H);
    });
  }
  return sheet.toCanvas();
}

const previewCache = new Map<string, string>();

/** 미리보기 크기 (정수 배율) */
export function avatarPreviewSize(scale = 3): { width: number; height: number } {
  const s = Math.max(1, Math.round(scale));
  return { width: AV_W * s, height: AV_H * s };
}

/**
 * UI 몸 고르기용 미리보기: 정면 서 있는 프레임의 PNG dataURL (브라우저 전용, 같은 인자면 캐시).
 *   import { avatarPreview, avatarPreviewSize } from "@/game/sprites/avatar";
 *   <img src={avatarPreview("cat", "#9fb8d8", 3)} {...avatarPreviewSize(3)} style={{ imageRendering: "pixelated" }} />
 */
export function avatarPreview(body: string, color: string, scale = 3): string {
  const s = Math.max(1, Math.round(scale));
  const b = bodyOf(body);
  const key = `${b}|${color}|${s}`;
  const hit = previewCache.get(key);
  if (hit) return hit;
  const f = drawFrame(b, "down", framesFor("down")[0], palette(parseHex(color), b), gearOf([])).toCanvas();
  const c = document.createElement("canvas");
  c.width = AV_W * s;
  c.height = AV_H * s;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(f, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/png");
  previewCache.set(key, url);
  return url;
}
