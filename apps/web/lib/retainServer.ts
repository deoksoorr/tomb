import { itemById, type CosmeticSlot } from "@tomb/protocol";
import { HttpError } from "./http";
import {
  FIRST_ALL,
  FIRST_REWARD,
  firstStepById,
  RETIRED_FIRST_STEPS,
  owedPathGifts,
  PATH,
  PATH_WEAR_DAYS,
  pathSince,
  pathView,
  todoDef,
  todoField,
  todoPicks,
  TODO_BONUS_GIFT,
  TODO_COUNT,
  TODO_GIFT,
  TODO_PROT_EVERY,
  TODO_PROT_GIFT,
  type PathGift,
  type Reward,
} from "./retain";
import { todoOpenNow } from "./retainQuest";
import { rewardText } from "./rewardText";
import { grantRpgBundle, isEmptyBundle } from "./rpgGift";
import { earnPointsOnly, getAccounts } from "./store";
import { kstDay, loadMe } from "./store/accounts";
import { forgetTitles } from "./titlesServer";
import type { Me } from "./types";
import type { EarnSource } from "./economy";

// 11/18 둘째 날 다시 오게 (lib/retain.ts) — 서버 판정. 받기는 계정 저장소 Lua 하나로 원자적으로 한 번 (계정 기준, 같은 IP 제한 없음).
// 11/19 첫 걸음·오늘의 할 일은 포인트(지갑 적립 firstSteps·todo) + 사냥 가방, 새 이웃 꾸러미는 아이템 (밀린 것까지 한꺼번에, 모든 계정 소급).
// 포인트·사냥 가방 몫은 받기(Lua)가 성공한 뒤에 넣는다. 오늘의 할 일 진행은 행동 저장소 명령에 실어 올린다 (lib/retainQuest).

const DAY_MS = 86_400_000;

/** 보상 한 칸 넣기 (포인트는 지갑, 꾸러미는 사냥 가방). 실패는 기록만 (받기 표시는 이미 남았다) */
async function grantReward(accountId: string, r: Reward, source: EarnSource): Promise<void> {
  if (r.points && r.points > 0) await earnPointsOnly(accountId, source, r.points).catch((e) => console.error("[retain] 포인트 넣기 실패", source, e));
  if (r.bundle && !isEmptyBundle(r.bundle)) await grantRpgBundle(accountId, r.bundle).catch((e) => console.error("[retain] 사냥 가방 넣기 실패", source, e));
}

// ── 새 이웃 꾸러미 ──

/** gifts = 이번에 받은 꾸러미들 (밀린 것까지) */
export type PathClaimResponse = { me: Me; gift: PathGift; gifts: PathGift[] };

/** 꾸러미들의 사냥 가방 몫을 넣고 표시(gpPot)를 지운다. 실패하면 표시가 남아 다음 받기 때 다시 넣는다 */
async function grantPathBundles(accountId: string, ns: readonly number[]): Promise<void> {
  for (const n of ns) {
    const gift = PATH[n - 1];
    if (gift?.bundle) await grantRpgBundle(accountId, gift.bundle);
  }
  await getAccounts().clearPathPotions(accountId);
}

/** 예전에 못 넣은 사냥 가방 몫이 있으면 다시 (실패해도 받기는 막지 않는다) */
async function retryPathBundles(accountId: string, pending: string | null): Promise<void> {
  const ns = (pending ?? "")
    .split(",")
    .map(Number)
    .filter((n) => n >= 1 && n <= PATH.length);
  if (!ns.length) return;
  await grantPathBundles(accountId, ns).catch((e) => console.error("[retain] 사냥 가방 다시 넣기 실패", e));
}

export async function claimGiftPath(accountId: string, now = Date.now()): Promise<PathClaimResponse> {
  const accounts = getAccounts();
  const day = kstDay(now);
  const a = await accounts.get(accountId, day, now);
  await retryPathBundles(accountId, a.retain.gpPot);
  const v = pathView(pathSince(a.createdAt, a.lifetimePoints, now), a.retain.gp, a.retain.gpSeen, day);
  if (!v) throw new HttpError(409, "PATH_CLOSED", "꾸러미를 모두 받았어요.");
  if (!v.canClaim) throw new HttpError(409, "PATH_TODAY", "지금 받을 꾸러미가 없어요. 내일 새벽 5시에 다음 꾸러미가 열려요.");
  const gifts = owedPathGifts(v);
  // 같은 아이템은 합친다
  const items = new Map<string, number>();
  for (const g of gifts) for (const it of g.items ?? []) items.set(it.itemId, (items.get(it.itemId) ?? 0) + it.count);
  const wear = gifts.flatMap((g) => {
    const slot = g.wear ? itemById(g.wear)?.slot : undefined;
    return g.wear && slot ? [[g.wear, slot] as const satisfies readonly [string, CosmeticSlot]] : [];
  });
  const pend = gifts.filter((g) => !isEmptyBundle(g.bundle)).map((g) => g.n);
  const r = await accounts.claimGiftPath(
    accountId,
    day,
    v.got,
    { count: gifts.length, items: [...items].map(([itemId, count]) => ({ itemId, count })), wear, until: now + PATH_WEAR_DAYS * DAY_MS, pend },
    now,
  );
  if (!r.ok) throw new HttpError(409, "PATH_STALE", "다른 화면에서 먼저 받았어요. 다시 열어 주세요.");
  if (pend.length) await grantPathBundles(accountId, pend).catch((e) => console.error("[retain] 사냥 가방 넣기 실패 (다음 받기 때 다시)", e));
  // 7번째 = 한정 칭호 조건 (칭호 기억을 지워 알림이 바로 뜨게)
  if (gifts.some((g) => g.title)) forgetTitles(accountId);
  return { me: await loadMe(accounts, accountId, now), gift: gifts[gifts.length - 1], gifts };
}

