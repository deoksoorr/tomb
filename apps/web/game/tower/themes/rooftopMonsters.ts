import type { RfMonsterId } from "@/lib/rpg/towerThemes/rooftop";
import { darken, Grid, lighten, type Color } from "../../sprites/pixel";

// 11/15 옥상 정원 폭풍 몬스터 열네 종 그림 (monsterArt가 P에 펼쳐 넣는다 — 12프레임 시트는 monsterArt가 만든다).
// 모두 다른 모양: 뒤집힌 우산·날아다니는 화분·우비 흡연자·실외기·비둘기·물덩어리·물방울·서류 뭉치·기운 피뢰침·택배 상자·검은 고양이·불꽃·풍향계 수탉·피뢰침 탑.
// 기본 방향은 오른쪽, 발은 맨 아래 (monsterArt와 같은 틀).

const OUT = 0x141218;
const EYE = 0x141218;
const WHITE = 0xf2ead3;

type Pose = { f: number; step: number; atk: number; hurt: boolean };
type Paint = (g: Grid, s: number, m: Color, a: Color, p: Pose) => void;

const leg = (p: Pose) => (p.step < 0 ? 0 : p.step % 2 === 0 ? 1 : -1);
const lift = (p: Pose) => (p.step === 1 || p.step === 3 ? 1 : 0);
const flap = (p: Pose) => (p.f + Math.max(0, p.step)) % 2;

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

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

