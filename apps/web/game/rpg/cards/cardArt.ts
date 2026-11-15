import { darken, Grid, lighten, type Color } from "../../sprites/pixel";
import { CARDS, type CardId, type CardRarity } from "@/lib/rpg/cards";

// 11/15 능력 카드 그림 (16×16 픽셀아트, 코드로 그린다). 회사 소재로 새로 그렸다.
// 카드 고르기 창은 24×24 그림 칸(희귀도 배경 + 그림)을, HUD는 16×16 그림만 쓴다.

const OUT = 0x16151a;
const PAPER = 0xf2ead3;
const INK = 0x3a3440;

type Painter = (g: Grid, m: Color, a: Color) => void;

/** 서류 한 장 (줄 몇 개) */
function paper(g: Grid, x: number, y: number, w: number, h: number, line = 0xb8ad94): void {
  g.rect(x, y, w, h, PAPER);
  for (let j = y + 2; j < y + h - 1; j += 2) g.hline(x + 1, x + w - 2, j, line);
}

const P: Record<CardId, Painter> = {
  // 참조 추가: 봉투 두 장 + 더하기
  cc(g, m, a) {
    g.rect(1, 6, 10, 7, darken(m, 0.25));
    g.rect(3, 4, 10, 7, m);
    for (let i = 0; i < 5; i++) {
      g.set(3 + i, 4 + i, a);
      g.set(12 - i, 4 + i, a);
    }
    g.rect(11, 9, 5, 1, 0xffe08a);
    g.rect(13, 7, 1, 5, 0xffe08a);
  },
  // 병렬 처리: 나란히 가는 서류 두 장과 화살
  parallel(g, m, a) {
    paper(g, 1, 2, 6, 8);
    paper(g, 9, 2, 6, 8);
    g.rect(3, 11, 2, 3, m);
    g.rect(11, 11, 2, 3, m);
    g.rect(2, 13, 4, 1, m);
    g.rect(10, 13, 4, 1, m);
    g.set(4, 15, m);
    g.set(12, 15, m);
    g.set(1, 2, a);
    g.set(9, 2, a);
  },
  // 회람: 클립보드에 대각선 화살 두 개
  circular(g, m, a) {
    g.rect(4, 4, 8, 10, darken(m, 0.35));
    paper(g, 5, 5, 6, 8);
    g.rect(6, 3, 4, 2, a);
    for (let i = 0; i < 4; i++) {
      g.set(3 - i, 4 - i, m);
      g.set(12 + i, 4 - i, m);
    }
    g.rect(0, 0, 2, 1, m);
    g.rect(0, 0, 1, 2, m);
    g.rect(14, 0, 2, 1, m);
    g.rect(15, 0, 1, 2, m);
  },
  // 옆자리 협업: 가운데 모니터, 양옆으로 하이파이브
  side(g, m, a) {
    g.rect(5, 4, 6, 5, INK);
    g.rect(6, 5, 4, 3, 0x7ad0f0);
    g.rect(7, 9, 2, 2, INK);
    g.rect(5, 11, 6, 1, INK);
    g.rect(0, 6, 3, 4, m);
    g.rect(13, 6, 3, 4, m);
    g.set(0, 5, m);
    g.set(2, 5, m);
    g.set(13, 5, m);
    g.set(15, 5, m);
    g.rect(1, 12, 2, 2, a);
    g.rect(13, 12, 2, 2, a);
  },
  // 뒷담화: 손으로 가린 말풍선 + 뒤로 가는 화살
  backbite(g, m, a) {
    g.ellipse(9, 6, 6, 4.5, PAPER);
    g.rect(12, 9, 2, 3, PAPER);
    g.set(14, 12, PAPER);
    g.rect(6, 6, 1, 1, INK);
    g.rect(9, 6, 1, 1, INK);
    g.rect(12, 6, 1, 1, INK);
    g.rect(2, 4, 3, 7, m);
    g.rect(1, 5, 1, 4, a);
    g.rect(1, 13, 7, 1, m);
    g.set(2, 12, m);
    g.set(2, 14, m);
    g.set(1, 13, m);
  },
  // 직보: 서류 더미를 꿰뚫는 화살
  direct(g, m, a) {
    paper(g, 5, 3, 3, 10);
    paper(g, 9, 3, 3, 10);
    g.hline(0, 14, 8, m);
    g.hline(0, 12, 7, darken(m, 0.2));
    g.rect(13, 6, 1, 5, m);
    g.rect(14, 7, 1, 3, m);
    g.set(15, 8, m);
    g.rect(0, 6, 2, 1, a);
    g.rect(0, 9, 2, 1, a);
  },
  // 업무 토스: 휘어 날아가는 종이비행기
  toss(g, m, a) {
    for (let i = 0; i < 6; i++) g.set(1 + i, 13 - Math.round(i * 0.6), lighten(m, 0.3));
    for (let i = 0; i < 3; i++) g.set(7 + i, 10 - i, lighten(m, 0.3));
    g.rect(8, 3, 7, 1, PAPER);
    g.rect(9, 4, 5, 1, PAPER);
    g.rect(10, 5, 3, 1, darken(PAPER, 0.15));
    g.rect(11, 6, 2, 2, darken(PAPER, 0.15));
    g.set(15, 2, a);
    g.set(3, 13, m);
    g.set(5, 12, m);
  },
  // 반려 후 재상신: 빨간 반려 도장 + 되돌아 올라가는 화살
  resubmit(g, m, a) {
    paper(g, 2, 2, 9, 12);
    for (let i = 0; i < 5; i++) {
      g.set(4 + i, 5 + i, a);
      g.set(8 - i, 5 + i, a);
    }
    g.rect(12, 4, 2, 9, m);
    g.rect(11, 3, 4, 1, m);
    g.set(13, 2, m);
    g.rect(10, 12, 3, 2, m);
  },
  // 야근 열정: 모니터 위 불꽃
  passion(g, m, a) {
    g.rect(3, 10, 10, 5, INK);
    g.rect(4, 11, 8, 3, 0x3a5a8a);
    g.ellipse(8, 7, 4, 5, m);
    g.ellipse(8, 8, 2.5, 3, a);
    g.set(5, 2, m);
    g.set(11, 3, m);
    g.set(8, 1, m);
  },
  // 냉랭한 분위기: 얼음 사각 + 결정
  chill(g, m, a) {
    g.rect(3, 5, 10, 9, m);
    g.rect(4, 6, 3, 2, a);
    g.rect(4, 6, 1, 6, lighten(m, 0.4));
    g.vline(12, 0, 4, a);
    g.hline(10, 14, 2, a);
    g.set(11, 1, a);
    g.set(13, 3, a);
    g.set(11, 3, a);
    g.set(13, 1, a);
  },
  // 독박 업무: 혼자 짊어진 서류 탑 + 독 방울
  solo(g, m, a) {
    paper(g, 4, 9, 8, 2);
    paper(g, 3, 7, 8, 2);
    paper(g, 5, 5, 8, 2);
    paper(g, 4, 3, 8, 2);
    paper(g, 5, 1, 7, 2);
    g.rect(4, 11, 8, 4, a);
    g.ellipse(13, 12, 2, 2.5, m);
    g.set(13, 9, m);
    g.ellipse(2, 13, 1.5, 2, m);
  },
  // 급한 호출: 울리는 사내 전화 + 번개
  urgent(g, m, a) {
    g.rect(2, 9, 9, 6, a);
    g.rect(3, 7, 7, 2, darken(a, 0.2));
    g.rect(1, 6, 2, 3, darken(a, 0.2));
    g.rect(10, 6, 2, 3, darken(a, 0.2));
    g.rect(5, 11, 3, 2, 0xd8d8e8);
    g.rect(12, 0, 3, 2, m);
    g.rect(11, 2, 3, 2, m);
    g.rect(12, 4, 3, 1, m);
    g.rect(12, 5, 2, 2, m);
    g.set(12, 7, m);
  },
  // 도는 결재판: 결재판 + 도는 궤적
  boards(g, m, a) {
    g.rect(4, 3, 8, 11, m);
    paper(g, 5, 5, 6, 8);
    g.rect(6, 2, 4, 2, 0x9aa3ad);
    g.rect(6, 7, 2, 2, 0xe84a4a);
    for (let i = 0; i < 7; i++) {
      const t = (i / 7) * Math.PI * 2;
      if (i % 2 === 0) g.set(8 + Math.cos(t) * 7.5, 8.5 + Math.sin(t) * 7.5, a);
    }
  },
  // 서류 방패: 부채처럼 펼친 서류
  papers(g, m, a) {
    for (let k = 0; k < 5; k++) {
      const ang = -0.9 + k * 0.45;
      for (let r = 2; r < 7; r++)
        for (let w = -1; w <= 1; w++) g.set(8 + Math.cos(ang - Math.PI / 2) * r + Math.cos(ang) * w, 12 + Math.sin(ang - Math.PI / 2) * r + Math.sin(ang) * w, k % 2 ? m : darken(m, 0.12));
    }
    g.ellipse(8, 12, 2, 2, a);
    g.rect(2, 14, 12, 1, darken(a, 0.2));
  },
  // 인턴 소환: 목걸이 사원증을 건 신입
  intern(g, m, a) {
    g.ellipse(8, 5, 3.5, 3.5, a);
    g.rect(5, 2, 7, 2, 0x3a2a1e);
    g.set(7, 5, INK);
    g.set(9, 5, INK);
    g.rect(4, 9, 8, 6, m);
    g.vline(7, 9, 11, PAPER);
    g.vline(9, 9, 11, PAPER);
    g.rect(7, 11, 3, 2, PAPER);
    g.set(8, 12, 0xe84a4a);
  },
  // 칼퇴 의지: 6시를 가리키는 시계
  offwork(g, m, a) {
    g.ellipse(8, 8, 7, 7, m);
    g.ellipse(8, 8, 5.5, 5.5, a);
    g.vline(8, 4, 12, INK);
    g.set(8, 3, darken(m, 0.3));
    g.set(8, 13, darken(m, 0.3));
    g.set(3, 8, darken(m, 0.3));
    g.set(13, 8, darken(m, 0.3));
  },
  // 커피 수혈: 김 나는 머그
  coffee(g, m, a) {
    g.rect(3, 6, 8, 8, a);
    g.rect(4, 7, 6, 2, m);
    g.rect(11, 8, 2, 4, a);
    g.set(12, 9, 0x16151a);
    g.set(12, 10, 0x16151a);
    g.rect(3, 14, 8, 1, darken(a, 0.25));
    g.set(5, 3, 0xd8d8e8);
    g.set(6, 2, 0xd8d8e8);
    g.set(8, 4, 0xd8d8e8);
    g.set(9, 3, 0xd8d8e8);
  },
  // 연봉 협상: 돈 봉투 + 오르는 화살
  raise(g, m, a) {
    g.rect(1, 7, 10, 7, 0xf0e0b0);
    g.rect(1, 7, 10, 2, 0xd8c890);
    g.ellipse(6, 11, 2, 2, m);
    g.set(6, 11, a);
    g.vline(13, 2, 13, 0x5ad08a);
    g.rect(12, 3, 3, 1, 0x5ad08a);
    g.rect(11, 4, 5, 1, 0x5ad08a);
    g.set(13, 1, 0x5ad08a);
  },
  // 손이 빨라짐: 키보드 위 잔상 손
  quick(g, m, a) {
    g.rect(1, 10, 14, 5, a);
    for (let x = 2; x < 14; x += 2) g.set(x, 11, lighten(a, 0.4));
    for (let x = 3; x < 13; x += 2) g.set(x, 13, lighten(a, 0.4));
    g.ellipse(9, 7, 3.5, 2.5, m);
    g.rect(6, 4, 2, 4, m);
    g.rect(9, 3, 2, 4, m);
    g.rect(1, 5, 3, 1, lighten(m, 0.3));
    g.rect(0, 7, 3, 1, lighten(m, 0.3));
  },
  // 예리한 지적: 빨간 펜과 동그라미
  sharp(g, m, a) {
    paper(g, 1, 3, 9, 11);
    g.ellipse(5, 8, 3.5, 3.5, m);
    g.ellipse(5, 8, 2.5, 2.5, PAPER);
    for (let i = 0; i < 7; i++) g.rect(9 + i * 0.85, 13 - i * 1.6, 2, 2, m);
    g.set(15, 1, a);
    g.set(9, 14, INK);
  },
  // 체력 관리: 하트 + 더하기
  health(g, m, a) {
    g.ellipse(5.5, 6, 3.5, 3.5, m);
    g.ellipse(10.5, 6, 3.5, 3.5, m);
    for (let y = 7; y < 14; y++) g.hline(2 + (y - 7), 13 - (y - 7), y, m);
    g.rect(7, 5, 2, 6, a);
    g.rect(5, 7, 6, 2, a);
    g.set(4, 4, lighten(m, 0.5));
  },
  // 빠른 퇴근길: 운동화 + 바람 줄
  commute(g, m, a) {
    g.rect(5, 7, 6, 5, m);
    g.rect(5, 10, 10, 3, m);
    g.rect(4, 13, 12, 1, 0xf2ead3);
    g.set(7, 8, a);
    g.set(8, 9, a);
    g.set(9, 8, a);
    g.rect(0, 6, 4, 1, lighten(m, 0.3));
    g.rect(1, 9, 3, 1, lighten(m, 0.3));
    g.rect(0, 12, 3, 1, lighten(m, 0.3));
  },
  // 원샷 결재: 금빛 결재 도장 (손잡이 · 몸통 · 빨간 인주 자국)
  oneshot(g, m, a) {
    g.ellipse(8, 2.5, 2.5, 2, lighten(m, 0.2));
    g.rect(7, 4, 2, 3, darken(m, 0.3));
    g.rect(4, 7, 8, 4, m);
    g.rect(4, 7, 8, 1, lighten(m, 0.35));
    g.rect(3, 10, 10, 1, darken(m, 0.35));
    g.ellipse(8, 13.5, 5.5, 1.8, a);
    g.set(6, 13, 0xffffff);
    g.set(13, 2, 0xffffff);
    g.set(2, 4, 0xffffff);
  },
  // 무한 야근: 초승달과 그 아래 무한 기호
  overtime(g, m, a) {
    g.ellipse(7, 6, 5.5, 5.5, m);
    g.ellipse(9.5, 4.5, 4.5, 4.5, 0);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g.get(x, y) === Grid.rgba(0)) g.px[y * 16 + x] = 0;
    for (let i = 0; i < 28; i++) {
      const t = (i / 28) * Math.PI * 2;
      g.set(8 + Math.sin(t) * 6, 12.5 + Math.sin(2 * t) * 1.8, a);
    }
    g.set(12, 2, 0xffffff);
    g.set(14, 5, lighten(m, 0.5));
  },
};

