import { requireAdmin } from "@/lib/admin";
import {
  refreshDevNotePages,
  removeDevNote,
  staticAsSource,
  staticNote,
  updateDevNote,
  type AdminDevNoteResponse,
} from "@/lib/devNotes/admin";
import { DevNoteInputSchema } from "@/lib/devNotes/input";
import { handler, HttpError, json } from "@/lib/http";
import { getNotices } from "@/lib/store";
import type { Notice } from "@/lib/types";
import { readBody } from "@/lib/validate";
import { z } from "zod";

const noNote = () => new HttpError(404, "NOT_FOUND", "글을 찾을 수 없어요.");

/** 고치기 화면: 공지 + 본문(꼭지·맺음말). 아직 고친 적 없는 정적 글은 원본(posts.ts)으로 채운다 */
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  const store = getNotices();
  const notice = await store.get(id);
  const origin = staticNote(id);
  if (notice?.rich) return json<AdminDevNoteResponse>({ notice, doc: await store.getDoc(id), kind: origin ? "edited" : "note" });
  if (origin) return json<AdminDevNoteResponse>({ ...staticAsSource(origin), kind: "static" });
  if (!notice) throw noNote();
  return json<AdminDevNoteResponse>({ notice, doc: null, kind: "note" });
});

/** 통째로 고치기 (쓴 시각은 그대로). 정적 글 id면 같은 id로 덮어쓴다 (lib/devNotes/admin) */
export const PUT = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  const input = await readBody(req, DevNoteInputSchema);
  const notice = await updateDevNote(getNotices(), id, input);
  if (!notice) throw noNote();
  refreshDevNotePages(id);
  return json<{ notice: Notice }>({ notice });
});

/** 고정만 켜고 끄기 `{ pinned }` */
export const PATCH = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  const { pinned } = await readBody(req, z.object({ pinned: z.boolean("고정 여부가 올바르지 않아요.") }));
  const store = getNotices();
  const current = await store.get(id);
  if (!current) throw noNote();
  const notice: Notice = { ...current, pinned };
  await store.put(notice);
  refreshDevNotePages(id);
  return json<{ notice: Notice }>({ notice });
});

/** 지우기 (본문·올린 이미지까지) */
export const DELETE = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  if (staticNote(id)) throw new HttpError(400, "STATIC_NOTE", "정적 글은 지울 수 없어요. 고친 내용은 「원본으로 되돌리기」로 버려요.");
  if (!(await removeDevNote(getNotices(), id))) throw noNote();
  refreshDevNotePages(id);
  return json({ ok: true });
});
