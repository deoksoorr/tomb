import { beforeAll, describe, expect, it, vi } from "vitest";

// 11/12 머리 염색 풀림·외형 바꾸기 늦게 반영: 내 모습(염색·몸 모양·꾸미기)의 출처는 마지막 착용 증서(look:set) 하나.
// 어느 장면(월드·상점·집·마을)에서 Player를 만들어도 그 값으로 시작하고, 장면 안에 있는 동안 바뀌면 바로 따라간다.
// (예전엔 상점 장면이 look:set을 듣지 않아 상점 안에서 염색·외형 바꾸기를 해도 나가야 바뀌었다)

type Call = { kind: string; arg: unknown };
const views: { color: string; body: string; calls: Call[]; sprite: { scene: unknown } }[] = [];

vi.mock("phaser", () => ({}));
vi.mock("./AvatarView", () => ({
  SIT_CHAIR_LIFT: 0,
  AvatarView: class {
    calls: Call[] = [];
    sprite = {
      scene: {} as unknown,
      width: 16,
      height: 20,
      originX: 0.5,
      originY: 0.95,
      body: { setSize() {}, setOffset() {}, setCollideWorldBounds() {} },
    };
    constructor(_s: unknown, _a: unknown, _x: number, _y: number, public color: string, _n: string, _me: boolean, _l: unknown, public body: string) {
      views.push(this);
    }
    setStaff(on: boolean) {
      this.calls.push({ kind: "staff", arg: on });
    }
    setDexBadge() {}
    setChamp() {}
    // 운영자면 내 이름표도 "운영자"로 바꾼다 (Player가 부른다)
    shownName = "";
    setName(n: string) {
      this.shownName = n;
    }
    setLook(look: string[]) {
      this.calls.push({ kind: "look", arg: look });
    }
    applyAppearance(a: unknown) {
      this.calls.push({ kind: "appearance", arg: a });
    }
    destroy() {
      this.sprite.scene = undefined;
    }
  },
}));

let Player: new (scene: unknown, atlas: unknown, x: number, y: number, color: string, name: string, body?: string) => { destroy(): void };
let bridge: typeof import("../bridge").bridge;

beforeAll(async () => {
  ({ Player } = (await import("./Player")) as unknown as { Player: typeof Player });
  ({ bridge } = await import("../bridge"));
});

const scene = { physics: { add: { existing() {} } } };

describe("내 캐릭터는 마지막 착용 증서(look:set)를 따른다", () => {
  it("만들 때: 염색·몸 모양을 마지막 증서에서 (장면이 넘긴 입장 시점 값보다 먼저)", () => {
    bridge.emit("look:set", { look: [], lookGrant: "g1", dye: { head: "#e03030", body: "#30a040", accent: "#3050e0" }, body: "cat" });
    new Player(scene, {}, 0, 0, "#9fc5a8", "나", "hood");
    const v = views.at(-1)!;
    expect(v.color).toBe("#9fc5a8|#e03030|#30a040|#3050e0");
    expect(v.body).toBe("cat");
  });

  it("장면 안에 있는 동안 염색·외형 바꾸기·꾸미기가 바뀌면 바로 입힌다, 장면이 끝나면 더 듣지 않는다", () => {
    const p = new Player(scene, {}, 0, 0, "#9fc5a8", "나", "hood");
    const v = views.at(-1)!;
    v.calls.length = 0;
    bridge.emit("look:set", { look: ["hat_straw"], lookGrant: "g2", dye: { head: "#111111" }, body: "bun" });
    expect(v.calls).toEqual([
      { kind: "look", arg: ["hat_straw"] },
      { kind: "appearance", arg: { dye: { head: "#111111" }, body: "bun" } },
    ]);
    p.destroy();
    v.calls.length = 0;
    bridge.emit("look:set", { look: [], lookGrant: "g3", dye: {} });
    expect(v.calls).toEqual([]);
  });

  it("그림이 이미 사라진 Player(정리 안 된 장면)는 이벤트를 받아도 건드리지 않고 구독을 끊는다", () => {
    new Player(scene, {}, 0, 0, "#9fc5a8", "나", "hood");
    const v = views.at(-1)!;
    v.sprite.scene = undefined;
    v.calls.length = 0;
    bridge.emit("look:set", { look: [], lookGrant: "g4", dye: {} });
    bridge.emit("look:set", { look: [], lookGrant: "g5", dye: {} });
    expect(v.calls).toEqual([]);
  });
});
