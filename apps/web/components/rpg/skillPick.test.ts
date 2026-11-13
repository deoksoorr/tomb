import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRANCHES, HOTBAR_SIZE, SKILLS, type SkillId } from "@/lib/rpg/catalog";
import { initialPick, keyPress, nextPick, slotLook, slotPress, type PickState } from "./skillPick";

const [b1, b2] = BRANCHES;
const inB1 = SKILLS.filter((x) => x.branch === b1);
const inB2 = SKILLS.filter((x) => x.branch === b2);
const activeB1 = inB1.filter((x) => x.kind === "active");
const passiveB1 = inB1.find((x) => x.kind === "passive")!;
const activeB2 = inB2.find((x) => x.kind === "active")!;

// 시험용 캐릭터: b1 액티브 두 개(A, B)와 b2 액티브 하나(C), 패시브 P를 배웠다. 안 배운 액티브 U.
const A = activeB1[0].id;
const B = activeB1[1].id;
const U = activeB1[2].id;
const P = passiveB1.id;
const C = activeB2.id;
const learned = new Set<SkillId>([A, B, C, P]);
const isPlaceable = (id: SkillId | null) => !!id && learned.has(id) && SKILLS.find((x) => x.id === id)!.kind === "active";

describe("nextPick (트리 선택)", () => {
  it("처음엔 아무것도 고르지 않는다", () => {
    expect(initialPick(b1)).toEqual({ branch: b1, picked: null });
  });

  it("누르면 그 스킬만, 다른 스킬을 누르면 그쪽으로 옮긴다. 같은 걸 또 누르면 그대로", () => {
    let s = initialPick(b1);
    s = nextPick(s, { type: "press", id: inB1[2].id });
    expect(s.picked).toBe(inB1[2].id);
    s = nextPick(s, { type: "press", id: inB1[1].id });
    expect(s.picked).toBe(inB1[1].id);
    expect(nextPick(s, { type: "press", id: inB1[1].id })).toBe(s);
  });

  it("빈 곳·Esc(clear)면 해제, 이미 비었으면 그대로", () => {
    const s = nextPick(initialPick(b1), { type: "press", id: A });
    expect(nextPick(s, { type: "clear" })).toEqual({ branch: b1, picked: null });
    const empty = initialPick(b1);
    expect(nextPick(empty, { type: "clear" })).toBe(empty);
  });

  it("끌어다 놓은 뒤 따라온 click은 선택을 바꾸지 않는다", () => {
    const s = nextPick(initialPick(b1), { type: "press", id: inB1[1].id });
    expect(nextPick(s, { type: "press", id: inB1[3].id, afterDrag: true })).toBe(s);
  });

  it("다른 갈래 스킬을 고르면(단축 칸) 그 갈래로 옮긴다", () => {
    expect(nextPick(initialPick(b1), { type: "press", id: inB2[1].id })).toEqual({ branch: b2, picked: inB2[1].id });
  });

  it("갈래 탭: 다른 갈래로 가면 선택 해제, 같은 갈래면 그대로", () => {
    const s = nextPick(initialPick(b1), { type: "press", id: inB1[2].id });
    expect(nextPick(s, { type: "branch", branch: b2 })).toEqual({ branch: b2, picked: null });
    expect(nextPick(s, { type: "branch", branch: b1 })).toBe(s);
  });
});

