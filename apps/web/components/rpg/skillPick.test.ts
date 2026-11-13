import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRANCHES, SKILLS } from "@/lib/rpg/catalog";
import { firstSkillOf, initialPick, nextPick } from "./skillPick";

const [b1, b2] = BRANCHES;
const inB1 = SKILLS.filter((x) => x.branch === b1);
const inB2 = SKILLS.filter((x) => x.branch === b2);

describe("nextPick (스킬 창 선택)", () => {
  it("처음엔 갈래 첫 스킬", () => {
    expect(initialPick(b1)).toEqual({ branch: b1, picked: firstSkillOf(b1) });
  });

  it("누르면(클릭·탭·Enter·Space) 그 스킬로 바뀌고, 다른 스킬을 누르기 전까지 그대로", () => {
    let s = initialPick(b1);
    s = nextPick(s, { type: "press", id: inB1[2].id });
    expect(s.picked).toBe(inB1[2].id);
    s = nextPick(s, { type: "press", id: inB1[2].id });
    expect(s.picked).toBe(inB1[2].id);
    s = nextPick(s, { type: "press", id: inB1[1].id });
    expect(s.picked).toBe(inB1[1].id);
  });

  it("끌어다 놓은 뒤 따라온 click은 선택을 바꾸지 않는다", () => {
    const s = nextPick(initialPick(b1), { type: "press", id: inB1[1].id });
    expect(nextPick(s, { type: "press", id: inB1[3].id, afterDrag: true })).toBe(s);
  });

  it("다른 갈래 스킬을 누르면(단축 칸) 그 갈래로 옮긴다", () => {
    expect(nextPick(initialPick(b1), { type: "press", id: inB2[1].id })).toEqual({ branch: b2, picked: inB2[1].id });
  });

  it("갈래 탭: 고른 스킬이 그 갈래 것이 아니면 첫 스킬, 같은 갈래면 그대로", () => {
    const s = nextPick(initialPick(b1), { type: "press", id: inB1[2].id });
    expect(nextPick(s, { type: "branch", branch: b2 })).toEqual({ branch: b2, picked: firstSkillOf(b2) });
    expect(nextPick(s, { type: "branch", branch: b1 })).toBe(s);
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
});
