import { nanoid } from "nanoid";
import { z } from "zod";
import { resetChairRankCache } from "@/lib/chairman/service";
import { resetChairMemo, settleChair } from "@/lib/chairman/settle";
import { getChairStore } from "@/lib/chairman/store";
import { CHAIR_TICKET_MS, chairWeek } from "@/lib/chairman/rules";
import { env } from "@/lib/env";
import { gameDay, prevWeek, weekEndMs } from "@/lib/gameDay";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import type { SkillId } from "@/lib/rpg/catalog";
import { getRpgStore } from "@/lib/rpg/store";
import { requireVisitor } from "@/lib/session";
import { forgetTitles, forgetTowerTitles } from "@/lib/titlesServer";
import { getAccounts } from "@/lib/store";
import { readBody } from "@/lib/validate";

const Mode = z.enum(["normal", "hell"]);
const DevSchema = z.discriminatedUnion("action", [
  // 내 야근 빌딩 최고 층 (자격 100층)
  // kit: 지옥 봉인 확인용 스킬·단축키 (불씨 계열 액티브 + 패시브)
  z.object({ action: z.literal("floor"), floor: z.number().int().min(0).max(999).default(120), kit: z.boolean().default(false) }),
  // 이번 주 랭킹에 시험 계정 기록 심기 (+ me면 내 기록도). reset: 그 모드 그 주 기록부터 비운다 (로컬 메모리 저장소만)
  // prev: 지난주 랭킹에 심기 (settle로 정리해 1위 칭호·대여를 바로 보려고)
  z.object({ action: z.literal("seed"), mode: Mode, names: z.array(z.string().min(1).max(12)).max(60), top: z.number().int().min(1).default(48_213_904), me: z.number().int().min(0).default(0), prev: z.boolean().default(false), reset: z.boolean().default(false) }),
  // 오늘 유료 판 쓰기 (다 쓴 창 확인용)
  z.object({ action: z.literal("spend"), mode: Mode, n: z.number().int().min(1).max(2).default(2) }),
  // 주간 정리 바로 하기 (기본 지난주 — 마감·첫 주 검사 없이). 지급·1위 대여·확성기까지 실제 경로 그대로
  // again: 이미 정리한 주를 지우고 다시 (로컬 메모리 저장소만 — 다른 시험 계정으로 다시 보려고)
  z.object({ action: z.literal("settle"), prev: z.boolean().default(true), again: z.boolean().default(false) }),
  // 11/21 오늘 판 수 되돌리기 (로컬 메모리 저장소만). acct를 주면 관리자 키로 그 계정 (운영자 시험용)
  // 11/22 refund: 오늘 판 돌려받기도 다시 쓸 수 있게
  z.object({ action: z.literal("refill"), acct: z.string().min(1).max(40).optional(), refund: z.boolean().default(false) }),
  // 11/22 시험 기록 지우기 (로컬 메모리 저장소만): 모든 주 랭킹 · 정리 기록(명예의 전당) · 지급 표시
  z.object({ action: z.literal("wipe") }),
]);