export const RF_PAINT: Record<RfMonsterId, Paint> = {
  // 뒤집힌 우산: 바람에 뒤집혀 컵 모양이 된 천(줄무늬) + 솟은 살 + 아래로 J 손잡이. 공격하면 살이 쫙 벌어진다
  rf_umbrella(g, s, m, a, p) {
    const f = p.f + lift(p) * 0.5;
    const cx = s / 2 - 0.5;
    const spread = p.atk ? 1 : 0;
    // 뒤집힌 천: 아래가 좁고 위가 넓은 그릇 (여덟 폭이 번갈아 진하고 밝다)
    for (let y = 0; y < 8; y++) {
      const half = 1.5 + y * 0.95 + spread;
      const yy = 9 - y - f;
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        const seg = Math.floor(((x - cx) / (half + 0.5)) * 4 + 4);
        g.set(x, yy, seg % 2 ? m : lighten(m, 0.35));
      }
    }
    g.hline(Math.round(cx - 8 - spread), Math.round(cx + 8 + spread), 2 - f, darken(m, 0.35));
    // 뒤집혀 솟은 살 (은색 끝이 천 위로 삐죽)
    for (const dx of [-8, -5, -2, 2, 5, 8]) {
      const x = Math.round(cx + dx * (1 + spread * 0.15));
      g.set(x, 1 - f, 0xd8dce4);
      g.set(x + (dx > 0 ? 1 : -1), 0 - f - (p.atk ? 1 : 0), 0xf2f2ee);
    }
    eyes(g, Math.round(cx) - 2, 6 - f, 4, p, WHITE);
    if (p.atk) g.hline(Math.round(cx) - 1, Math.round(cx) + 1, 8 - f, OUT);
    // 손잡이 (아래로, 끝이 갈고리)
    g.vline(Math.round(cx), 10 - f, s - 3, 0x6a4a2c);
    g.set(Math.round(cx), 11 - f, 0xc8ccd4);
    g.set(Math.round(cx) + 1, s - 2, a);
    g.set(Math.round(cx) + 2, s - 2, a);
    g.set(Math.round(cx) + 3, s - 3, a);
    g.set(Math.round(cx) - 1 + leg(p), s - 1, darken(a, 0.3));
  },
  // 날아다니는 화분: 테라코타 화분 몸통 + 위로 솟은 잎 + 옆 잎 날개 (파닥). 화난 눈
  rf_planter(g, s, m, a, p) {
    const f = p.f + lift(p);
    const cx = s / 2;
    for (let y = 0; y < 6; y++) g.hline(cx - 5 + y * 0.4, cx + 5 - y * 0.4, 7 + y - f, m);
    g.hline(cx - 6, cx + 5, 6 - f, lighten(m, 0.25));
    g.hline(cx - 6, cx + 5, 7 - f, darken(m, 0.1));
    shade(g, m, 8 - f, 11 - f);
    g.hline(cx - 4, cx + 3, 5 - f, 0x3a2a1c);
    // 잎
    g.vline(cx, 1 - f, 5 - f, darken(a, 0.2));
    g.rect(cx - 3, 1 - f, 3, 2, a);
    g.rect(cx + 1, 0 - f, 3, 2, lighten(a, 0.2));
    g.set(cx - 1, 3 - f, a);
    // 잎 날개
    const wy = flap(p) ? 6 : 8;
    g.rect(0, wy - f, 2, 2, a);
    g.rect(s - 2, wy - f, 2, 2, a);
    eyes(g, cx - 2, 9 - f, 3, p, WHITE);
    g.set(cx - 3, 8 - f, OUT);
    g.set(cx + 2, 8 - f, OUT);
    if (p.atk) g.hline(cx - 1, cx, 11 - f, OUT);
  },
  // 젖은 흡연자: 우비 후드를 뒤집어쓴 구부정한 사람, 입에 담배 (주황 불씨), 머리 위 연기
  rf_smoker(g, s, m, a, p) {
    const f = p.f;
    const cx = s / 2 - 1;
    // 후드
    g.ellipse(cx, 5 - f, 4.5, 4.5, m);
    g.ellipse(cx + 1, 5.5 - f, 2.8, 3, 0xe0c0a0);
    g.rect(cx - 1, 3 - f, 5, 1, darken(m, 0.25));
    eyes(g, cx, 5 - f, 2, p);
    // 담배
    g.hline(cx + 3, cx + 5, 7 - f, WHITE);
    g.set(cx + 6, 7 - f, p.atk ? 0xffd04a : a);
    // 연기
    g.set(cx + 6, 4 - f - (p.f ? 1 : 0), 0xb0b4b8);
    g.set(cx + 7, 2 - f, 0x9aa0a4);
    g.set(cx + 5, 1 - f, 0x9aa0a4);
    // 우비 몸통 (넓게 퍼진 밑단)
    for (let y = 0; y < 7; y++) g.hline(cx - 4 - Math.floor(y / 3), cx + 4 + Math.floor(y / 3), 9 + y - f, m);
    shade(g, m, 10 - f, 14 - f);
    g.vline(cx, 10 - f, 15 - f, darken(m, 0.3));
    for (const by of [11, 13]) g.set(cx + 1, by - f, 0xd8d8c8);
    // 빗방울 맺힘
    g.set(cx - 3, 12 - f, 0x9ad0f0);
    g.set(cx + 3, 10 - f, 0x9ad0f0);
    // 장화
    g.rect(cx - 3 + leg(p), s - 2, 2, 2, 0x2a3a2a);
    g.rect(cx + 1 - leg(p), s - 2, 2, 2, 0x2a3a2a);
  },
  // 실외기: 베이지 상자 + 왼쪽 큰 팬(프레임마다 날개가 돈다) + 오른쪽 통풍 칸, 팬 위로 눈. 공격하면 팬이 빨갛게
  rf_ac_unit(g, s, m, a, p) {
    const f = p.f * 0.5;
    const y0 = 3 - f;
    g.rect(1, y0, s - 2, 12, m);
    shade(g, m, y0 + 1, y0 + 10);
    g.hline(1, s - 2, y0, lighten(m, 0.3));
    const cx = 7;
    const cy = y0 + 7;
    const hot = p.atk ? 0xff6a3a : lighten(a, 0.25);
    g.ellipse(cx, cy, 5, 5, darken(m, 0.35));
    g.ellipse(cx, cy, 4, 4, p.atk ? 0x5a1a10 : 0x22262c);
    const t = (p.step < 0 ? p.f * 2 : p.step) % 4;
    const ang = (t / 4) * Math.PI;
    for (let k = 0; k < 3; k++) {
      const q = ang + (k * Math.PI * 2) / 3;
      line(g, cx, cy, cx + Math.cos(q) * 3.6, cy + Math.sin(q) * 3.6, hot);
    }
    g.set(cx, cy, lighten(hot, 0.3));
    for (let yy = y0 + 3; yy < y0 + 11; yy += 2) g.hline(13, s - 3, yy, darken(m, 0.3));
    eyes(g, 13, y0 + 1, 2, p);
    // 고무 받침 발
    g.rect(2 + leg(p), s - 3, 3, 2, 0x2a2a2a);
    g.rect(s - 5 - leg(p), s - 3, 3, 2, 0x2a2a2a);
    // 물 떨어짐
    if (p.f) g.set(s - 4, s - 1, 0x9ad0f0);
  },
  // 비둘기: 회색 몸 + 반짝이는 초록 목 + 주황 눈·부리 + 꼬리. 걸으면 날개가 들썩
  rf_pigeon(g, s, m, a, p) {
    const f = lift(p);
    g.ellipse(3.5, 5.5 - f, 3.5, 2.5, m);
    g.rect(0, 5 - f, 2, 2, darken(m, 0.2));
    g.ellipse(6, 3 - f, 2, 2, m);
    g.rect(5, 4 - f, 2, 2, a);
    g.set(7, 2 - f, p.hurt ? EYE : 0xff8a2a);
    g.set(8, 3 - f, 0xe8b070);
    if (flap(p) || p.atk) g.rect(1, 2 - f, 3, 2, lighten(m, 0.2));
    else g.hline(2, 4, 5 - f, darken(m, 0.25));
    g.set(3 + leg(p), s - 1, 0xe87a8a);
    g.set(5 - leg(p), s - 1, 0xe87a8a);
  },
  // 물탱크 누수: 출렁이는 물덩어리 + 머리에 박힌 녹슨 밸브 + 흘러내리는 물줄기
  rf_leak(g, s, m, a, p) {
    const sq = p.atk === 1 ? 1 : p.atk === 2 ? -1 : 0;
    const f = p.f * 0.5;
    g.ellipse(s / 2, s - 5 + f, 6.5 + sq, 4.8 - sq + (p.step % 2 ? 0.4 : 0), m);
    g.ellipse(s / 2, s - 8 + f, 4.5, 3.5, m);
    g.ellipse(s / 2 - 2, s - 9 + f, 2, 1.5, a);
    g.set(s / 2 + 3, s - 6, lighten(m, 0.3));
    // 밸브 (녹슨 손잡이)
    g.vline(s / 2, s - 13 + f, s - 11 + f, 0x8a5a3a);
    g.hline(s / 2 - 2, s / 2 + 2, s - 13 + f, 0xb07040);
    // 물줄기 방울
    g.set(1 + leg(p), s - 2, a);
    g.set(s - 2, s - 3 - (p.f ? 1 : 0), a);
    eyes(g, s / 2 - 2, s - 6 + f, 4, p);
    if (p.atk) g.hline(s / 2 - 1, s / 2 + 1, s - 4 + f, OUT);
  },
  // 물방울: 위가 뾰족한 물방울 + 반짝이
  rf_droplet(g, s, m, a, p) {
    const f = lift(p);
    const cx = s / 2;
    for (let y = 0; y < 4; y++) g.hline(cx - y * 0.5, cx + y * 0.5, 1 + y - f, m);
    g.ellipse(cx, s - 3.5 - f, 3.5, 3, m);
    g.set(cx - 1, s - 5 - f, a);
    g.set(cx - 2, s - 4 - f, a);
    eyes(g, cx - 1, s - 3 - f, 2, p);
  },
  // 날리는 서류 뭉치: 엇갈려 펄럭이는 종이 세 장 + 글줄 + 클립, 모서리가 바람에 접힌다
  rf_papers(g, s, m, a, p) {
    const f = flap(p);
    const lean = p.atk ? 1 : 0;
    // 뒷장 둘: 바람에 들려 비스듬히
    for (let y = 0; y < 7; y++) g.hline(1 + Math.floor(y / 2), 7 + Math.floor(y / 2), 1 + y - f, darken(m, 0.18));
    for (let y = 0; y < 7; y++) g.hline(5 - Math.floor(y / 3) + lean, 11 - Math.floor(y / 3) + lean, 2 + y + f, darken(m, 0.08));
    // 앞장 (글줄·도장)
    g.rect(2 - lean, 5, 8, 7, m);
    for (let y = 7; y < 11; y += 2) g.hline(3 - lean, 7 - lean, y, a);
    g.rect(7 - lean, 9, 2, 2, 0xd83a3a);
    // 접힌 귀퉁이
    g.set(9 - lean, 5, darken(m, 0.3));
    g.set(8 - lean, 5, darken(m, 0.3));
    g.set(9 - lean, 6, darken(m, 0.3));
    g.vline(3 - lean, 4, 6, 0xc8ccd4);
    eyes(g, 4 - lean, 6, 3, p);
    if (p.step >= 0) {
      g.set(0, 4 + leg(p), WHITE);
      g.set(11, 1 + leg(p), WHITE);
    }
  },
  // 고장난 피뢰침: 볼트 박힌 받침 상자(얼굴) + 기울어진 쇠 기둥 + 끝에서 튀는 노란 불꽃 + 구리 접지선
  rf_rod_broken(g, s, m, a, p) {
    const f = p.f * 0.5;
    // 기운 기둥
    line(g, 6, 9 - f, 12, 1 - f, m);
    line(g, 7, 9 - f, 13, 1 - f, lighten(m, 0.3));
    g.set(13, 0, lighten(m, 0.5));
    // 불꽃
    const sp = p.atk ? 2 : p.f;
    g.set(14, 0 + sp, a);
    g.set(11 + sp, 0, a);
    if (p.atk) {
      g.set(15, 2, a);
      g.set(12, 0, 0xffffff);
    }
    // 받침 상자 (얼굴)
    g.rect(2, 8 - f, 10, 6, darken(m, 0.15));
    shade(g, darken(m, 0.15), 9 - f, 12 - f);
    g.set(3, 9 - f, 0xd8dce4);
    g.set(10, 9 - f, 0xd8dce4);
    eyes(g, 5, 11 - f, 3, p, a);
    // 구리 선
    g.hline(0, 2, 13 - f, 0xb07a3a);
    g.set(0, 14, 0xb07a3a);
    g.rect(3 + leg(p), s - 2, 2, 2, 0x3a3e46);
    g.rect(9 - leg(p), s - 2, 2, 2, 0x3a3e46);
  },
  // 미끄러지는 택배 상자: 골판지 + 파란 테이프 + 「파손 주의」 빨간 잔 + 덮개 틈 눈
  rf_parcel(g, s, m, a, p) {
    const f = p.atk === 2 ? 0 : p.f * 0.5;
    const y0 = 4 - f;
    g.rect(1, y0, s - 2, s - 5, m);
    shade(g, m, y0 + 1, s - 3);
    // 덮개 (들썩)
    const open = p.atk ? 2 : flap(p);
    g.hline(1, s / 2 - 1, y0 - open, lighten(m, 0.2));
    g.hline(s / 2, s - 2, y0, lighten(m, 0.2));
    g.rect(2, y0 - open + 1, 4, 1, 0x1a1410);
    eyes(g, 3, y0 + 1 - open, 2, p, WHITE);
    // 테이프
    g.vline(s / 2, y0, s - 2, a);
    g.hline(1, s - 2, y0 + 5, a);
    // 파손 주의
    g.rect(3, y0 + 7, 3, 3, 0xd83a3a);
    g.set(4, y0 + 7, m);
    g.set(s - 4, y0 + 7, 0x2a2a2a);
    g.set(s - 4, y0 + 8, 0x2a2a2a);
    // 미끄러진 물보라 (걸을 때)
    if (p.step >= 0) {
      g.set(0, s - 1, 0x9ad0f0);
      g.set(1 + leg(p), s - 2, 0x9ad0f0);
    }
  },
  // 옥상 고양이: 옆모습 검은 고양이, 노란 눈, 쫑긋 귀, 위로 말린 꼬리. 공격하면 앞발을 든다
  rf_cat(g, s, m, a, p) {
    const f = p.f * 0.5;
    g.ellipse(5, 7.5 - f, 4.5, 2.6, m);
    g.ellipse(9, 5 - f, 2.6, 2.4, m);
    g.set(8, 2 - f, m);
    g.set(10, 2 - f, m);
    g.set(8, 3 - f, 0x6a3a4a);
    g.set(10, 3 - f, 0x6a3a4a);
    if (p.hurt) g.hline(9, 10, 5 - f, a);
    else {
      g.set(9, 5 - f, a);
      g.set(11, 5 - f, a);
    }
    g.set(11, 6 - f, 0xe88aa0);
    // 꼬리
    const tw = p.f ? 1 : 0;
    g.vline(0, 3 - f - tw, 7 - f, m);
    g.set(1, 2 - f - tw, m);
    // 다리
    const l = leg(p);
    g.vline(2 + l, 9, s - 1, m);
    g.vline(4 - l, 9, s - 1, m);
    if (p.atk) {
      g.set(11, 7 - f, m);
      g.set(12, 6 - f, m);
    } else {
      g.vline(7 - l, 9, s - 1, m);
      g.vline(9 + l, 9, s - 1, m);
    }
    g.set(5, 6 - f, lighten(m, 0.25));
  },
  // 정전기 불꽃: 뾰족뾰족한 노란 별 + 파란 테두리 번쩍임
  rf_spark(g, s, m, a, p) {
    const cx = s / 2;
    const cy = s / 2;
    g.ellipse(cx, cy, 2.5, 2.5, m);
    const rot = (p.f + Math.max(0, p.step)) % 2;
    const arms = rot ? [[0, -4], [4, 0], [0, 4], [-4, 0]] : [[3, -3], [3, 3], [-3, 3], [-3, -3]];
    for (const [dx, dy] of arms) {
      line(g, cx, cy, cx + dx, cy + dy, m);
      g.set(cx + dx, cy + dy, a);
    }
    g.set(cx, cy, 0xffffff);
    eyes(g, cx - 1, cy, 2, p);
  },
  // 정예 풍향계 수탉: 기둥 + 동서남북 십자 + 화살 위에 선 녹슨 수탉 (빨간 볏)
  rf_vane(g, s, m, a, p) {
    const f = p.f * 0.5;
    const cx = 10;
    // 기둥·받침
    g.vline(cx, 12 - f, s - 3, 0x6a707a);
    g.hline(cx - 3, cx + 3, s - 2, 0x6a707a);
    g.set(cx - 4 + leg(p), s - 1, darken(a, 0.2));
    g.set(cx + 4 - leg(p), s - 1, darken(a, 0.2));
    g.hline(cx - 5, cx + 5, 15 - f, 0x6a707a);
    g.set(cx - 6, 15 - f, 0xe8c040);
    g.set(cx + 6, 15 - f, 0xe8c040);
    // 화살 (밝은 쇠)
    const steel = 0x8a92a0;
    g.hline(1, s - 3, 11 - f, steel);
    g.set(s - 2, 11 - f, steel);
    g.set(s - 3, 10 - f, steel);
    g.set(s - 3, 12 - f, steel);
    g.rect(1, 9 - f, 2, 5, steel);
    g.set(0, 9 - f, steel);
    g.set(0, 13 - f, steel);
    // 수탉
    const ruffle = p.atk ? 1 : 0;
    g.ellipse(9, 7 - f, 5 + ruffle, 3, m);
    g.ellipse(13, 4 - f, 2.2, 2.2, m);
    g.rect(3 - ruffle, 2 - f, 3, 4, m);
    g.set(2 - ruffle, 1 - f, darken(m, 0.2));
    g.set(4, 1 - f, darken(m, 0.2));
    g.rect(12, 1 - f, 3, 1, 0xd83a2a);
    g.set(13, 0 - f, 0xd83a2a);
    g.set(15, 5 - f, 0xf0c040);
    g.set(14, 6 - f, 0xd83a2a);
    shade(g, m, 5 - f, 9 - f);
    for (let k = 0; k < 5; k++) g.set(6 + k * 2, 7 - f, darken(m, 0.35));
    if (p.hurt) g.hline(13, 14, 4 - f, EYE);
    else g.set(14, 4 - f, EYE);
    if (p.atk) g.set(15, 4 - f, 0xffffff);
  },
  // 우두머리 피뢰침: 쇠 삼각 다리 + 애자(흰 원판) 기둥 + 구리 코일 + 왕관 끝에서 튀는 번개 + 가운데 노란 눈 + 양옆 접지선 팔
  rf_lightning_rod(g, s, m, a, p) {
    const f = p.f;
    const cx = s / 2;
    // 다리 셋
    line(g, cx - 3, 30 - f, cx - 14 - leg(p), s - 2, darken(m, 0.25));
    line(g, cx - 2, 30 - f, cx - 13 - leg(p), s - 2, darken(m, 0.1));
    line(g, cx + 3, 30 - f, cx + 14 + leg(p), s - 2, darken(m, 0.25));
    line(g, cx + 2, 30 - f, cx + 13 + leg(p), s - 2, darken(m, 0.1));
    g.vline(cx, 30 - f, s - 2, darken(m, 0.2));
    g.hline(cx - 9, cx + 9, 36 - f, darken(m, 0.3));
    g.rect(cx - 16 - leg(p), s - 2, 5, 2, 0x2a2e34);
    g.rect(cx + 12 + leg(p), s - 2, 5, 2, 0x2a2e34);
    // 몸통 기계 상자
    g.rect(cx - 7, 21 - f, 14, 10, m);
    shade(g, m, 22 - f, 29 - f);
    g.hline(cx - 7, cx + 6, 21 - f, lighten(m, 0.3));
    // 눈 (노란 빛)
    const eyeC = p.hurt ? 0xffffff : a;
    g.rect(cx - 4, 24 - f, 8, 4, 0x1a1c22);
    if (p.hurt) g.hline(cx - 3, cx + 2, 26 - f, eyeC);
    else {
      g.rect(cx - 3, 25 - f, 2, 2, eyeC);
      g.rect(cx + 1, 25 - f, 2, 2, eyeC);
      if (p.atk) {
        g.hline(cx - 4, cx - 1, 24 - f, eyeC);
        g.hline(cx, cx + 3, 24 - f, eyeC);
      }
    }
    // 애자 기둥
    g.vline(cx - 1, 6 - f, 20 - f, lighten(m, 0.2));
    g.vline(cx, 6 - f, 20 - f, lighten(m, 0.4));
    for (const y of [9, 13, 17]) {
      g.ellipse(cx, y - f, 4, 1.4, 0xe8e4dc);
      g.hline(cx - 3, cx + 3, y + 1 - f, 0xa8a49c);
    }
    // 구리 코일
    for (let y = 7; y < 20; y += 2) g.set(cx + 2, y - f, 0xc8843a);
    // 왕관 끝
    g.hline(cx - 3, cx + 3, 5 - f, 0xd8dce4);
    for (const dx of [-3, 0, 3]) g.vline(cx + dx, 1 - f - (dx === 0 ? 1 : 0), 4 - f, 0xd8dce4);
    // 번개 (공격·숨쉬기마다 다른 자리)
    const zz = p.atk ? 2 : p.f;
    const bx = cx + (zz === 1 ? 5 : -5);
    line(g, cx, 0, bx, 2, a);
    line(g, bx, 2, bx - (zz === 1 ? 2 : -2), 4, a);
    if (p.atk) {
      line(g, cx + 3, 0, cx + 9, 3, 0xffffff);
      line(g, cx - 3, 0, cx - 9, 3, 0xffffff);
    }
    // 접지선 팔 (공격하면 치켜든다)
    const ay = p.atk ? 16 : 26;
    line(g, cx - 7, 24 - f, cx - 15, ay - f, 0xb07a3a);
    line(g, cx + 7, 24 - f, cx + 15, ay - f, 0xb07a3a);
    g.rect(cx - 17, ay - 1 - f, 3, 3, 0x8a929c);
    g.rect(cx + 14, ay - 1 - f, 3, 3, 0x8a929c);
    if (p.atk) {
      g.set(cx - 18, ay - 2 - f, a);
      g.set(cx + 17, ay - 2 - f, a);
    }
  },
};
