// 11/20 입장 연출 「지옥으로 가는 길」 시간표 (순수 — 그림·소리·글이 같은 표를 본다, ms)
// 밤 돌길 → 하늘이 피빛 폭풍으로 → 붉은 번개에 탑 실루엣 → 빛줄기가 빨개져 나를 비춤(들킴) → 탑이 덮쳐 오고 걸음이 느려짐 → 문이 삐걱 열리며 붉은 빛 → 섬광

export type IntroMode = "normal" | "hell";

/** 걷기 끝 (문 앞에 멈춘다) */
export const WALK_MS = 4800;
/** 하얗게 번쩍이기 시작 · 가장 하얄 때 (이때 등장 컷·싸움을 부른다) · 끝 */
export const FLASH_AT = 4950;
export const FLASH_PEAK = 5350;
export const INTRO_END = 5850;
/** 움직임 줄이기: 이 시각 한 장 (빛줄기에 들킨 순간) */
export const STILL_AT = 2450;
/** 빛줄기가 나를 찾아 멈춤: 돌기 시작 · 고정 · 놓음 */
export const SPOT = { from: 1950, lock: 2200, to: 2850 } as const;
/** 문: 삐걱 시작 · 다 열림 */
export const DOOR = { from: 3950, open: 4650 } as const;

/** 번개 시각 */
export const bolts = (mode: IntroMode): readonly number[] => (mode === "hell" ? [1550, 2450, 3300, 4250] : [1550, 3300]);

/** 글 세 줄 (나타남 · 사라짐) */
export const lines = (mode: IntroMode): readonly { at: number; end: number; text: string; big?: boolean }[] => [
  { at: 250, end: 1450, text: "야근 빌딩 100층 너머" },
  { at: 1600, end: 3150, text: mode === "hell" ? "판교의 등대 · 헬" : "판교의 등대", big: true },
  { at: 3350, end: FLASH_AT, text: "회장님이 기다리고 있어요" },
];

/** 지금 보일 글 (없으면 -1) */
export function lineAt(ms: number, mode: IntroMode): number {
  return lines(mode).findIndex((l) => ms >= l.at && ms < l.end);
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (a: number, b: number, v: number) => {
  const k = clamp((v - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/** 걸음 0..1: 65%까지 같은 빠르기, 그 뒤 문 앞까지 천천히 멈춘다 (속도가 이어진다) */
export function advance(ms: number): number {
  const p = clamp(ms / WALK_MS);
  const a = 0.65;
  const v = 2 / (1 + a);
  return p <= a ? v * p : v * a + v * (p - a) - (v * (p - a) ** 2) / (2 * (1 - a));
}

/** 번개 밝기 0..1 (번쩍-꺼짐-번쩍-잦아듦) */
export function boltFlash(ms: number, mode: IntroMode): number {
  let f = 0;
  for (const b of bolts(mode)) {
    const d = ms - b;
    if (d < 0 || d > 420) continue;
    const v = d < 60 ? 1 : d < 110 ? 0.15 : d < 190 ? 0.85 : 0.85 * (1 - (d - 190) / 230);
    f = Math.max(f, v);
  }
  return f;
}

/** 폭풍 0..1: 천천히 붉어지다 번개마다 한 칸씩 (헬은 처음부터 조금 붉다) */
export function storm(ms: number, mode: IntroMode): number {
  const b = bolts(mode);
  const base = mode === "hell" ? 0.22 : 0;
  const v = base + 0.3 * smooth(0, b[0], ms) + 0.28 * smooth(b[0], b[0] + 260, ms) + 0.3 * smooth(b[0] + 260, 3300, ms) + 0.2 * smooth(3300, 3600, ms);
  return clamp(v);
}

/** 빛줄기가 나를 비추는 정도 0..1 */
export function spot(ms: number): number {
  return smooth(SPOT.from, SPOT.lock, ms) * (1 - smooth(SPOT.to, SPOT.to + 260, ms));
}

/** 문 열림 0..1 (삐걱 — 처음엔 조금, 멈칫, 활짝) */
export function door(ms: number): number {
  const t = ms - DOOR.from;
  if (t <= 0) return 0;
  const span = DOOR.open - DOOR.from;
  return clamp(0.18 * smooth(0, 0.25, t / span) + 0.82 * smooth(0.45, 1, t / span));
}

/** 심장 박동 시각 (점점 빨라진다: 약 64 → 130bpm) */
export function heartTimes(mode: IntroMode): number[] {
  const out: number[] = [];
  const fast = mode === "hell" ? 430 : 470;
  for (let t = 180; t < FLASH_AT; ) {
    out.push(t);
    t += 940 - (940 - fast) * smooth(0, WALK_MS, t);
  }
  return out;
}

/** 박동 울림 0..1 (쿵-쿵 두 번) */
export function pulse(ms: number, beats: readonly number[]): number {
  let v = 0;
  for (const b of beats) {
    const d = ms - b;
    if (d < 0 || d > 420) continue;
    const one = (x: number) => (x < 0 ? 0 : Math.exp(-x / 70));
    v = Math.max(v, one(d), 0.65 * one(d - 170));
  }
  return v;
}

/** 손떨림 크기 0..1 (점점 커지고 번개·들킴에 툭) */
export function shake(ms: number, mode: IntroMode): number {
  return clamp(0.12 + 0.45 * smooth(600, WALK_MS, ms) + 0.5 * boltFlash(ms, mode) + 0.35 * spot(ms) * (1 - smooth(SPOT.lock, SPOT.lock + 300, ms)));
}
