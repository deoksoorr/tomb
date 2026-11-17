// 11/17 포구 갈매기 과자 (순수 규칙 — 서버 gullService · 화면 · 시험 gull.test 가 같은 값을 봐요).
//  - 포구 매점에서 「갈매기 과자」 5P · 「매운 새우 과자」 8P. 하루(게임 날, 새벽 5시) 둘을 합쳐 10개까지 살 수 있어요
//  - 갈매기 가까이에서 E로 던지면 갈매기들이 몰려와 하나가 낚아채요 (같은 바닷가 사람에게도 — 실시간 act "gull"/"gullHot")
//  - 던질 때마다 10%로 「갈매기 깃털」을 떨어뜨려요. 매운 과자를 받아먹은(빨개진) 갈매기면 그중 40%는 「붉은 갈매기 깃털」
//  - 깃털은 발굴품 칸 (lib/forage/catalog GULL_DIGS) — 가방에 들어가고 수집가 유령에게 팔아요. 값은 작게 (3P · 8P)

export type SnackKind = "plain" | "spicy";
export const SNACK_KINDS: readonly SnackKind[] = ["plain", "spicy"];
export const SNACK = {
  plain: { name: "갈매기 과자", price: 5 },
  spicy: { name: "매운 새우 과자", price: 8 },
} as const satisfies Record<SnackKind, { name: string; price: number }>;
/** 하루에 살 수 있는 과자 (두 가지를 합쳐서) */
export const SNACK_DAY_LIMIT = 10;
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

/** 빨간 정도 0..1 (먹은 지 t ms) — 30초 동안 빨갛고 마지막 4초에 서서히 돌아와요 */
export function hotLevel(t: number): number {
  if (t < 0 || t >= HOT_MS) return 0;
  if (t < 600) return t / 600;
  if (t > HOT_MS - HOT_FADE_MS) return (HOT_MS - t) / HOT_FADE_MS;
  return 1;
}

export type GullSnacks = { plain: number; spicy: number; bought: number; limit: number };

export const SNACK_NONE_MSG = "던질 과자가 없어요. 매점에서 사 와요.";
export const SNACK_LIMIT_MSG = `과자는 하루에 ${SNACK_DAY_LIMIT}개까지 살 수 있어요.`;
export const FEATHER_MSG: Record<string, string> = {
  [FEATHER_ID]: "갈매기가 고맙다며 깃털을 떨어뜨렸어요.",
  [RED_FEATHER_ID]: "빨개진 갈매기가 붉은 깃털을 떨어뜨렸어요!",
};
