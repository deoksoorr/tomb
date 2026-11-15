import { beforeAll, describe, expect, it, vi } from "vitest";

// 11/15 운영자 모습 맞추기: 운영자 표시(낫·안개·오라·칭호)는 몸·색·염색을 바꾸지 않는다.
// (예전엔 염색 안 한 운영자의 몸 색을 검은 망토색으로 덮어, 가방·상점·사냥 장비창의 연보라 유령이 마을·사냥터·다른 사람 화면에서는
//  검은 저승사자처럼 보였다 — 어디서 보든 같은 모습이어야 한다)

/** 무엇을 부르든 자기 자신을 돌려주는 가짜 Phaser 객체 (그리기 호출만 흘려보낸다) */
const stub: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : stub),
  apply: () => stub,
});
const textures: { color: string; body: string }[] = [];

vi.mock("phaser", () => ({ BlendModes: {}, default: {} }));
vi.mock("../assets/manifest", () => ({
  TEX: new Proxy({}, { get: (_t, k) => String(k) }),
  addCanvasTexture: () => {},
  avatarActAnimKey: () => "act",
  avatarAnimKey: () => "anim",
  avatarFrame: () => 0,
  ensureAvatarTexture: (_s: unknown, color: string, _look: unknown, body: string) => {
    textures.push({ color, body });
    return `av:${color}:${body}`;
  },
}));
vi.mock("./StaffFxView", () => ({ StaffFxView: class { sync() {} setVisible() {} destroy() {} } }));
vi.mock("./CosmeticFxView", () => ({ CosmeticFxView: class { setLook() {} labelTop() { return 0; } destroy() {} } }));
vi.mock("./TitleView", () => ({ TitleView: class { setStaff() {} set() {} destroy() {} } }));

type View = { setStaff(on: boolean): void; setColor(spec: string): void; colorSpec: string; bodyId: string; staff: boolean };
let AvatarView: new (scene: unknown, atlas: unknown, x: number, y: number, color: string, name: string, isMe: boolean, look?: string[], body?: string) => View;

beforeAll(async () => {
  ({ AvatarView } = (await import("./AvatarView")) as unknown as { AvatarView: typeof AvatarView });
});

const atlas = { ensure() {} };

describe("운영자 표시는 몸·색을 바꾸지 않는다", () => {
  it("염색 안 한 연보라 이불 유령 → 운영자 표시를 켜도 연보라 이불 유령 (검은 망토색으로 덮지 않는다)", () => {
    const v = new AvatarView(stub, atlas, 0, 0, "#c9b6e4", "슈퍼계정", true, [], "sheet");
    v.setStaff(true);
    expect(v.staff).toBe(true);
    expect(v.colorSpec).toBe("#c9b6e4");
    expect(v.bodyId).toBe("sheet");
    expect(textures.at(-1)).toEqual({ color: "#c9b6e4", body: "sheet" });
    // 켜진 채로 염색이 와도 그 색 그대로
    v.setColor("#c9b6e4||#30a040|");
    expect(v.colorSpec).toBe("#c9b6e4||#30a040|");
    expect(textures.at(-1)?.color).toBe("#c9b6e4||#30a040|");
    v.setStaff(false);
    expect(v.colorSpec).toBe("#c9b6e4||#30a040|");
  });
});
