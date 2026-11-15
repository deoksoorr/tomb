import type { SvMonsterId } from "@/lib/rpg/serverRoom";
import { darken, Grid, lighten, type Color } from "../../sprites/pixel";

// 11/15 지하 서버실 몬스터 그림 (monsterArt.ts의 P 표에 끼워 넣는다 — 같은 틀: 자세를 받아 한 프레임을 칠한다, 테두리는 틀이 두른다).
// 종류마다 몸 모양·크기·색이 모두 다르다 (같은 그림에 색만 바꾼 것 없음). 기본 방향은 오른쪽.

type Pose = { f: number; step: number; atk: number; hurt: boolean };
type Paint = (g: Grid, s: number, m: Color, a: Color, p: Pose) => void;

const EYE = 0x141218;
const WHITE = 0xf2f2ee;
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

/** 고리 (속이 빈 타원) */
function ring(g: Grid, cx: number, cy: number, rx: number, ry: number, w: number, c: Color): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const o = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      const i = ((x + 0.5 - cx) / Math.max(0.5, rx - w)) ** 2 + ((y + 0.5 - cy) / Math.max(0.5, ry - w)) ** 2;
      if (o <= 1 && i > 1) g.set(x, y, c);
    }
}

export const SV_PAINT: Record<SvMonsterId, Paint> = {
  // 엉킨 랜선: 둘둘 감긴 파란 케이블 뭉치 + 오른쪽으로 내민 투명 플러그 머리 (꼬리 마디는 게임이 따로 끌고 다닌다)
  sv_tangled_lan(g, s, m, a, p) {
    const f = p.f + lift(p);
    const dk = darken(m, 0.3);
    ring(g, 5, 8 - f * 0.5, 4.5, 3.5, 1.6, m);
    ring(g, 7, 9, 4, 3.2, 1.4, dk);
    ring(g, 4, 10 + f * 0.5, 3, 2.6, 1.2, lighten(m, 0.2));
    // 목 (구불)
    const lunge = p.atk === 2 ? 2 : p.atk === 1 ? -1 : 0;
    g.rect(9, 6 - f, 2 + lunge, 2, m);
    // 플러그 (투명 플라스틱 + 금색 핀)
    const hx = 10 + lunge;
    g.rect(hx, 3 - f, 4, 5, 0xc8dcea);
    g.hline(hx, hx + 3, 3 - f, 0xe8f4ff);
    g.rect(hx + 1, 2 - f, 2, 1, 0x9ab4c8); // 걸쇠
    for (let k = 0; k < 4; k++) g.set(hx + k, 7 - f, p.atk ? a : darken(a, 0.2));
    if (p.atk === 2) g.hline(hx + 1, hx + 3, 8 - f, a);
    eyes(g, hx + 1, 5 - f, 2, p, p.atk ? 0xd03030 : EYE);
  },

  // 과열 팬: 네모난 상자 선풍기, 둥근 망 안에 날개 셋 (프레임마다 각도가 달라 도는 것처럼). 공격 준비면 날개가 시뻘겋게
  sv_hot_fan(g, s, m, a, p) {
    const f = p.f * 0.5;
    const y0 = 1 - f;
    g.rect(1, y0, s - 2, s - 4, m);
    shade(g, m, y0 + 1, s - 6);
    const cx = s / 2;
    const cy = y0 + (s - 4) / 2;
    g.ellipse(cx, cy, 6.5, 6.5, darken(m, 0.55));
    const hot = p.atk ? a : p.hurt ? 0xc8ccd2 : 0x8a92a0;
    const turn = (p.step < 0 ? p.f * 0.6 : p.step * 0.45) + (p.atk === 2 ? 0.3 : 0);
    for (let k = 0; k < 3; k++) {
      const ang = turn + (k * Math.PI * 2) / 3;
      for (let r = 1.5; r < 6; r += 0.5) {
        const w = r < 4 ? 1 : 0.6;
        g.set(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, hot);
        g.set(cx + Math.cos(ang + w * 0.35) * r, cy + Math.sin(ang + w * 0.35) * r, hot);
      }
    }
    g.ellipse(cx, cy, 1.5, 1.5, p.atk ? lighten(a, 0.5) : 0xc8ccd2);
    // 망 가로줄
    for (let y = Math.round(cy - 5); y <= cy + 5; y += 3) for (let x = Math.round(cx - 5); x <= cx + 5; x += 2) if (g.get(x, y) === Grid.rgba(darken(m, 0.55))) g.set(x, y, darken(m, 0.35));
    // 위 모서리 눈 (빨간 경고등)
    eyes(g, 3, y0 + 1, s - 7, p, p.atk ? 0xff3a2a : 0xffb07a);
    // 받침 다리
    g.rect(3, s - 3, 3, 3, darken(m, 0.3));
    g.rect(s - 6, s - 3, 3, 3, darken(m, 0.3));
    if (p.atk === 2) for (let k = 0; k < 3; k++) g.set(s - 1, cy - 3 + k * 3, lighten(a, 0.4));
  },

  // 블루스크린: 받침 없이 떠다니는 납작한 새파란 화면 + 큰 ":(" + 찢어진 줄 (공격하면 ":O" 와 화면이 어긋난다)
  sv_bluescreen(g, s, m, a, p) {
    const f = p.f;
    const y0 = 2 - f;
    g.rect(0, y0, s, 10, 0x2a2e38);
    g.rect(1, y0 + 1, s - 2, 8, m);
    g.hline(1, s - 2, y0 + 1, lighten(m, 0.25));
    const tear = p.atk ? 2 : p.hurt ? -1 : 0;
    // 찢어진 줄 (가로로 밀린 한 줄)
    for (let x = 1; x < s - 1; x++) g.set(x + tear, y0 + 6, x % 3 ? m : lighten(m, 0.4));
    // 얼굴
    g.set(3, y0 + 3, a);
    g.set(3, y0 + 5, a);
    if (p.atk) {
      g.rect(5, y0 + 3, 2, 3, a);
      g.set(5, y0 + 4, m);
    } else {
      g.vline(5, y0 + 3, y0 + 5, a);
      g.set(6, y0 + 2, a);
      g.set(6, y0 + 6, a);
    }
    // 글씨 줄 (오류 코드)
    g.hline(8, 12, y0 + 3, darken(a, 0.25));
    g.hline(8, 11, y0 + 5, darken(a, 0.35));
    g.rect(9, y0 + 7, 3, 1, a);
    // QR 조각
    g.rect(s - 3, y0 + 7, 1, 1, a);
    // 아래로 늘어진 글리치 조각 (둥둥)
    if (!p.hurt) g.rect(4 + (p.f ? 1 : 0), y0 + 11, 3, 1, lighten(m, 0.2));
  },

  // 무한 재부팅: 좁고 키 큰 본체 케이스 (앞 칸·통풍구 눈·초록 전원등), 짧은 다리로 뒤뚱
  sv_reboot(g, s, m, a, p) {
    const f = p.f + lift(p);
    const x0 = 3;
    const w = 10;
    g.rect(x0, 1 - f, w, s - 4, m);
    shade(g, m, 2 - f, s - 7);
    g.vline(x0 + w - 1, 1 - f, s - 4 - f, darken(m, 0.4));
    // 드라이브 칸
    g.rect(x0 + 2, 3 - f, w - 4, 2, 0x4a505c);
    g.hline(x0 + 3, x0 + w - 4, 4 - f, 0x8a92a0);
    // 통풍구 눈
    eyes(g, x0 + 3, 7 - f, 3, p, p.atk ? 0xff5a3a : 0x9aa3ad);
    for (const y of [10, 11]) g.hline(x0 + 2, x0 + w - 3, y - f, darken(m, 0.3));
    // 전원 버튼 + 전원등 (재부팅 고리)
    g.ellipse(x0 + w / 2, s - 7 - f, 1.6, 1.6, p.atk ? a : darken(a, 0.35));
    g.set(x0 + w / 2, s - 8 - f, lighten(a, 0.6));
    // 다리
    g.rect(x0 + 1 + leg(p), s - 3, 2, 3, darken(m, 0.5));
    g.rect(x0 + w - 3 - leg(p), s - 3, 2, 3, darken(m, 0.5));
  },

  // 랜섬 자물쇠: 금빛 자물쇠 몸통 + 회색 고리, 붉은 해골 열쇠 구멍, 양옆에 늘어진 사슬
  sv_ransom_lock(g, s, m, a, p) {
    const f = p.f + lift(p) * 0.5;
    // 고리 (공격하면 들썩)
    const up = p.atk ? 1 : 0;
    ring(g, s / 2, 6 - f - up, 4.5, 5, 1.5, 0xa8b0bc);
    g.rect(2, 6 - f, s - 4, 8, m);
    shade(g, m, 7 - f, 12 - f);
    g.hline(2, s - 3, 6 - f, lighten(m, 0.4));
    // 해골 열쇠 구멍
    g.ellipse(s / 2, 9 - f, 2, 1.6, a);
    g.set(s / 2 - 1, 9 - f, EYE);
    g.set(s / 2 + 1, 9 - f, EYE);
    g.rect(s / 2 - 0.5, 11 - f, 2, 2, a);
    // 노려보는 눈썹
    if (!p.hurt) {
      g.set(4, 8 - f, darken(m, 0.6));
      g.set(s - 5, 8 - f, darken(m, 0.6));
    }
    // 사슬
    for (let k = 0; k < 3; k++) {
      g.set(1, 9 + k * 2 - f + (k % 2), 0x8a92a0);
      g.set(s - 2, 9 + k * 2 - f + ((k + 1) % 2), 0x8a92a0);
    }
    g.rect(4 + leg(p), s - 1, 2, 1, darken(m, 0.5));
    g.rect(s - 6 - leg(p), s - 1, 2, 1, darken(m, 0.5));
  },

  // 무선 공유기: 납작한 흰 상자 + 안테나 셋 (공격하면 와이파이 물결), 앞의 파란 불빛 줄
  sv_wifi_router(g, s, m, a, p) {
    const f = p.f * 0.5;
    const y0 = 8 - f;
    g.rect(1, y0, s - 2, 4, m);
    g.hline(1, s - 2, y0, lighten(m, 0.3));
    g.hline(1, s - 2, y0 + 3, darken(m, 0.25));
    for (let k = 0; k < 4; k++) g.set(3 + k * 2, y0 + 2, p.f && k % 2 ? darken(a, 0.4) : a);
    // 안테나 (공격 준비면 바짝 선다)
    const tilt = p.atk ? 0 : 1;
    g.vline(2, y0 - 6, y0 - 1, 0x3a3f4a);
    g.set(2 - tilt, y0 - 7, 0x3a3f4a);
    g.vline(s / 2, y0 - 7, y0 - 1, 0x3a3f4a);
    g.vline(s - 3, y0 - 6, y0 - 1, 0x3a3f4a);
    g.set(s - 3 + tilt, y0 - 7, 0x3a3f4a);
    if (p.atk) {
      ring(g, s / 2, y0 - 4, 5, 3.5, 1, a);
      for (let x = 0; x < s; x++) if (g.get(x, Math.round(y0 - 2)) === Grid.rgba(a)) g.set(x, Math.round(y0 - 2), 0);
    }
    eyes(g, 5, y0 + 1, 4, p, 0x3a3f4a);
    g.rect(3 + leg(p), y0 + 4, 2, 1, 0x8a8a84);
    g.rect(s - 5 - leg(p), y0 + 4, 2, 1, 0x8a8a84);
  },

  // 프린터 걸림: 넓은 사무용 프린터, 위로 구겨진 종이가 삐져나오고 주황 '용지 걸림' 불 (공격하면 종이가 튀어나온다)
  sv_printer_jam(g, s, m, a, p) {
    const f = p.f * 0.5;
    const y0 = 5 - f;
    g.rect(1, y0, s - 2, 10, m);
    shade(g, m, y0 + 1, y0 + 8);
    g.rect(1, y0 + 4, s - 2, 1, darken(m, 0.3));
    // 출력 칸 (어두운 입)
    g.rect(3, y0 + 6, s - 8, 2, 0x3a3f4a);
    if (p.atk === 2) for (let k = 0; k < 3; k++) g.rect(4 + k * 3, y0 + 8, 2, 2, WHITE);
    // 구겨진 종이 (위)
    g.rect(4, y0 - 4 - (p.atk ? 1 : 0), 7, 4, WHITE);
    g.set(6, y0 - 3, 0xc8c4b8);
    g.set(9, y0 - 2, 0xc8c4b8);
    g.set(4, y0 - 4, 0xc8c4b8);
    // 조작판 + 용지 걸림 불
    g.rect(s - 5, y0 + 1, 3, 2, 0x4a505c);
    g.set(s - 4, y0 + 1, p.f || p.atk ? a : darken(a, 0.5));
    eyes(g, 5, y0 + 2, 4, p);
    // 받침 바퀴
    g.rect(2, s - 2, 2, 2, 0x3a3f4a);
    g.rect(s - 4, s - 2, 2, 2, 0x3a3f4a);
  },

  // 엑셀 매크로: 작은 초록 칸 (하얀 격자 + "fx"), 가는 다리로 종종종
  sv_excel_macro(g, s, m, a, p) {
    const f = lift(p);
    g.rect(1, 1 - f, s - 2, s - 4, m);
    g.hline(1, s - 2, 1 - f, lighten(m, 0.3));
    for (const x of [4, 7]) g.vline(x, 2 - f, s - 5 - f, lighten(m, 0.45));
    g.hline(2, s - 3, 4 - f, lighten(m, 0.45));
    // fx
    g.set(2, 2 - f, a);
    g.set(3, 2 - f, a);
    g.set(2, 3 - f, a);
    eyes(g, 3, 6 - f, 4, p, 0x0a2a14);
    if (p.atk) g.hline(4, 6, 8 - f, 0x0a2a14);
    g.vline(3 + leg(p), s - 3, s - 1, darken(m, 0.4));
    g.vline(s - 4 - leg(p), s - 3, s - 1, darken(m, 0.4));
  },

  // 보안 카메라: 벽 받침대에 달린 흰 카메라 몸통, 검은 렌즈와 빨간 녹화 불 (공격 준비면 렌즈가 붉게)
  sv_security_cam(g, s, m, a, p) {
    const f = p.f * 0.5;
    // 받침대 (세로 막대 + 밑판)
    g.rect(2, 6, 2, s - 8, 0x6a707c);
    g.rect(0, s - 3, 6, 3, 0x4a505c);
    // 몸통 (오른쪽으로 기울어진 상자)
    const y0 = 3 - f;
    g.rect(3, y0, 9, 5, m);
    g.rect(4, y0 + 5, 8, 1, darken(m, 0.25));
    g.hline(3, 11, y0, lighten(m, 0.3));
    // 햇빛 가리개
    g.hline(4, 13, y0 - 1, darken(m, 0.15));
    // 렌즈
    g.ellipse(12, y0 + 3, 2, 2, 0x1a1e28);
    g.set(12, y0 + 2, p.atk ? 0xff3a3a : 0x6a9ad0);
    // 녹화 불
    g.set(5, y0 + 2, p.f || p.atk ? a : darken(a, 0.5));
    if (p.hurt) g.hline(7, 9, y0 + 2, 0x3a3f4a);
  },

  // 냉각수 누수: 둥근 파란 냉각수 통 + 새는 호스, 아래로 떨어지는 물방울 (출렁이며 걷는다)
  sv_coolant_leak(g, s, m, a, p) {
    const f = p.f + lift(p);
    const wob = p.step >= 0 ? (p.step % 2 ? 1 : 0) : 0;
    g.ellipse(s / 2 - 1, 8 - f, 5.5 + wob * 0.5, 5.5 - wob * 0.5, m);
    shade(g, m, 5 - f, 11 - f);
    // 물 높이 줄
    g.hline(3, s - 5, 8 - f, lighten(m, 0.35));
    // 뚜껑
    g.rect(s / 2 - 3, 2 - f, 4, 2, 0x3a4a5c);
    // 새는 호스 (오른쪽으로 휘어 나온다)
    g.rect(s - 5, 6 - f, 3, 2, 0x2a3440);
    g.set(s - 2, 8 - f, 0x2a3440);
    g.set(s - 2, 9 - f + (p.f ? 1 : 0), a);
    g.set(s - 2, 11 - f + (p.f ? 0 : 1), a);
    eyes(g, 4, 7 - f, 3, p, 0x0a2a3a);
    if (p.atk) g.hline(4, 7, 10 - f, 0x0a2a3a);
    // 바닥 물방울
    g.set(2 + leg(p), s - 1, a);
    g.set(s - 4 - leg(p), s - 1, a);
    g.rect(4, s - 2, 2, 2, darken(m, 0.4));
    g.rect(s - 7, s - 2, 2, 2, darken(m, 0.4));
  },

  // 백업 테이프 (정예): 크고 검은 테이프 카트리지, 하얀 릴 둘(바퀴살이 돈다)과 베이지 라벨, 풀려나온 갈색 테이프
  sv_backup_tape(g, s, m, a, p) {
    const f = p.f + lift(p);
    const y0 = 3 - f;
    g.rect(1, y0, s - 2, 13, m);
    shade(g, m, y0 + 1, y0 + 11);
    g.hline(1, s - 2, y0, lighten(m, 0.25));
    // 라벨
    g.rect(3, y0 + 1, s - 6, 4, a);
    g.hline(4, s - 5, y0 + 2, 0xd03030);
    g.hline(4, 10, y0 + 3, 0x6a6e78);
    // 릴 둘
    const spin = p.step < 0 ? p.f : p.step;
    for (const cx of [6, s - 7]) {
      g.ellipse(cx, y0 + 9, 3, 3, 0xe8e4dc);
      g.ellipse(cx, y0 + 9, 1.2, 1.2, 0x2a2a32);
      const ang = spin * 0.8 + cx;
      g.set(cx + Math.cos(ang) * 2.2, y0 + 9 + Math.sin(ang) * 2.2, 0x6a5a4a);
      g.set(cx - Math.cos(ang) * 2.2, y0 + 9 - Math.sin(ang) * 2.2, 0x6a5a4a);
    }
    // 테이프 창
    g.rect(9, y0 + 8, 2, 3, 0x5a3a24);
    eyes(g, 8, y0 + 6, 3, p, p.atk ? 0xff4a3a : WHITE);
    // 풀린 테이프 꼬리 (공격하면 채찍처럼)
    const t = p.atk === 2 ? 3 : 1;
    for (let k = 0; k < 4 + t; k++) g.set(s - 2 + Math.min(1, k), y0 + 12 + k * 0.6, 0x7a4a2a);
    g.rect(3 + leg(p), s - 2, 3, 2, darken(m, 0.5));
    g.rect(s - 6 - leg(p), s - 2, 3, 2, darken(m, 0.5));
  },

  // 레거시 시스템 (우두머리): 베이지 메인프레임 — 초록 화면 얼굴(브라운관), 이빨 같은 키보드, 옆구리 테이프 릴·깜빡이는 계기판, 발밑을 기는 케이블 촉수
  sv_legacy_system(g, s, m, a, p) {
    const f = p.f + lift(p) * 0.5;
    const rage = p.atk ? 0xff4a3a : a;
    const y0 = 2 - f;
    // 본체 캐비닛
    g.rect(4, y0 + 6, s - 8, s - 14, m);
    shade(g, m, y0 + 8, s - 12);
    g.vline(4, y0 + 6, s - 9 - f, lighten(m, 0.3));
    g.vline(s - 5, y0 + 6, s - 9 - f, darken(m, 0.35));
    // 위 브라운관 (머리)
    g.rect(9, y0, s - 18, 18, darken(m, 0.15));
    g.rect(10, y0 + 1, s - 20, 16, darken(m, 0.05));
    g.rect(12, y0 + 3, s - 24, 12, 0x0a140c);
    // 화면 글자 줄 (초록 인광)
    for (let y = y0 + 4; y < y0 + 14; y += 2) for (let x = 13; x < s - 13; x++) if ((x * 7 + y * 3) % 5 < 2) g.set(x, y, darken(rage, 0.55));
    // 얼굴: 눈 둘 (치켜뜸) + 입
    const ex = Math.round(s / 2) - 5;
    const ey = y0 + 6;
    if (p.hurt) {
      g.hline(ex - 1, ex + 2, ey + 1, rage);
      g.hline(ex + 8, ex + 11, ey + 1, rage);
    } else {
      g.rect(ex, ey, 3, 3, rage);
      g.rect(ex + 8, ey, 3, 3, rage);
      g.set(ex + 1 + (p.atk ? 1 : 0), ey + 1, 0x0a140c);
      g.set(ex + 9 + (p.atk ? 1 : 0), ey + 1, 0x0a140c);
      if (p.atk) {
        g.hline(ex - 1, ex + 3, ey - 1, rage);
        g.hline(ex + 7, ex + 11, ey - 1, rage);
      }
    }
    g.hline(ex + 1, ex + 9, ey + 6, rage);
    if (p.atk === 2) g.hline(ex + 2, ex + 8, ey + 7, rage);
    // 키보드 이빨
    g.rect(8, y0 + 19, s - 16, 4, lighten(m, 0.15));
    for (let x = 9; x < s - 9; x += 2) g.set(x, y0 + 20, darken(m, 0.35));
    for (let x = 10; x < s - 9; x += 2) g.set(x, y0 + 21, darken(m, 0.35));
    // 옆구리 테이프 릴 (왼쪽 둘)
    for (const cy of [y0 + 26, y0 + 32]) {
      g.ellipse(9, cy, 3.4, 3.4, 0x3a3a40);
      g.ellipse(9, cy, 2, 2, 0xd8d4c8);
      g.set(9 + (p.f ? 1 : -1), cy, 0x3a3a40);
    }
    // 계기판 불빛 (오른쪽)
    for (let k = 0; k < 8; k++) {
      const on = (k + p.f + (p.step < 0 ? 0 : p.step)) % 3 === 0;
      g.set(s - 11 + (k % 4) * 2, y0 + 26 + Math.floor(k / 4) * 3, on ? (k % 2 ? 0xffb03a : rage) : 0x3a3a34);
    }
    // 통풍구
    for (let y = y0 + 33; y < y0 + 36; y += 2) g.hline(s - 13, s - 7, y, darken(m, 0.3));
    // 케이블 촉수 (발)
    const lg = leg(p);
    const cols = [0x3a7ad8, 0xd03030, 0xf0d050, 0x3a3f4a];
    for (let k = 0; k < 4; k++) {
      const x = 7 + k * 9;
      const wig = (k % 2 ? lg : -lg) + (p.atk === 2 ? (k < 2 ? -1 : 1) : 0);
      g.vline(x, s - 8 - f, s - 4, cols[k]);
      g.set(x + wig, s - 3, cols[k]);
      g.set(x + wig * 2, s - 2, cols[k]);
      g.set(x + wig * 2 + 1, s - 2, cols[k]);
    }
  },
};
