import type * as Phaser from "phaser";
import { MONSTERS, type MonsterId } from "@/lib/rpg/catalog";
import { darken, Grid, lighten, mix, type Color } from "../sprites/pixel";

// 40번 몬스터 디자인: 종류마다 코드로 그린 픽셀아트 + 동작별 프레임.
// 한 장의 시트에 12프레임 — 0·1 가만히, 2~5 걷기, 6·7 공격(준비·내지름), 8 맞음, 9~11 쓰러짐.
// 그림 함수는 자세(Pose)를 받아 다리·팔·입·눈을 바꾸고, 공통 변형(기울기·찌그러짐·흩어짐)을 덧입혀 모든 종류가 같은 틀로 움직인다.
// 기본 방향은 오른쪽 (HuntScene이 플레이어 쪽으로 setFlipX).

const OUT = 0x141218;
const EYE = 0x141218;
const WHITE = 0xf2ead3;
const PAD = 3;

export const MON_FRAMES = { idle: 0, move: 2, attack: 6, hurt: 8, death: 9, count: 12 } as const;

type Pose = {
  /** 숨쉬기 0|1 */
  f: number;
  /** 걷기 단계 0..3 (가만히는 -1) */
  step: number;
  /** 공격 0 없음, 1 준비, 2 내지름 */
  atk: number;
  hurt: boolean;
};

type Paint = (g: Grid, s: number, m: Color, a: Color, p: Pose) => void;

// ── 작은 도구 ──

const leg = (p: Pose) => (p.step < 0 ? 0 : p.step % 2 === 0 ? 1 : -1);
const lift = (p: Pose) => (p.step === 1 || p.step === 3 ? 1 : 0);

/** 눈 두 개 (맞으면 질끈 감은 눈, 공격 준비면 치켜뜬 눈) */
function eyes(g: Grid, x: number, y: number, gap: number, p: Pose, c: Color = EYE, big = false): void {
  for (const ex of [x, x + gap]) {
    if (p.hurt) {
      g.hline(ex - 1, ex + 1, y, c);
    } else if (big) {
      g.rect(ex - 1, y - 1, 3, 3, WHITE);
      g.rect(ex + (p.atk ? 1 : 0), y, 1, 2, c);
      if (p.atk) g.hline(ex - 1, ex + 1, y - 2, c);
    } else {
      g.set(ex, y, c);
      if (p.atk) g.set(ex + (ex === x ? 1 : -1), y - 1, c);
    }
  }
}

function feet(g: Grid, cx: number, y: number, spread: number, p: Pose, c: Color, w = 2): void {
  const l = leg(p);
  g.rect(cx - spread - w + 1 + l, y, w, 2 - (l > 0 ? 1 : 0), c);
  g.rect(cx + spread - l, y, w, 2 - (l < 0 ? 1 : 0), c);
}

/** 위는 밝게, 아래는 어둡게 (칠해진 픽셀 중 색이 c인 것만) */
function shade(g: Grid, c: Color, top: number, bottom: number): void {
  const hi = Grid.rgba(c);
  const lt = lighten(c, 0.22);
  const dk = darken(c, 0.22);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (g.get(x, y) !== hi) continue;
      if (y <= top && g.get(x, y - 2) === 0) g.set(x, y, lt);
      else if (y >= bottom && (g.get(x, y + 1) === 0 || g.get(x, y + 2) === 0)) g.set(x, y, dk);
    }
}

// ── 몬스터별 그림 ──

