import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { getNotices } from "@/lib/store";
import type { Notice } from "@/lib/types";
import { NoticePatchSchema, readBody } from "@/lib/validate";

const noNotice = () => new HttpError(404, "NOT_FOUND", "공지를 찾을 수 없어요.");

/** 공지 수정: 바꿀 것만 `{ title?, body?, pinned? }` */
export const PATCH = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  const patch = await readBody(req, NoticePatchSchema);
  const notices = getNotices();
  const current = await notices.get(id);
  if (!current) throw noNotice();
  const notice: Notice = {
    ...current,
    title: patch.title ?? current.title,
    body: patch.body ?? current.body,
    pinned: patch.pinned ?? current.pinned,
  };
  await notices.put(notice);
  return json<{ notice: Notice }>({ notice });
});

export const DELETE = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  if (!(await getNotices().remove(id))) throw noNotice();
  return json({ ok: true });
});
