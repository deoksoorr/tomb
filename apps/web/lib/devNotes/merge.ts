import { todayKst } from "@/lib/epitaph";
import type { Notice } from "@/lib/types";
import type { DevNote } from "./types";

// 정적 개발자 노트(지난 공지를 다시 쓴 글) + 게임에서 새로 쓴 공지를 하나의 목록으로.
// 정적 목록에 없는 id의 공지만 글만 있는 개발자 노트로 바꿔 끼운다 (같은 id면 정적 글이 이긴다).

/** 공지 하나 → 글만 있는 개발자 노트. 본문 첫 문단을 머리글로, 나머지를 본문으로 */
export function noticeToNote(n: Notice): DevNote {
  const paras = n.body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const [intro = "", ...rest] = paras;
  return {
    id: n.id,
    title: n.title,
    date: todayKst(n.createdAt),
    createdAt: n.createdAt,
    pinned: n.pinned,
    hero: null,
    intro,
    sections: rest.length ? [{ img: null, heading: "", text: rest.join("\n\n") }] : [],
    outro: "",
  };
}

/** 정적 글 + 저장소 공지 → 최신 순 (고정 여부는 목록 화면이 따로 다룬다) */
export function mergeDevNotes(statics: readonly DevNote[], notices: readonly Notice[]): DevNote[] {
  const known = new Set(statics.map((s) => s.id));
  const extra = notices.filter((n) => !known.has(n.id)).map(noticeToNote);
  return [...statics, ...extra].sort((a, b) => b.createdAt - a.createdAt);
}