const P: Record<MonsterId, Paint> = {
  scope_creep(g, s, m, a, p) {
    const f = p.f + lift(p);
    g.ellipse(s / 2, s / 2 + 2 - f, 5.5 + (p.atk === 2 ? 1 : 0), 4.5 + f * 0.5, m);
    shade(g, m, s / 2 - 1, s / 2 + 4);
    for (let i = 0; i < 3; i++) g.vline(3 + i * 4 + leg(p) * (i % 2 ? 1 : -1), s - 3, s - 1, a);
    eyes(g, s / 2 - 2, s / 2 - f, 4, p);
    if (p.atk) g.hline(s / 2 - 1, s / 2 + 1, s / 2 + 3 - f, OUT);
    g.set(s / 2 + 3, 2 - f, a);
    g.set(s / 2 + 4, 1 - f, a);
    g.set(s / 2 + 5, 2 - f, lighten(m, 0.3));
  },
  endless_meeting(g, s, m, a, p) {
    const f = p.f + lift(p);
    g.rect(2, 3 - f, s - 4, s - 5, m);
    shade(g, m, 4 - f, s - 4);
    g.rect(2, 3 - f, s - 4, 3, 0xc83c3c);
    g.ellipse(s / 2, s / 2 + 2 - f, 4, 4, WHITE);
    // 시곗바늘이 돈다
    const t = (p.step < 0 ? p.f : p.step) % 4;
    g.vline(s / 2, s / 2 - 1 - f, s / 2 + 2 - f, OUT);
    if (t === 0) g.hline(s / 2, s / 2 + 2, s / 2 + 2 - f, OUT);
    else if (t === 1) g.vline(s / 2, s / 2 + 2 - f, s / 2 + 4 - f, OUT);
    else if (t === 2) g.hline(s / 2 - 2, s / 2, s / 2 + 2 - f, OUT);
    else g.set(s / 2 + 1, s / 2 + 3 - f, OUT);
    if (p.atk) g.rect(s / 2 - 2, 0, 4, 2, 0xffe39a);
    feet(g, s / 2, s - 2, 3, p, a);
  },
  tech_debt_slime(g, s, m, a, p) {
    const sq = p.atk === 1 ? 1 : p.atk === 2 ? -1 : 0;
    g.ellipse(s / 2, s - 5 + p.f * 0.5, 6.5 + p.f * 0.5 + sq, 4.5 - p.f * 0.5 - sq + (p.step % 2 ? 0.5 : 0), m);
    g.ellipse(s / 2 - 1, s - 8, 3, 2, lighten(m, 0.25));
    g.vline(3, s - 3, s - 1 + p.f, a);
    g.vline(s - 4, s - 2, s - 1, a);
    eyes(g, s / 2 - 2, s - 6, 4, p);
    g.hline(s / 2 - 1, s / 2 + 1, s - 4, p.atk ? OUT : a);
  },
  already_exists(g, s, m, a, p) {
    const f = p.f;
    g.ellipse(s / 2, s / 2 - f, 5, 5, m);
    g.rect(s / 2 - 5, s / 2 - f, 10, 5, m);
    for (let x = 0; x < 10; x += 3) g.set(s / 2 - 5 + x + ((f + p.step) % 2), s / 2 + 5 - f, m);
    if (p.hurt) {
      g.hline(s / 2 - 3, s / 2 - 1, s / 2 - 1 - f, OUT);
      g.hline(s / 2 + 1, s / 2 + 3, s / 2 - 1 - f, OUT);
    } else {
      g.rect(s / 2 - 3, s / 2 - 2 - f, 2, 2, OUT);
      g.rect(s / 2 + 1, s / 2 - 2 - f, 2, 2, OUT);
    }
    if (p.atk) g.ellipse(s / 2, s / 2 + 2 - f, 1.5, 1.5, OUT);
    else g.hline(s / 2 - 1, s / 2, s / 2 + 2 - f, a);
    g.rect(s / 2 + 5, s / 2 - f + (p.atk ? -2 : 1), 2, 2, m);
  },
  req_change(g, s, m, a, p) {
    const spin = (p.f + Math.max(0, p.step)) % 2;
    g.ellipse(s / 2, s / 2, 4.5, 4.5, m);
    shade(g, m, s / 2 - 2, s / 2 + 2);
    const spikes = spin ? [[0, -6], [6, 0], [0, 6], [-6, 0]] : [[4, -4], [4, 4], [-4, 4], [-4, -4]];
    for (const [dx, dy] of spikes) {
      g.set(s / 2 + dx, s / 2 + dy, a);
      g.set(s / 2 + dx * 0.7, s / 2 + dy * 0.7, m);
    }
    eyes(g, s / 2 - 1, s / 2 - 1, 2, p);
    if (p.atk) g.set(s / 2, s / 2 + 2, OUT);
  },
  merge_conflict(g, s, m, a, p) {
    const f = p.f + lift(p);
    g.ellipse(s / 2, s / 2 + 1 - f, 6, 5.5, m);
    for (let y = 0; y < s; y++) for (let x = Math.ceil(s / 2); x < s; x++) if (g.filled(x, y)) g.set(x, y, a);
    g.hline(2, s - 3, s / 2 + 1 - f, WHITE);
    if (p.atk) for (let y = 2; y < s - 2; y++) g.set(s / 2 + (y % 2), y - f, WHITE);
    eyes(g, s / 2 - 3, s / 2 - 2 - f, 6, p);
    feet(g, s / 2, s - 2, 3, p, darken(m, 0.4));
  },
  conflict_shard(g, s, m, a, p) {
    const f = p.f + lift(p);
    for (let i = 0; i < 4; i++) g.hline(s / 2 - i, s / 2 + i, 1 + i + f, i % 2 ? m : a);
    for (let i = 0; i < 4; i++) g.hline(s / 2 - 3 + i, s / 2 + 3 - i, 5 + i + f, i % 2 ? a : m);
    if (!p.hurt) g.set(s / 2, 4 + f, OUT);
  },
  server_bill(g, s, m, a, p) {
    const f = lift(p);
    g.ellipse(s / 2, s / 2 + 2 - f, 5 + (p.atk ? 1 : 0), 5 + (p.atk ? 1 : 0), p.atk === 2 ? mix(m, a, 0.5) : m);
    g.rect(s / 2 - 1, 2 - f, 3, 2, 0x6a6e78);
    g.set(s / 2 + 2, 1 - f, p.f || p.atk ? 0xffe39a : a);
    g.set(s / 2 + 3, 0 - f, a);
    g.rect(s / 2 - 2, s / 2 + 1 - f, 4, 1, a);
    g.set(s / 2 - 2, s / 2 - 1 - f, lighten(m, 0.4));
    eyes(g, s / 2 - 2, s / 2 + 3 - f, 4, p, a);
  },
  opposing_lead(g, s, m, a, p) {
    const f = p.f * 0.5 + lift(p);
    g.ellipse(s / 2, 4 - f, 3, 3, a);
    g.rect(s / 2 - 3, 1 - f, 6, 2, 0x3a3030);
    g.rect(s / 2 - 4, 7 - f, 8, 7, m);
    shade(g, m, 8 - f, 12);
    g.vline(s / 2, 7 - f, 11 - f, 0xc83c3c);
    eyes(g, s / 2 - 1, 4 - f, 2, p);
    g.hline(s / 2 - 1, s / 2 + 1, 6 - f, p.atk ? 0xc83c3c : OUT);
    feet(g, s / 2, s - 2, 2, p, OUT);
    // 서류 든 팔: 공격하면 치켜든다
    const ay = p.atk === 2 ? 3 : p.atk === 1 ? 5 : 8 + p.f;
    g.rect(s / 2 + 4, ay - f, 2, 4, WHITE);
  },
  legacy_golem(g, s, m, a, p) {
    const f = p.f + lift(p);
    g.rect(4, 3 + f, s - 8, 6, m);
    g.rect(2, 9 + f, s - 4, 8, darken(m, 0.1));
    const arm = p.atk === 2 ? -4 : p.atk === 1 ? -2 : 0;
    g.rect(0, 9 + f + arm, 3, 7, m);
    g.rect(s - 3, 9 + f + arm, 3, 7, m);
    g.rect(5 + leg(p), s - 3, 4, 3, a);
    g.rect(s - 9 - leg(p), s - 3, 4, 3, a);
    const ec = p.hurt ? 0x8a7a5a : p.atk ? 0xff6a3a : 0xffe39a;
    g.rect(7, 5 + f, 2, 2, ec);
    g.rect(s - 9, 5 + f, 2, 2, ec);
    for (let y = 11; y < 16; y += 2) g.hline(5, s - 6, y + f, a);
    g.rect(6, 1 + f, 5, 2, WHITE);
  },
  burnout_wraith(g, s, m, a, p) {
    const f = p.f;
    g.ellipse(s / 2, 6 - f, 5, 5, m);
    g.rect(s / 2 - 5, 6 - f, 10, 7, m);
    for (let x = 0; x < 10; x++) if ((x + f + Math.max(0, p.step)) % 3 !== 0) g.set(s / 2 - 5 + x, 13 - f + (x % 2), m);
    shade(g, m, 4 - f, 11);
    if (p.hurt) {
      g.hline(s / 2 - 3, s / 2 - 1, 5 - f, a);
      g.hline(s / 2 + 1, s / 2 + 3, 5 - f, a);
    } else {
      g.rect(s / 2 - 3, 4 - f, 2, 3, a);
      g.rect(s / 2 + 1, 4 - f, 2, 3, a);
    }
    g.hline(s / 2 - 2, s / 2 + 2, 9 - f, OUT);
    if (p.atk) g.rect(s / 2 + 5, 6 - f - p.atk, 3, 2, m);
  },
  prod_dragon(g, s, m, a, p) {
    const flap = (p.f + Math.max(0, p.step)) % 2;
    for (let i = 0; i < 9; i++) {
      g.vline(3 + i, 6 + i - flap * 2, 14, darken(m, 0.25));
      g.vline(s - 4 - i, 6 + i - flap * 2, 14, darken(m, 0.25));
    }
    g.ellipse(s / 2, 19, 9, 8, m);
    shade(g, m, 14, 24);
    g.ellipse(s / 2, 21, 5, 5, a);
    g.ellipse(s / 2, 9, 6, 5, m);
    g.rect(s / 2 - 5, 3, 2, 3, WHITE);
    g.rect(s / 2 + 3, 3, 2, 3, WHITE);
    eyes(g, s / 2 - 3, 8, 5, p, 0xffe39a);
    if (p.atk) {
      g.rect(s / 2 - 3, 11, 7, 2 + p.atk, OUT);
      g.rect(s / 2 - 2, 12, 5, p.atk, 0xffb040);
    } else g.hline(s / 2 - 3, s / 2 + 3, 12, OUT);
    g.rect(s / 2 - 6 + leg(p), s - 4, 4, 3, darken(m, 0.3));
    g.rect(s / 2 + 2 - leg(p), s - 4, 4, 3, darken(m, 0.3));
  },

  // ── 출근길 지하철 ──
  rush_commuter(g, s, m, a, p) {
    const f = lift(p);
    const lean = p.step >= 0 ? 1 : 0;
    g.ellipse(s / 2 + lean, 3.5 - f, 2.6, 2.8, a);
    g.rect(s / 2 - 2 + lean, 1 - f, 5, 2, 0x2a2420);
    g.rect(s / 2 - 3, 6 - f, 7, 6, m);
    shade(g, m, 7 - f, 10);
    g.vline(s / 2 + 1, 6 - f, 9 - f, WHITE);
    g.set(s / 2 + 1, 7 - f, 0xc83c3c);
    eyes(g, s / 2 + lean, 3 - f, 2, p);
    // 서류 가방
    const bx = p.atk === 2 ? s / 2 + 4 : s / 2 - 6;
    g.rect(bx, 9 - f - (p.atk === 2 ? 2 : 0), 4, 3, 0x6a4a30);
    g.set(bx + 1, 8 - f - (p.atk === 2 ? 2 : 0), OUT);
    g.rect(s / 2 - 3 + leg(p), 12 - f, 2, 2, 0x22222a);
    g.rect(s / 2 + 1 - leg(p), 12 - f, 2, 2, 0x22222a);
  },
  phone_zombie(g, s, m, a, p) {
    const f = lift(p);
    // 고개를 숙이고 폰을 본다
    g.rect(s / 2 - 3, 6 - f, 6, 6, 0x5a5a6a);
    shade(g, 0x5a5a6a, 7, 10);
    g.ellipse(s / 2 + 1, 4.5 - f, 3, 2.7, m);
    g.rect(s / 2 - 2, 2 - f, 5, 1, 0x3a2a20);
    if (p.hurt) g.hline(s / 2, s / 2 + 2, 5 - f, EYE);
    else {
      g.set(s / 2 + 1, 5 - f, EYE);
      g.set(s / 2 + 3, 5 - f, EYE);
    }
    const ph = p.atk ? 0xffffff : a;
    g.rect(s / 2 + 3, 7 - f - (p.atk ? 2 : 0), 2, 3, OUT);
    g.set(s / 2 + 3, 8 - f - (p.atk ? 2 : 0), ph);
    g.set(s / 2 + 4, 8 - f - (p.atk ? 2 : 0), ph);
    // 화면 빛이 얼굴에 비친다
    g.set(s / 2 + 2, 6 - f, lighten(a, 0.3));
    g.rect(s / 2 - 2 + leg(p), 12 - f, 2, 2, 0x2a2a32);
    g.rect(s / 2 + 1 - leg(p), 12 - f, 2, 2, 0x2a2a32);
  },
  backpack_turtle(g, s, m, a, p) {
    const f = lift(p);
    const tuck = p.atk === 1 ? 1 : 0;
    g.ellipse(s / 2 - 1, 8 - f, 6.5, 5.5, m);
    shade(g, m, 5 - f, 11);
    g.rect(s / 2 - 5, 6 - f, 9, 1, darken(m, 0.25));
    g.rect(s / 2 - 4, 9 - f, 7, 1, darken(m, 0.25));
    g.vline(s / 2 - 3, 3 - f, 12 - f, a);
    g.vline(s / 2 + 1, 3 - f, 12 - f, a);
    g.rect(s / 2 - 2, 10 - f, 3, 2, lighten(a, 0.2));
    if (!tuck) {
      g.ellipse(s / 2 + 6 + (p.atk === 2 ? 1 : 0), 8 - f, 2.5, 2.2, 0xa8c878);
      g.set(s / 2 + 7 + (p.atk === 2 ? 1 : 0), 7 - f, p.hurt ? 0xa8c878 : EYE);
    }
    g.rect(s / 2 - 5 + leg(p), 13 - f, 3, 2, 0x6a8a4a);
    g.rect(s / 2 + 2 - leg(p), 13 - f, 3, 2, 0x6a8a4a);
  },
  express_train(g, s, m, a, p) {
    const f = p.f + lift(p);
    const x0 = 3;
    const w = s - 6;
    // 차체
    g.rect(x0 + 2, 3 - f, w - 4, s - 9, m);
    g.rect(x0, 6 - f, w, s - 13, m);
    shade(g, m, 8 - f, s - 9);
    // 행선지 전광판
    g.rect(x0 + 6, 4 - f, w - 12, 3, 0x1a1a1a);
    for (let i = 0; i < w - 14; i += 2) g.set(x0 + 7 + i, 5 - f, (i + p.f) % 4 ? a : 0xff8a3a);
    // 앞 유리 = 성난 눈
    g.rect(x0 + 3, 9 - f, w - 6, 9, 0x1a2a34);
    g.rect(x0 + 4, 10 - f, 4, 2, 0x4a6a7a);
    const ec = p.hurt ? 0x8aa0aa : p.atk ? 0xff5a3a : 0xffffff;
    g.rect(x0 + 6, 13 - f, 6, 3, ec);
    g.rect(x0 + w - 12, 13 - f, 6, 3, ec);
    if (!p.hurt) {
      g.rect(x0 + 9, 14 - f, 2, 2, EYE);
      g.rect(x0 + w - 9, 14 - f, 2, 2, EYE);
    }
    // 눈썹
    for (let i = 0; i < 6; i++) {
      g.set(x0 + 6 + i, 12 - f - Math.floor(i / 3) * (p.atk ? -1 : 0) + (p.atk ? 0 : 0), OUT);
      g.set(x0 + w - 7 - i, 12 - f, OUT);
    }
    // 노란 띠·전조등
    g.rect(x0, 20 - f, w, 3, a);
    const hl = p.atk ? 0xffffff : 0xfff3c8;
    g.rect(x0 + 2, 21 - f, 4, 2, hl);
    g.rect(x0 + w - 6, 21 - f, 4, 2, hl);
    // 입 (그릴)
    g.rect(x0 + 10, 24 - f, w - 20, 3 + (p.atk ? 2 : 0), OUT);
    for (let i = 0; i < w - 22; i += 3) g.set(x0 + 11 + i, 25 - f, 0x6a6e78);
    // 바퀴
    g.rect(x0 + 1, s - 6, w - 2, 2, 0x2a2a30);
    for (const wx of [x0 + 4, x0 + w - 9]) {
      g.ellipse(wx + 2.5, s - 3, 2.5 + (p.step % 2 ? 0.3 : 0), 2.5, 0x3a3a44);
      g.set(wx + 2 + leg(p), s - 3, 0x9aa3ad);
    }
  },

  // ── 새해 다짐 헬스장 ──
  dumbbell_imp(g, s, m, a, p) {
    const f = lift(p) + p.f * 0.5;
    const tilt = p.atk === 2 ? 1 : 0;
    g.rect(1, 3 - f + tilt, 3, 8, m);
    g.rect(s - 4, 3 - f - tilt, 3, 8, m);
    g.rect(0, 4 - f + tilt, 1, 6, darken(m, 0.2));
    g.rect(s - 1, 4 - f - tilt, 1, 6, darken(m, 0.2));
    g.rect(4, 6 - f, s - 8, 3, 0x9aa3ad);
    g.rect(4, 5 - f, s - 8, 5, a);
    g.hline(4, s - 5, 5 - f, lighten(a, 0.3));
    eyes(g, s / 2 - 2, 7 - f, 3, p, WHITE);
    if (p.atk) g.hline(s / 2 - 1, s / 2 + 1, 9 - f, OUT);
    feet(g, s / 2, s - 2, 2, p, OUT);
    g.vline(s / 2 - 2, 10 - f, s - 3, OUT);
    g.vline(s / 2 + 2, 10 - f, s - 3, OUT);
  },
  protein_shaker(g, s, m, a, p) {
    const shake = p.step >= 0 ? (p.step % 2 ? 1 : -1) : 0;
    const pop = p.atk === 2 ? 3 : p.atk === 1 ? 1 : 0;
    g.rect(s / 2 - 4 + shake, 4, 8, s - 5, m);
    g.rect(s / 2 - 3 + shake, 7 + p.f, 6, s - 9 - p.f, a);
    g.hline(s / 2 - 3 + shake, s / 2 + 2 + shake, 7 + p.f, lighten(a, 0.35));
    g.vline(s / 2 - 3 + shake, 5, s - 3, lighten(m, 0.4));
    g.rect(s / 2 - 4 + shake, 2 - pop, 8, 3, darken(a, 0.2));
    g.rect(s / 2 - 1 + shake, 0 - pop, 2, 2, darken(a, 0.35));
    eyes(g, s / 2 - 2 + shake, 9, 3, p, WHITE);
    if (pop) for (let i = 0; i < 3; i++) g.set(s / 2 - 3 + i * 3, 3 - i % 2, lighten(a, 0.5));
  },
  treadmill_ghost(g, s, m, a, p) {
    const f = p.f;
    g.ellipse(s / 2, s / 2 - 1 - f, 5, 5, m);
    g.rect(s / 2 - 5, s / 2 - 1 - f, 10, 5, m);
    for (let x = 0; x < 10; x += 2) g.set(s / 2 - 5 + x + ((f + Math.max(0, p.step)) % 2), s / 2 + 4 - f, m);
    shade(g, m, s / 2 - 4, s / 2 + 3);
    g.hline(s / 2 - 5, s / 2 + 4, s / 2 - 4 - f, 0xd04a4a); // 머리띠
    eyes(g, s / 2 - 2, s / 2 - 1 - f, 4, p);
    // 회원권 카드
    const cy = p.atk === 2 ? s / 2 - 5 : s / 2 + 1;
    g.rect(s / 2 + 4, cy - f, 4, 3, a);
    g.hline(s / 2 + 4, s / 2 + 7, cy - f, 0xf0d050);
  },
  membership_titan(g, s, m, a, p) {
    const f = p.f + lift(p);
    const flex = p.atk ? 1 : 0;
    // 다리
    g.rect(s / 2 - 8 + leg(p), s - 9, 6, 7, 0x3a3f58);
    g.rect(s / 2 + 2 - leg(p), s - 9, 6, 7, 0x3a3f58);
    g.rect(s / 2 - 9 + leg(p), s - 3, 7, 3, OUT);
    g.rect(s / 2 + 2 - leg(p), s - 3, 7, 3, OUT);
    // 몸 (민소매)
    g.ellipse(s / 2, 17 - f, 11, 9, m);
    g.rect(s / 2 - 7, 13 - f, 14, 12, a);
    g.hline(s / 2 - 5, s / 2 + 5, 16 - f, lighten(a, 0.2));
    // 팔: 공격하면 알통 자랑
    for (const sd of [-1, 1]) {
      const ax = s / 2 + sd * 12;
      if (flex) {
        g.ellipse(ax, 10 - f - p.atk, 4, 5, m);
        g.ellipse(ax + sd, 6 - f - p.atk, 3, 3, m);
      } else {
        g.ellipse(ax, 17 - f, 4, 6, m);
        g.ellipse(ax, 23 - f, 3, 3, m);
      }
    }
    shade(g, m, 10 - f, 22);
    // 머리
    g.ellipse(s / 2, 8 - f, 6, 6, m);
    g.rect(s / 2 - 6, 4 - f, 12, 2, 0xd04a4a);
    eyes(g, s / 2 - 3, 8 - f, 6, p, EYE, true);
    g.hline(s / 2 - 2, s / 2 + 2, 12 - f, p.atk ? 0xd04a4a : OUT);
    // 1년 회원권 카드 (가슴팍)
    g.rect(s / 2 - 4, 18 - f, 8, 5, 0xf0d050);
    g.hline(s / 2 - 3, s / 2 + 3, 20 - f, darken(0xf0d050, 0.4));
  },

  // ── 시험 전날 도서관 ──
  flying_book(g, s, m, a, p) {
    const flap = (p.f + Math.max(0, p.step) + (p.atk ? 1 : 0)) % 2;
    const wy = flap ? 2 : 6;
    // 펼친 책: 양쪽 표지가 날개처럼
    for (let i = 0; i < 5; i++) {
      g.vline(s / 2 - 1 - i, wy + i * (flap ? 0.6 : 0) , wy + 5 + i * (flap ? 0.6 : 0), m);
      g.vline(s / 2 + 1 + i, wy + i * (flap ? 0.6 : 0), wy + 5 + i * (flap ? 0.6 : 0), m);
    }
    g.rect(s / 2 - 4, 6, 8, 5, a);
    for (let y = 7; y < 11; y += 2) {
      g.hline(s / 2 - 3, s / 2 - 1, y, darken(a, 0.35));
      g.hline(s / 2 + 1, s / 2 + 3, y, darken(a, 0.35));
    }
    g.vline(s / 2, 5, 11, darken(m, 0.3));
    eyes(g, s / 2 - 2, 8, 4, p);
    g.set(s / 2, 12 + p.f, darken(m, 0.2));
  },
  night_owl(g, s, m, a, p) {
    const f = p.f + lift(p) * 0.5;
    g.ellipse(s / 2, s / 2 + 1 - f, 5.5, 6, m);
    shade(g, m, s / 2 - 3, s / 2 + 4);
    g.ellipse(s / 2, s / 2 + 3 - f, 3, 3, lighten(m, 0.35));
    g.set(s / 2 - 4, 1 - f, m);
    g.set(s / 2 + 4, 1 - f, m);
    // 큰 눈 + 다크서클
    for (const ex of [s / 2 - 2.5, s / 2 + 2.5]) {
      g.ellipse(ex, s / 2 - 2 - f, 2.3, 2.3, p.hurt ? m : a);
      if (!p.hurt) g.set(ex, s / 2 - 2 - f, EYE);
      g.hline(ex - 1, ex + 1, s / 2 - f, darken(m, 0.4));
    }
    g.set(s / 2, s / 2 - f, 0xe0a030);
    // 날개: 쪽지를 던질 때 펼친다
    const wy = p.atk ? s / 2 - 3 : s / 2;
    g.rect(s / 2 - 7, wy - f, 2, 5, darken(m, 0.25));
    g.rect(s / 2 + 5, wy - f, 2, 5, darken(m, 0.25));
    if (p.atk === 2) g.rect(s / 2 + 6, wy - 3 - f, 3, 2, WHITE);
    g.set(s / 2 - 2, s - 2, 0xe0a030);
    g.set(s / 2 + 2, s - 2, 0xe0a030);
  },
  eraser_crumb(g, s, m, a, p) {
    const f = lift(p);
    const sq = p.atk === 1 ? 1 : 0;
    g.rect(2, 4 - f + sq, s - 4, s - 7 - sq, m);
    shade(g, m, 5, s - 5);
    g.rect(s / 2 - 1, 3 - f + sq, s / 2 - 1, s - 6 - sq, a);
    g.hline(s / 2 - 1, s - 3, 5 - f + sq, lighten(a, 0.3));
    eyes(g, 5, 7 - f + sq, 3, p);
    if (p.atk) g.hline(5, 7, 10 - f, OUT);
    // 떨어지는 가루
    g.set(1 + (p.f ? 1 : 0), s - 2, lighten(m, 0.2));
    g.set(s - 2, s - 3 + p.f, lighten(m, 0.2));
    feet(g, s / 2, s - 2, 3, p, darken(m, 0.3));
  },
  eraser_bit(g, s, m, a, p) {
    const f = lift(p) + p.f;
    g.rect(2, 3 - f, 5, 4, m);
    g.rect(4, 3 - f, 3, 4, a);
    if (!p.hurt) g.set(3, 4 - f, EYE);
    g.set(2 + leg(p) + 1, 8 - f, m);
    g.set(6, 8 - f, m);
  },
  exam_paper(g, s, m, a, p) {
    const f = p.f + lift(p);
    const w = s - 10;
    const x0 = 5;
    // 종이 (오른쪽 위 귀퉁이 접힘)
    g.rect(x0, 2 - f, w, s - 7, m);
    for (let i = 0; i < 5; i++) for (let x = x0 + w - 5 + i; x <= x0 + w - 1; x++) g.set(x, 2 - f + i, 0, 0);
    for (let i = 0; i < 5; i++) g.set(x0 + w - 5 + i, 2 - f + i, darken(m, 0.25));
    // 줄
    for (let y = 18; y < s - 7; y += 3) g.hline(x0 + 3, x0 + w - 4, y - f, 0xb8c8e0);
    // 빨간 동그라미 점수
    g.ellipse(x0 + 7, 8 - f, 4, 3.5, a);
    g.ellipse(x0 + 7, 8 - f, 2.6, 2.1, m);
    // 성난 눈
    eyes(g, x0 + w / 2 - 1, 12 - f, 8, p, EYE, true);
    for (let i = 0; i < 4; i++) {
      g.set(x0 + w / 2 - 3 + i, 9 - f + Math.floor(i / 2), OUT);
      g.set(x0 + w / 2 + 10 - i, 9 - f + Math.floor(i / 2), OUT);
    }
    // 입
    if (p.atk) g.rect(x0 + w / 2 + 1, 16 - f, 6, 3, OUT);
    else g.hline(x0 + w / 2 + 1, x0 + w / 2 + 6, 17 - f, OUT);
    // 빨간 X 표시
    for (let i = 0; i < 4; i++) {
      g.set(x0 + 4 + i, 22 - f + i, a);
      g.set(x0 + 7 - i, 22 - f + i, a);
    }
    // 빨간 펜 팔: 공격하면 치켜든다
    const py = p.atk === 2 ? 2 : p.atk === 1 ? 6 : 14;
    g.rect(x0 + w + 1, py - f, 2, 10, a);
    g.rect(x0 + w + 1, py + 10 - f, 2, 2, 0x2a2a30);
    g.rect(x0 - 3, 14 - f, 3, 2, m);
    // 다리
    g.rect(x0 + 6 + leg(p), s - 5, 2, 4, OUT);
    g.rect(x0 + w - 8 - leg(p), s - 5, 2, 4, OUT);
  },

  // ── 장바구니 정글 ──
  sale_tag(g, s, m, a, p) {
    const f = lift(p) + p.f * 0.5;
    g.rect(3, 1 - f, s - 5, s - 4, m);
    for (let i = 0; i < 3; i++) for (let j = 0; j <= 2 - i; j++) g.set(3 + i, 1 - f + j, 0, 0);
    g.set(5, 3 - f, OUT);
    g.hline(5, s - 4, s - 6 - f, a);
    g.hline(5, s - 4, s - 5 - f, a);
    eyes(g, 5, 6 - f, 3, p);
    if (p.atk) g.set(6, 8 - f, OUT);
    feet(g, s / 2, s - 2, 2, p, OUT, 1);
  },
  impulse_vine(g, s, m, a, p) {
    const sway = p.f + (p.step >= 0 ? (p.step % 2 ? 1 : -1) : 0);
    // 화분
    g.rect(s / 2 - 4, s - 5, 8, 5, 0xb06a3a);
    g.hline(s / 2 - 5, s / 2 + 4, s - 5, 0xc87a4a);
    // 줄기·잎
    g.vline(s / 2, 7, s - 5, m);
    g.vline(s / 2 + 1, 8, s - 6, darken(m, 0.2));
    g.rect(s / 2 - 5, 10 + sway * 0.5, 4, 2, m);
    g.rect(s / 2 + 2, 11 - sway * 0.5, 4, 2, m);
    // 꽃 머리: 공격하면 입을 벌린다
    const open = p.atk;
    g.ellipse(s / 2 + sway * 0.5, 5, 4.5, 4 + open * 0.5, a);
    if (open) {
      g.rect(s / 2 - 1 + sway * 0.5, 4, 4, 2 + open, OUT);
      g.set(s / 2 + sway * 0.5, 4, WHITE);
      g.set(s / 2 + 2 + sway * 0.5, 4, WHITE);
    } else {
      eyes(g, s / 2 - 2 + sway * 0.5, 4, 3, p);
    }
    g.set(s / 2 - 3, 2, lighten(a, 0.3));
  },
  runaway_cart(g, s, m, a, p) {
    const f = p.f * 0.5;
    const lean = p.atk === 2 ? 1 : 0;
    // 바구니 (철망)
    for (let y = 3; y < 11; y++) g.hline(2 + Math.floor((y - 3) / 3) + lean, s - 3, y - f, (y % 2 ? m : darken(m, 0.25)));
    for (let x = 4; x < s - 3; x += 3) g.vline(x, 3 - f, 10 - f, darken(m, 0.35));
    g.hline(1, s - 2, 3 - f, lighten(m, 0.3));
    // 손잡이 (빨강)
    g.rect(0, 1 - f, 2, 3, a);
    g.rect(0, 0 - f, 4, 1, a);
    // 눈 (앞쪽)
    eyes(g, s - 7, 6 - f, 3, p, EYE, true);
    // 아래 프레임·바퀴
    g.hline(3, s - 3, 12, darken(m, 0.4));
    const sp = Math.max(0, p.step);
    for (const wx of [4, s - 5]) {
      g.ellipse(wx, s - 2, 1.6, 1.6, OUT);
      g.set(wx + ((sp % 2) ? 0 : -1), s - 2, 0x9aa3ad);
    }
    if (p.atk === 1) g.set(1, s - 1, 0xffe39a);
  },
  black_friday(g, s, m, a, p) {
    const f = p.f + lift(p);
    const x0 = 5;
    const w = s - 10;
    // 손잡이 (금색 끈)
    for (let i = 0; i < 8; i++) {
      g.set(x0 + 6 + i, 6 - f - Math.round(Math.sin((i / 7) * Math.PI) * 5), a);
      g.set(x0 + w - 14 + i, 6 - f - Math.round(Math.sin((i / 7) * Math.PI) * 5), a);
    }
    // 가방 몸통
    g.rect(x0, 7 - f, w, s - 12, m);
    g.rect(x0 - 1, 7 - f, w + 2, 2, darken(m, 0.3));
    shade(g, m, 10 - f, s - 7);
    // % 엠블럼
    g.ellipse(x0 + 7, 13 - f, 2, 2, a);
    g.ellipse(x0 + w - 7, 25 - f, 2, 2, a);
    for (let i = 0; i < 14; i++) g.set(x0 + w - 8 - i * ((w - 16) / 14), 11 - f + i, a);
    // 눈·입
    eyes(g, x0 + w / 2 - 5, 17 - f, 10, p, EYE, true);
    const mh = p.atk ? 5 : 3;
    g.rect(x0 + w / 2 - 6, 22 - f, 12, mh, 0x8a2020);
    for (let i = 0; i < 12; i += 2) g.set(x0 + w / 2 - 6 + i, 22 - f, WHITE);
    if (p.atk) for (let i = 1; i < 12; i += 2) g.set(x0 + w / 2 - 6 + i, 22 - f + mh - 1, WHITE);
    // 가격표 펄럭
    g.rect(x0 + w, 12 - f + p.f, 4, 6, 0xf2ead3);
    g.hline(x0 + w, x0 + w + 3, 14 - f + p.f, 0xd03030);
    // 바닥
    g.rect(x0 + 4 + leg(p), s - 5, 4, 4, darken(m, 0.4));
    g.rect(x0 + w - 8 - leg(p), s - 5, 4, 4, darken(m, 0.4));
  },

  // ── 방학 숙제 사막 ──
  diary_mummy(g, s, m, a, p) {
    const f = lift(p);
    const arm = p.atk === 2 ? 4 : p.atk === 1 ? 2 : 0;
    g.ellipse(s / 2, 4 - f, 3.5, 3.5, m);
    g.rect(s / 2 - 4, 7 - f, 8, 7, m);
    for (let y = 2; y < 14; y += 2) g.hline(s / 2 - 4 + (y % 4 ? 1 : 0), s / 2 + 3 - (y % 4 ? 0 : 1), y - f, a);
    // 앞으로 뻗은 팔
    g.rect(s / 2 + 3, 8 - f - (arm ? 1 : 0), 3 + arm, 2, m);
    g.set(s / 2 + 4 + arm, 8 - f, a);
    // 한쪽 눈이 빨갛게 빛난다
    if (!p.hurt) {
      g.set(s / 2 + 1, 4 - f, 0xe84040);
      g.set(s / 2 - 1, 4 - f, darken(a, 0.2));
    } else g.hline(s / 2 - 1, s / 2 + 1, 4 - f, darken(a, 0.2));
    // 그림일기장
    g.rect(s / 2 - 7, 9 - f, 3, 4, 0x3a6ac8);
    g.rect(s / 2 - 3 + leg(p), 14 - f, 2, 2, m);
    g.rect(s / 2 + 1 - leg(p), 14 - f, 2, 2, m);
  },
  essay_cactus(g, s, m, a, p) {
    const f = p.f * 0.5;
    g.rect(s / 2 - 2, 2 - f, 5, s - 4, m);
    g.ellipse(s / 2 + 0.5, 2.5 - f, 2.5, 2, m);
    // 팔: 공격하면 위로
    const up = p.atk ? 2 : 0;
    g.rect(s / 2 - 5, 7 - f - up, 3, 2, m);
    g.rect(s / 2 - 6, 4 - f - up, 2, 4, m);
    g.rect(s / 2 + 3, 9 - f - up, 3, 2, m);
    g.rect(s / 2 + 5, 6 - f - up, 2, 4, m);
    shade(g, m, 3, s - 4);
    // 가시
    for (const [x, y] of [[s / 2 - 3, 5], [s / 2 + 3, 4], [s / 2 - 3, 11], [s / 2 + 3, 13], [s / 2 - 7, 5], [s / 2 + 7, 7]]) g.set(x, y - f, a);
    // 원고지 한 장
    g.rect(s / 2 - 1, 9 - f, 3, 3, 0xf2ead3);
    eyes(g, s / 2 - 1, 5 - f, 2, p);
    if (p.atk) g.set(s / 2, 7 - f, OUT);
    g.rect(s / 2 - 4, s - 2, 9, 2, 0xb06a3a);
  },
  sand_worm(g, s, m, a, p) {
    const rise = p.atk === 2 ? -2 : p.atk === 1 ? 1 : 0;
    const wig = p.f + Math.max(0, p.step);
    // 모래 무더기
    g.ellipse(s / 2, s - 2, 7, 2.5, 0xc8a868);
    // 마디
    for (let i = 0; i < 4; i++) {
      const y = s - 4 - i * 3 + rise;
      const x = s / 2 + ((i + wig) % 2 ? 1 : -1) * (i > 0 ? 1 : 0);
      g.ellipse(x, y, 3.2 - i * 0.2, 2, i % 2 ? m : darken(m, 0.15));
    }
    // 입 (이빨 고리)
    const hy = s - 14 + rise;
    g.ellipse(s / 2 + 1, hy, 3.5, 3, m);
    g.ellipse(s / 2 + 2, hy, 1.8 + (p.atk ? 0.6 : 0), 1.8 + (p.atk ? 0.6 : 0), a);
    g.set(s / 2 + 2, hy - 2, WHITE);
    g.set(s / 2 + 4, hy, WHITE);
    if (!p.hurt) g.set(s / 2 - 1, hy - 2, EYE);
  },
  homework_sphinx(g, s, m, a, p) {
    const f = p.f;
    // 엎드린 몸
    g.ellipse(s / 2 - 4, s - 9, 13, 7, m);
    shade(g, m, s - 14, s - 5);
    // 앞발
    g.rect(s / 2 + 2 + leg(p), s - 6, 10, 4, m);
    g.rect(s / 2 + 10 + leg(p), s - 5, 3, 3, lighten(m, 0.2));
    g.rect(s / 2 - 16 - leg(p), s - 5, 7, 3, m);
    // 머리쓰개 (파란 줄무늬)
    const hx = s / 2 + 4;
    const hy = 12 - f - (p.atk ? 2 : 0);
    g.rect(hx - 8, hy - 8, 16, 18, a);
    for (let y = hy - 8; y < hy + 10; y += 3) g.hline(hx - 8, hx + 7, y, 0xd8b060);
    g.ellipse(hx, hy - 7, 6, 3, a);
    // 얼굴 + 안경
    g.rect(hx - 5, hy - 4, 10, 11, lighten(m, 0.15));
    g.rect(hx - 5, hy - 1, 4, 3, OUT);
    g.rect(hx + 1, hy - 1, 4, 3, OUT);
    g.hline(hx - 1, hx, hy, OUT);
    if (!p.hurt) {
      g.rect(hx - 4, hy, 2, 1, p.atk ? 0xff5a3a : 0x9ad0f0);
      g.rect(hx + 2, hy, 2, 1, p.atk ? 0xff5a3a : 0x9ad0f0);
    }
    if (p.atk) g.rect(hx - 2, hy + 4, 4, 2, OUT);
    else g.hline(hx - 2, hx + 1, hy + 4, darken(m, 0.4));
    // 수염 (턱)
    g.rect(hx - 1, hy + 7, 2, 4, a);
    // 숙제 공책 더미
    g.rect(s / 2 - 14, s - 13 - f, 8, 2, 0xd03a3a);
    g.rect(s / 2 - 13, s - 15 - f, 8, 2, 0x3a8a3a);
    g.rect(s / 2 - 14, s - 17 - f, 8, 2, WHITE);
  },

  // ── 12월 31일 밤 축제장 ──
  firecracker_kid(g, s, m, a, p) {
    const f = lift(p);
    g.rect(s / 2 - 3, 3 - f, 6, s - 6, m);
    shade(g, m, 4, s - 4);
    g.hline(s / 2 - 3, s / 2 + 2, 5 - f, a);
    g.hline(s / 2 - 3, s / 2 + 2, s - 5 - f, a);
    eyes(g, s / 2 - 2, 7 - f, 3, p, WHITE);
    // 심지·불꽃
    g.vline(s / 2, 0 - f, 2 - f, 0x6a5a4a);
    const spark = p.atk || p.f ? 0xfff3c8 : a;
    g.set(s / 2 + 1, 0 - f, spark);
    g.set(s / 2 - 1, 1 - f, a);
    if (p.atk) {
      g.set(s / 2 + 2, 1 - f, 0xffffff);
      g.set(s / 2 - 2, 0 - f, 0xffffff);
    }
    g.rect(s / 2 - 3 + leg(p), s - 3, 2, 3, OUT);
    g.rect(s / 2 + 1 - leg(p), s - 3, 2, 3, OUT);
  },
  resolution_card(g, s, m, a, p) {
    const f = p.f + (p.step >= 0 ? p.step % 2 : 0);
    const tilt = p.atk === 2 ? 1 : 0;
    g.rect(2 + tilt, 2 - f, s - 4, s - 5, m);
    g.rect(2 + tilt, 2 - f, s - 4, 3, a);
    // 체크 상자 (하나만 체크, 나머지는 비어 있다)
    for (let i = 0; i < 3; i++) {
      const y = 6 + i * 2 - f;
      g.set(4 + tilt, y, darken(m, 0.45));
      g.hline(6 + tilt, s - 5 + tilt, y, darken(m, 0.3));
    }
    g.set(4 + tilt, 6 - f, 0x40a050);
    eyes(g, 5 + tilt, s - 5 - f, 4, p);
    // 반투명 꼬리
    g.set(s / 2, s - 2 - f, lighten(a, 0.4));
    g.set(s / 2 + 1, s - 1 - f, lighten(a, 0.6));
  },
  countdown_clock(g, s, m, a, p) {
    const f = lift(p) + p.f * 0.5;
    const ring = p.atk ? (p.f ? 1 : -1) : 0;
    // 종 두 개 + 망치
    g.ellipse(s / 2 - 5 + ring, 3 - f, 3, 2.5, m);
    g.ellipse(s / 2 + 5 - ring, 3 - f, 3, 2.5, m);
    g.vline(s / 2, 1 - f, 4 - f, OUT);
    // 몸통
    g.ellipse(s / 2, s / 2 + 1 - f, 7, 7, m);
    shade(g, m, s / 2 - 4, s / 2 + 5);
    g.ellipse(s / 2, s / 2 + 1 - f, 5.2, 5.2, WHITE);
    // 바늘: 걸을 때마다 돈다
    const st = Math.max(0, p.step);
    g.vline(s / 2, s / 2 - 3 - f, s / 2 + 1 - f, a);
    const hx = [3, 3, 0, -3][st];
    const hy = [0, 2, 3, 2][st];
    for (let i = 1; i <= 3; i++) g.set(s / 2 + Math.round((hx * i) / 3), s / 2 + 1 + Math.round((hy * i) / 3) - f, a);
    if (p.atk) g.set(s / 2, s / 2 + 3 - f, 0xd03030);
    if (!p.hurt) {
      g.set(s / 2 - 3, s / 2 - 1 - f, EYE);
      g.set(s / 2 + 3, s / 2 - 1 - f, EYE);
    }
    feet(g, s / 2, s - 2, 3, p, a);
  },
  party_popper(g, s, m, a, p) {
    const f = lift(p) + p.f * 0.5;
    // 고깔모자
    for (let i = 0; i < 5; i++) g.hline(s / 2 - i / 2, s / 2 + i / 2, i - f, i % 2 ? a : 0xe84a8a);
    g.set(s / 2, -1 - f, 0xffffff);
    g.ellipse(s / 2, 7 - f, 3, 3, 0xf0c8a0);
    eyes(g, s / 2 - 1, 7 - f, 2, p);
    g.rect(s / 2 - 3, 10 - f, 6, 4, m);
    shade(g, m, 10, 13);
    // 폭죽 대롱
    const py = p.atk === 2 ? 7 : 10;
    g.rect(s / 2 + 3, py - f, 3, 2, a);
    if (p.atk === 2) {
      for (const [x, y, c] of [[s / 2 + 7, py - 2, 0xe84a8a], [s / 2 + 8, py, 0x6ad0c8], [s / 2 + 7, py + 2, 0xf0d050]] as const) g.set(x, y - f, c);
    }
    g.rect(s / 2 - 3 + leg(p), 14 - f, 2, 1, OUT);
    g.rect(s / 2 + 1 - leg(p), 14 - f, 2, 1, OUT);
  },
  midnight_bell(g, s, m, a, p) {
    const sway = p.step >= 0 ? (p.step % 2 ? 1 : -1) : p.f ? 1 : 0;
    const f = p.f;
    // 고리 (용뉴)
    g.ellipse(s / 2 + sway, 3, 4, 3, darken(m, 0.2));
    g.ellipse(s / 2 + sway, 3, 2, 1.5, 0, 0);
    // 종 몸통: 위는 둥글고 아래로 갈수록 넓다
    for (let y = 5; y < s - 4; y++) {
      const t = (y - 5) / (s - 9);
      const hw = 9 + t * 7 + (y > s - 8 ? 2 : 0);
      g.hline(Math.round(s / 2 - hw + sway * (1 - t)), Math.round(s / 2 + hw + sway * (1 - t)), y - f * (1 - t), m);
    }
    shade(g, m, 12, s - 7);
    // 띠·돋을무늬
    g.hline(s / 2 - 11, s / 2 + 11, 10 - f, a);
    g.hline(s / 2 - 15, s / 2 + 15, s - 8, a);
    for (let i = -2; i <= 2; i++) g.ellipse(s / 2 + i * 5, 7 - f, 1, 1, a);
    // 얼굴
    eyes(g, s / 2 - 5, 18 - f, 10, p, EYE, true);
    for (let i = 0; i < 4; i++) {
      g.set(s / 2 - 7 + i, 14 - f + (p.atk ? Math.floor(i / 2) : 0), OUT);
      g.set(s / 2 + 7 - i, 14 - f + (p.atk ? Math.floor(i / 2) : 0), OUT);
    }
    const mh = p.atk === 2 ? 6 : p.atk ? 4 : 2;
    g.rect(s / 2 - 4, 24 - f, 8, mh, 0x2a1a10);
    if (p.atk) g.hline(s / 2 - 3, s / 2 + 2, 24 - f, WHITE);
    // 아래 입구 그림자
    g.hline(s / 2 - 14, s / 2 + 14, s - 5, darken(m, 0.5));
    // 당좌 (치는 자리 연꽃)
    g.ellipse(s / 2 + 10, 26 - f, 2.5, 2.5, lighten(a, 0.2));
  },
  endless_toast(g, s, m, a, p) {
    const f = p.f + lift(p);
    const x0 = s / 2 - 8;
    // 병목·뚜껑
    g.rect(s / 2 - 3, 1 - f, 6, 3, 0xd8d8d8);
    g.rect(s / 2 - 3, 4 - f, 6, 6, m);
    // 병 몸통
    g.rect(x0, 9 - f, 16, s - 13, m);
    g.rect(x0 + 1, 8 - f, 14, 1, m);
    shade(g, m, 12 - f, s - 7);
    g.vline(x0 + 2, 10 - f, s - 7, lighten(m, 0.45));
    // 상표 (흰 띠)
    g.rect(x0, 16 - f, 16, 11, a);
    g.hline(x0, x0 + 15, 16 - f, 0x2a6a9a);
    g.hline(x0, x0 + 15, 26 - f, 0x2a6a9a);
    // 얼굴 (상표 위) — 발그레한 볼
    eyes(g, x0 + 5, 20 - f, 6, p);
    g.rect(x0 + 3, 22 - f, 2, 1, 0xe87a8a);
    g.rect(x0 + 12, 22 - f, 2, 1, 0xe87a8a);
    if (p.atk) g.rect(x0 + 7, 23 - f, 3, 2, OUT);
    else g.hline(x0 + 7, x0 + 9, 24 - f, OUT);
    // 건배하는 팔 + 잔
    const up = p.atk === 2 ? 10 : p.atk === 1 ? 14 : 20;
    g.rect(x0 + 16, up - f, 6, 2, m);
    g.rect(x0 + 20, up - 4 - f, 4, 4, 0xe8f0f0);
    g.rect(x0 + 20, up - 3 - f, 4, 2, 0xf0e8a0);
    g.rect(x0 - 3, 22 - f, 3, 2, m);
    // 다리
    g.rect(x0 + 3 + leg(p), s - 4, 3, 4, darken(m, 0.4));
    g.rect(x0 + 10 - leg(p), s - 4, 3, 4, darken(m, 0.4));
  },
};

