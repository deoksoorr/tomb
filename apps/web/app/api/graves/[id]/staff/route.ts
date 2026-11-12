import { handler, json, notFound } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { requireStaffAtAdminIp } from "@/lib/staff";
import { deleteGrave, getStore } from "@/lib/store";
import { isGraveId } from "@/lib/validate";

type Params = { id: string };

/**
 * 31번 운영자 묘비 삭제: 누구의 묘비든 완전히 지운다 (관리자 화면의 삭제와 같다 — 사진·세운 계정의 목록까지).
 * 운영자 계정 + 관리자 IP 둘 다 맞아야 한다 (어느 하나라도 아니면 403). 숨긴 묘비도 지울 수 있다
 */
export const DELETE = handler<Params>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await requireStaffAtAdminIp(req, visitorId);
  if (!isGraveId(id) || !(await deleteGrave(getStore(), id))) throw notFound();
  console.info(`[staff] 운영자가 묘비 ${id}를 지웠어요`);
  return json({ ok: true });
});
