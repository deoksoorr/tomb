import { unstable_cache } from "next/cache";
import { getNotices } from "@/lib/store";
import type { Notice, NoticeDoc } from "@/lib/types";
import { mergeDevNotes, noticeToNote } from "./merge";
import { STATIC_NOTES } from "./posts";
import type { DevNote } from "./types";

/** 개발자 노트 화면이 공지 저장소를 다시 읽는 간격 (초). Redis 명령을 아끼려고 1분 */
export const DEV_NOTES_REVALIDATE = 60;
/** 관리자 화면에서 글을 올리거나 고치면 이 태그를 바로 만료시킨다 (lib/devNotes/admin) */
export const DEV_NOTES_TAG = "devnotes";

const cachedNotices = unstable_cache(
  async (): Promise<Notice[]> => {
    try {
      return await getNotices().list();
    } catch {
      // 저장소를 못 읽어도 정적 글은 보여 준다
      return [];
    }
  },
  ["devnotes-notices"],
  { revalidate: DEV_NOTES_REVALIDATE, tags: [DEV_NOTES_TAG] },
);

/** 편집기로 쓴 글의 꼭지·맺음말 (글 보기에서만, 글마다 GET 한 번을 1분 캐시) */
const cachedDoc = unstable_cache(
  async (id: string): Promise<NoticeDoc | null> => {
    try {
      return await getNotices().getDoc(id);
    } catch {
      return null;
    }
  },
  ["devnotes-doc"],
  { revalidate: DEV_NOTES_REVALIDATE, tags: [DEV_NOTES_TAG] },
);

/** 모든 개발자 노트 (최신 순). 편집기로 쓴 글은 꼭지 없이 (목록·카드·사이트맵에는 제목·요약·첫 문단·대표 이미지면 된다) */
export async function listDevNotes(): Promise<DevNote[]> {
  return mergeDevNotes(STATIC_NOTES, await cachedNotices());
}

/** 글 하나 (목록용 가벼운 모양) */
export async function getDevNote(id: string): Promise<DevNote | null> {
  return (await listDevNotes()).find((n) => n.id === id) ?? null;
}

/** 글 보기: 편집기로 쓰거나 고친 글이면 꼭지·맺음말까지 채운다 (정적 글 원본은 그대로) */
export async function withDevNoteBody(note: DevNote): Promise<DevNote> {
  if (!note.fromStore) return note;
  const notice = (await cachedNotices()).find((n) => n.id === note.id);
  if (!notice?.rich) return note;
  return noticeToNote(notice, await cachedDoc(note.id));
}
