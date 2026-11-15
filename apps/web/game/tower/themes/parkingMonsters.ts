import type { PkMonsterId } from "@/lib/rpg/towerThemes/parking";
import { darken, Grid, lighten, type Color } from "../../sprites/pixel";

// 11/15 지하 주차장 몬스터 그림 (monsterArt.ts P 표에 끼워 넣는다 — 같은 틀: 자세를 받아 한 프레임을 칠한다, 테두리는 틀이 두른다).
// 종류마다 몸 모양·크기·색이 모두 다르다 (색만 바꾼 것 없음). 기본 방향은 오른쪽.

type Pose = { f: number; step: number; atk: number; hurt: boolean };
type Paint = (g: Grid, s: number, m: Color, a: Color, p: Pose) => void;

const EYE = 0x141218;
const WHITE = 0xf2f2ee;
const TIRE = 0x16161a;
const leg = (p: Pose) => (p.step < 0 ? 0 : p.step % 2 === 0 ? 1 : -1);
const lift = (p: Pose) => (p.step === 1 || p.step === 3 ? 1 : 0);

/** 눈 두 개 (맞으면 질끈, 공격 준비면 치켜뜸) */
function eyes(g: Grid, x: number, y: number, gap: number, p: Pose, c: Color = EYE): void {
  for (const ex of [x, x + gap]) {
    if (p.hurt) g.hline(ex - 1, ex + 1, y, c);
    else {
      g.set(ex, y, c);
      if (p.atk) g.set(ex + (ex === x ? 1 : -1), y - 1, c);
    }
  }
}

/** 위는 밝게, 아래는 어둡게 (색이 c인 픽셀만) */
function shade(g: Grid, c: Color, top: number, bottom: number): void {
  const hi = Grid.rgba(c);
  const lt = lighten(c, 0.22);
  const dk = darken(c, 0.25);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (g.get(x, y) !== hi) continue;
      if (y <= top) g.set(x, y, lt);
      else if (y >= bottom) g.set(x, y, dk);
    }
}

/** 바퀴 (옆에서 본): 검은 타이어 + 은색 휠, step으로 휠 무늬가 돈다 */
function wheel(g: Grid, cx: number, cy: number, r: number, step: number): void {
  g.ellipse(cx, cy, r, r, TIRE);
  g.ellipse(cx, cy, Math.max(1, r * 0.5), Math.max(1, r * 0.5), 0x9aa0a8);
  const a = (step < 0 ? 0 : step) * 0.8;
  g.set(Math.round(cx - 0.5 + Math.cos(a) * r * 0.45), Math.round(cy - 0.5 + Math.sin(a) * r * 0.45), 0x4a4e56);
}

