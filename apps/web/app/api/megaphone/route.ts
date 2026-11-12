import { GRANT_TTL_SEC, megaphoneScope, signGrant, staffPublicName } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { z } from "zod";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { checkMegaphoneText } from "@/lib/megaphone";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts, getMegaphone, NO_NAME } from "@/lib/store";
import { kstDay, loadMe } from "@/lib/store/accounts";
import { isGraveChannel } from "@/lib/store/channels";
import { MEGA_KEEP, MEGA_SHOW, MEGAPHONE_COOLDOWN_MS } from "@/lib/store/megaphone";
import type { MegaphoneEntry, MegaphoneListResponse, MegaphoneUseResponse } from "@/lib/types";
import { isStaff, staffAccountId } from "@/lib/staff";
import { readBody } from "@/lib/validate";

/**
 * 23번 확성기 최근 기록 `?channel=N`: 그 채널에서 외친 것 + 모든 채널 확성기 (관리자가 숨긴 것 빼고, 오래된 것 먼저 최대 20개).
 * 누구나 같은 내용을 보므로 CDN에 10초 캐시한다 (숨김 처리도 그 안에 반영된다)
 */
export const GET = handler(async (req) => {
  const ch = Number(req.nextUrl.searchParams.get("channel") ?? 1);
  const channel = isGraveChannel(ch) ? ch : 1;
  const [rows, staffId] = await Promise.all([getMegaphone().recent(MEGA_KEEP), staffAccountId()]);
  const entries: MegaphoneEntry[] = rows
    .filter((r) => !r.hidden && (r.scope === "all" || r.ch === channel))
    .slice(0, MEGA_SHOW)
    .reverse()
    // 운영자로 지정되기 전에 남긴 기록도 "운영자"로
    .map(({ id, name, text, scope, ch, at, accountId }) => ({ id, name: staffPublicName(name, !!staffId && accountId === staffId), text, scope, ch, at }));
  return json<MegaphoneListResponse>(
    { entries },
    { headers: { "cache-control": "no-store", "vercel-cdn-cache-control": "s-maxage=10, stale-while-revalidate=30" } },
  );
});

const UseSchema = z.object({
  itemId: z.string().refine((id) => megaphoneScope(id) !== null, "확성기 아이템이 아니에요."),
  text: z.string().max(400),
  channel: z.number().int().refine(isGraveChannel, "채널 번호가 올바르지 않아요."),
});

/**
 * 확성기 쓰기 `{ itemId, text, channel }`: 문장 검사(1~60자, 링크·금칙어·반복 도배 금지) → 계정마다 30초 간격 →
 * 가방에서 1개 소모 → 기록 → 서명한 증서(닉네임·문장)를 돌려준다. 게임이 실시간 서버로 보내면 채널(mega_all은 모든 채널)에 방송된다
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId, text: raw, channel } = await readBody(req, UseSchema);
  const checked = checkMegaphoneText(raw);
  if (!checked.ok) throw new HttpError(400, "INVALID_INPUT", checked.reason);
  await rateLimit("megaphone", req, visitorId);
  const accounts = getAccounts();
  const store = getMegaphone();
  const now = Date.now();
  const wait = await store.cooldown(visitorId, MEGAPHONE_COOLDOWN_MS, now);
  if (wait > 0) throw new HttpError(429, "RATE_LIMITED", `확성기는 ${Math.ceil(wait / 1000)}초 뒤에 다시 쓸 수 있어요.`);
  // 31번 운영자 계정은 확성기를 가방에서 꺼내지 않는다 (무료)
  const staff = await isStaff(visitorId);
  if (!staff && !(await accounts.consume(visitorId, itemId))) {
    await store.releaseCooldown(visitorId);
    throw new HttpError(409, "NO_ITEM", "가방에 확성기가 없어요. 상점에서 살 수 있어요.");
  }
  // 운영자는 보낸 이가 "운영자"로 보인다
  const name = staffPublicName((await accounts.get(visitorId, kstDay(now), now)).name ?? NO_NAME, staff);
  const scope = megaphoneScope(itemId)!;
  const entry: MegaphoneEntry = { id: nanoid(10), name, text: checked.text, scope, ch: channel, at: now };
  await store.push({ ...entry, accountId: visitorId });
  const grant = await signGrant(env.joinSecret(), {
    kind: "megaphone",
    visitorId,
    nonce: entry.id,
    name,
    text: entry.text,
    scope,
    ch: channel,
    exp: Math.floor(now / 1000) + GRANT_TTL_SEC,
  });
  return json<MegaphoneUseResponse>({ entry, grant, me: await loadMe(accounts, visitorId, now) });
});