describe("slotPress / keyPress (단축 칸 누름·숫자 키)", () => {
  const bar: (SkillId | null)[] = [A, null, C, null, null, null];

  it("선택 없음: 채운 칸은 그 스킬을 고르고, 빈 칸은 안내", () => {
    expect(slotPress(null, false, bar, 0)).toEqual({ do: "select", id: A });
    expect(slotPress(null, false, bar, 2)).toEqual({ do: "select", id: C });
    expect(slotPress(null, false, bar, 1)).toEqual({ do: "hint", why: "empty" });
  });

  it("넣을 수 있는 스킬을 고름: 어느 칸이든 넣기(빈 칸·다른 스킬 칸), 이미 그 칸이면 안내", () => {
    expect(slotPress(B, true, bar, 1)).toEqual({ do: "place", id: B, to: 1 });
    expect(slotPress(B, true, bar, 2)).toEqual({ do: "place", id: B, to: 2 });
    expect(slotPress(A, true, bar, 3)).toEqual({ do: "place", id: A, to: 3 });
    expect(slotPress(A, true, bar, 0)).toEqual({ do: "hint", why: "already" });
  });

  it("넣을 수 없는 스킬(패시브·안 배움)을 고름: 어느 칸을 눌러도 안내만 (칸의 스킬을 고르지 않는다)", () => {
    for (let i = 0; i < HOTBAR_SIZE; i++) expect(slotPress(P, false, bar, i)).toEqual({ do: "hint", why: "blocked" });
  });

  it("끌어다 놓은 뒤 따라온 click은 아무것도 안 한다", () => {
    expect(slotPress(B, true, bar, 1, true)).toEqual({ do: "none" });
    expect(slotPress(null, false, bar, 0, true)).toEqual({ do: "none" });
  });

  it("숫자 키: 칸 누름과 같되, 선택이 없으면 안내만", () => {
    expect(keyPress(null, false, bar, 1)).toEqual({ do: "hint", why: "pickFirst" });
    expect(keyPress(B, true, bar, 2)).toEqual({ do: "place", id: B, to: 1 });
    expect(keyPress(A, true, bar, 1)).toEqual({ do: "hint", why: "already" });
    expect(keyPress(U, false, bar, 4)).toEqual({ do: "hint", why: "blocked" });
  });
});

describe("slotLook (단축 칸 테두리는 두 경우뿐)", () => {
  const bar: (SkillId | null)[] = [A, null, C, B, null, null];
  const all = (picked: SkillId | null, drag: { from: number | null } | null = null, over: number | null = null) =>
    Array.from({ length: HOTBAR_SIZE }, (_, i) => slotLook(i, bar, picked, isPlaceable(picked), drag, over));

  it("선택 없음: 아무 칸도 강조하지 않는다", () => {
    expect(all(null).every((l) => !l.mine && !l.canPreview && !l.previewNow)).toBe(true);
  });

  it("① 고른 스킬이 든 칸만 mine, ② 나머지 칸은 마우스를 올리면 미리보기 가능", () => {
    const looks = all(A);
    expect(looks.map((l) => l.mine)).toEqual([true, false, false, false, false, false]);
    expect(looks.map((l) => l.canPreview)).toEqual([false, true, true, true, true, true]);
    expect(looks.some((l) => l.previewNow)).toBe(false);
  });

  it("고른 스킬이 아직 칸에 없으면 mine 없음, 모든 칸이 미리보기 가능", () => {
    const bar2: (SkillId | null)[] = [A, null, null, null, null, null];
    const looks = Array.from({ length: HOTBAR_SIZE }, (_, i) => slotLook(i, bar2, B, true, null, null));
    expect(looks.every((l) => !l.mine && l.canPreview)).toBe(true);
  });

  it("패시브·안 배운 스킬: 미리보기 없음 (칸에 들어 있을 수도 없으니 mine도 없음)", () => {
    for (const id of [P, U]) expect(all(id).every((l) => !l.mine && !l.canPreview && !l.previewNow)).toBe(true);
  });

  it("끄는 중: 마우스 올림 미리보기는 끄고, 포인터 아래 칸만 미리보기 (끌기 시작한 칸 자신은 제외)", () => {
    const fromNode = all(A, { from: null }, 4);
    expect(fromNode.map((l) => l.previewNow)).toEqual([false, false, false, false, true, false]);
    expect(fromNode.some((l) => l.canPreview)).toBe(false);
    expect(fromNode[0].mine).toBe(true);
    expect(all(null, { from: 2 }, 2).some((l) => l.previewNow)).toBe(false);
    expect(all(null, { from: 2 }, 5)[5].previewNow).toBe(true);
    expect(all(null, { from: 2 }, null).some((l) => l.previewNow)).toBe(false);
  });
});