export const PK_PAINT: Record<PkMonsterId, Paint> = {
  // 주차 딱지: 노란 종이 한 장 (모서리가 펄럭 접힌다), 빨간 도장 줄, 화난 눈
  pk_ticket(g, s, m, a, p) {
    const flap = p.step < 0 ? p.f : p.step % 2;
    const y0 = 1 + lift(p);
    g.rect(1, y0, s - 3, s - 3, m);
    shade(g, m, y0, s - 3);
    // 접힌 모서리
    if (flap) {
      g.rect(s - 4, y0, 2, 2, darken(m, 0.35));
      g.set(s - 3, y0, 0);
    } else g.rect(s - 3, y0 + s - 5, 1, 2, darken(m, 0.3));
    g.hline(2, s - 4, y0 + 2, a);
    g.hline(2, s - 6, y0 + s - 5, darken(m, 0.4));
    // 도장 (빨간 동그라미)
    g.set(2, y0 + s - 6, a);
    g.set(3, y0 + s - 7, a);
    eyes(g, 3, y0 + 4, 3, p);
    if (p.atk === 2) g.hline(3, 6, y0 + 6, EYE);
  },

  // 굴러다니는 타이어: 옆에서 본 큰 바퀴 (홈 패인 고무 + 은색 휠), 휠에 눈. 걸으면 무늬가 돈다
  pk_tire(g, s, m, a, p) {
    const cx = s / 2;
    const cy = s / 2 + (p.atk === 1 ? 1 : 0) - lift(p) * 0.5;
    const r = s / 2 - 0.5;
    g.ellipse(cx, cy, r, r * (p.atk === 1 ? 0.9 : 1), m);
    // 홈 (바깥 둘레를 따라 짧은 금)
    const turn = (p.step < 0 ? p.f * 0.2 : p.step * 0.4) + (p.atk === 2 ? 0.5 : 0);
    for (let k = 0; k < 12; k++) {
      const ang = turn + (k / 12) * Math.PI * 2;
      g.set(Math.round(cx - 0.5 + Math.cos(ang) * (r - 0.8)), Math.round(cy - 0.5 + Math.sin(ang) * (r - 0.8)), lighten(m, 0.18));
    }
    g.ellipse(cx, cy, r - 2.5, r - 2.5, darken(m, 0.25));
    g.ellipse(cx, cy, r - 3.5, r - 3.5, a);
    g.ellipse(cx, cy, 1.6, 1.6, darken(a, 0.3));
    for (let k = 0; k < 5; k++) {
      const ang = turn + (k / 5) * Math.PI * 2;
      g.set(Math.round(cx - 0.5 + Math.cos(ang) * 3.2), Math.round(cy - 0.5 + Math.sin(ang) * 3.2), lighten(a, 0.3));
    }
    eyes(g, Math.round(cx) - 2, Math.round(cy) - 2, 4, p, p.atk ? 0xd03030 : EYE);
  },

  // 경보 울리는 차: 작은 빨간 해치백 옆모습, 앞뒤 비상등이 번갈아 깜빡, 앞유리에 눈
  pk_alarm_car(g, s, m, a, p) {
    const bump = p.atk ? -1 : p.f ? 0 : 0;
    const y = 7 + bump;
    g.rect(1, y + 3, s - 2, 6, m);
    g.rect(4, y, s - 9, 4, m);
    g.rect(5, y + 1, 4, 2, 0x2a3a4a);
    g.rect(10, y + 1, 4, 2, 0x5a7a9a);
    shade(g, m, y + 3, y + 8);
    g.hline(2, s - 3, y + 6, darken(m, 0.35));
    // 비상등 (앞·뒤) — 숨 쉴 때마다 번갈아
    const on = p.f === 1 || p.atk > 0;
    g.rect(0, y + 4, 2, 2, on ? a : darken(a, 0.5));
    g.rect(s - 2, y + 4, 2, 2, on ? darken(a, 0.5) : a);
    if (p.atk) g.rect(s - 2, y + 4, 2, 2, 0xfff4c8);
    // 눈 (앞유리)
    eyes(g, 11, y + 2, 2, p, p.atk ? 0xff3030 : EYE);
    wheel(g, 5, y + 9.5, 2.5, p.step);
    wheel(g, s - 6, y + 9.5, 2.5, p.step);
    // 소리 고리
    if (p.atk === 2) {
      g.vline(s - 1, y - 2, y, a);
      g.set(s - 2, y - 3, a);
    }
  },

  // 카트 무리: 철망 바구니 + 빨간 손잡이 + 작은 바퀴 둘, 바구니 앞에 눈
  pk_cart(g, s, m, a, p) {
    const y0 = 2 + lift(p);
    for (let y = y0; y < y0 + 5; y++) g.hline(1 + (y - y0 > 3 ? 1 : 0), s - 3, y, m);
    for (let x = 2; x < s - 2; x += 2) g.vline(x, y0, y0 + 4, darken(m, 0.3));
    g.hline(1, s - 3, y0, lighten(m, 0.3));
    // 손잡이 (뒤 = 왼쪽)
    g.vline(0, y0 - 2, y0 + 1, darken(m, 0.2));
    g.rect(0, y0 - 2, 2, 1, a);
    // 다리·바퀴
    g.vline(3, y0 + 5, y0 + 6, darken(m, 0.4));
    g.vline(s - 4, y0 + 5, y0 + 6, darken(m, 0.4));
    g.set(3 + leg(p), y0 + 7, TIRE);
    g.set(s - 4 - leg(p), y0 + 7, TIRE);
    eyes(g, s - 6, y0 + 2, 2, p);
  },

  // 기둥 뒤 그림자: 아래가 너덜너덜한 보랏빛 검은 덩어리, 노랗게 빛나는 눈, 덮칠 때 긴 팔
  pk_shadow(g, s, m, a, p) {
    const sway = p.step < 0 ? p.f : leg(p);
    g.ellipse(s / 2 + sway * 0.5, 6, 5, 5, m);
    g.rect(3, 6, s - 6, 6, m);
    for (let x = 3; x < s - 3; x++) {
      const len = 2 + ((x * 7 + (p.step < 0 ? p.f : p.step)) % 3);
      g.vline(x, 11, 11 + len, x % 2 ? m : darken(m, 0.2));
    }
    g.ellipse(s / 2, 7, 3, 3, lighten(m, 0.12));
    // 눈 (빛난다)
    const ey = p.atk ? 4 : 5;
    for (const ex of [6, 9]) {
      if (p.hurt) g.hline(ex - 1, ex, ey, a);
      else {
        g.rect(ex, ey, 1 + (p.atk ? 1 : 0), 1, a);
        g.set(ex, ey + 1, darken(a, 0.4));
      }
    }
    if (p.atk) {
      const reach = p.atk === 2 ? 4 : 1;
      g.hline(s - 4, s - 4 + reach, 8, m);
      g.hline(s - 4, s - 5 + reach, 10, m);
      g.set(s - 4 + reach, 7, m);
    }
  },

  // 비상구 표시등: 초록 상자 (흰 달리는 사람 + 문), 상자 아래로 짧은 다리가 달린다
  pk_exit_sign(g, s, m, a, p) {
    const y0 = 1 + lift(p);
    g.rect(0, y0, s, 8, darken(m, 0.35));
    g.rect(1, y0 + 1, s - 2, 6, m);
    // 문
    g.rect(s - 5, y0 + 2, 3, 4, a);
    g.set(s - 4, y0 + 4, m);
    // 달리는 사람 (자세마다 팔다리가 바뀐다)
    const run = p.step < 0 ? p.f : p.step % 2;
    g.set(5, y0 + 2, a);
    g.vline(5, y0 + 3, y0 + 4, a);
    g.set(run ? 4 : 6, y0 + 3, a);
    g.set(run ? 6 : 4, y0 + 3, a);
    g.set(run ? 4 : 6, y0 + 5, a);
    g.set(run ? 6 : 4, y0 + 6, a);
    // 빛나는 테두리
    g.hline(1, s - 2, y0 + 1, lighten(m, 0.3));
    // 다리
    const l = leg(p);
    g.vline(4 + l, y0 + 8, y0 + 10, darken(m, 0.5));
    g.vline(s - 5 - l, y0 + 8, y0 + 10, darken(m, 0.5));
    eyes(g, 3, y0 - 1 + (p.atk ? 0 : 99), 6, p, 0xffffff);
    if (p.atk) g.hline(2, s - 3, y0, 0xc8ffc8);
  },

  // 배기가스 구름: 회색 연기 덩이 여럿 (안쪽이 짙다), 빨간 눈, 위로 연기가 피어오른다
  pk_exhaust(g, s, m, a, p) {
    const puff = p.step < 0 ? p.f : p.step % 2;
    const lt = lighten(m, 0.18);
    const pts: [number, number, number][] = [
      [5, 10, 4],
      [10, 8, 5],
      [13, 11, 3.5],
      [8, 12, 4],
      [7, 5 - puff, 3],
      [12, 4 + puff, 2.5],
    ];
    for (const [x, y, r] of pts) g.ellipse(x, y, r, r * 0.9, m);
    for (const [x, y, r] of pts) g.ellipse(x - 0.8, y - 0.8, r * 0.5, r * 0.4, lt);
    g.ellipse(9, 10, 3, 2.5, a);
    for (const ex of [7, 11]) {
      if (p.hurt) g.hline(ex - 1, ex, 9, 0xe03030);
      else g.rect(ex, 9, 1, p.atk ? 2 : 1, 0xff4030);
    }
    if (p.atk === 2) g.rect(14, 9, 2, 2, lt);
  },

  // 주차 요원: 남색 모자·옷, 주황 안전 조끼(반사띠), 손에 빛나는 경광봉
  pk_attendant(g, s, m, a, p) {
    const y = 1 + lift(p);
    // 다리
    const l = leg(p);
    g.rect(5 + l, y + 11, 2, 3, darken(m, 0.3));
    g.rect(9 - l, y + 11, 2, 3, darken(m, 0.3));
    // 몸 + 조끼
    g.rect(4, y + 5, 8, 7, m);
    g.rect(5, y + 5, 6, 6, a);
    g.hline(5, 10, y + 8, 0xe8f0f0);
    g.vline(7, y + 5, y + 10, m);
    // 머리 + 모자
    g.rect(5, y + 1, 6, 4, 0xf0c8a0);
    g.rect(4, y, 8, 2, m);
    g.hline(9, 12, y + 1, darken(m, 0.3));
    eyes(g, 8, y + 3, 2, p);
    // 팔 + 경광봉 (공격이면 치켜든다)
    const up = p.atk === 1 ? -4 : p.atk === 2 ? -1 : 0;
    g.rect(12, y + 6, 1, 3, m);
    g.vline(13, y + 2 + up, y + 7 + up, a);
    g.vline(14, y + 2 + up, y + 7 + up, lighten(a, 0.3));
    g.set(13, y + 1 + up, 0xfff0c0);
    g.rect(3, y + 6, 1, 3, m);
  },

  // 차단기: 흰 기둥 상자 (작은 화면) + 빨강·흰 줄무늬 봉 (공격 준비면 번쩍 들고, 내지르면 휘둘러 내린다)
  pk_barrier(g, s, m, a, p) {
    const y = 4;
    g.rect(1, y + 2, 5, s - y - 2, m);
    g.hline(1, 5, y + 2, lighten(m, 0.2));
    g.rect(2, y + 4, 3, 2, 0x1a1c20);
    g.set(3, y + 5, p.atk ? 0xff3030 : 0x3aff6a);
    g.rect(1, s - 2, 5, 2, darken(m, 0.4));
    // 봉
    const ang = p.atk === 1 ? -1.1 : p.atk === 2 ? 0.35 : p.f ? -0.05 : 0;
    for (let k = 0; k < s - 5; k++) {
      const x = Math.round(5 + Math.cos(ang) * k);
      const yy = Math.round(y + 3 + Math.sin(ang) * k);
      const col = Math.floor(k / 3) % 2 ? a : WHITE;
      g.set(x, yy, col);
      g.set(x, yy + 1, darken(col, 0.2));
    }
    eyes(g, 2, y + 8, 2, p);
  },

  // 블랙박스: 검은 작은 상자 + 큰 파란 렌즈 (앞), 위에 흡착판, 빨간 녹화 불
  pk_dashcam(g, s, m, a, p) {
    const y0 = 3 + lift(p);
    g.rect(1, y0, s - 3, 6, m);
    g.hline(1, s - 4, y0, lighten(m, 0.25));
    // 흡착판·거치대
    g.rect(4, y0 - 2, 3, 2, darken(m, 0.2));
    g.hline(3, 7, y0 - 3, 0x5a5e66);
    // 렌즈
    g.ellipse(s - 3.5, y0 + 3, 2.6, 2.6, 0x0a0c10);
    g.ellipse(s - 3.5, y0 + 3, 1.6, 1.6, a);
    g.set(s - 4, y0 + 2, 0xe8f4ff);
    // 녹화 불 (숨 쉴 때마다 깜빡, 공격 때 늘 켜짐)
    if (p.f || p.atk) g.rect(2, y0 + 1, 2, 2, 0xff2a2a);
    // 다리
    g.set(3 + leg(p), y0 + 6, darken(m, 0.1));
    g.set(s - 6 - leg(p), y0 + 6, darken(m, 0.1));
    eyes(g, 4, y0 + 4, 2, p, 0xa8b0bc);
  },

  // 이중 주차 (정예): 큰 파란 세단 옆모습, 앞에서 헤드라이트가 번쩍, 앞유리에 성난 눈썹
  pk_double_park(g, s, m, a, p) {
    const y = 9 - (p.atk === 1 ? 1 : 0);
    g.rect(1, y + 4, s - 2, 8, m);
    g.rect(5, y, s - 12, 5, m);
    g.rect(6, y + 1, 5, 3, 0x2a3a4a);
    g.rect(12, y + 1, 5, 3, 0x4a6a8a);
    g.set(13, y + 1, 0xa8c8e8);
    shade(g, m, y + 4, y + 10);
    g.hline(2, s - 3, y + 8, darken(m, 0.35));
    g.vline(12, y + 5, y + 9, darken(m, 0.3));
    // 범퍼·전조등·미등
    g.rect(s - 2, y + 5, 2, 3, a);
    if (p.atk) {
      g.rect(s - 1, y + 4, 1, 5, 0xffffff);
    }
    g.rect(0, y + 5, 2, 2, 0xd82a2a);
    // 눈썹 (앞유리)
    eyes(g, 14, y + 2, 2, p, p.atk ? 0xff3a3a : EYE);
    g.hline(13, 16, y + 1 - (p.atk ? 1 : 0), EYE);
    wheel(g, 6, y + 12, 3.2, p.step);
    wheel(g, s - 7, y + 12, 3.2, p.step);
  },

  // 견인차 (우두머리): 노란 견인차 옆모습 — 오른쪽 운전석(경광등·성난 앞유리), 왼쪽 짐칸과 기중기 팔·늘어진 갈고리, 큰 바퀴 셋
  pk_tow_truck(g, s, m, a, p) {
    const y = 14 + (p.atk === 1 ? 1 : 0) - (p.step < 0 ? p.f * 0.5 : 0);
    const dk = darken(m, 0.3);
    // 짐칸 (왼쪽)
    g.rect(2, y + 10, 26, 7, m);
    g.hline(2, 27, y + 10, lighten(m, 0.25));
    for (let x = 4; x < 27; x += 5) g.vline(x, y + 11, y + 15, dk);
    // 기중기 팔 (공격이면 갈고리를 앞으로 휘두른다)
    const swing = p.atk === 2 ? 6 : p.atk === 1 ? -3 : 0;
    for (let k = 0; k < 16; k++) {
      g.set(6 + k, y + 9 - Math.floor(k * 0.7), 0x5a5e66);
      g.set(6 + k, y + 10 - Math.floor(k * 0.7), 0x3a3e46);
    }
    // 줄 + 갈고리 (왼쪽 끝에 늘어진다)
    const hx = 4 - swing;
    g.vline(6, y + 2, y + 6, 0x8a8e96);
    g.set(hx + 2, y + 6, 0x8a8e96);
    g.rect(hx + 1, y + 7, 3, 1, a);
    g.set(hx + 1, y + 8, a);
    g.set(hx + 3, y + 8, a);
    // 운전석 (오른쪽)
    g.rect(28, y + 2, 14, 15, m);
    g.rect(30, y + 4, 9, 6, 0x2a3a4a);
    g.set(31, y + 4, 0xa8c8e8);
    shade(g, m, y + 3, y + 14);
    g.hline(28, 41, y + 11, dk);
    g.rect(41, y + 12, 2, 3, 0xfff4c8);
    g.rect(28, y + 15, 15, 2, 0x5a5e66);
    // 경광등 (주황, 숨 쉴 때마다 밝기가 바뀐다)
    g.rect(32, y, 6, 2, p.f || p.atk ? a : darken(a, 0.35));
    g.set(34, y - 1, lighten(a, 0.4));
    // 눈 (앞유리) + 성난 눈썹
    eyes(g, 35, y + 7, 2, p, p.atk ? 0xff3a3a : EYE);
    g.hline(34, 38, y + 5, EYE);
    // 바퀴 셋
    wheel(g, 8, y + 18, 4, p.step);
    wheel(g, 19, y + 18, 4, p.step);
    wheel(g, 36, y + 18, 4, p.step);
    // 그릴
    for (let yy = y + 12; yy < y + 15; yy++) g.set(42, yy, 0x3a3e46);
  },
};
