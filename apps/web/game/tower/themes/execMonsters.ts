import type { ExMonsterId } from "@/lib/rpg/towerThemes/exec";
import { darken, Grid, lighten, type Color } from "../../sprites/pixel";

// 11/15 임원층 몬스터 그림 14종 (monsterArt가 시트 12프레임으로 만든다 — 기본 방향 오른쪽).
// 모두 다른 모양: 탁상 전화·만년필·퍼터·와인 잔·임원 의자·액자·인감·명함 뭉치·명함·분재·차 키·수행 임원·비서실장·대표이사.

type Pose = { f: number; step: number; atk: number; hurt: boolean };
type Paint = (g: Grid, s: number, m: Color, a: Color, p: Pose) => void;

const EYE = 0x141218;
const WHITE = 0xf2ead3;
const GOLD = 0xe8c050;
const GOLD_D = 0xa8822c;

const leg = (p: Pose) => (p.step < 0 ? 0 : p.step % 2 === 0 ? 1 : -1);
const lift = (p: Pose) => (p.step === 1 || p.step === 3 ? 1 : 0);

function eyes(g: Grid, x: number, y: number, gap: number, p: Pose, c: Color = EYE): void {
  for (const ex of [x, x + gap]) {
    if (p.hurt) g.hline(ex - 1, ex + 1, y, c);
    else {
      g.set(ex, y, c);
      if (p.atk) g.set(ex + (ex === x ? 1 : -1), y - 1, c);
    }
  }
}

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

/** 굵은 선 (두께 w) */
function thick(g: Grid, x0: number, y0: number, x1: number, y1: number, w: number, c: Color): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) g.rect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), w, w, c);
}

