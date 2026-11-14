import { CHAMP_BOARDS, CHAMP_HAT, itemById, PERMANENT_UNTIL, type ChampBoard } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { z } from "zod";
import { env } from "@/lib/env";
import { getFishRank } from "@/lib/forage/fishRank";
import { handler, HttpError, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { kstWeek, weekOfDay } from "@/lib/store/accounts";
import { weekStartMs } from "@/lib/store/champ";
import { readBody } from "@/lib/validate";
import { prevWeek, settleChamps } from "@/lib/weeklyChamp";

const DevSchema = z.discriminatedUnion("action", [
  // 그 주 랭킹에 기록 남기기 (기본: 나). value = 포인트 P · 처치 수 · 크기 cm×10
  z.object({
    action: z.literal("seed"),
    week: z.enum(["last", "this", "ago2", "ago3"]),
    boards: z.array(z.enum(CHAMP_BOARDS)).min(1),
    value: z.number().int().min(1).max(5000),
    accountId: z.string().optional(),
  }),
  // 이름·모습이 있는 시험용 계정 만들기 (시상대용)
  z.object({ action: z.literal("bot"), name: z.string().min(1).max(12), color: z.string(), body: z.string().optional(), look: z.array(z.string()).max(7).default([]) }),
  // 지난 주 1위 정리·지급 (weeksAgo = 몇 주 전, 기능을 연 주보다 이른 개발 날짜에서도)
  z.object({ action: z.literal("settle"), weeksAgo: z.number().int().min(1).max(4).default(1) }),
]);

/**
 * 개발 전용 (운영 404): 주간 1위 보상·레이스 화면 QA. 랭킹 기록 심기 · 시험 계정 만들기 · 지난주 정리를 바로 해 본다.
 * 포인트는 그 주 날짜에 사냥 적립(하루 600P 한도)으로 나눠 넣는다
 */
export const POST = handler(async (req) => {
  if (env.isProd()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  const visitorId = await requireVisitor(req);
  const body = await readBody(req, DevSchema);
  const accounts = getAccounts();
  const now = Date.now();
  if (body.action === "settle") {
    let week = kstWeek(now);
    for (let i = 0; i < body.weeksAgo; i++) week = prevWeek(week);
    return json(await settleChamps(week, now, { minWeek: "0" }));
  }
  if (body.action === "bot") {
    const id = nanoid(21);
    await accounts.enter(id, { name: body.name, color: body.color, body: body.body ?? "hood" }, now);
    for (const itemId of body.look) {
      const slot = itemById(itemId)?.slot;
      if (slot) await accounts.grantChamp(id, `dev:${id}:${itemId}`, itemId, slot, PERMANENT_UNTIL, 0, now);
    }
    // 벗어 둔 꾸미기를 입힌다
    for (const itemId of body.look) {
      const slot = itemById(itemId)?.slot;
      if (slot) await accounts.wear(id, itemId, slot, now);
    }
    return json({ accountId: id });
  }
  const who = body.accountId ?? visitorId;
  const back = { this: 0, last: 1, ago2: 2, ago3: 3 }[body.week];
  let week = kstWeek(now);
  for (let i = 0; i < back; i++) week = prevWeek(week);
  const start = weekStartMs(week);
  for (const b of body.boards as ChampBoard[]) {
    if (b === "points") {
      let left = body.value;
      for (let d = 0; left > 0 && d < 7; d++) {
        const day = new Date(start + d * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10).replaceAll("-", "");
        if (weekOfDay(day) !== week) break;
        left -= await accounts.earn(who, "hunt", day, { amount: Math.min(600, left) });
      }
    } else if (b === "huntKills") await accounts.recordHunt(who, "easy", { kills: body.value, clearMs: null }, week);
    else await getFishRank().record(who, "f_carp", body.value, week);
  }
  return json({ ok: true, week, hat: body.boards.map((b) => CHAMP_HAT[b as ChampBoard]) });
});
