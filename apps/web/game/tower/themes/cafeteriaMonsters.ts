import type { CfMonsterId } from "@/lib/rpg/towerThemes/cafeteria";
import { darken, Grid, lighten, type Color } from "../../sprites/pixel";

// 11/15 구내식당 몬스터 그림 (monsterArt.ts의 P 표에 끼워 넣는다 — 자세를 받아 한 프레임을 칠한다, 테두리는 틀이 두른다).
// 식판·젓가락·단무지·김치통 … 몸 모양이 모두 다르다 (색만 바꾼 그림 없음). 기본 방향은 오른쪽.

type Pose = { f: number; step: number; atk: number; hurt: boolean };
type Paint = (g: Grid, s: number, m: Color, a: Color, p: Pose) => void;

const EYE = 0x141218;
const WHITE = 0xf6f4ec;
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

/** 흰자 있는 큰 눈 (덩치 큰 것) */
function bigEyes(g: Grid, x: number, y: number, gap: number, p: Pose): void {
  for (const ex of [x, x + gap]) {
    if (p.hurt) {
      g.hline(ex - 1, ex + 1, y, EYE);
      continue;
    }
    g.rect(ex - 1, y - 1, 3, 3, WHITE);
    g.rect(ex + (p.atk ? 1 : 0), y, 1, 2, EYE);
    if (p.atk) g.hline(ex - 1, ex + 1, y - 2, EYE);
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

/** 두께 있는 선 (픽셀 중심 보간) */
function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color, w = 1): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    g.rect(Math.round(x - (w - 1) / 2), Math.round(y - (w - 1) / 2), w, w, c);
  }
}

const RICE = 0xf6f4ec;
const KIM = 0xd8302a;
const SOUP = 0xd88a3a;

