import { requireAdmin } from "@/lib/admin";
import { createDevNote, refreshDevNotePages, staticNoteRows, type AdminDevNotesResponse } from "@/lib/devNotes/admin";
import { DevNoteInputSchema } from "@/lib/devNotes/input";
import { handler, json } from "@/lib/http";
import { getNotices } from "@/lib/store";
import type { Notice } from "@/lib/types";
import { readBody } from "@/lib/validate";

/** 개발자 노트 목록: 공지 저장소 글(고정 먼저, 최신 순) + 사이트에 들어 있는 정적 글(읽기 전용) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<AdminDevNotesResponse>({ notices: await getNotices().list(), statics: staticNoteRows() });
});

/** 새 개발자 노트 (게임 공지 점·알림 카드에도 같이 뜬다) */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const input = await readBody(req, DevNoteInputSchema);
  const notice = await createDevNote(getNotices(), input);
  refreshDevNotePages(notice.id);
  return json<{ notice: Notice }>({ notice }, { status: 201 });
});
