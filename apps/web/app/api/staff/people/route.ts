import { onlinePeople } from "@/lib/ban";
import { HttpError, handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { isStaff } from "@/lib/staff";
import { staffPeopleOf, type StaffPeopleResponse } from "@/lib/staffPeople";

/** 11/20 운영자 「접속 중인 사람」 (순간이동 목록·채널 창 다른 맵 명단). 운영자 계정만 (아니면 403). 나는 뺀다 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  if (!(await isStaff(visitorId))) throw new HttpError(403, "FORBIDDEN", "운영자 계정만 볼 수 있어요.");
  await rateLimit("staffPeople", req, visitorId);
  const all = await onlinePeople();
  return json<StaffPeopleResponse>(all ? { people: staffPeopleOf(all, visitorId), reached: true } : { people: [], reached: false });
});
