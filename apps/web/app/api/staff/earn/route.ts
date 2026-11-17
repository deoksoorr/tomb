import { NAME_MAX } from "@tomb/protocol";
import { z } from "zod";
import { WHERE_MAX_IDS } from "@tomb/protocol";
import { onlineVisitorIds, whereOf } from "@/lib/ban";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { isStaff } from "@/lib/staff";
import { STAFF_EARN_MAX_NAMES, STAFF_EARN_TODAY_MAX, type StaffEarnResponse, type StaffEarnRow } from "@/lib/staffEarn";
import { getAccounts, NO_NAME } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { getEarnStatusStore } from "@/lib/store/earnStatus";
import { getActivity } from "@/lib/store/userActivity";
import { earnBoost } from "@/lib/store/pointEvent";
import { readBody } from "@/lib/validate";

const Schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("names"), names: z.array(z.string().trim().min(1).max(NAME_MAX * 2)).min(1).max(STAFF_EARN_MAX_NAMES) }),
  z.object({ mode: z.literal("today") }),
  z.object({ mode: z.literal("channel"), channel: z.number().int().min(1).max(99) }),
]);

/**
 * 운영자 「포인트 현황」 `{ mode: "names", names }` | `{ mode: "today" }`: 사람마다 오늘(게임 날짜) 받은 포인트 합계·항목별 값과
 * 오늘 포인트 배수 이벤트. 운영자 계정만 (관리자 키가 아니라 운영자 세션으로). 운영자 자신은 빼고, 계정 id는 내보내지 않는다.
 *  - names: 지금 채널에 보이는 사람들 이름 (최대 60명). 이름 색인으로 계정을 찾는다
 *  - channel: 11/17 그 채널에 지금 접속한 사람 모두 (예전엔 게임이 보는 이름 = 지금 맵 사람만이었다). 실시간 서버의 접속 명단 → 자리 조회로 채널을 고른다
 *  - today: 오늘(게임 날짜) 마을에 들어온 계정 모두 (활동 기록 act:d:{날짜}, 받은 것이 없으면 0P). 최대 STAFF_EARN_TODAY_MAX명까지 본다
 * 읽기는 저장소 명령 두 개 (이름 색인 또는 오늘 활동 SET + Lua 한 번)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  if (!(await isStaff(visitorId))) throw new HttpError(403, "FORBIDDEN", "운영자 계정만 볼 수 있어요.");
  await rateLimit("staffEarn", req, visitorId);
  const input = await readBody(req, Schema);
  const now = Date.now();
  const day = kstDay(now);
  const store = getEarnStatusStore(getAccounts());
  const boost = await earnBoost(now);

  if (input.mode === "names") {
    const names = [...new Set(input.names)];
    const owners = await store.owners(names);
    const seen = new Set<string>();
    const picked: { id: string; name: string }[] = [];
    const missing: string[] = [];
    names.forEach((name, i) => {
      const id = owners[i];
      if (!id) missing.push(name);
      else if (id !== visitorId && !seen.has(id)) {
        seen.add(id);
        picked.push({ id, name });
      }
    });
    const today = await store.today(picked.map((p) => p.id), day);
    const rows: StaffEarnRow[] = picked.map((p, i) => ({ name: today[i].name ?? p.name, total: today[i].total, by: today[i].by }));
    return json<StaffEarnResponse>({ day, boost, rows, ...(missing.length ? { missing } : {}) });
  }

  if (input.mode === "channel") {
    const online = await onlineVisitorIds();
    if (!online) throw new HttpError(503, "REALTIME_UNAVAILABLE", "실시간 서버에 닿지 못했어요. 잠시 뒤에 다시 봐 주세요.");
    const others = [...new Set(online)].filter((id) => id !== visitorId);
    const here: string[] = [];
    for (let i = 0; i < others.length; i += WHERE_MAX_IDS) {
      const part = others.slice(i, i + WHERE_MAX_IDS);
      const where = await whereOf(part);
      if (!where) throw new HttpError(503, "REALTIME_UNAVAILABLE", "실시간 서버에 닿지 못했어요. 잠시 뒤에 다시 봐 주세요.");
      for (const id of part) if (where[id]?.ch === input.channel) here.push(id);
    }
    const ids = here.sort().slice(0, STAFF_EARN_MAX_NAMES);
    const today = await store.today(ids, day);
    const rows: StaffEarnRow[] = today.map((t) => ({ name: t.name ?? NO_NAME, total: t.total, by: t.by }));
    return json<StaffEarnResponse>({ day, boost, rows });
  }

  // 순서가 없는 SET이라 id 순으로 잘라 둔다 (새로 볼 때마다 같은 사람들)
  const active = [...((await getActivity().daySets([day])).get(day) ?? [])].filter((id) => id !== visitorId).sort();
  const ids = active.slice(0, STAFF_EARN_TODAY_MAX);
  const today = await store.today(ids, day);
  const rows: StaffEarnRow[] = today.map((t) => ({ name: t.name ?? NO_NAME, total: t.total, by: t.by }));
  return json<StaffEarnResponse>({ day, boost, rows, ...(active.length > ids.length ? { truncated: true as const } : {}) });
});