export const CF_PAINT: Record<CfMonsterId, Paint> = {
  // 식판: 비스듬히 선 스테인리스 쟁반 (밥·김치·반찬·국 칸) — 밥 칸에 얼굴. 미끄러지기 전엔 몸을 낮춘다
  cf_tray(g, s, m, a, p) {
    const low = p.atk === 1 ? 2 : 0;
    const f = (p.step >= 0 ? lift(p) : 0) + low;
    const top = 3 + f;
    const lean = p.atk === 2 ? 1 : 0;
    // 쟁반 판 (위가 좁은 사다리꼴 — 비스듬히 본 모습)
    for (let y = top; y < s - 2; y++) {
      const k = (y - top) / (s - 2 - top);
      const inset = Math.round((1 - k) * 2);
      g.hline(inset + lean, s - 1 - inset + lean, y, m);
    }
    g.hline(2 + lean, s - 3 + lean, top, lighten(m, 0.4));
    g.hline(0, s - 1, s - 3, darken(m, 0.3));
    g.rect(1, s - 2, s - 2, 1, darken(m, 0.5));
    // 칸: 왼쪽 위 밥(얼굴), 오른쪽 위 김치·나물, 아래 국
    const ry = top + 2;
    g.rect(2 + lean, ry, 6, 4, RICE);
    g.hline(3 + lean, 6 + lean, ry - 1, RICE);
    g.set(3 + lean, ry, 0xffffff);
    eyes(g, 3 + lean, ry + 2, 3, p);
    g.rect(9 + lean, ry, 2, 3, KIM);
    g.set(9 + lean, ry, lighten(KIM, 0.3));
    g.rect(12 + lean, ry, 2, 3, 0x5aa04a);
    g.rect(2 + lean, ry + 5, s - 4, 2, SOUP);
    g.set(5 + lean, ry + 5, lighten(SOUP, 0.45));
    g.hline(2 + lean, s - 3 + lean, ry + 4, darken(m, 0.15));
    // 미끄러질 때 뒤로 남는 빛
    if (p.atk === 2) for (let k = 0; k < 3; k++) g.set(0, ry + 1 + k * 2, lighten(a, 0.6));
  },

  // 젓가락 한 쌍: 나무젓가락 두 짝이 V자로 크게 벌어져 있다 (공격하면 딱 오므린다), 끝에 집힌 단무지, 손잡이 쪽 종이 띠에 눈
  cf_chopsticks(g, s, m, a, p) {
    const f = p.f + lift(p);
    const open = p.atk === 2 ? 0 : p.atk === 1 ? 9 : 6 + (p.f ? 1 : 0);
    const bx = 2;
    const by = s - 3 - f * 0.5;
    const tx = s - 1;
    const ty = 1 + (p.atk === 2 ? 3 : 0) - f * 0.5;
    line(g, bx, by, tx, ty, m, 2);
    line(g, bx + 1, by + 1, tx, ty + open, darken(m, 0.2), 2);
    // 끝에 집힌 단무지 조각 (오므리면 꽉)
    if (open < 8) g.rect(tx - 2, ty + Math.max(1, open / 2) - 1, 2, 2, 0xf4e040);
    // 손잡이 끝 (색칠) + 종이 포장 띠 (얼굴)
    g.rect(bx - 1, by - 1, 3, 3, darken(m, 0.4));
    g.rect(3, by - 7, 5, 5, a);
    g.hline(3, 7, by - 7, lighten(a, 0.35));
    eyes(g, 4, by - 5, 2, p, WHITE);
  },
  // 단무지: 노란 반달 조각 (속은 옅고 테두리는 진한 노랑), 비스듬히 빙글
  cf_danmuji(g, s, m, a, p) {
    const f = p.f;
    const cx = s / 2;
    const cy = s / 2 + 1 - f;
    g.ellipse(cx, cy, s / 2 - 0.5, s / 2 - 1.5, a);
    g.ellipse(cx, cy, s / 2 - 1.8, s / 2 - 2.8, m);
    g.ellipse(cx - 1, cy - 1, 2, 1.2, lighten(m, 0.5));
    // 결 (방사 줄)
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2 + (p.step >= 0 ? p.step * 0.5 : 0);
      g.set(cx + Math.cos(ang) * 3, cy + Math.sin(ang) * 2.4, darken(m, 0.12));
    }
    eyes(g, cx - 1, cy, 3, p);
    if (p.atk === 2) g.hline(0, 1, cy, lighten(m, 0.5));
  },

  // 김치통: 반투명 통 속 빨간 김치, 초록 뚜껑 (터지기 전엔 뚜껑이 부푼다)
  cf_kimchi(g, s, m, a, p) {
    const f = p.f + lift(p);
    const puff = p.atk ? p.atk + 1 : 0;
    const y0 = 4 - f;
    g.rect(1, y0, s - 2, s - 5, m);
    g.rect(2, y0 + 3, s - 4, s - 9, a);
    // 배추 결 + 고춧가루
    for (let k = 0; k < 5; k++) g.set(3 + k * 2, y0 + 4 + (k % 2), lighten(a, 0.35));
    for (let k = 0; k < 6; k++) g.set(3 + ((k * 5) % (s - 6)), y0 + 7 + (k % 3), darken(a, 0.3));
    g.vline(2, y0 + 1, y0 + s - 7, lighten(m, 0.4));
    // 뚜껑
    g.rect(0, y0 - 2 - puff, s, 3, 0x3a9a5a);
    if (puff) g.rect(3, y0 - 3 - puff, s - 6, 1, 0x3a9a5a);
    g.hline(0, s - 1, y0 - 2 - puff, 0x6aca8a);
    g.rect(s / 2 - 2, y0 - 3 - puff, 4, 1, 0x2a7a4a);
    // 국물이 새는 자국
    if (p.atk) g.set(s - 2, y0 + s - 6, a);
    eyes(g, 5, y0 + 5, 4, p, WHITE);
    g.hline(5, 9, s - 1, darken(m, 0.3));
  },

  // 국자: 둥근 국자 머리(국물이 찰랑) + 긴 손잡이, 휘두를 땐 손잡이를 높이 든다
  cf_ladle(g, s, m, a, p) {
    const f = p.f + lift(p);
    const up = p.atk === 1 ? 3 : p.atk === 2 ? -2 : 0;
    const hx = 6;
    const hy = s - 6 - f * 0.5;
    // 손잡이
    line(g, hx + 3, hy - 3, s - 2, 1 + up, m, 2);
    g.rect(s - 3, up < 0 ? 0 : up, 3, 2, a);
    // 머리 (그릇)
    g.ellipse(hx, hy, 5.5, 4.5, m);
    g.ellipse(hx, hy - 1.5, 4.5, 2, darken(m, 0.35));
    g.ellipse(hx, hy - 1.5, 3.5, 1.2, SOUP);
    g.set(hx - 2, hy - 2, lighten(SOUP, 0.5));
    shade(g, m, hy - 3, hy + 2);
    bigEyes(g, hx - 2, hy + 2, 4, p);
    if (p.atk === 2) for (let k = 0; k < 3; k++) g.set(hx + 5 + k, hy - 5 - k, SOUP);
  },

  // 식권: 작은 종이 한 장 (파란 띠·도장 칸·뜯는 점선), 펄럭
  cf_meal_ticket(g, s, m, a, p) {
    const flap = p.step >= 0 ? lift(p) : p.f;
    g.rect(0, 2 + flap, s, s - 4, m);
    g.hline(0, s - 1, 2 + flap, a);
    g.hline(0, s - 1, 3 + flap, a);
    for (let x = 0; x < s; x += 2) g.set(x, s - 3 + flap, darken(m, 0.25));
    g.set(s - 3, 5 + flap, 0xd8302a);
    eyes(g, 2, 5 + flap, 3, p);
    if (flap) g.set(s - 1, 1, m);
  },

  // 디저트 젤리: 투명한 분홍 돔 + 하얀 크림 꼭지 + 빛 반사, 걸을 땐 출렁
  cf_jelly(g, s, m, a, p) {
    const sq = p.step >= 0 ? (p.step % 2 ? 1 : -1) : p.f;
    const w = s / 2 - 0.5 + sq * 0.5;
    const h = s / 2 - 2 - sq * 0.5;
    const cx = s / 2;
    const by = s - 1;
    g.ellipse(cx, by - h, w, h, m);
    g.rect(Math.round(cx - w), by - 2, Math.round(w * 2), 2, darken(m, 0.25));
    g.ellipse(cx - 2, by - h * 1.4, 1.5, 2.5, lighten(m, 0.55));
    // 속 딸기 조각
    g.rect(cx + 1, by - 5, 2, 2, darken(m, 0.35));
    // 크림
    g.ellipse(cx, by - h * 2 + 1, 2.5, 1.5, a);
    g.set(cx, by - h * 2 - 1, 0xd8302a);
    eyes(g, cx - 2, by - h, 4, p);
  },

  // 젤리 조각: 작은 네모 젤리
  cf_jelly_bit(g, s, m, a, p) {
    const f = p.f + lift(p);
    g.rect(1, 2 - f, s - 2, s - 3, m);
    g.hline(1, s - 2, 2 - f, a);
    g.set(2, 3 - f, a);
    eyes(g, 3, 4 - f, 2, p);
  },

  // 커피 자판기: 키 큰 갈색 상자, 컵 나오는 칸, 숫자판 얼굴, 버튼 줄
  cf_vending(g, s, m, a, p) {
    const f = p.f;
    const x0 = 3;
    const w = s - 6;
    g.rect(x0, 1 - f, w, s - 2, m);
    shade(g, m, 2 - f, s - 5);
    // 위 광고판 (커피잔)
    g.rect(x0 + 1, 2 - f, w - 2, 5, a);
    g.rect(x0 + 4, 3 - f, 3, 3, 0x6a3a1a);
    g.set(x0 + 7, 4 - f, 0x6a3a1a);
    g.set(x0 + 5, 2 - f, WHITE);
    // 얼굴 (숫자판)
    g.rect(x0 + 2, 8 - f, w - 4, 4, 0x141820);
    eyes(g, x0 + 4, 10 - f, 5, p, p.atk ? 0xff5a3a : 0x6aff8a);
    // 버튼
    for (let k = 0; k < 4; k++) g.set(x0 + 3 + k * 3, 13 - f, k % 2 ? 0xe8c040 : 0xf2f2ee);
    // 컵 나오는 칸 (공격 땐 캔이 보인다)
    g.rect(x0 + 3, s - 6 - f, w - 6, 3, 0x141218);
    if (p.atk) g.rect(x0 + 5, s - 6 - f, 3, 2, 0xc83a2a);
    g.vline(x0 + w - 1, 1 - f, s - 2, darken(m, 0.4));
    g.rect(x0, s - 1, 2, 1, darken(m, 0.5));
    g.rect(x0 + w - 2, s - 1, 2, 1, darken(m, 0.5));
  },

  // 잔반통: 초록 원통 + 뚜껑이 들썩이며 열린다 (안은 깜깜, 이빨 같은 잔반)
  cf_bin(g, s, m, a, p) {
    const f = p.f + lift(p);
    const open = p.atk ? p.atk * 2 + 1 : p.f;
    const y0 = 6;
    g.rect(2, y0 - f * 0.5, s - 4, s - y0 - 1, m);
    g.ellipse(s / 2, s - 2, s / 2 - 2, 1.5, darken(m, 0.3));
    shade(g, m, y0, s - 4);
    for (let y = y0 + 3; y < s - 3; y += 4) g.hline(2, s - 3, y, darken(m, 0.18));
    // 입 (뚜껑 아래)
    g.rect(3, y0 - f * 0.5, s - 6, Math.min(4, open + 1), 0x141218);
    for (let x = 4; x < s - 4; x += 3) g.set(x, y0 - f * 0.5, a);
    // 뚜껑 (뒤로 젖혀짐)
    g.rect(1, y0 - 2 - open - f * 0.5, s - 2, 2, lighten(m, 0.15));
    g.rect(s / 2 - 2, y0 - 3 - open - f * 0.5, 4, 1, darken(m, 0.3));
    // 음식물 표지 = 눈
    g.rect(5, y0 + 5, s - 10, 4, WHITE);
    eyes(g, 7, y0 + 7, 4, p, m);
  },

  // 숟가락: 비스듬히 선 숟가락 (왼쪽 위 오목한 머리에 비친 얼굴, 오른쪽 아래로 뻗은 손잡이). 던지기 전엔 뒤로 젖힌다
  cf_spoon(g, s, m, a, p) {
    const f = p.f + lift(p);
    const back = p.atk === 1 ? -1 : p.atk === 2 ? 1 : 0;
    const hx = 4.5 + back;
    const hy = 5 - f;
    line(g, hx + 2, hy + 3, s - 2, s - 3, m, 2);
    g.rect(s - 3, s - 4, 3, 3, a);
    g.ellipse(hx, hy, 4, 5, m);
    g.ellipse(hx, hy + 0.5, 2.8, 3.8, darken(m, 0.2));
    g.set(hx - 2, hy - 3, 0xffffff);
    g.set(hx - 2, hy - 2, 0xffffff);
    eyes(g, hx - 1, hy + 1, 2, p);
    if (p.atk === 2) g.hline(hx + 4, hx + 6, hy - 2, lighten(m, 0.4));
  },

  // 압력밥솥: 둥근 흰 몸통 + 빨간 뚜껑 단추 + 김 나는 추, 앞면 표시창 얼굴, 손잡이
  cf_rice_cooker(g, s, m, a, p) {
    const f = p.f + lift(p);
    const cx = s / 2;
    const top = 6 - f;
    g.ellipse(cx, top + 9, s / 2 - 1, 9, m);
    g.rect(1, top + 9, s - 2, s - top - 11, m);
    shade(g, m, top + 3, s - 5);
    // 뚜껑 띠
    g.hline(2, s - 3, top + 6, darken(m, 0.3));
    g.ellipse(cx, top + 2, 6, 2.5, lighten(m, 0.1));
    // 빨간 단추 + 추
    g.rect(cx - 2, top - 1, 4, 2, a);
    g.rect(cx + 4, top - 3 - (p.atk ? 1 : 0), 2, 3, 0x5a5e64);
    // 김 (공격 때 크게)
    if (p.atk || p.f) {
      g.set(cx + 5, top - 5 - (p.atk ? 1 : 0), 0xe8ecf0);
      if (p.atk) g.rect(cx + 4, top - 8, 3, 2, 0xe8ecf0);
    }
    // 표시창 얼굴
    g.rect(cx - 6, top + 9, 12, 6, 0x1a2a3a);
    if (p.hurt) g.hline(cx - 4, cx + 4, top + 12, 0xff8a6a);
    else {
      g.rect(cx - 4, top + 11, 2, 2, p.atk ? 0xff5a3a : 0x6aff9a);
      g.rect(cx + 2, top + 11, 2, 2, p.atk ? 0xff5a3a : 0x6aff9a);
    }
    // 「취사」 버튼 줄
    g.hline(cx - 5, cx + 5, top + 17, darken(m, 0.2));
    g.set(cx - 3, top + 17, a);
    // 옆 손잡이
    g.rect(0, top + 8, 2, 4, 0x5a5e64);
    g.rect(s - 2, top + 8, 2, 4, 0x5a5e64);
    // 바닥 받침
    const l = leg(p);
    g.rect(4 + l, s - 2, 4, 2, darken(m, 0.45));
    g.rect(s - 8 - l, s - 2, 4, 2, darken(m, 0.45));
  },

  // 주먹밥: 세모 밥 + 아래 김 띠
  cf_riceball(g, s, m, a, p) {
    const f = p.f + lift(p);
    for (let y = 0; y < s - 1; y++) {
      const half = (y + 1) * 0.55;
      g.hline(Math.round(s / 2 - half), Math.round(s / 2 + half - 1), y + 1 - f, m);
    }
    g.rect(2, s - 4 - f, s - 4, 3, a);
    g.set(s / 2 - 1, 3 - f, 0xd8e0d0);
    eyes(g, s / 2 - 2, s - 6 - f, 3, p);
  },

  // 배식 도우미: 흰 위생모·초록 앞치마, 식판을 든 작은 사람
  cf_server(g, s, m, a, p) {
    const f = p.f + lift(p);
    const cx = 6;
    // 다리
    const l = leg(p);
    g.rect(cx - 2 + l, s - 3, 2, 3, 0x2a2e3a);
    g.rect(cx + 1 - l, s - 3, 2, 3, 0x2a2e3a);
    // 몸 (흰 가운 + 초록 앞치마)
    g.rect(cx - 3, 6 - f, 7, s - 9, m);
    g.rect(cx - 2, 8 - f, 5, s - 11, a);
    // 머리 + 위생모
    g.rect(cx - 2, 2 - f, 5, 4, 0xf0c8a0);
    g.rect(cx - 3, 0 - f, 7, 2, WHITE);
    eyes(g, cx, 4 - f, 2, p);
    // 앞으로 든 식판
    const up = p.atk ? -1 : 0;
    g.rect(cx + 3, 8 - f + up, s - cx - 3, 2, 0xa8b2ba);
    g.set(s - 2, 7 - f + up, KIM);
    g.set(s - 4, 7 - f + up, RICE);
  },

  // 영양사: 흰 가운·위생모·안경, 한 손엔 「오늘의 메뉴」 클립보드, 한 손엔 큰 국자
  cf_nutritionist(g, s, m, a, p) {
    const f = p.f + lift(p);
    const cx = 18;
    const l = leg(p);
    // 다리·신발
    g.rect(cx - 5 + l, s - 7, 4, 6, 0x2a2e3a);
    g.rect(cx + 2 - l, s - 7, 4, 6, 0x2a2e3a);
    g.rect(cx - 6 + l, s - 2, 6, 2, 0xf2f2ee);
    g.rect(cx + 2 - l, s - 2, 6, 2, 0xf2f2ee);
    // 가운
    const gy = 14 - f;
    g.rect(cx - 9, gy, 19, s - gy - 7, m);
    g.rect(cx - 10, gy + 4, 21, s - gy - 12, m);
    shade(g, m, gy + 2, s - 10);
    g.vline(cx, gy + 1, s - 8, darken(m, 0.2));
    for (let k = 0; k < 3; k++) g.set(cx + 1, gy + 5 + k * 5, 0xb8bcc4);
    // 초록 명찰·주머니 펜
    g.rect(cx - 7, gy + 4, 5, 3, a);
    g.set(cx + 6, gy + 3, 0x2a6ad8);
    g.set(cx + 6, gy + 4, 0x2a6ad8);
    // 목·머리
    g.rect(cx - 2, gy - 2, 5, 3, 0xe8b890);
    g.ellipse(cx, gy - 7, 6.5, 6.5, 0xf0c8a0);
    // 위생모 (주름)
    g.rect(cx - 7, gy - 15, 15, 5, WHITE);
    g.ellipse(cx, gy - 15, 7.5, 3, WHITE);
    for (let k = -5; k <= 5; k += 3) g.set(cx + k, gy - 16, 0xd8dce0);
    // 안경 + 눈
    if (p.hurt) {
      g.hline(cx - 4, cx - 1, gy - 7, EYE);
      g.hline(cx + 2, cx + 5, gy - 7, EYE);
    } else {
      g.rect(cx - 5, gy - 9, 5, 4, 0x2a2e3a);
      g.rect(cx - 4, gy - 8, 3, 2, 0xd8f0ff);
      g.rect(cx + 2, gy - 9, 5, 4, 0x2a2e3a);
      g.rect(cx + 3, gy - 8, 3, 2, 0xd8f0ff);
      g.set(cx - 3 + (p.atk ? 1 : 0), gy - 7, EYE);
      g.set(cx + 4 + (p.atk ? 1 : 0), gy - 7, EYE);
      if (p.atk) {
        g.hline(cx - 5, cx - 1, gy - 10, EYE);
        g.hline(cx + 2, cx + 6, gy - 10, EYE);
      }
    }
    g.hline(cx - 1, cx + 2, gy - 3, p.atk ? 0xa83a3a : 0xc88a70);
    // 왼손: 클립보드 (오늘의 메뉴)
    g.rect(cx - 15, gy + 6, 8, 11, 0x8a5a2a);
    g.rect(cx - 14, gy + 8, 6, 8, WHITE);
    g.rect(cx - 13, gy + 6, 4, 2, 0xb8bcc4);
    for (let k = 0; k < 3; k++) g.hline(cx - 13, cx - 10 + (k % 2), gy + 10 + k * 2, k === 0 ? 0xd8302a : 0x6a6e74);
    // 오른손: 큰 국자 (공격 때 치켜든다)
    const up = p.atk === 1 ? -8 : p.atk === 2 ? 4 : 0;
    g.rect(cx + 9, gy + 6, 3, 4, m);
    line(g, cx + 11, gy + 9, s - 4, gy - 6 + up, 0xa8b0b8, 2);
    g.ellipse(s - 4, gy - 4 + up + 2, 3.5, 3, 0x8a929a);
    g.ellipse(s - 4, gy - 5 + up + 2, 2.5, 1.2, SOUP);
    if (p.atk === 2) for (let k = 0; k < 4; k++) g.set(s - 7 + k, gy + 2 + up + k, SOUP);
  },
};
