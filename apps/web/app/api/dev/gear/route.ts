import { nameKey } from "@tomb/protocol";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { maxDealPerSec } from "@/lib/rpg/dealCap";
import { RpgError } from "@/lib/rpg/character";

import { derive } from "@/lib/rpg/formulas";
import { effectiveLevel, rpgView } from "@/lib/rpg/service";
import { activeSets, decodeSg, sgCombat, sgName } from "@/lib/rpg/setGear";
import { getRpgStore } from "@/lib/rpg/store";
import { isSuperHunter } from "@/lib/rpg/superHunter";
import type { GearSlot } from "@/lib/rpg/catalog";
import { getAccounts } from "@/lib/store";
import { forgetTitles } from "@/lib/titlesServer";
import { addPresetGear } from "@/lib/devGear";
import { readBody } from "@/lib/validate";

const Schema = z.object({ name: z.string().min(1).max(24), preset: z.enum(["finalMagic15"]) });

/** 로컬 메모리 계정 저장소에서 이름이 비슷한 계정 (찾지 못했을 때 알려 주려고) */
function similarNames(name: string): string[] {
  const accts = (getAccounts() as unknown as { accts?: Map<string, { name?: string | null }> }).accts;
  if (!accts) return [];
  const all = [...accts.values()].map((a) => a.name).filter((n): n is string => !!n);
  const bits = [...new Set(name.split(""))];
  return all.filter((n) => bits.some((b) => n.includes(b))).slice(0, 30);
}

async function resolve(name: string): Promise<string> {
  const id = await getAccounts().nameOwner(nameKey(name), Date.now());
  if (!id) throw new HttpError(404, "NO_ACCOUNT", `「${name}」 계정이 없어요. 비슷한 이름: ${similarNames(name).join(", ") || "없음"}`);
  return id;
}

async function summary(acct: string) {
  const view = await rpgView(acct);
  const c = view.character;
  const sup = await isSuperHunter(acct);
  const lv = effectiveLevel(c.level, sup);
  const sets = activeSets(c.equip);
  const combat = sgCombat(c.equip);
  const d = derive(lv, c.stats, c.equip);
  return {
    acct,
    level: c.level,
    equip: Object.fromEntries(
      (Object.entries(c.equip) as [GearSlot, string | null][]).map(([slot, id]) => {
        const it = id ? decodeSg(id) : null;
        return [slot, it ? `${sgName(it)} +${it.e} (${it.o.map(([k, v]) => `${k}${v}`).join(" ")}${it.L ? ` 전설${it.L}` : ""})` : id];
      }),
    ),
    sets: { two: sets.two, four: sets.four, five: sets.five },
    derived: d,
    combat,
    dealCap: maxDealPerSec(lv, c.stats, c.equip, c.skills, c.tSkills),
    sgBag: (c.sg ?? []).length,
  };
}

/** 개발 전용 (운영 404, 관리자 키): 이름으로 찾은 계정에 세트 장비 프리셋을 넣고 낀다 (캐릭터 저장소·끼기 규칙 그대로) */
export const POST = handler(async (req) => {
  if (env.isProd()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  await requireAdmin(req);
  const body = await readBody(req, Schema);
  const acct = await resolve(body.name);
  const sup = await isSuperHunter(acct);
  try {
    await getRpgStore().update(acct, (s) => ({ state: addPresetGear(s, body.preset, sup), result: null }));
  } catch (e) {
    if (e instanceof RpgError) throw new HttpError(e.status, e.code, e.message);
    throw e;
  }
  forgetTitles(acct);
  return json({ ok: true, ...(await summary(acct)) });
});

/** 확인용: GET ?name= → 게임이 쓰는 rpgView로 장착·능력치 요약 */
export const GET = handler(async (req: NextRequest) => {
  if (env.isProd()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  await requireAdmin(req);
  const name = req.nextUrl.searchParams.get("name") ?? "";
  const acct = await resolve(name);
  // ?save=1: 그대로 다시 써서 로컬 운영자 캐릭터를 파일로 남긴다 (lib/devPersist)
  if (req.nextUrl.searchParams.get("save") === "1") await getRpgStore().update(acct, (s) => ({ state: s, result: null }));
  return json(await summary(acct));
});
