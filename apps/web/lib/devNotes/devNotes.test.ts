import { describe, expect, it } from "vitest";
import { FAQ } from "./faq";
import { GUIDE_PARTS } from "./guide";
import { mergeDevNotes, noticeToNote } from "./merge";
import { STATIC_NOTES } from "./posts";
import { latestDevNote, STATIC_NOTE_TITLES } from "./titles";

const notice = (id: string, createdAt: number, extra: Partial<{ title: string; body: string; pinned: boolean }> = {}) => ({
  id,
  title: extra.title ?? `공지 ${id}`,
  body: extra.body ?? "첫 문단이에요.\n\n둘째 문단.\n셋째 줄.",
  createdAt,
  pinned: extra.pinned ?? false,
});

describe("개발자 노트 합치기", () => {
  it("정적 목록에 없는 공지만 글만 있는 노트로 끼우고 최신 순으로", () => {
    const newest = STATIC_NOTES.reduce((m, n) => Math.max(m, n.createdAt), 0) + 1000;
    const merged = mergeDevNotes(STATIC_NOTES, [notice(STATIC_NOTES[1].id, 1, { title: "옛 제목" }), notice("new1", newest)]);
    expect(merged).toHaveLength(STATIC_NOTES.length + 1);
    expect(merged[0].id).toBe("new1");
    // 같은 id는 정적 글(다시 쓴 제목)이 이긴다
    expect(merged.find((n) => n.id === STATIC_NOTES[1].id)?.title).toBe(STATIC_NOTES[1].title);
    for (let i = 1; i < merged.length; i++) expect(merged[i - 1].createdAt).toBeGreaterThanOrEqual(merged[i].createdAt);
  });

  it("공지 본문: 첫 문단은 머리글, 나머지는 본문 한 꼭지, 날짜는 KST", () => {
    const n = noticeToNote(notice("x", Date.UTC(2026, 10, 19, 16, 0)));
    expect(n.intro).toBe("첫 문단이에요.");
    expect(n.sections).toEqual([{ img: null, heading: "", text: "둘째 문단.\n셋째 줄." }]);
    expect(n.date).toBe("2026-11-20");
    expect(n.hero).toBeNull();
  });

  it("빈 공지 목록이면 정적 글 그대로", () => {
    expect(mergeDevNotes(STATIC_NOTES, []).map((n) => n.id).sort()).toEqual(STATIC_NOTES.map((n) => n.id).sort());
  });
});

describe("개발자 노트 데이터", () => {
  it("게임 화면용 제목 표가 글 제목과 같다", () => {
    expect(STATIC_NOTE_TITLES).toEqual(Object.fromEntries(STATIC_NOTES.map((n) => [n.id, [n.title, n.createdAt]])));
  });

  it("가장 최근 글: 정적 글과 새 공지 중 늦은 것, 같은 id면 다시 쓴 제목", () => {
    const top = [...STATIC_NOTES].sort((a, b) => b.createdAt - a.createdAt)[0];
    expect(latestDevNote(null)).toEqual({ id: top.id, title: top.title });
    expect(latestDevNote([{ id: top.id, title: "옛 제목", createdAt: top.createdAt }])).toEqual({ id: top.id, title: top.title });
    expect(latestDevNote([{ id: "n9", title: "새 공지", createdAt: top.createdAt + 1 }])).toEqual({ id: "n9", title: "새 공지" });
  });

  it("그림은 모두 /devnotes/ 아래, 고정 글은 하나", () => {
    for (const n of STATIC_NOTES) {
      if (n.hero) expect(n.hero).toMatch(/^\/devnotes\/[\w-]+\.webp$/);
      for (const s of n.sections) if (s.img) expect(s.img).toMatch(/^\/devnotes\/[\w-]+\.webp$/);
    }
    expect(STATIC_NOTES.filter((n) => n.pinned)).toHaveLength(1);
    for (const p of GUIDE_PARTS) for (const [src] of p.images) expect(src).toMatch(/^\/devnotes\//);
  });

  it("미출시 콘텐츠 이름이 사이트 글에 없다", () => {
    const text = JSON.stringify([STATIC_NOTES, GUIDE_PARTS, FAQ]);
    for (const w of ["보따리상", "분양사", "품종", "시즌 가구", "겨울 코디"]) expect(text).not.toContain(w);
  });

  it("자주 묻는 질문: 33개, 분류가 모두 탭에 있다", () => {
    expect(FAQ.items).toHaveLength(33);
    for (const it of FAQ.items) expect(FAQ.cats).toContain(it.cat);
  });
});
