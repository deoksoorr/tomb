import { darken, Grid, lighten, mix, parseHex, type Color } from "./pixel";

// 방문자 아바타: 둥근 두건을 쓴 작은 순례자 ("떠돌이"). 두건 끝이 새싹처럼 접혀 있고,
// 어두운 얼굴 구멍에 눈 두 점만 보인다. 기존 게임/애니 캐릭터를 본뜨지 않은 오리지널 디자인.
// 프레임 16×20, 발바닥 y=18. 시트 = 4행(DIR: down,left,right,up) × 14열.

export const AV_W = 16;
export const AV_H = 20;
/** 스프라이트 원점 (발바닥) */
export const AV_ORIGIN_Y = 19 / AV_H;

export const AV_COLS = 14;
export const AV_ANIM = {
  idle: { col: 0, frames: 2, fps: 2 },
  walk: { col: 2, frames: 4, fps: 8 },
  run: { col: 6, frames: 6, fps: 13 },
  sitGround: { col: 12, frames: 1, fps: 1 },
  sitChair: { col: 13, frames: 1, fps: 1 },
} as const;

type View = "down" | "side" | "up";
type Pose = {
  /** 윗몸(두건) 세로 흔들림 */
  bob: number;
  /** 옆모습 달리기: 앞으로 기울기 */
  lean: number;
  /** 두 발 오프셋 [dx,dy] (side: 0=뒷발, 1=앞발) */
  f0: [number, number];
  f1: [number, number];
  sit: 0 | 1 | 2; // 0 서기, 1 바닥, 2 의자
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
};

function palette(base: Color): Pal {
  return {
    hoodHi: lighten(base, 0.28),
    hood: base,
    hoodLo: darken(base, 0.22),
    cloak: darken(base, 0.12),
    cloakLo: darken(base, 0.34),
    line: mix(darken(base, 0.72), 0x15141b, 0.5),
    face: 0x17161d,
    eye: 0xf6efd4,
    scarf: 0xd9ceb2,
    scarfLo: 0xb0a589,
    feet: 0x2a2520,
  };
}

const P = (bob = 0, f0: [number, number] = [0, 0], f1: [number, number] = [0, 0], lean = 0, sit: 0 | 1 | 2 = 0): Pose => ({
  bob,
  lean,
  f0,
  f1,
  sit,
});

function framesFor(view: View): Pose[] {
  const side = view === "side";
  const idle = [P(0), P(1)];
  const walk = side
    ? [P(0, [-2, 0], [2, 0]), P(1, [0, -1], [0, 0]), P(0, [2, 0], [-2, 0]), P(1, [0, 0], [0, -1])]
    : [P(0, [0, -1], [0, 0]), P(1), P(0, [0, 0], [0, -1]), P(1)];
  const run: Pose[] = [];
  for (let i = 0; i < 6; i++) {
    const s = Math.sin((i / 6) * Math.PI * 2);
    const bob = i % 3 === 1 ? 1 : 0;
    if (side) run.push(P(bob, [Math.round(-3 * s), s < -0.3 ? -1 : 0], [Math.round(3 * s), s > 0.3 ? -1 : 0], 1));
    else run.push(P(bob, [0, s > 0.3 ? -2 : 0], [0, s < -0.3 ? -2 : 0]));
  }
  return [...idle, ...walk, ...run, P(0, [0, 0], [0, 0], 0, 1), P(0, [0, 0], [0, 0], 0, 2)];
}