// ── 공통 변형 ──

/** 바닥(아래 가운데) 기준으로 가로 sx·세로 sy배 */
function scaleGrid(src: Grid, sx: number, sy: number, shiftX = 0): Grid {
  const g = new Grid(src.w, src.h);
  const cx = src.w / 2;
  const by = src.h - PAD;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const ux = Math.floor(cx + (x + 0.5 - cx - shiftX) / sx);
      const uy = Math.floor(by + (y + 0.5 - by) / sy);
      const v = src.get(ux, uy);
      if (v) g.px[y * g.w + x] = v;
    }
  return g;
}

/** 위쪽일수록 dx만큼 밀어 기울인다 (돌진·움찔) */
function lean(src: Grid, dx: number): Grid {
  const g = new Grid(src.w, src.h);
  for (let y = 0; y < g.h; y++) {
    const off = Math.round(dx * (1 - y / g.h));
    for (let x = 0; x < g.w; x++) {
      const v = src.get(x - off, y);
      if (v) g.px[y * g.w + x] = v;
    }
  }
  return g;
}

function tintGrid(src: Grid, to: Color, t: number): void {
  for (let i = 0; i < src.px.length; i++) {
    const v = src.px[i];
    if ((v & 255) === 0) continue;
    const c = mix(v >>> 8, to, t);
    src.px[i] = Grid.rgba(c, v & 255);
  }
}

