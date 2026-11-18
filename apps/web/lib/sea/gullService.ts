import { grantGullFeather } from "../forage/service";
import type { DexGain } from "../forage/types";
import { HttpError } from "../http";
import { refundPoints, spendPoints } from "../store";
import { kstDay } from "../store/accounts";
import type { Me } from "../types";
import { rollFeather, SNACK, SNACK_DAY_LIMIT, SNACK_HOLD_MAX, SNACK_LIMIT_MSG, SNACK_NONE_MSG, type GullSnacks, type SnackKind } from "./gull";
import { getGullStore } from "./gullStore";

// 11/17 포구 갈매기 과자 (서버): 과자 자판기에서 사기 (하루 둘 합쳐 10개) · 던지기 (하나 쓰고 깃털 굴리기 — 10%, 매운 과자는 그중 40% 붉은 깃털).
// 서버는 갈매기 위치를 몰라요 (어디서 던져도 같은 값 — 깃털 확률은 던진 횟수로만, 과자는 하루 10개라 남길 이득이 없어요).

const snacks = (s: { plain: number; spicy: number; bought: number }): GullSnacks => ({ plain: s.plain, spicy: s.spicy, bought: s.bought, limit: SNACK_DAY_LIMIT });

export async function gullSnacks(acct: string, now = Date.now()): Promise<GullSnacks> {
  return snacks(await getGullStore().get(acct, kstDay(now)));
}

export type SnackBuyResult = GullSnacks & { me: Me };
const SNACK_FULL_MSG = "과자를 너무 많이 들고 있어요. 갈매기에게 먼저 던져 줘요.";

/**
 * 매점에서 과자 하나. 11/18 보안: 포인트를 먼저 내고 과자를 받는다 (한도·가득이면 돌려줘요).
 * 예전에는 과자를 먼저 넣고 돈이 모자라면 뺐는데, 그 사이에 던지면 공짜로 던지고 개수가 −1이 됐다
 */
export async function buySnack(acct: string, kind: SnackKind, now = Date.now()): Promise<SnackBuyResult> {
  const day = kstDay(now);
  const store = getGullStore();
  // 흔한 거절(한도·가득)은 돈을 내기 전에 (포인트 기록에 냈다 돌려받기가 남지 않게)
  const cur = await store.get(acct, day);
  if (cur.bought >= SNACK_DAY_LIMIT) throw new HttpError(409, "SNACK_LIMIT", SNACK_LIMIT_MSG);
  if (cur[kind] >= SNACK_HOLD_MAX) throw new HttpError(409, "SNACK_FULL", SNACK_FULL_MSG);
  const me = await spendPoints(acct, SNACK[kind].price, `sea:${SNACK[kind].name}`);
  const r = await store.buy(acct, day, kind);
  if (r.status !== "ok") {
    await refundPoints(acct, SNACK[kind].price, `sea:${SNACK[kind].name} 환불`);
    if (r.status === "limit") throw new HttpError(409, "SNACK_LIMIT", SNACK_LIMIT_MSG);
    throw new HttpError(409, "SNACK_FULL", SNACK_FULL_MSG);
  }
  return { ...snacks(r), me };
}

export type SnackThrowResult = GullSnacks & { kind: SnackKind; feather: string | null; dex?: DexGain };
/** 갈매기에게 하나 던지기 → 깃털 (없으면 null). rand는 시험용 */
export async function throwSnack(acct: string, kind: SnackKind, now = Date.now(), ip?: string, rand: () => number = Math.random): Promise<SnackThrowResult> {
  // 쓰고 남은 개수까지 한 번에 받아요 (Redis 1명령)
  const left = await getGullStore().take(acct, kstDay(now), kind);
  if (!left) throw new HttpError(409, "NO_SNACK", SNACK_NONE_MSG);
  const id = rollFeather(kind, rand(), rand());
  let dex: DexGain | undefined;
  let feather: string | null = null;
  if (id) {
    const g = await grantGullFeather(acct, id, now, ip).catch((e) => {
      console.error("[sea/gull] 깃털 넣기 실패", e);
      return null;
    });
    // 가방이 가득 찼으면(같은 것 99개) 떨어뜨리기만 했어요 (도감엔 남아요)
    feather = g?.item ? id : null;
    dex = g?.dex;
  }
  return { ...snacks(left), kind, feather, ...(dex ? { dex } : {}) };
}