/** 개발 전용 (운영 404): 회장님 독대 입장 창·레이스 탭 QA. 자격 층·랭킹 기록·오늘 판 쓰기를 바로 해 본다 */
export const POST = handler(async (req) => {
  if (env.isProd()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  const body = await readBody(req, DevSchema);
  if (body.action === "refill") {
    const acct = body.acct ? (await requireAdmin(req), body.acct) : await requireVisitor(req);
    const m = (getChairStore() as unknown as { me?: Map<string, { cn: number; ch: number; rf?: string }> }).me?.get(acct);
    if (m) Object.assign(m, { cn: 0, ch: 0 }, body.refund ? { rf: undefined } : {});
    return json({ ok: true, refilled: !!m });
  }
  if (body.action === "wipe") {
    const mem = getChairStore() as unknown as { weeks?: Map<string, unknown>; settles?: Map<string, unknown>; marks?: Map<string, string> };
    const n = { weeks: mem.weeks?.size ?? 0, settles: mem.settles?.size ?? 0 };
    mem.weeks?.clear();
    mem.settles?.clear();
    mem.marks?.clear();
    resetChairMemo();
    resetChairRankCache();
    return json({ ok: true, wiped: n });
  }
  const me = await requireVisitor(req);
  const now = Date.now();
  const store = getChairStore();
  const day = gameDay(now);
  const week = chairWeek(now);
  if (body.action === "floor") {
    const kit = body.kit
      ? {
          level: 50,
          // 선행·단을 맞춘 배분 (lib/rpg/skillRules — 틀리면 normalize가 비운다)
          skills: { em_kindle: 12, em_fan: 8, em_ring: 2, em_hearth: 5, em_meteor: 3, em_bonfire: 1, em_spark: 1 },
          hotbar: ["em_kindle", "em_fan", "em_ring", "em_meteor", null, "em_bonfire"] as (SkillId | null)[],
        }
      : {};
    await getRpgStore().update(me, (s) => ({ state: { ...s, fBest: body.floor, ...kit }, result: null }));
    return json({ ok: true, floor: body.floor });
  }
  if (body.action === "settle") {
    const wk = body.prev ? prevWeek(week) : week;
    if (body.again) {
      const mem = store as unknown as { settles?: Map<string, unknown>; marks?: Map<string, string> };
      mem.settles?.delete(wk);
      for (const k of [...(mem.marks?.keys() ?? [])]) if (k.startsWith(`${wk}:`)) mem.marks!.delete(k);
    }
    resetChairMemo();
    const r = await settleChair(wk, Math.max(now, weekEndMs(wk) + 1), { minWeek: "0" });
    resetChairMemo();
    resetChairRankCache();
    // 칭호 주인·칭호 사실 기억도 비워 1위 칭호가 바로 보이게
    forgetTowerTitles();
    forgetTitles();
    return json({ ok: true, week: wk, done: r.done, fresh: r.fresh, ranks: r.rec?.ranks ?? null, pay: r.rec?.pay ?? null });
  }
  const seedWeek = body.action === "seed" && body.prev ? prevWeek(week) : week;
  const run = async (acct: string, mode: "normal" | "hell", damage: number | null, durationMs = 600_000) => {
    const nonce = nanoid(16);
    await store.start({ acct, nonce, mode, practice: false, day, ttlMs: CHAIR_TICKET_MS, max: 99 });
    if (damage !== null) await store.finish({ acct, nonce, mode, week: seedWeek, day, damage, at: now, durationMs, dm: damage, keepBest: true, ranked: true, points: 0 });
  };
  if (body.action === "spend") {
    for (let i = 0; i < body.n; i++) await run(me, body.mode, null);
    return json({ ok: true });
  }
  if (body.reset) (store as unknown as { weeks?: Map<string, unknown> }).weeks?.delete(`${body.mode}:${seedWeek}`);
  const accounts = getAccounts();
  const colors = ["#9fb8d8", "#e8b4a0", "#a8d8a0", "#d8c48a", "#c0a8e0", "#8ad0d0"];
  let d = body.top;
  for (const [i, name] of body.names.entries()) {
    const id = nanoid(21);
    // 같은 이름이 이미 있으면(앞서 심은 계정) 끝에 숫자를 붙여 다시 — 「이름 없는 유령」이 늘어서지 않게
    for (let k = 1; k < 10; k++) {
      await accounts.enter(id, { name: k === 1 ? name : `${name.slice(0, 7)}${k}`, color: colors[i % colors.length], body: "hood" }, now);
      if ((await accounts.summaries([id]))[0]?.name) break;
    }
    // 버틴 시간도 줄마다 다르게 (14분 32초부터 조금씩 짧게)
    await run(id, body.mode, d, Math.max(95_000, 872_000 - i * 37_000 - ((i * 7919) % 23) * 1000));
    d = Math.floor(d * 0.93);
  }
  if (body.me > 0) await run(me, body.mode, body.me);
  resetChairRankCache();
  return json({ ok: true });
});
