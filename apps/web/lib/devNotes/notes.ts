import { unstable_cache } from "next/cache";
import { getNotices } from "@/lib/store";
import type { Notice } from "@/lib/types";
import { mergeDevNotes } from "./merge";
import { STATIC_NOTES } from "./posts";
import type { DevNote } from "./types";

/** 개발자 노트 화면이 공지 저장소를 다시 읽는 간격 (초). Redis 명령을 아끼려고 1분 */
export const DEV_NOTES_REVALIDATE = 60;

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
  { revalidate: DEV_NOTES_REVALIDATE },
);

/** 모든 개발자 노트 (최신 순) */
export async function listDevNotes(): Promise<DevNote[]> {
  return mergeDevNotes(STATIC_NOTES, await cachedNotices());
}

export async function getDevNote(id: string): Promise<DevNote | null> {
  return (await listDevNotes()).find((n) => n.id === id) ?? null;
}