/** 꾸러미 창이 오늘 저절로 열렸다 (하루 한 번만 저절로 — 서버 기록) */
export async function markPathSeen(accountId: string, now = Date.now()): Promise<{ ok: true }> {
  await getAccounts().markPathSeen(accountId, kstDay(now));
  return { ok: true };
}

// ── 첫 걸음 미션 ──

/** text = 이번에 처음 한 미션의 보상 글귀 (이미 했던 칸이면 없음), points = 그 포인트 */
export type FirstStepResponse = { mask: number; text?: string; points?: number };
export type FirstClaimResponse = { me: Me; text: string };

export async function markFirstStep(accountId: string, stepId: string): Promise<FirstStepResponse> {
  const step = firstStepById(stepId);
  if (!step && RETIRED_FIRST_STEPS.includes(stepId)) return { mask: -1 };
  if (!step) throw new HttpError(400, "INVALID_INPUT", "모르는 미션이에요.");
  const r = await getAccounts().markFirstStep(accountId, step.bit);
  if (!r) return { mask: -1 };
  if (!r.fresh) return { mask: r.mask };
  // 처음 한 칸이면 보상 (칸마다 한 번 — 비트를 켠 쪽만 준다)
  await grantReward(accountId, step.reward, "firstSteps");
  return { mask: r.mask, text: rewardText(step.reward), ...(step.reward.points ? { points: step.reward.points } : {}) };
}

/** 큰 선물 글귀 「1,000P, 고양이 귀 하루권, 결재 서류 10장, 보호 문서 1장」 */
export const firstRewardText = () =>
  [rewardText({ points: FIRST_REWARD.points }), `${itemById(FIRST_REWARD.itemId)?.name ?? "꾸미기"} 하루권`, rewardText({ bundle: FIRST_REWARD.bundle })].filter(Boolean).join(", ");

export async function claimFirstSteps(accountId: string, now = Date.now()): Promise<FirstClaimResponse> {
  const accounts = getAccounts();
  const day = kstDay(now);
  if (!itemById(FIRST_REWARD.itemId)) throw new Error(`[retain] 없는 아이템 ${FIRST_REWARD.itemId}`);
  const r = await accounts.claimFirstSteps(accountId, day, FIRST_ALL, { itemId: FIRST_REWARD.itemId, count: FIRST_REWARD.count }, now);
  if (r === -1) throw new HttpError(409, "FIRST_DONE", "첫 걸음 선물은 이미 받았어요.");
  if (r === -2) throw new HttpError(409, "FIRST_NOT_YET", "아직 다 하지 않았어요.");
  await grantReward(accountId, { points: FIRST_REWARD.points, bundle: FIRST_REWARD.bundle }, "firstSteps");
  return { me: await loadMe(accounts, accountId, now), text: firstRewardText() };
}

// ── 오늘 미션 ──

export type TodoClaimResponse = { me: Me; text: string; points: number };

/** which 0..2 = 그 칸, 3 = 셋 다 한 보너스 (도장이 TODO_PROT_EVERY개 쌓일 때마다 보호 문서 1장 더) */
export async function claimTodo(accountId: string, which: number, now = Date.now()): Promise<TodoClaimResponse> {
  if (!Number.isInteger(which) || which < 0 || which > TODO_COUNT) throw new HttpError(400, "INVALID_INPUT", "모르는 미션이에요.");
  const accounts = getAccounts();
  const day = kstDay(now);
  const kind = which < TODO_COUNT ? todoPicks(day, accountId, todoOpenNow())[which] : null;
  const def = kind ? todoDef(kind)! : null;
  const r = await accounts.claimTodo(accountId, day, which, kind ? todoField(kind) : "_qc", def?.need ?? 0, now);
  if (r === -1) throw new HttpError(409, "TODO_DONE", "이미 받았어요.");
  if (r === -2) throw new HttpError(409, "TODO_NOT_YET", "아직 다 하지 않았어요.");
  const gifts: Reward[] = [def ? TODO_GIFT : TODO_BONUS_GIFT];
  if (!def && r % TODO_PROT_EVERY === 0) gifts.push(TODO_PROT_GIFT);
  for (const g of gifts) await grantReward(accountId, g, "todo");
  return { me: await loadMe(accounts, accountId, now), text: gifts.map(rewardText).join(", "), points: gifts.reduce((n, g) => n + (g.points ?? 0), 0) };
}
