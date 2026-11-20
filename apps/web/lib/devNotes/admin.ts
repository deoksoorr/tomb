import { nanoid } from "nanoid";
import { revalidatePath, revalidateTag } from "next/cache";
import { deleteDevNoteImages } from "@/lib/blob";
import type { NoticeStore } from "@/lib/store/notices";
import type { Notice, NoticeDoc } from "@/lib/types";
import { devNoteImages, toNoticeDoc, type DevNoteInput } from "./input";
import { DEV_NOTES_TAG } from "./notes";
import { noteToBlocks } from "./merge";
import { STATIC_NOTES } from "./posts";
import type { DevNote } from "./types";

// 관리자 「개발자 노트」 쓰기·고치기·지우기 (공지 저장소에 같이 저장 → 게임 공지 점·알림 카드와 사이트에 같이 나온다).
// 가벼운 쪽(제목·첫 문단·요약·대표 이미지)은 공지 HASH에, 꼭지·맺음말은 notice:doc:<id>에.

/** 관리자 목록에 같이 보이는 정적 글 (읽기 전용) */
export type StaticNoteRow = { id: string; title: string; createdAt: number; pinned: boolean; hero: string | null };
export type AdminDevNotesResponse = { notices: Notice[]; statics: StaticNoteRow[] };
/** 고치기 화면: kind static = 아직 고친 적 없는 정적 글(원본으로 채움), edited = 고친 정적 글, note = 저장소 글 */
export type AdminDevNoteResponse = { notice: Notice; doc: NoticeDoc | null; kind: "static" | "edited" | "note" };

export const staticNoteRows = (): StaticNoteRow[] =>
  STATIC_NOTES.map((n) => ({ id: n.id, title: n.title, createdAt: n.createdAt, pinned: n.pinned, hero: n.hero }));

/** 저장 직후 사이트에 바로 보이게: 개발자 노트 데이터 캐시와 목록·글 화면을 만료시킨다 (없으면 1분 안에 저절로) */
export function refreshDevNotePages(id: string): void {
  try {
    revalidateTag(DEV_NOTES_TAG, { expire: 0 });
    revalidatePath("/news");
    revalidatePath(`/news/${id}`);
  } catch (e) {
    // 테스트처럼 Next 요청 밖이면 건너뛴다
    console.warn("[devnotes] 캐시 만료 실패", e);
  }
}

function toNotice(base: { id: string; createdAt: number; updatedAt?: number }, v: DevNoteInput): Notice {
  return {
    id: base.id,
    title: v.title,
    body: v.intro,
    createdAt: base.createdAt,
    pinned: !!v.pinned,
    ...(v.summary ? { summary: v.summary } : {}),
    ...(v.hero ? { hero: v.hero } : {}),
    rich: true,
    ...(base.updatedAt ? { updatedAt: base.updatedAt } : {}),
  };
}

export const staticNote = (id: string): DevNote | null => STATIC_NOTES.find((n) => n.id === id) ?? null;

/** 새 글. 본문을 먼저 저장해 공지가 보이는 순간 본문도 읽힌다 */
export async function createDevNote(store: NoticeStore, v: DevNoteInput, now = Date.now()): Promise<Notice> {
  const notice = toNotice({ id: nanoid(10), createdAt: now }, v);
  await store.putDoc(notice.id, toNoticeDoc(v));
  await store.put(notice);
  return notice;
}

/**
 * 고치기 (쓴 시각은 그대로 — 게임 새 글 점이 다시 켜지지 않는다). 빠진 이미지는 저장소에서 지운다. 없으면 null.
 * 정적 글(posts.ts)도 같은 id로 고친다: 저장소에 같은 id의 예전 공지(글만)가 있으면 그 원문을 본문에 보관해 두고(되돌리기용)
 * 쓴 시각을 그대로 쓰고, 없으면 정적 글의 쓴 시각으로 새로 둔다. 고친 글(rich)은 사이트에서 정적 글보다 앞선다.
 */
export async function updateDevNote(store: NoticeStore, id: string, v: DevNoteInput, now = Date.now()): Promise<Notice | null> {
  const current = await store.get(id);
  const origin = staticNote(id);
  if (!current && !origin) return null;
  const oldDoc = current?.rich ? await store.getDoc(id) : null;
  const backup = oldDoc?.backup ?? (current && !current.rich && origin ? { title: current.title, body: current.body, pinned: current.pinned } : undefined);
  const doc = toNoticeDoc(v, backup);
  const notice = toNotice({ id, createdAt: current?.createdAt ?? origin!.createdAt, updatedAt: now }, v);
  await store.putDoc(id, doc);
  await store.put(notice);
  const keep = new Set(devNoteImages(notice.hero, doc));
  await deleteDevNoteImages(devNoteImages(current?.hero, oldDoc).filter((u) => !keep.has(u)));
  return notice;
}

/**
 * 정적 글을 고친 것을 버리고 원본(posts.ts)으로 되돌린다. 예전 공지 원문을 보관해 뒀으면 그 공지(글만)를 쓴 시각 그대로 되살리고,
 * 없었으면(정적 글로만 있던 글) 저장소 항목을 지운다. 올린 이미지는 지운다. 고친 적이 없으면 false
 */
export async function revertStaticNote(store: NoticeStore, id: string): Promise<boolean> {
  const current = await store.get(id);
  if (!staticNote(id) || !current?.rich) return false;
  const doc = await store.getDoc(id);
  if (doc?.backup) {
    await store.put({ id, ...doc.backup, createdAt: current.createdAt });
    await store.putDoc(id, null);
  } else await store.remove(id);
  await deleteDevNoteImages(devNoteImages(current.hero, doc));
  return true;
}

/** 관리자 「고치기」로 열 정적 글 모양 (아직 고친 적 없는 정적 글) */
export function staticAsSource(n: DevNote): { notice: Notice; doc: NoticeDoc } {
  return {
    notice: {
      id: n.id,
      title: n.title,
      body: n.intro,
      createdAt: n.createdAt,
      pinned: n.pinned,
      ...(n.summary ? { summary: n.summary } : {}),
      ...(n.hero ? { hero: n.hero } : {}),
      rich: true,
    },
    doc: { blocks: noteToBlocks(n), outro: n.outro, ...(n.callout ? { callout: n.callout } : {}) },
  };
}

/** 지우기 (본문·이미지까지). 없으면 false */
export async function removeDevNote(store: NoticeStore, id: string): Promise<boolean> {
  const current = await store.get(id);
  if (!current) return false;
  const doc = current.rich ? await store.getDoc(id) : null;
  if (!(await store.remove(id))) return false;
  await deleteDevNoteImages(devNoteImages(current.hero, doc));
  return true;
}
