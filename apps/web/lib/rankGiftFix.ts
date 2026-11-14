import { getAccounts, getGifts } from "./store";
import { CHAMP_POINTS } from "./weeklyChamp";

// 한 번짜리 정리: 관리자 선물·주간 1위 보상 포인트가 모은 포인트(lifetime)·전체 포인트 랭킹에 들어가던 때의 몫을 뺀다.
// 지금은 둘 다 지갑에만 들어간다 (lib/store/gifts.ts GIFT_CLAIM_LUA·accounts-redis.ts CHAMP_LUA). 주간 랭킹은 원래 안 건드렸다.
//  - 선물: 이전 방식 받기(지갑 전용 표시 w: 없이 받음)를 계정별로 모아 선물에 적힌 포인트만큼 (lib/store/gifts.ts legacyGiftPoints)
//  - 1위 보상: 지갑 전용 표시(champ:wallet)가 없는 지급 표시(champ:paid)마다 CHAMP_POINTS (개발용 dev: 표시는 0P라 뺀다)
// 두 번 눌러도 한 번만: 전체 표시(fix:{tag})로 겹쳐 돌지 않게 하고, 계정마다 원자적으로 한 번만 뺀다 (fix:{tag}:acct)

export const RANK_GIFT_FIX_TAG = "giftrank1";
/** 진행 중 표시가 저절로 풀리는 시간 (정리하던 서버가 죽어도 다시 누를 수 있게 — 계정마다 한 번만이라 이어서 해도 두 번 빼지 않는다) */
const RUNNING_TTL_SEC = 300;
/** 한 번에 같이 보내는 계정 수 */
const BATCH = 20;

export type RankGiftFixSummary = {
  at: number;
  /** 정리한 계정 수 (이번에 처음 뺀 계정) */
  accounts: number;
  /** 이미 정리돼 건너뛴 계정 수 (중간에 멈췄다 이어서 한 경우) */
  skipped: number;
  /** 빼야 할 합계 (선물 + 1위 보상) */
  requested: number;
  /** 실제로 뺀 합계 (모은 포인트가 모자라 0에서 멈춘 만큼은 빠진다) */
  deducted: number;
  /** 모은 포인트가 모자라 0에서 멈춘 계정 수 */
  clamped: number;
  gift: { claims: number; deleted: number; ambiguous: number; missing: number; points: number };
  champ: { marks: number; points: number };
};

export type RankGiftFixResponse = { status: "done" | "already" | "busy" | "none"; summary: RankGiftFixSummary | null };

const parse = (v: string | null): RankGiftFixSummary | null => {
  if (!v || v === "running") return null;
  try {
    return JSON.parse(v) as RankGiftFixSummary;
  } catch {
    return null;
  }
};

/** 지금 상태 (none = 아직 안 함, busy = 진행 중, already = 끝남) */
export async function rankGiftFixStatus(): Promise<RankGiftFixResponse> {
  const v = await getAccounts().onceGet(RANK_GIFT_FIX_TAG);
  if (v === null) return { status: "none", summary: null };
  if (v === "running") return { status: "busy", summary: null };
  return { status: "already", summary: parse(v) };
}

/** 정리 한 번 (이미 했으면 그때 결과, 진행 중이면 busy) */
export async function runRankGiftFix(now = Date.now()): Promise<RankGiftFixResponse> {
  const accounts = getAccounts();
  const cur = await accounts.onceBegin(RANK_GIFT_FIX_TAG, RUNNING_TTL_SEC);
  if (cur === "running") return { status: "busy", summary: null };
  if (cur !== null) return { status: "already", summary: parse(cur) };
  try {
    const [gift, marks] = await Promise.all([getGifts().legacyClaims(), accounts.legacyChampMarks()]);
    const per = new Map(gift.perAccount);
    const champMarks = marks.filter((m) => !m.mark.startsWith("dev:"));
    for (const m of champMarks) per.set(m.accountId, (per.get(m.accountId) ?? 0) + CHAMP_POINTS);
    const summary: RankGiftFixSummary = {
      at: now,
      accounts: 0,
      skipped: 0,
      requested: 0,
      deducted: 0,
      clamped: 0,
      gift: {
        claims: gift.claims,
        deleted: gift.deleted,
        ambiguous: gift.ambiguous,
        missing: gift.missing,
        points: [...gift.perAccount.values()].reduce((a, b) => a + b, 0),
      },
      champ: { marks: champMarks.length, points: champMarks.length * CHAMP_POINTS },
    };
    const rows = [...per].filter(([, n]) => n > 0);
    for (let i = 0; i < rows.length; i += BATCH) {
      const part = rows.slice(i, i + BATCH);
      const res = await Promise.all(part.map(([id, n]) => accounts.unrankOnce(RANK_GIFT_FIX_TAG, id, n)));
      res.forEach((r, j) => {
        if (!r) return void summary.skipped++;
        const n = part[j][1];
        summary.accounts++;
        summary.requested += n;
        summary.deducted += r.before - r.after;
        if (r.before - r.after < n) summary.clamped++;
      });
    }
    await accounts.onceEnd(RANK_GIFT_FIX_TAG, JSON.stringify(summary));
    return { status: "done", summary };
  } catch (e) {
    // 다시 누를 수 있게 진행 중 표시를 푼다 (이미 뺀 계정은 계정별 표시로 다시 빼지 않는다)
    await accounts.onceEnd(RANK_GIFT_FIX_TAG, null).catch(() => undefined);
    throw e;
  }
}