export const EX_PAINT: Record<ExMonsterId, Paint> = {
  // 비서실 전화: 까만 탁상 전화 + 금 버튼, 위에 수화기 (던지면 수화기가 없고 꼬인 줄만)
  ex_phone(g, s, m, a, p) {
    const f = lift(p);
    const ring = p.step < 0 && p.f ? 1 : 0;
    // 몸통 (위가 좁은 사다리꼴) + 금 다이얼 판
    g.rect(1, 9 - f, 12, 4, m);
    g.rect(2, 8 - f, 10, 1, m);
    g.rect(3, 7 - f, 8, 1, m);
    shade(g, m, 8 - f, 11 - f);
    g.rect(6, 9 - f, 6, 3, darken(a, 0.55));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.set(7 + i * 2, 9 + j * 2 - f, a);
    eyes(g, 2, 10 - f, 2, p, WHITE);
    g.hline(1, 12, 13 - f, darken(m, 0.4));
    if (p.atk === 2) {
      // 수화기는 날아갔다: 받침 갈고리 둘 + 꼬인 줄
      g.rect(2, 6 - f, 2, 1, 0x5a5a62);
      g.rect(10, 6 - f, 2, 1, 0x5a5a62);
      for (let k = 0; k < 5; k++) g.set(12 + (k % 2), 7 - k - f, 0x3a3a40);
    } else {
      // 수화기: 손잡이 + 아래로 볼록한 귀·입 부분 (울리면 들썩인다)
      const ry = 3 - f - ring - (p.atk ? 1 : 0);
      const hc = lighten(m, 0.12);
      g.rect(3, ry, 8, 2, hc);
      g.hline(3, 10, ry, lighten(m, 0.4));
      g.rect(0, ry + 1, 4, 3, hc);
      g.rect(10, ry + 1, 4, 3, hc);
      g.hline(0, 3, ry + 3, darken(m, 0.3));
      g.hline(10, 13, ry + 3, darken(m, 0.3));
      if (ring) {
        g.set(0, ry - 2, a);
        g.set(1, ry - 3, a);
        g.set(13, ry - 2, a);
        g.set(12, ry - 3, a);
      }
    }
  },
  // 금장 만년필: 대각선으로 선 검은 몸통 + 금띠 + 금 펜촉 (서명할 땐 더 눕는다)
  ex_pen(g, s, m, a, p) {
    const f = lift(p);
    const tilt = p.atk ? 2 : 0;
    const x0 = 2 + tilt;
    const y0 = 11;
    const x1 = 10;
    const y1 = 1 + tilt - f;
    thick(g, x0, y0 - f, x1, y1, 3, m);
    // 금띠·클립·뚜껑 끝
    g.rect(x0 + 4, y0 - 5 - f, 3, 1, a);
    g.rect(x1 - 1, y1 + 2, 3, 1, a);
    g.rect(x1 + 1, y1, 1, 4, a);
    g.set(x1, y1, lighten(m, 0.5));
    // 펜촉 (금 + 가운데 홈)
    g.rect(x0 - 2, y0 + 1 - f, 2, 2, a);
    g.set(x0 - 2, y0 + 2 - f, lighten(a, 0.4));
    g.set(x0 - 3, y0 + 2 - f + (p.atk ? 1 : 0), 0x1a1a3a);
    eyes(g, x0 + 3, y0 - 3 - f, 2, p, WHITE);
    if (p.atk === 2) g.set(0, 12, 0x2a3a8a);
  },
  // 골프 퍼터: 은빛 납작 헤드(얼굴) + 긴 샤프트 + 검은 그립, 옆에 골프공
  ex_putter(g, s, m, a, p) {
    const f = lift(p);
    const sw = p.atk === 1 ? -2 : p.atk === 2 ? 2 : 0;
    // 샤프트 (공격 때 휘두르며 기운다)
    thick(g, 10 - sw, 0 - f, 9, 11 - f, 1, 0xb8bcc4);
    g.rect(9 - sw, 0 - f, 3, 4, 0x1a1a1e);
    g.set(10 - sw, 1 - f, 0x3a3a40);
    // 헤드
    g.rect(2 + Math.max(0, sw), 11 - f, 11, 3, m);
    g.rect(2 + Math.max(0, sw), 11 - f, 11, 1, lighten(m, 0.3));
    g.rect(2 + Math.max(0, sw), 13 - f, 11, 1, darken(m, 0.3));
    g.hline(4 + Math.max(0, sw), 8 + Math.max(0, sw), 12 - f, a);
    eyes(g, 5 + Math.max(0, sw), 12 - f, 4, p);
    // 골프공
    if (p.atk !== 2) {
      g.rect(13, 13, 3, 3, WHITE);
      g.set(14, 14, 0xc8c8c8);
    }
    g.set(3, 15, darken(m, 0.4));
    g.set(11, 15, darken(m, 0.4));
  },
  // 와인 잔: 크리스털 볼 + 붉은 와인(출렁) + 가는 다리·받침
  ex_wine(g, s, m, a, p) {
    const f = lift(p);
    const cx = s / 2;
    g.ellipse(cx, 4 - f, 5, 4.5, m);
    g.rect(cx - 5, 1 - f, 11, 3, m);
    const slosh = p.step < 0 ? 0 : p.step % 2 ? 1 : -1;
    for (let y = 4; y <= 8; y++) for (let x = -4; x <= 4; x++) if (x * x / 20 + (y - 4) * (y - 4) / 20 <= 1 && y >= 4 + (x * slosh > 0 ? 1 : 0)) g.set(cx + x, y - f, a);
    g.hline(cx - 4, cx + 4, 4 - f + (slosh > 0 ? 1 : 0), lighten(a, 0.35));
    g.set(cx - 3, 2 - f, 0xffffff);
    g.set(cx - 3, 3 - f, 0xffffff);
    eyes(g, cx - 2, 3 - f, 3, p);
    g.vline(cx, 9 - f, 11, darken(m, 0.15));
    g.hline(cx - 3 + leg(p), cx + 3 + leg(p), 12, darken(m, 0.1));
    if (p.atk === 2) {
      // 금 간 유리
      g.set(cx + 2, 1 - f, 0x8a9aa8);
      g.set(cx + 3, 2 - f, 0x8a9aa8);
      g.set(cx + 2, 3 - f, 0x8a9aa8);
    }
  },
  // 고급 의자: 단추 박힌 높은 가죽 등받이 + 금 팔걸이 + 별 다리 바퀴
  ex_chair(g, s, m, a, p) {
    const f = p.f;
    const back = p.atk === 1 ? -1 : 0;
    g.rect(2 + back, 0 - f, 8, 11, m);
    g.rect(3 + back, 0 - f, 6, 1, lighten(m, 0.3));
    for (let y = 2; y < 10; y += 3) for (let x = 3 + ((y / 3) % 2 ? 1 : 0); x < 9; x += 2) g.set(x + back, y - f, a);
    g.rect(2, 10 - f, 13, 3, lighten(m, 0.12));
    g.rect(10, 7 - f, 5, 1, a);
    g.vline(14, 7 - f, 10 - f, darken(a, 0.2));
    eyes(g, 4 + back, 5 - f, 3, p, WHITE);
    if (p.atk) g.hline(3 + back, 6 + back, 3 - f, EYE);
    // 가스 실린더·별 다리·바퀴 (구르면 바퀴가 돈다)
    g.rect(8, 13, 2, 2, 0x3a3a40);
    g.hline(2, 15, 15, 0x2a2a30);
    const w = Math.max(0, p.step) % 2;
    for (const x of [2, 8, 15]) g.set(x + (w ? 1 : 0), 16, 0x1a1a1e);
    g.set(2, 17 - 1, 0x1a1a1e);
  },
  // 액자 속 초상화: 금테 액자 + 근엄한 대머리 회장님 (공격 때 눈이 빨갛다)
  ex_portrait(g, s, m, a, p) {
    const f = p.f + lift(p) * 0.5;
    const y0 = 2 - f;
    g.rect(0, y0, 17, 14, m);
    g.rect(1, y0 + 1, 15, 12, 0xd8b050);
    g.rect(2, y0 + 2, 13, 10, 0x2a3a2a);
    // 어깨·양복
    g.rect(3, y0 + 9, 11, 3, 0x1a1a22);
    g.set(8, y0 + 9, WHITE);
    g.set(8, y0 + 10, a);
    // 얼굴
    g.ellipse(8.5, y0 + 6, 3.5, 3.6, 0xd8b090);
    g.hline(6, 11, y0 + 3, 0xe8c8a8);
    g.set(5, y0 + 5, 0xb8b8b8);
    g.set(12, y0 + 5, 0xb8b8b8);
    const ec = p.atk ? 0xff3a2a : EYE;
    if (p.hurt) {
      g.hline(6, 7, y0 + 6, EYE);
      g.hline(10, 11, y0 + 6, EYE);
    } else {
      g.set(7, y0 + 6, ec);
      g.set(10, y0 + 6, ec);
      if (p.atk) {
        g.set(6, y0 + 5, EYE);
        g.set(11, y0 + 5, EYE);
      }
    }
    g.hline(7, 10, y0 + 8, 0xe8e8e8);
    // 걸이 줄
    g.set(8, y0 - 1, GOLD_D);
    g.set(7, y0 - 2 < 0 ? 0 : y0 - 2, GOLD_D);
    g.set(9, y0 - 2 < 0 ? 0 : y0 - 2, GOLD_D);
    g.set(1, y0 + 1, 0xfff0b0);
  },
  // 인감 도장: 상아 손잡이 + 붉은 몸통 + 아래 도장면 (뛰어오를 땐 몸을 웅크린다)
  ex_seal(g, s, m, a, p) {
    const f = lift(p);
    const sq = p.atk === 1 ? 2 : 0;
    const top = 1 + sq - f;
    g.ellipse(s / 2, top + 2, 3, 2.5, a);
    g.rect(s / 2 - 2, top + 3, 5, 2, darken(a, 0.15));
    g.rect(3, top + 5, 9, 9 - sq, m);
    shade(g, m, top + 6, top + 11 - sq);
    g.hline(3, 11, top + 7, GOLD);
    eyes(g, 5, top + 9, 4, p, WHITE);
    g.rect(2, 13 + (p.atk === 2 ? 1 : 0), 11, 2, darken(m, 0.35));
    g.set(5, 14, 0xff8a7a);
    g.set(8, 14, 0xff8a7a);
  },
  // 명함 뭉치: 비뚤게 쌓인 명함 + 파란 고무줄, 맨 위 장은 들썩인다
  ex_cards(g, s, m, a, p) {
    const f = lift(p);
    for (let k = 0; k < 5; k++) {
      const off = (k % 2 ? 1 : -1) * (k === 4 && p.atk ? 2 : 0);
      g.rect(2 + off + (k % 3) - 1, 9 - k * 1.6 - f, 10, 2, k % 2 ? m : darken(m, 0.06));
    }
    g.rect(2, 3 - f + (p.atk ? -1 : 0), 10, 3, m);
    g.hline(3, 7, 4 - f, 0x2a2a2a);
    g.set(10, 4 - f, GOLD);
    g.vline(7, 3 - f, 11 - f, a);
    g.vline(8, 3 - f, 11 - f, darken(a, 0.25));
    eyes(g, 3, 8 - f, 2, p);
    g.set(3 + leg(p), 12, 0x5a5a60);
    g.set(10 - leg(p), 12, 0x5a5a60);
  },
  // 명함 한 장: 비스듬히 나는 크림색 카드 + 금 줄
  ex_card(g, s, m, a, p) {
    const t = Math.max(0, p.step) % 2;
    g.rect(1, 2 + t, 7, 4, m);
    g.hline(2, 6, 3 + t, a);
    g.hline(2, 4, 5 + t, 0x8a8a8a);
    if (!p.hurt) g.set(6, 5 + t, EYE);
    g.set(0, 3 + t, lighten(m, 0.3));
    if (p.step >= 0) g.set(0, 6, 0xffffff);
  },
  // 분재: 납작한 갈색 화분(얼굴) + 굽은 줄기 + 구름 모양 잎 (공격 땐 가시)
  ex_bonsai(g, s, m, a, p) {
    const f = p.f;
    g.rect(1, 11, 13, 3, a);
    g.rect(2, 14, 11, 1, darken(a, 0.35));
    g.hline(1, 13, 11, lighten(a, 0.25));
    eyes(g, 5, 12, 4, p, WHITE);
    // 줄기
    thick(g, 7, 10, 5, 6 - f, 1, 0x5a3a20);
    thick(g, 5, 6 - f, 9, 3 - f, 1, 0x5a3a20);
    g.set(9, 7 - f, 0x5a3a20);
    // 잎 구름
    g.ellipse(4, 5 - f, 3.5, 1.8, m);
    g.ellipse(10, 2.5 - f, 3.5, 1.8, m);
    g.ellipse(10, 7 - f, 2.5, 1.5, m);
    g.hline(2, 5, 4 - f, lighten(m, 0.3));
    g.hline(8, 11, 1 - f, lighten(m, 0.3));
    if (p.atk) for (const [x, y] of [[0, 4], [14, 2], [13, 7], [6, 0]] as const) g.set(x, y - f, 0xd8d0a0);
  },
  // 임원 차 키: 검은 리모컨(얼굴) + 빨간 버튼 + 은빛 열쇠 날 + 고리
  ex_car_key(g, s, m, a, p) {
    const f = lift(p);
    g.rect(1, 3 - f, 7, 7, m);
    g.rect(2, 2 - f, 5, 1, m);
    g.rect(2, 10 - f, 5, 1, m);
    g.hline(2, 6, 3 - f, lighten(m, 0.3));
    g.rect(3, 4 - f, 3, 2, p.atk ? 0xff6a5a : a);
    eyes(g, 3, 7 - f, 2, p, WHITE);
    // 열쇠 날
    g.rect(8, 5 - f, 3, 2, 0xc8ccd4);
    g.set(10, 7 - f, 0xc8ccd4);
    g.set(9, 4 - f, 0xe8ecf0);
    // 고리
    g.set(0, 1 - f, 0xc8ccd4);
    g.set(1, 0, 0xc8ccd4);
    g.set(leg(p) + 3, 10, 0x3a3a40);
  },
  // 수행 임원: 짙은 정장·안경·회색 머리, 파일을 끼고 고개를 끄덕인다
  ex_entourage(g, s, m, a, p) {
    const nod = p.step >= 0 && p.step % 2 ? 1 : 0;
    const cx = 7;
    g.ellipse(cx, 3 + nod, 3, 3, 0xe0b898);
    g.rect(cx - 3, 0 + nod, 6, 2, 0x8a8a90);
    g.hline(cx - 2, cx + 2, 3 + nod, 0x2a2a30);
    if (!p.hurt) {
      g.set(cx - 1, 3 + nod, 0x9ad0ff);
      g.set(cx + 2, 3 + nod, 0x9ad0ff);
    }
    g.rect(cx - 4, 6, 8, 6, m);
    shade(g, m, 7, 10);
    g.vline(cx, 6, 9, a);
    g.set(cx, 7, 0xa83c3c);
    g.set(cx, 8, 0xa83c3c);
    // 파일
    g.rect(cx + 3, 7 + (p.atk ? -2 : 0), 3, 4, 0xe8d8a0);
    g.rect(cx - 3 + leg(p), 12, 2, 2, darken(m, 0.4));
    g.rect(cx + 1 - leg(p), 12, 2, 2, darken(m, 0.4));
  },
  // 비서실장: 틀어 올린 머리·헤드셋·보랏빛 정장, 금 일정판을 든다
  ex_secretary(g, s, m, a, p) {
    const f = p.f;
    const cx = 9;
    g.ellipse(cx, 5 - f, 3.6, 3.8, 0xf0c8a8);
    g.rect(cx - 4, 1 - f, 8, 3, 0x2a1a14);
    g.ellipse(cx - 3, 1 - f, 2.5, 2, 0x2a1a14);
    g.rect(cx - 4, 2 - f, 1, 5, 0x2a1a14);
    // 헤드셋
    g.set(cx + 4, 4 - f, 0x3a3a40);
    g.set(cx + 4, 5 - f, 0x3a3a40);
    g.hline(cx + 2, cx + 4, 7 - f, 0x3a3a40);
    eyes(g, cx, 5 - f, 2, p);
    g.set(cx + 1, 7 - f, 0xc85a5a);
    // 정장
    g.rect(cx - 5, 9 - f, 10, 7, m);
    shade(g, m, 10 - f, 14 - f);
    g.vline(cx, 9 - f, 12 - f, WHITE);
    g.set(cx - 1, 9 - f, WHITE);
    g.rect(cx - 4, 16 - f, 8, 2, darken(m, 0.15));
    g.rect(cx - 3 + leg(p), 18, 2, 2, 0x1a1a22);
    g.rect(cx + 1 - leg(p), 18, 2, 2, 0x1a1a22);
    // 금 일정판 (가리킬 땐 앞으로)
    const ax = p.atk ? cx + 6 : cx + 3;
    const ay = p.atk ? 9 - f : 11 - f;
    g.rect(ax, ay, 6, 7, a);
    g.rect(ax + 1, ay + 1, 4, 5, WHITE);
    for (let k = 0; k < 3; k++) g.hline(ax + 1, ax + 3 + (k % 2), ay + 2 + k * 1.5, 0x3a3a5a);
    g.set(ax + 4, ay + 2, 0xd04040);
  },
  // 대표이사: 은발·안경·검은 쓰리피스 정장·금 넥타이·커프스, 오른손에 커다란 붉은 결재 도장
  ex_ceo(g, s, m, a, p) {
    const f = p.f;
    const cx = 19;
    const ux = p.atk === 2 ? 1 : 0;
    // 다리·구두
    g.rect(cx - 7 + leg(p), 34, 5, 6, 0x14161e);
    g.rect(cx + 2 - leg(p), 34, 5, 6, 0x14161e);
    g.rect(cx - 8 + leg(p), 39, 7, 2, 0x050505);
    g.rect(cx + 2 - leg(p), 39, 7, 2, 0x050505);
    g.hline(cx - 7 + leg(p), cx - 3 + leg(p), 39, 0x3a3a40);
    // 몸통 (넓은 어깨)
    g.rect(cx - 11, 15 - f, 22, 20, m);
    g.rect(cx - 12, 16 - f, 24, 6, m);
    shade(g, m, 17 - f, 31);
    // 셔츠·조끼·넥타이
    for (let y = 0; y < 9; y++) g.hline(cx - Math.max(0, 4 - y / 2), cx + Math.max(0, 4 - y / 2), 15 - f + y, y < 7 ? WHITE : m);
    g.rect(cx - 4, 21 - f, 8, 12, 0x2a2e40);
    g.rect(cx - 1, 15 - f, 3, 2, a);
    g.rect(cx - 1, 17 - f, 3, 10, a);
    g.set(cx, 27 - f, darken(a, 0.3));
    for (let y = 23; y < 32; y += 3) g.set(cx + 3, y - f, GOLD_D);
    // 옷깃 금 배지·주머니 행커치프
    g.rect(cx - 9, 19 - f, 2, 2, GOLD);
    g.rect(cx + 6, 20 - f, 3, 2, 0xf2f2f2);
    g.set(cx + 7, 19 - f, 0xf2f2f2);
    // 머리: 은발 올백·안경·콧수염
    g.ellipse(cx, 8 - f, 6, 6.5, 0xe0b090);
    g.rect(cx - 6, 1 - f, 12, 4, 0xc8c8d0);
    g.rect(cx - 7, 3 - f, 2, 5, 0xc8c8d0);
    g.rect(cx + 5, 3 - f, 2, 5, 0xc8c8d0);
    g.hline(cx - 5, cx + 5, 2 - f, 0xe8e8f0);
    // 안경 (금테)
    for (const ex of [cx - 4, cx + 1]) {
      g.rect(ex, 7 - f, 4, 3, GOLD);
      g.rect(ex + 1, 8 - f, 2, 1, p.atk ? 0xff5a4a : 0x2a2a30);
    }
    g.hline(cx, cx + 1, 8 - f, GOLD);
    if (p.hurt) {
      g.hline(cx - 4, cx - 1, 8 - f, EYE);
      g.hline(cx + 1, cx + 4, 8 - f, EYE);
    }
    g.hline(cx - 3, cx + 3, 11 - f, 0xc8c8d0);
    g.hline(cx - 1, cx + 1, 12 - f, p.atk ? 0x6a2020 : 0xb88a70);
    // 왼팔 (서류철)
    g.rect(cx - 15, 17 - f, 4, 12, m);
    g.rect(cx - 15, 29 - f, 4, 2, 0xe0b090);
    g.rect(cx - 17, 24 - f, 5, 8, 0x3a2414);
    g.rect(cx - 16, 25 - f, 3, 6, 0xf2ead3);
    // 오른팔 + 커다란 결재 도장 (공격 준비 때 높이 들고, 내지를 때 내려찍는다)
    const sy = p.atk === 1 ? 2 : p.atk === 2 ? 22 : 15 - f;
    g.rect(cx + 11, Math.min(sy + 6, 17 - f), 4, Math.abs(17 - f - (sy + 6)) + 6, m);
    g.set(cx + 13, 24 - f, GOLD);
    g.rect(cx + 12 + ux, sy, 8, 4, 0xe8d0a0);
    g.rect(cx + 14 + ux, sy - 2, 4, 2, darken(0xe8d0a0, 0.15));
    g.rect(cx + 11 + ux, sy + 4, 10, 7, 0xa83030);
    g.hline(cx + 11 + ux, cx + 20 + ux, sy + 6, GOLD);
    g.rect(cx + 11 + ux, sy + 11, 10, 2, 0x6a1a1a);
    g.set(cx + 13 + ux, sy + 12, 0xff8a7a);
    g.set(cx + 16 + ux, sy + 12, 0xff8a7a);
    g.set(cx + 18 + ux, sy + 12, 0xff8a7a);
  },
};
