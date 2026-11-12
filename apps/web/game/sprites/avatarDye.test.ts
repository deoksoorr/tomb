import { AVATAR_BODIES } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { avatarColors, avatarColorSpec, avatarFrameGrid } from "./avatar";

// 46번 아바타 3부위 색: 염색 전에는 예전과 똑같이, 염색한 부위만 바뀐다

const BASE = "#9fc5a8";
const px = (g: ReturnType<typeof avatarFrameGrid>) => [...g.px];
const diff = (a: number[], b: number[]) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);

describe("46번 아바타 3부위 색", () => {
  it("색 표기: 염색이 없으면 기본색 그대로, 있으면 부위별", () => {
    expect(avatarColorSpec(BASE)).toBe(BASE);
    expect(avatarColorSpec(BASE, {})).toBe(BASE);
    expect(avatarColorSpec(BASE, { accent: "#f4a7b9" })).toBe(`${BASE}|||#f4a7b9`);
    // 이미 표기인 값에 다시 입혀도 기본색만 남기고 새로 쓴다
    expect(avatarColorSpec(`${BASE}|#000000||`, { body: "#111111" })).toBe(`${BASE}||#111111|`);
    expect(avatarColors(`${BASE}|||#f4a7b9`)).toEqual({ base: 0x9fc5a8, head: 0x9fc5a8, body: 0x9fc5a8, accent: 0xf4a7b9 });
  });

  it("머리·몸을 기본색으로 칠하면 염색 전과 같은 그림 (6종 모두)", () => {
    for (const b of AVATAR_BODIES)
      for (const view of ["down", "side", "up"] as const)
        expect(diff(px(avatarFrameGrid(b.id, view, 0, `${BASE}|${BASE}|${BASE}|`)), px(avatarFrameGrid(b.id, view, 0, BASE))), `${b.id} ${view}`).toBe(0);
  });

  it("머리·몸·포인트를 따로 염색하면 6종 모두 그 부위가 바뀐다", () => {
    for (const b of AVATAR_BODIES) {
      const plain = px(avatarFrameGrid(b.id, "down", 0, BASE));
      for (const part of ["head", "body", "accent"] as const) {
        const dyed = px(avatarFrameGrid(b.id, part === "accent" && b.id === "bun" ? "side" : "down", 0, avatarColorSpec(BASE, { [part]: "#d0306a" })));
        const ref = part === "accent" && b.id === "bun" ? px(avatarFrameGrid(b.id, "side", 0, BASE)) : plain;
        expect(diff(dyed, ref), `${b.id} ${part}`).toBeGreaterThan(0);
      }
    }
  });

  it("머리만 염색하면 망토(몸)는 그대로, 몸만 염색하면 얼굴 쪽은 그대로 (두건)", () => {
    const plain = avatarFrameGrid("hood", "down", 0, BASE);
    const head = avatarFrameGrid("hood", "down", 0, avatarColorSpec(BASE, { head: "#d0306a" }));
    const body = avatarFrameGrid("hood", "down", 0, avatarColorSpec(BASE, { body: "#d0306a" }));
    // 망토 아랫단 줄(23)은 머리 염색과 무관
    for (let x = 0; x < plain.w; x++) expect(head.get(x, 23)).toBe(plain.get(x, 23));
    // 두건 윗줄(12)은 몸 염색과 무관
    for (let x = 0; x < plain.w; x++) expect(body.get(x, 12)).toBe(plain.get(x, 12));
  });
});