// ── 클릭 순서 조합: 화면이 하는 일을 그대로 흉내 낸 작은 모형으로 모든 2~3단계 순서를 돌려 본다 ──
type Ev = { k: "node"; id: SkillId } | { k: "slot"; i: number } | { k: "key"; n: number } | { k: "clear" } | { k: "tab"; b: (typeof BRANCHES)[number] };
type World = { sel: PickState; bar: (SkillId | null)[] };

/** SkillTreePanel의 place()와 같은 단축 줄 갱신 */
function placeIn(bar: (SkillId | null)[], id: SkillId, to: number) {
  const next = [...bar];
  const from = next.indexOf(id);
  if (from === to) return next;
  const prev = next[to];
  next[to] = id;
  if (from >= 0) next[from] = prev ?? null;
  return next;
}

function step(w: World, e: Ev): World {
  switch (e.k) {
    case "node":
      return { ...w, sel: nextPick(w.sel, { type: "press", id: e.id }) };
    case "clear":
      return { ...w, sel: nextPick(w.sel, { type: "clear" }) };
    case "tab":
      return { ...w, sel: nextPick(w.sel, { type: "branch", branch: e.b }) };
    case "slot":
    case "key": {
      const p = w.sel.picked;
      const a = e.k === "slot" ? slotPress(p, isPlaceable(p), w.bar, e.i) : keyPress(p, isPlaceable(p), w.bar, e.n);
      if (a.do === "place") return { ...w, bar: placeIn(w.bar, a.id, a.to) };
      if (a.do === "select") return { ...w, sel: nextPick(w.sel, { type: "press", id: a.id }) };
      return w;
    }
  }
}

const EVENTS: Ev[] = [
  ...[A, B, U, P, C].map((id) => ({ k: "node" as const, id })),
  { k: "slot", i: 0 },
  { k: "slot", i: 1 },
  { k: "slot", i: 2 },
  { k: "key", n: 2 },
  { k: "key", n: 1 },
  { k: "clear" },
  { k: "tab", b: b2 },
];

function* sequences(len: number): Generator<Ev[]> {
  if (len === 0) return yield [];
  for (const head of sequences(len - 1)) for (const e of EVENTS) yield [...head, e];
}

