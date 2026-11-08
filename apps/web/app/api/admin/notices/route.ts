import { nanoid } from "nanoid";
import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { getNotices } from "@/lib/store";
import type { Notice, NoticeListResponse } from "@/lib/types";
import { NoticeInputSchema, readBody } from "@/lib/validate";

/** 공지 전체 (고정 먼저, 최신 순) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<NoticeListResponse>({ notices: await getNotices().list() });
});

/** 공지 쓰기 `{ title, body, pinned? }` (본문 줄바꿈은 그대로 저장한다) */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { title, body, pinned } = await readBody(req, NoticeInputSchema);
  const notice: Notice = { id: nanoid(10), title, body, pinned: !!pinned, createdAt: Date.now() };
  await getNotices().put(notice);
  return json<{ notice: Notice }>({ notice }, { status: 201 });
});