/** 카드 그림 (16×16) */
export function cardArtGrid(id: CardId): Grid {
  const def = CARDS[id];
  const g = new Grid(16, 16);
  P[id](g, def.art.main, def.art.accent);
  g.outline(OUT);
  return g;
}

/** 희귀도 배경 (24×24 그림 칸): 일반은 종이, 희귀는 푸른빛, 전설은 금빛 햇살 */
const BACK: Record<CardRarity, [Color, Color]> = {
  common: [0x4a4438, 0x5e5646],
  rare: [0x1e3a5a, 0x2e5a8a],
  legend: [0x5a2a1e, 0xa8682a],
};

function windowGrid(id: CardId): Grid {
  const r = CARDS[id].rarity;
  const g = new Grid(24, 24);
  const [b0, b1] = BACK[r];
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x - 11.5, y - 11.5);
      let c = d < 7 ? b1 : d < 10 ? mixC(b0, b1, 0.5) : b0;
      if (r === "legend") {
        const ang = Math.atan2(y - 11.5, x - 11.5);
        if (Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 12) % 2 === 0 && d > 5) c = lighten(c, 0.12);
      }
      if (r === "rare" && (x + y) % 6 === 0 && d > 8) c = lighten(c, 0.08);
      g.set(x, y, c);
    }
  g.draw(cardArtGrid(id), 4, 4);
  return g;
}
const mixC = (a: Color, b: Color, t: number) => {
  const ar = a >> 16,
    ag = (a >> 8) & 255,
    ab = a & 255;
  const br = b >> 16,
    bg = (b >> 8) & 255,
    bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};

const cache = new Map<string, string>();
function toUrl(key: string, g: Grid, scale: number): string {
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return "";
  const src = g.toCanvas();
  const cv = document.createElement("canvas");
  cv.width = g.w * scale;
  cv.height = g.h * scale;
  const ctx = cv.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, cv.width, cv.height);
  const url = cv.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

/** 카드 고르기 창 그림 칸 (24×24 × scale) */
export const cardWindowUrl = (id: CardId, scale = 3) => toUrl(`w|${id}|${scale}`, windowGrid(id), scale);
/** HUD 작은 아이콘 (16×16 × scale) */
export const cardIconUrl = (id: CardId, scale = 2) => toUrl(`i|${id}|${scale}`, cardArtGrid(id), scale);
