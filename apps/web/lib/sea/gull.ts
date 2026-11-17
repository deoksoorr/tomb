// 11/17 포구 갈매기 과자 (순수 규칙 — 서버 gullService · 화면 · 시험 gull.test 가 같은 값을 봐요).
//  - 포구 매점에서 「갈매기 과자」 5P · 「매운 새우 과자」 8P. 하루(게임 날, 새벽 5시) 둘을 합쳐 10개까지 살 수 있어요
//    (11/17 r2 선착장 길목의 「과자 자판기」로 옮겼어요 — 값·한도는 그대로)
//  - 던지면(r2 F 키·과자 칸 버튼 — 백사장·갯벌·선착장·방파제 어디서든) 가장 가까운 갈매기 쪽으로 날아가 갈매기들이 몰려와 하나가 낚아채요 (같은 바닷가 사람에게도 — 실시간 act "gull"/"gullHot")
//  - 던질 때마다 10%로 「갈매기 깃털」을 떨어뜨려요. 매운 과자를 받아먹은(빨개진) 갈매기면 그중 40%는 「붉은 갈매기 깃털」
//  - 깃털은 발굴품 칸 (lib/forage/catalog GULL_DIGS) — 가방에 들어가고 수집가 유령에게 팔아요. 값은 작게 (3P · 8P)

export type SnackKind = "plain" | "spicy";
export const SNACK_KINDS: readonly SnackKind[] = ["plain", "spicy"];
export const SNACK = {
  plain: { name: "갈매기 과자", price: 5 },
  spicy: { name: "매운 새우 과자", price: 8 },
} as const satisfies Record<SnackKind, { name: string; price: number }>;
/**
 * 하루에 살 수 있는 과자 (두 가지를 합쳐서). 11/17 사용자 요청으로 사실상 풀었다 (10 → 9999).
 * 과자 값(5·8P)이 깃털 기대값(약 0.3~0.4P)보다 훨씬 커서 많이 사도 포인트를 버는 길이 안 생긴다 (포인트를 쓰는 곳). 들고 있는 상한(SNACK_HOLD_MAX)은 그대로
 */
export const SNACK_DAY_LIMIT = 9999;
/** 이보다 크면 하루 한도가 없는 것으로 보고 화면에 남은 개수를 안 보여 줘요 */
export const SNACK_NO_LIMIT = 1000;
/** 한 사람이 들고 있을 수 있는 과자 (가지마다) */
export const SNACK_HOLD_MAX = 30;
/** 던질 때 깃털이 떨어질 확률 · 매운 과자 깃털 중 붉은 깃털 */
export const FEATHER_CHANCE = 0.1;
export const RED_FEATHER_SHARE = 0.4;
export const FEATHER_ID = "d_gullfeather";
export const RED_FEATHER_ID = "d_redfeather";
/** 매운 과자를 먹은 갈매기가 빨간 시간 (ms) · 서서히 돌아오는 시간 */
export const HOT_MS = 30_000;
export const HOT_FADE_MS = 4_000;

/** 깃털 굴리기 (r1·r2 = [0,1) 난수 — 서버가 굴려요) */
export function rollFeather(kind: SnackKind, r1: number, r2: number): string | null {
  if (r1 >= FEATHER_CHANCE) return null;
  return kind === "spicy" && r2 < RED_FEATHER_SHARE ? RED_FEATHER_ID : FEATHER_ID;
}

/** 처음 빨개지는 데 걸리는 시간 (ms) */
export const HOT_RAMP_MS = 600;

/** 빨간 정도 0..1 (먹은 지 t ms) — 30초 동안 빨갛고 마지막 4초에 서서히 돌아와요. ramp = 하얀 데서 빨개지는 0.6초를 거치는지 */
export function hotLevel(t: number, ramp = true): number {
  if (t < 0 || t >= HOT_MS) return 0;
  if (ramp && t < HOT_RAMP_MS) return t / HOT_RAMP_MS;
  if (t > HOT_MS - HOT_FADE_MS) return (HOT_MS - t) / HOT_FADE_MS;
  return 1;
}

/**
 * 11/17 r2 빨개진 갈매기 상태 (화면마다 — 먹은 때 · 하얀 데서 빨개지는 단계를 거치는지).
 * 사용자 "빨간 갈매기가 매운 과자를 또 먹으러 오다 하얘졌어요" → 이미 빨가면 하얘지지 않고 빨간 채로 30초를 다시 세요
 */
export type GullHot = { at: number; ramp: boolean };

/** 지금 빨간 정도 0..1 */
export function gullHotLevel(h: GullHot | null, now: number): number {
  return h ? hotLevel(now - h.at, h.ramp) : 0;
}

/** 빨간 시간이 끝났는지 (없으면 true) */
export function gullHotOver(h: GullHot | null, now: number): boolean {
  return !h || now - h.at >= HOT_MS;
}

/** 매운 과자를 먹었어요: 하얀 갈매기는 0.6초에 걸쳐 빨개지고, 이미 빨간(빠지는 중이어도) 갈매기는 바로 꽉 찬 빨강으로 30초 다시 */
export function eatSpicy(h: GullHot | null, now: number): GullHot {
  return { at: now, ramp: gullHotLevel(h, now) <= 0 };
}

/**
 * 매운 과자를 먹으러 달려가요: 빨간 갈매기는 오는 동안 빨간 시간을 멈춰 두고 꽉 찬 빨강으로 붙잡아요 (먹는 순간 eatSpicy가 30초로 다시 늘려요).
 * 돌려주는 값 = 붙잡아 둘 지난 시간 (오는 동안 매 프레임 heldHot으로 써요 — 빠지는 중이었으면 빠지기 전으로). 못 받아먹고 떠나면 거기서 다시 흘러요.
 * 일반 과자·하얀 갈매기는 null (일반 과자는 빨간 시간이 끝날 때까지 빨간 채로 · 하얀 갈매기는 먹고 나서 빨개져요)
 */
export function holdHot(h: GullHot | null, now: number, spicy: boolean): number | null {
  if (!spicy || !h || gullHotLevel(h, now) <= 0) return null;
  return Math.min(Math.max(now - h.at, HOT_RAMP_MS), HOT_MS - HOT_FADE_MS - 1);
}
/** 붙잡아 둔 지난 시간으로 지금 상태 (꽉 찬 빨강 — 하얀 데서 빨개지는 단계 없이) */
export function heldHot(held: number, now: number): GullHot {
  return { at: now - held, ramp: false };
}

export type GullSnacks = { plain: number; spicy: number; bought: number; limit: number };

export const SNACK_NONE_MSG = "던질 과자가 없어요. 과자 자판기에서 사 와요.";
export const SNACK_LIMIT_MSG = `과자는 하루에 ${SNACK_DAY_LIMIT}개까지 살 수 있어요.`;
export const FEATHER_MSG: Record<string, string> = {
  [FEATHER_ID]: "갈매기가 고맙다며 깃털을 떨어뜨렸어요.",
  [RED_FEATHER_ID]: "빨개진 갈매기가 붉은 깃털을 떨어뜨렸어요!",
};