/** 쓰러질 때 픽셀이 흩어진다 (결정적 해시) */
function dissolve(src: Grid, amount: number, salt: number): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const i = y * src.w + x;
      if (!src.px[i]) continue;
      const h = ((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791)) >>> 0;
      if ((h % 1000) / 1000 < amount) src.px[i] = 0;
    }
}

function frame(id: MonsterId, p: Pose): Grid {
  const def = MONSTERS[id];
  const s = def.size;
  const inner = new Grid(s, s);
  P[id](inner, s, def.color, def.accent, p);
  inner.outline(OUT);
  const g = new Grid(s + PAD * 2, s + PAD * 2);
  g.draw(inner, PAD, PAD);
  return g;
}

/** 한 몬스터의 12프레임 시트 */
export function monsterSheet(id: MonsterId): HTMLCanvasElement {
  const s = MONSTERS[id].size;
  const fw = s + PAD * 2;
  const sheet = new Grid(fw * MON_FRAMES.count, fw);
  const put = (g: Grid, i: number) => sheet.draw(g, i * fw, 0);
  const idle = (f: number): Pose => ({ f, step: -1, atk: 0, hurt: false });
  put(frame(id, idle(0)), 0);
  put(frame(id, idle(1)), 1);
  for (let k = 0; k < 4; k++) {
    let g = frame(id, { f: 0, step: k, atk: 0, hurt: false });
    g = lean(g, k % 2 ? 1 : 0);
    put(g, 2 + k);
  }
  // 공격: 준비(움츠림) → 내지름(앞으로 늘어남)
  put(scaleGrid(frame(id, { f: 0, step: -1, atk: 1, hurt: false }), 1.08, 0.88, -1), 6);
  put(lean(scaleGrid(frame(id, { f: 0, step: -1, atk: 2, hurt: false }), 1.12, 1.04, 2), 2), 7);
  // 맞음: 뒤로 젖히고 하얗게
  const hurt = lean(frame(id, { f: 0, step: -1, atk: 0, hurt: true }), -2);
  tintGrid(hurt, 0xffffff, 0.35);
  put(hurt, 8);
  // 쓰러짐: 찌그러지며 흩어진다
  for (let k = 0; k < 3; k++) {
    const g = scaleGrid(frame(id, { f: 0, step: -1, atk: 0, hurt: true }), 1 + k * 0.12, [0.72, 0.45, 0.22][k]);
    tintGrid(g, k === 0 ? 0xffffff : 0x2a2030, [0.25, 0.3, 0.5][k]);
    dissolve(g, [0.08, 0.3, 0.55][k], k + 1);
    put(g, 9 + k);
  }
  return sheet.toCanvas();
}

