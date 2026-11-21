import { describe, expect, it } from "vitest";
import { FAQ } from "./faq";
import { GUIDE_PARTS } from "./guide";
import { blocksToSections, mergeDevNotes, noteToBlocks, noticeToNote } from "./merge";
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
    // 11/21 보따리상은 11/20부터 마을에 열려 있어 뺐다 (11월 21일 노트가 자리 바꿈을 알린다)
    for (const w of ["분양사", "품종", "시즌 가구", "겨울 코디"]) expect(text).not.toContain(w);
  });

  it("자주 묻는 질문: 33개, 분류가 모두 탭에 있다", () => {
    expect(FAQ.items).toHaveLength(33);
    for (const it of FAQ.items) expect(FAQ.cats).toContain(it.cat);
  });
});

describe("편집기로 쓴 개발자 노트 그리기", () => {
  const rich = { id: "r1", title: "새 글", body: "첫 문단", createdAt: Date.UTC(2026, 10, 30, 3), pinned: false, summary: "요약", hero: "/devnotes/hero-1119.webp", rich: true as const };

  it("블록 → 꼭지: 소제목이 꼭지를 열고, 이미지는 꼭지 맨 위에. 글 뒤에 온 이미지는 소제목 없는 새 꼭지", () => {
    expect(
      blocksToSections([
        { t: "p", text: "머리 글" },
        { t: "h", text: "하나" },
        { t: "img", src: "a" },
        { t: "p", text: "가" },
        { t: "p", text: "나" },
        { t: "img", src: "b" },
        { t: "p", text: "다" },
        { t: "h", text: "둘" },
      ]),
    ).toEqual([
      { img: null, heading: "", text: "머리 글" },
      { img: "a", heading: "하나", text: "가\n\n나" },
      { img: "b", heading: "", text: "다" },
      { img: null, heading: "둘", text: "" },
    ]);
  });

  it("본문이 있으면 정적 글과 같은 모양 (대표 이미지·요약·첫 문단·꼭지·맺음말), 목록용은 꼭지 없이", () => {
    const full = noticeToNote(rich, { blocks: [{ t: "h", text: "소제목" }, { t: "img", src: "x" }, { t: "p", text: "본문" }], outro: "끝" });
    expect(full).toMatchObject({ id: "r1", hero: "/devnotes/hero-1119.webp", summary: "요약", intro: "첫 문단", outro: "끝", date: "2026-11-30" });
    expect(full.sections).toEqual([{ img: "x", heading: "소제목", text: "본문" }]);
    const light = noticeToNote(rich);
    expect(light.sections).toEqual([]);
    expect(light.intro).toBe("첫 문단");
    // 합친 목록에도 같은 모양으로
    expect(mergeDevNotes([], [rich])[0]).toEqual(light);
  });

  it("예전 공지(새 필드 없음)는 지금처럼 글만", () => {
    const n = noticeToNote(notice("old", 1, { body: "가\n\n나" }));
    expect(n.hero).toBeNull();
    expect(n.summary).toBeUndefined();
    expect(n.sections).toEqual([{ img: null, heading: "", text: "나" }]);
  });
});

describe("정적 글 덮어쓰기", () => {
  const s = STATIC_NOTES.find((n) => !n.pinned)!;

  it("같은 id면 편집기로 고친 글(rich)이 정적 글을 이기고, 예전 공지(글만)는 진다", () => {
    const rich = { id: s.id, title: "고친 제목", body: "고친 첫 문단", createdAt: s.createdAt, pinned: false, rich: true as const };
    const merged = mergeDevNotes(STATIC_NOTES, [rich]);
    expect(merged).toHaveLength(STATIC_NOTES.length);
    expect(merged.find((n) => n.id === s.id)).toMatchObject({ title: "고친 제목", intro: "고친 첫 문단", fromStore: true });
    expect(mergeDevNotes(STATIC_NOTES, [notice(s.id, s.createdAt, { title: "옛 제목" })]).find((n) => n.id === s.id)?.title).toBe(s.title);
  });

  it("게임 화면 최신 글 제목도 고친 제목으로", () => {
    const top = [...STATIC_NOTES].sort((a, b) => b.createdAt - a.createdAt)[0];
    expect(latestDevNote([{ id: top.id, title: "고친 제목", createdAt: top.createdAt, rich: true }])).toEqual({ id: top.id, title: "고친 제목" });
    expect(latestDevNote([{ id: top.id, title: "옛 제목", createdAt: top.createdAt }])).toEqual({ id: top.id, title: top.title });
  });

  it("정적 글 → 블록: 소제목·이미지·글 순서. 고정 글(편지)은 그리지 않던 꼭지 이미지를 뺀다", () => {
    const blocks = noteToBlocks(s);
    expect(blocksToSections(blocks).map((x) => [x.heading, x.img])).toEqual(s.sections.map((x) => [x.heading, x.img]));
    const pinned = STATIC_NOTES.find((n) => n.pinned)!;
    expect(noteToBlocks(pinned).some((b) => b.t === "img")).toBe(false);
  });
});
