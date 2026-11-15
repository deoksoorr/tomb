import { GRANT_TTL_SEC, megaphoneScope, signGrant } from "@tomb/protocol";
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
import { isManager, managerIds } from "@/lib/managers";
import { isStaff, staffAccountId } from "@/lib/staff";
import { readBody } from "@/lib/validate";
import { CHAMP_NOTICE_ACCOUNT } from "@/lib/weeklyChamp";

/**
 * 23번 확성기 최근 기록 `?channel=N`: 그 채널에서 외친 것 + 모든 채널 확성기 (관리자가 숨긴 것 빼고, 오래된 것 먼저 최대 20개).
 * 누구나 같은 내용을 보므로 CDN에 30초 캐시한다 (숨김 처리도 그 안에 반영된다. 새 방송은 실시간으로 온다)
 */
export const GET = handler(async (req) => {
  const ch = Number(req.nextUrl.searchParams.get("channel") ?? 1);
  const channel = isGraveChannel(ch) ? ch : 1;
  const [rows, staffId, mgrIds] = await Promise.all([getMegaphone().recent(MEGA_KEEP), staffAccountId(), managerIds().catch(() => new Set<string>())]);
  // 11/15 뒤 공지가 바꿔 끼운 앞 공지(긴급 의뢰 시작 → 끝)는 뺀다
  const replaced = new Set(rows.flatMap((r) => (r.replaces ? [r.replaces] : [])));
  const entries: MegaphoneEntry[] = rows
    .filter((r) => !r.hidden && !replaced.has(r.id) && (r.scope === "all" || r.ch === channel))
    .slice(0, MEGA_SHOW)
    .reverse()
    // 운영자로 지정되기 전에 남긴 기록도 금색·"운영자" 딱지로 (이름은 남긴 그대로)
    .map(({ id, name, text, scope, ch, at, accountId, replaces }) => {
      const staff = !!staffId && accountId === staffId;
      // 주간 1위 소식 같은 마을 공지(시스템 줄)는 보낸 이 이름("마을 소식") 그대로, 운영자처럼 금색·신고 버튼 없이
      const system = accountId === CHAMP_NOTICE_ACCOUNT;
      // 11/16 지금 매니저면 "매니저" 딱지 (운영자 딱지와 같은 규칙 — 지금 계정으로 다시 판별)
      const mgr = !staff && !system && !!accountId && mgrIds.has(accountId);
      return { id, name, text, scope, ch, at, ...(staff || system ? { staff: true as const } : {}), ...(system ? { system: true as const } : {}), ...(system && replaces ? { replaces } : {}), ...(mgr ? { mgr: true as const } : {}) };
    });
  return json<MegaphoneListResponse>(
    { entries },
    { headers: { "cache-control": "no-store", "vercel-cdn-cache-control": "s-maxage=30, stale-while-revalidate=120" } },
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
  // 11/16 매니저는 딱지만 (확성기는 가방에서 꺼낸다 — 운영자 특권 없음)
  const mgr = !staff && (await isManager(visitorId, now));
  if (!staff && !(await accounts.consume(visitorId, itemId))) {
    await store.releaseCooldown(visitorId);
    throw new HttpError(409, "NO_ITEM", "가방에 확성기가 없어요. 상점에서 살 수 있어요.");
  }
  // 11/15: 운영자도 보낸 이는 닉네임 그대로 (staff 표시로 금색·"운영자" 딱지)
  const name = (await accounts.get(visitorId, kstDay(now), now)).name ?? NO_NAME;
  const scope = megaphoneScope(itemId)!;
  const row = { id: nanoid(10), name, text: checked.text, scope, ch: channel, at: now };
  await store.push({ ...row, accountId: visitorId }); // 저장 기록엔 staff를 넣지 않는다 (목록에서 계정으로 다시 판별)
  const entry: MegaphoneEntry = { ...row, ...(staff ? { staff: true as const } : {}), ...(mgr ? { mgr: true as const } : {}) };
  const grant = await signGrant(env.joinSecret(), {
    kind: "megaphone",
    visitorId,
    nonce: entry.id,
    name,
    text: entry.text,
    scope,
    ch: channel,
    exp: Math.floor(now / 1000) + GRANT_TTL_SEC,
    ...(staff ? { staff: true as const } : {}),
    ...(mgr ? { mgr: true as const } : {}),
  });
  return json<MegaphoneUseResponse>({ entry, grant, me: await loadMe(accounts, visitorId, now) });
});