export const monsterFrameSize = (id: MonsterId) => MONSTERS[id].size + PAD * 2;
/** 스프라이트 원점: 가로 가운데, 세로는 발밑 (예전 0.9 위치와 같게) */
export const monsterOrigin = (id: MonsterId): [number, number] => {
  const s = MONSTERS[id].size;
  return [0.5, (s * 0.9 + PAD) / (s + PAD * 2)];
};

// ── 동작 고르기 (HuntScene 매 프레임) ──

/** HuntScene의 Mon에서 동작을 읽어 낼 만큼만 */
export type AnimMon = {
  id: MonsterId;
  x: number;
  y: number;
  nextAtk: number;
  nextThink: number;
  windUntil: number;
  stunUntil: number;
  hidden: boolean;
};

type AnimState = { x: number; y: number; atk: number; think: number; atkUntil: number; moveUntil: number; phase: number };
const anim = new WeakMap<object, AnimState>();
const SHOOTERS = new Set(["ranged", "boss"]);

/** 지금 보여 줄 프레임: 맞음 > 공격 > 걷기 > 가만히 */
export function monsterFrame(m: AnimMon, now: number): number {
  let st = anim.get(m);
  if (!st) {
    st = { x: m.x, y: m.y, atk: m.nextAtk, think: m.nextThink, atkUntil: 0, moveUntil: 0, phase: Math.floor(Math.random() * 1000) };
    anim.set(m, st);
  }
  if (Math.abs(m.x - st.x) + Math.abs(m.y - st.y) > 0.06) st.moveUntil = now + 90;
  st.x = m.x;
  st.y = m.y;
  if (m.nextAtk !== st.atk) {
    if (m.nextAtk > st.atk) st.atkUntil = now + 280;
    st.atk = m.nextAtk;
  }
  if (m.nextThink !== st.think) {
    if (m.nextThink > st.think && SHOOTERS.has(MONSTERS[m.id].behavior)) st.atkUntil = now + 320;
    st.think = m.nextThink;
  }
  if (now < m.stunUntil) return MON_FRAMES.hurt;
  if (m.windUntil > now) return MON_FRAMES.attack;
  if (now < st.atkUntil) return MON_FRAMES.attack + (st.atkUntil - now < 160 ? 1 : 0);
  const t = now + st.phase;
  if (now < st.moveUntil) return MON_FRAMES.move + (Math.floor(t / 110) % 4);
  return MON_FRAMES.idle + (Math.floor(t / 420) % 2);
}

/** 쓰러짐: 3프레임을 넘기며 사라진다 */
export function playMonsterDeath(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite): void {
  sprite.setFrame(MON_FRAMES.death);
  const o = { t: 0 };
  scene.tweens.add({
    targets: o,
    t: 1,
    duration: 420,
    onUpdate: () => {
      if (!sprite.active) return;
      // 처음 잠깐은 처치 효과의 하얀 번쩍임을 그대로 두고, 그다음 프레임을 넘긴다
      if (o.t > 0.18 && sprite.isTinted) sprite.clearTint();
      sprite.setFrame(MON_FRAMES.death + Math.min(2, Math.floor(o.t * 3)));
      sprite.setAlpha(o.t < 0.6 ? 1 : 1 - (o.t - 0.6) / 0.4);
    },
    onComplete: () => sprite.destroy(),
  });
}

/** 로비 미리보기·도감용: 가만히 프레임 하나를 캔버스로 */
export function monsterIdleCanvas(id: MonsterId): HTMLCanvasElement {
  return frame(id, { f: 0, step: -1, atk: 0, hurt: false }).toCanvas();
}