/** 프레임 하나를 그린다 (오른쪽을 보는 옆모습 기준, 왼쪽은 좌우 반전) */
function drawFrame(view: View, pose: Pose, pal: Pal): Grid {
  const g = new Grid(AV_W, AV_H);
  const sitDrop = pose.sit === 1 ? 3 : pose.sit === 2 ? 2 : 0;
  const by = pose.bob + sitDrop; // 윗몸 오프셋
  const cx = 8 + (view === "side" ? pose.lean : 0);

  // ── 발 (망토 밑단 아래로 살짝) ──
  const footY = 17;
  if (pose.sit === 0) {
    if (view === "side") {
      g.rect(5 + pose.f0[0], footY + pose.f0[1], 2, 2, darken(pal.feet, 0.2));
      g.rect(9 + pose.f1[0], footY + pose.f1[1], 2, 2, pal.feet);
    } else {
      g.rect(5 + pose.f0[0], footY + pose.f0[1], 2, 2, pal.feet);
      g.rect(9 + pose.f1[0], footY + pose.f1[1], 2, 2, pal.feet);
    }
  }

  // ── 망토 (사다리꼴) ──
  const cloakTop = 10 + sitDrop;
  const cloakBot = pose.sit === 1 ? 18 : 16 + (pose.sit === 2 ? 1 : 0);
  for (let y = cloakTop; y <= cloakBot; y++) {
    const spread = pose.sit === 1 ? 0.75 : 0.5;
    const hw = 3 + (y - cloakTop) * spread;
    for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++) {
      const shade = x >= cx + hw - 2 || y === cloakBot;
      g.set(x, y, shade ? pal.cloakLo : pal.cloak);
    }
  }
  // 망토 주름
  if (view !== "side") {
    g.set(cx - 2, cloakBot - 1, pal.cloakLo);
    g.set(cx + 1, cloakBot - 2, pal.cloakLo);
  } else {
    g.set(cx - 1, cloakBot - 1, pal.cloakLo);
  }

  // ── 목도리 ──
  const sy = 12 + by;
  for (let x = cx - 4; x < cx + 4; x++) if (g.filled(x, sy) || g.filled(x, sy + 1) || x >= cx - 3) g.set(x, sy, pal.scarf);
  if (view === "down") {
    g.set(cx + 2, sy + 1, pal.scarfLo);
    g.set(cx + 2, sy + 2, pal.scarfLo);
  } else if (view === "side") {
    g.set(cx - 4, sy + 1, pal.scarfLo);
    if (pose.lean) g.set(cx - 5, sy + 1, pal.scarfLo);
  } else {
    g.set(cx - 2, sy + 1, pal.scarfLo);
    g.set(cx - 2, sy + 2, pal.scarfLo);
  }

  // ── 두건 ──
  const hy = 7 + by;
  g.ellipse(cx, hy, 5, 5, pal.hood);
  g.recolor((x, y) => (x - cx) + (y - hy) < -4 && y < hy + 5, pal.hoodHi);
  g.recolor((x, y) => (x - cx) - (y - hy) > 2.5 && y < hy + 5 && y > hy - 5, pal.hoodLo);
  g.recolor((x, y) => y === hy + 4 && Math.abs(x + 0.5 - cx) < 4, pal.hoodLo);

  // 두건 끝: 새싹처럼 접힌 꼭지
  if (view === "down") {
    g.set(cx + 2, hy - 5, pal.hood);
    g.set(cx + 3, hy - 6, pal.hoodHi);
    g.set(cx + 4, hy - 6, pal.hood);
    g.set(cx + 5, hy - 5, pal.hoodLo);
  } else if (view === "side") {
    g.set(cx - 3, hy - 5, pal.hood);
    g.set(cx - 4, hy - 6, pal.hoodHi);
    g.set(cx - 5, hy - 6, pal.hood);
    g.set(cx - 6, hy - 5, pal.hoodLo);
  } else {
    g.set(cx - 3, hy - 5, pal.hood);
    g.set(cx - 4, hy - 6, pal.hoodHi);
    g.set(cx - 5, hy - 6, pal.hood);
    g.set(cx - 6, hy - 5, pal.hoodLo);
    // 뒤통수 솔기
    g.vline(cx, hy - 3, hy + 2, pal.hoodLo);
  }

  // ── 얼굴 구멍 + 눈 ──
  if (view === "down") {
    g.ellipse(cx, hy + 1.5, 3.2, 2.4, pal.face);
    g.set(cx - 2, hy + 1, pal.eye);
    g.set(cx + 1, hy + 1, pal.eye);
  } else if (view === "side") {
    g.ellipse(cx + 2.6, hy + 1.5, 2.2, 2.3, pal.face);
    g.set(cx + 3, hy + 1, pal.eye);
  }

  // ── 앉은 자세의 발 ──
  if (pose.sit === 1) {
    if (view === "down") {
      g.set(cx - 3, 18, pal.feet);
      g.set(cx + 2, 18, pal.feet);
    } else if (view === "side") {
      g.rect(cx + 3, 17, 2, 1, pal.feet);
      g.set(cx + 5, 17, pal.feet);
    }
  } else if (pose.sit === 2) {
    if (view === "down") {
      g.set(cx - 2, 18, pal.feet);
      g.set(cx + 1, 18, pal.feet);
      g.set(cx - 2, 19, pal.feet);
      g.set(cx + 1, 19, pal.feet);
    } else if (view === "side") {
      g.rect(cx + 3, 16, 2, 1, pal.cloakLo);
      g.set(cx + 5, 17, pal.feet);
      g.set(cx + 5, 18, pal.feet);
    }
  }

  g.outline(pal.line);

  // 발밑 그림자 (외곽선 뒤, 투명한 곳에만)
  if (pose.sit !== 2) {
    for (let x = 3; x < 13; x++) {
      const y = 19;
      if (!g.filled(x, y)) g.set(x, y, 0x000000, x === 3 || x === 12 ? 40 : 80);
    }
  }
  return g;
}

/** 색 하나에 대한 전체 스프라이트 시트 (4행 × 14열) */
export function buildAvatarSheet(color: string): HTMLCanvasElement {
  const pal = palette(parseHex(color));
  const sheet = new Grid(AV_W * AV_COLS, AV_H * 4);
  const views: [number, View, boolean][] = [
    [0, "down", false],
    [1, "side", true], // left = 오른쪽 옆모습 반전
    [2, "side", false],
    [3, "up", false],
  ];
  for (const [row, view, flip] of views) {
    framesFor(view).forEach((pose, col) => {
      let f = drawFrame(view, pose, pal);
      if (flip) f = f.mirrored();
      sheet.draw(f, col * AV_W, row * AV_H);
    });
  }
  return sheet.toCanvas();
}