describe("클릭 순서 조합 (모든 1~3단계 순서)", () => {
  const start: World = { sel: initialPick(b1), bar: [A, null, C, null, null, null] };

  it("불변식: 선택은 0~1개 · 테두리는 mine(고른 스킬 칸, 최대 1칸)과 미리보기 가능 칸뿐 · 슬롯 누름은 선택을 지우거나 다른 스킬로 바꾸지 않는다(선택이 없을 때만 고름)", () => {
    let count = 0;
    for (let len = 1; len <= 3; len++) {
      for (const seq of sequences(len)) {
        let w = start;
        for (const e of seq) {
          const before = w;
          w = step(w, e);
          count++;
          const p = w.sel.picked;
          const looks = w.bar.map((_, i) => slotLook(i, w.bar, p, isPlaceable(p), null, null));
          // 선택이 없으면 아무 칸도 강조하지 않는다
          if (p === null) expect(looks.every((l) => !l.mine && !l.canPreview)).toBe(true);
          // mine은 고른 스킬이 든 칸 하나뿐
          expect(looks.filter((l) => l.mine).length).toBe(p !== null && w.bar.includes(p) ? 1 : 0);
          // 미리보기는 넣을 수 있는 스킬을 골랐을 때만, mine 칸은 빼고
          looks.forEach((l) => expect(l.canPreview).toBe(isPlaceable(p) && !l.mine));
          // 칸 누름·숫자 키: 선택이 있었으면 그대로 유지(등록 후에도), 없었으면 칸의 스킬 하나만 고르거나 그대로
          if (e.k === "slot" || e.k === "key") {
            if (before.sel.picked !== null) expect(w.sel.picked).toBe(before.sel.picked);
            else if (e.k === "slot") expect(w.sel.picked).toBe(before.bar[e.i]);
            else expect(w.sel.picked).toBeNull();
          }
          // 칸 누름으로 줄이 바뀌었다면 고른 스킬이 그 칸에 들어갔다 (다른 칸 스킬은 자리만 바꿈 또는 밀려남)
          if (e.k === "slot" && w.bar !== before.bar) {
            expect(w.bar[e.i]).toBe(before.sel.picked);
            expect(w.bar.filter((x) => x === before.sel.picked).length).toBe(1);
          }
          // 빈 곳·Esc 뒤엔 선택 없음
          if (e.k === "clear") expect(p).toBeNull();
          // 패시브·안 배운 스킬은 단축 줄에 절대 들어가지 않는다
          expect(w.bar.includes(P) || w.bar.includes(U)).toBe(false);
        }
      }
    }
    expect(count).toBeGreaterThan(EVENTS.length ** 3);
  });

  it("대표 흐름: A 고름 → 2번 칸 누름(옮김) → 선택 유지 → 2번 칸만 mine", () => {
    let w = start;
    w = step(w, { k: "node", id: A });
    w = step(w, { k: "slot", i: 1 });
    expect(w.bar).toEqual([null, A, C, null, null, null]);
    expect(w.sel.picked).toBe(A);
    expect(w.bar.map((_, i) => slotLook(i, w.bar, A, true, null, null).mine)).toEqual([false, true, false, false, false, false]);
  });

  it("대표 흐름: B 고름 → 3번 칸(C) 누름 → C는 밀려나고 B가 들어감, B 선택 유지", () => {
    let w = step(start, { k: "node", id: B });
    w = step(w, { k: "slot", i: 2 });
    expect(w.bar).toEqual([A, null, B, null, null, null]);
    expect(w.sel.picked).toBe(B);
  });

  it("대표 흐름: 선택 없이 칸 누름 → 그 칸 스킬 선택(갈래도 이동) → 다른 칸 누름 → 옮김", () => {
    let w = step(start, { k: "slot", i: 2 });
    expect(w.sel).toEqual({ branch: b2, picked: C });
    w = step(w, { k: "slot", i: 5 });
    expect(w.bar).toEqual([A, null, null, null, null, C]);
  });

  it("대표 흐름: 패시브 고른 채 채운 칸 누름 → 칸 스킬로 바뀌지 않고 안내만", () => {
    let w = step(start, { k: "node", id: P });
    w = step(w, { k: "slot", i: 0 });
    expect(w.sel.picked).toBe(P);
    expect(w.bar).toEqual(start.bar);
  });
});

describe("SkillTreePanel: 마우스 올림으로 설명이 바뀌지 않는다", () => {
  const src = readFileSync(new URL("./SkillTreePanel.tsx", import.meta.url), "utf8");

  it("hover·focus로 선택/설명을 바꾸는 처리기가 없다", () => {
    expect(src).not.toMatch(/on(Pointer|Mouse)(Enter|Over|Move)\s*=/);
    expect(src).not.toMatch(/onFocus\s*=/);
    expect(src).not.toMatch(/setHover|\bhover\b/);
  });

  it("노드는 기본 버튼(type=button, aria-pressed)이고 onClick으로만 고른다 → Enter·Space도 click으로 들어온다", () => {
    const node = src.match(/<button\s+key=\{sk\.id\}[\s\S]*?>\s*<span className=\{t\.icon\}>/)?.[0] ?? "";
    expect(node).toMatch(/type="button"/);
    expect(node).toMatch(/aria-pressed=\{picked === sk\.id\}/);
    expect(node).toMatch(/onClick=\{\(\) => select\(sk\.id\)\}/);
    expect(node).not.toMatch(/onKey(Down|Up)/);
  });

  it("단축 칸은 skillPick의 slotLook·slotPress만 따른다 (예전 data-target 같은 별도 강조 없음)", () => {
    expect(src).toMatch(/slotLook\(i, hotbar, picked, placeable, drag, over\)/);
    expect(src).toMatch(/runSlot\(slotPress\(picked, placeable, hotbar, i, suppressClick\.current\), i\)/);
    expect(src).not.toMatch(/data-target/);
  });
});
