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
  // ── 11/15 등급 개편 새 카드 16장 ──
  // 믹스커피: 종이컵 + 비스듬한 막대 봉지
  mix(g, m, a) {
    g.rect(3, 8, 7, 7, PAPER);
    g.rect(3, 8, 7, 2, 0x8a5a3a);
    g.rect(2, 7, 9, 1, darken(PAPER, 0.1));
    g.set(5, 5, 0xd8d8e8);
    g.set(6, 4, 0xd8d8e8);
    for (let i = 0; i < 7; i++) {
      g.rect(9 + i * 0.75, 7 - i, 2, 2, m);
      if (i === 3) g.rect(9 + i * 0.75, 7 - i, 2, 2, a);
    }
  },
  // 메모 습관: 귀퉁이 접힌 포스트잇과 파란 글씨
  memo(g, m, a) {
    g.rect(2, 2, 12, 12, m);
    g.rect(11, 11, 3, 3, darken(m, 0.25));
    g.set(13, 11, 0);
    g.hline(4, 11, 5, a);
    g.hline(4, 9, 8, a);
    g.hline(4, 10, 11, a);
    g.set(12, 4, 0xe84a4a);
  },
  // 점심 산책: 둥근 나무와 해
  walk(g, m, a) {
    g.ellipse(7, 7, 5, 4.5, m);
    g.ellipse(5, 6, 2, 2, lighten(m, 0.25));
    g.rect(6, 11, 2, 4, a);
    g.rect(3, 14, 9, 1, darken(m, 0.3));
    g.ellipse(13, 3, 2, 2, 0xffe08a);
  },
  // 탕비실 간식: 분홍 아이싱 도넛
  snack(g, m, a) {
    g.ellipse(8, 8.5, 6.5, 5.5, m);
    g.ellipse(8, 7.5, 5.5, 4, a);
    g.ellipse(8, 8, 2, 1.5, 0);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g.get(x, y) === Grid.rgba(0)) g.px[y * 16 + x] = 0;
    g.set(5, 6, 0xffffff);
    g.set(10, 5, 0x7ad0f0);
    g.set(11, 8, 0xffe08a);
    g.set(5, 9, 0x7ad07a);
  },
  // 사원증 목걸이: 줄 + 사진 붙은 카드
  badge(g, m, a) {
    for (let i = 0; i < 6; i++) {
      g.set(3 + i, 1 + i, m);
      g.set(12 - i, 1 + i, m);
    }
    g.rect(4, 7, 8, 8, a);
    g.rect(5, 8, 3, 3, 0x9aa3ad);
    g.hline(9, 10, 9, INK);
    g.hline(5, 10, 12, m);
    g.rect(7, 6, 2, 2, 0x9aa3ad);
  },
  // 반차: 반쯤 채운 시계 (오후는 쉰다)
  halfday(g, m, a) {
    g.ellipse(8, 8, 7, 7, a);
    g.ellipse(8, 8, 5.5, 5.5, PAPER);
    for (let y = 2; y < 15; y++) for (let x = 8; x < 15; x++) if (Math.hypot(x + 0.5 - 8, y + 0.5 - 8) < 5.5) g.set(x, y, m);
    g.vline(8, 4, 8, INK);
    g.hline(8, 11, 8, INK);
  },
  // 회의록 정리: 공책과 초록 체크
  minutes(g, m, a) {
    g.rect(3, 1, 10, 14, PAPER);
    g.rect(3, 1, 2, 14, a);
    for (const y of [4, 8, 12]) {
      g.set(6, y, m);
      g.set(7, y + 1, m);
      g.set(8, y, m);
      g.set(9, y - 1, m);
      g.hline(10, 11, y, 0xb8ad94);
    }
  },
  // 회식 2차: 거품 넘치는 맥주잔과 펑
  afterparty(g, m, a) {
    g.rect(3, 6, 8, 9, m);
    g.rect(4, 7, 2, 6, lighten(m, 0.3));
    g.rect(11, 8, 2, 4, darken(m, 0.2));
    g.ellipse(7, 5, 5, 2.5, 0xffffff);
    g.set(13, 2, a);
    g.set(14, 4, a);
    g.set(12, 1, a);
    g.set(15, 1, a);
  },
  // 퇴사 각: 빨간 도장 찍은 사직서 봉투
  resign(g, m, a) {
    g.rect(1, 4, 14, 9, a);
    for (let i = 0; i < 6; i++) {
      g.set(1 + i, 4 + i * 0.6, darken(a, 0.2));
      g.set(14 - i, 4 + i * 0.6, darken(a, 0.2));
    }
    g.hline(3, 8, 10, INK);
    g.ellipse(11.5, 9.5, 2.2, 2.2, m);
    g.set(11, 9, lighten(m, 0.5));
  },
  // 결재 라인: 결재 칸 셋을 잇는 번개
  chainline(g, m, a) {
    for (const x of [1, 6, 11]) {
      g.rect(x, 9, 4, 5, PAPER);
      g.rect(x, 9, 4, 1, m);
      g.set(x + 1, 12, 0xe84a4a);
    }
    g.set(3, 7, a);
    g.set(4, 6, a);
    g.set(5, 5, a);
    g.rect(6, 4, 3, 1, a);
    g.set(9, 5, a);
    g.set(10, 6, a);
    g.set(11, 5, a);
    g.set(12, 4, a);
    g.set(13, 3, a);
  },
  // 재택근무: 지붕 아래 불 켜진 노트북
  wfh(g, m, a) {
    for (let i = 0; i < 7; i++) g.hline(7 - i, 8 + i, 1 + i, m);
    g.rect(2, 8, 12, 7, a);
    g.rect(5, 10, 6, 3, INK);
    g.rect(6, 11, 4, 1, 0x7ad0f0);
    g.rect(4, 13, 8, 1, 0x9aa3ad);
  },
  // 사내 정치: 왕관 쓴 체스 말
  politics(g, m, a) {
    g.rect(6, 4, 4, 7, m);
    g.rect(5, 10, 6, 2, darken(m, 0.2));
    g.rect(3, 12, 10, 3, m);
    g.rect(5, 2, 6, 2, a);
    g.set(5, 1, a);
    g.set(8, 1, a);
    g.set(10, 1, a);
    g.set(7, 6, lighten(m, 0.4));
  },
  // 성과급: 띠를 두른 지폐 다발과 금화
  bonus(g, m, a) {
    g.rect(1, 9, 11, 5, darken(m, 0.3));
    g.rect(1, 7, 11, 5, darken(m, 0.15));
    g.rect(1, 5, 11, 5, m);
    g.rect(2, 6, 9, 3, lighten(m, 0.2));
    g.ellipse(6.5, 7.5, 1.5, 1.2, darken(m, 0.35));
    g.rect(5, 5, 3, 9, 0xf2ead3);
    g.ellipse(12.5, 12, 3, 3, a);
    g.ellipse(12.5, 12, 1.5, 1.5, darken(a, 0.25));
    g.set(11, 10, lighten(a, 0.5));
  },
  // 팀장 승진: 넥타이와 금별
  promote(g, m, a) {
    g.rect(6, 2, 4, 2, m);
    g.rect(7, 4, 2, 2, m);
    for (let y = 6; y < 13; y++) g.hline(6 - Math.min(1, y - 6), 9 + Math.min(1, y - 6), y, m);
    g.rect(7, 13, 2, 1, m);
    for (const y of [7, 10]) g.hline(6, 9, y, a);
    g.set(13, 2, a);
    g.hline(12, 14, 3, a);
    g.set(13, 4, a);
  },
  // 법인카드: 금빛 칩 박힌 카드
  corpcard(g, m, a) {
    g.rect(1, 4, 14, 9, m);
    g.rect(1, 6, 14, 1, lighten(m, 0.15));
    g.rect(3, 8, 3, 3, a);
    g.set(4, 9, darken(a, 0.3));
    g.hline(8, 13, 11, lighten(m, 0.35));
    g.ellipse(12, 9, 1.2, 1.2, a);
  },
  // 연차 몰아 쓰기: 줄무늬 파라솔과 모래
  leave(g, m, a) {
    for (let y = 2; y < 8; y++) {
      const w = (y - 1) * 1.2;
      for (let x = Math.round(8 - w); x <= Math.round(8 + w); x++) g.set(x, y, Math.floor((x + 16) / 2) % 2 ? m : a);
    }
    g.vline(8, 8, 14, 0x8a6a40);
    g.rect(1, 14, 14, 2, 0xf0d890);
    g.ellipse(13, 12, 1.5, 1.5, 0xff7a7a);
  },
  // 11/19 불씨 단속: 서류 위 작은 불꽃
  brEmber(g, m, a) {
    paper(g, 2, 6, 12, 9);
    g.ellipse(8, 5, 3, 3.5, m);
    g.ellipse(8, 6, 1.5, 2, a);
    g.set(8, 1, a);
  },
  // 서리 낀 창문: 네모 창 + 눈꽃
  brFrost(g, m, a) {
    g.rect(2, 2, 12, 12, darken(m, 0.35));
    g.rect(3, 3, 10, 10, m);
    g.vline(8, 3, 12, a);
    g.hline(3, 12, 8, a);
    for (const [x, y] of [[5, 5], [11, 5], [5, 11], [11, 11]]) g.set(x, y, 0xffffff);
  },
  // 등불 하나 더: 등불 두 개
  brSoul(g, m, a) {
    for (const x of [4, 11]) {
      g.vline(x, 1, 3, 0x8a6a40);
      g.rect(x - 2, 4, 5, 6, m);
      g.rect(x - 1, 5, 3, 4, a);
    }
    g.hline(1, 14, 13, darken(m, 0.3));
  },
  // 손에 익은 연장: 삽 + 렌치
  brWorker(g, m, a) {
    for (let i = 0; i < 9; i++) g.set(3 + i, 12 - i, 0x8a6440);
    g.rect(11, 2, 4, 4, a);
    g.rect(2, 10, 4, 4, m);
    g.rect(3, 11, 2, 2, darken(m, 0.3));
  },
  // 업무 인수인계: 서류를 건네는 화살
  handover(g, m, a) {
    paper(g, 1, 3, 7, 9);
    paper(g, 8, 5, 7, 9);
    g.hline(4, 11, 14, a);
    g.set(12, 13, a);
    g.set(12, 15, a);
    g.set(13, 14, a);
    void m;
  },
  // 11/19 기획서 다듬기 (마공): 서류 위 반짝이는 별빛 펜
  chant(g, m, a) {
    paper(g, 2, 3, 10, 12);
    for (const y of [6, 8, 10]) g.hline(4, 9, y, darken(a, 0.45));
    for (let i = 0; i < 6; i++) g.set(8 + i, 12 - i, m);
    g.set(14, 5, a);
    g.set(13, 2, a);
    g.hline(12, 14, 3, a);
  },
  // 회의 줄이기 (마공 쿨타임): 반쯤 줄어든 모래시계
  brief(g, m, a) {
    g.hline(3, 12, 2, darken(m, 0.4));
    g.hline(3, 12, 13, darken(m, 0.4));
    for (let y = 3; y < 8; y++) g.hline(4 + (y - 3), 11 - (y - 3), y, m);
    for (let y = 8; y < 13; y++) g.hline(4 + (12 - y), 11 - (12 - y), y, m);
    g.rect(7, 9, 2, 3, a);
    g.set(7, 6, a);
  },
  // 텀블러 리필 (최대 SP): 김이 나는 텀블러
  refill(g, m, a) {
    g.rect(5, 5, 6, 9, m);
    g.rect(5, 4, 6, 1, darken(m, 0.35));
    g.rect(6, 8, 4, 3, a);
    g.set(6, 1, 0xffffff);
    g.set(8, 2, 0xffffff);
    g.set(10, 1, 0xffffff);
  },
  // 경비 환급 (SP 환급): 금화가 돌아오는 봉투
  refund(g, m, a) {
    g.rect(1, 6, 10, 7, 0xf2ead3);
    g.hline(1, 10, 6, darken(0xf2ead3, 0.3));
    g.ellipse(12, 5, 2.5, 2.5, m);
    g.ellipse(12, 5, 1.2, 1.2, darken(m, 0.3));
    g.set(4, 9, a);
    g.set(6, 9, a);
    g.hline(3, 7, 10, a);
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

/** 등급 배경 (24×24 그림 칸): 일반 회색 · 매직 파랑 · 레어 금색 · 유니크 주황 햇살 · 전설 보라 햇살과 별 */
const BACK: Record<CardRarity, [Color, Color]> = {
  common: [0x3e3e42, 0x58585e],
  magic: [0x1e2e5a, 0x2e4a8a],
  rare: [0x4a3a14, 0x7a6020],
  unique: [0x5a2a10, 0x9a4a1a],
  legend: [0x2a1448, 0x5a2a8a],
};

function windowGrid(id: CardId): Grid {
  const r = CARDS[id].rarity;
  const g = new Grid(24, 24);
  const [b0, b1] = BACK[r];
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x - 11.5, y - 11.5);
      let c = d < 7 ? b1 : d < 10 ? mixC(b0, b1, 0.5) : b0;
      if (r === "legend" || r === "unique") {
        const ang = Math.atan2(y - 11.5, x - 11.5);
        if (Math.floor(((ang + Math.PI) / (Math.PI * 2)) * (r === "legend" ? 12 : 8)) % 2 === 0 && d > 5) c = lighten(c, 0.12);
      }
      if (r === "legend" && (x * 7 + y * 13) % 29 === 0 && d > 9) c = 0xf0e0ff;
      if ((r === "rare" || r === "magic") && (x + y) % 6 === 0 && d > 8) c = lighten(c, 0.08);
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
