import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 11/22 회장님 독대 안전장치: 결과도 나가기도 없이 판이 끝나면(rpg:ended) 회장님 화면을 닫는다. 정상 종료 경로는 그대로
const h = vi.hoisted(() => ({ mounts: 0, unmounts: 0, aborts: [] as string[], finishes: 0, disposers: [] as (() => void)[] }));
vi.mock("phaser", () => ({
  Scene: class {
    registry = { get: () => ({ disposers: h.disposers, opts: { name: "me" } }) };
    events = { once: () => undefined };
    time = { delayedCall: () => undefined };
  },
  Scenes: { Events: { DESTROY: "destroy" } },
}));
vi.mock("./mountOverlay", () => ({
  mountChairOverlay: () => {
    h.mounts++;
    return () => void h.unmounts++;
  },
}));
vi.mock("@/lib/rpg/client", () => ({
  rpgApi: { view: async () => ({ character: { hotbar: [], skills: {}, level: 60, potions: {}, equip: {} }, derived: {} }) },
}));
vi.mock("./api", () => ({
  bestOf: () => 0,
  chairApi: {
    start: async (_m: string, practice: boolean) => ({ ticket: "t1", seed: 1, practice, remaining: { normal: 1, hell: 1 }, sealPool: [] }),
    status: async () => ({}),
    abort: async (t: string) => {
      h.aborts.push(t);
      return { ok: true, refunded: true, remaining: { normal: 1, hell: 1 }, refundLeft: 0 };
    },
    finish: async () => {
      h.finishes++;
      return { damage: 1, points: 0, newBest: false, best: 1, remaining: { normal: 0, hell: 1 } };
    },
  },
}));

const { bridge } = await import("../bridge");
const { ChairmanHostScene } = await import("./ChairmanHostScene");
type Play = { chairman?: { ended: (r: { damage: number; durationMs: number; timeUp: boolean; potionsUsed: Record<string, number> }) => void } };

const flush = () => new Promise((r) => setTimeout(r, 0));
const ended = () => bridge.emit("rpg:ended", { result: {} as never, aborted: true });

describe("ChairmanHostScene 판 끝 안전장치", () => {
  let offs: (() => void)[] = [];
  let play: Play | null = null;
  beforeEach(() => {
    Object.assign(h, { mounts: 0, unmounts: 0, aborts: [], finishes: 0 });
    play = null;
    offs = [bridge.on("rpg:play", (p) => void (play = p as Play)), bridge.on("rpg:quit", ended)];
    new ChairmanHostScene().create();
  });
  afterEach(() => {
    offs.forEach((o) => o());
    // 씬 정리 (다음 시험에 지난 씬의 구독이 남지 않게)
    for (const d of h.disposers.splice(0)) d();
  });

  async function enter(practice = false) {
    bridge.emit("chairman:enter", { mode: "normal", practice });
    await flush();
    await flush();
    expect(play).not.toBeNull();
    expect(h.mounts).toBe(1);
  }

  it("시작 전에 다른 길로 판이 끝나면 판을 돌려받고 화면을 닫는다", async () => {
    await enter();
    ended();
    await flush();
    expect(h.aborts).toEqual(["t1"]);
    expect(h.unmounts).toBe(1);
  });

  it("연습 판도 화면을 닫는다 (돌려받기는 부르지 않는다)", async () => {
    await enter(true);
    ended();
    await flush();
    expect(h.aborts).toEqual([]);
    expect(h.unmounts).toBe(1);
  });

  it("정상: 결과를 낸 뒤 [마을로] — 결과 창은 그대로 있다가 마을로에서 한 번만 닫힌다", async () => {
    await enter();
    play!.chairman!.ended({ damage: 1, durationMs: 1000, timeUp: false, potionsUsed: {} });
    await flush();
    expect(h.finishes).toBe(1);
    expect(h.unmounts).toBe(0);
    bridge.emit("chairman:exit");
    await flush();
    expect(h.unmounts).toBe(1);
    expect(h.aborts).toEqual([]);
  });

  it("정상: 결과 뒤 [한 판 더]는 화면을 닫지 않고 다음 판으로", async () => {
    await enter();
    play!.chairman!.ended({ damage: 1, durationMs: 1000, timeUp: false, potionsUsed: {} });
    await flush();
    play = null;
    bridge.emit("chairman:retry");
    await flush();
    await flush();
    expect(play).not.toBeNull();
    expect(h.unmounts).toBe(0);
    expect(h.aborts).toEqual([]);
  });

  it("정상: 브리핑 「나가기」는 돌려받기 한 번 + 화면 한 번만 닫는다", async () => {
    await enter();
    bridge.emit("chairman:leave");
    await flush();
    await flush();
    expect(h.aborts).toEqual(["t1"]);
    expect(h.unmounts).toBe(1);
  });
});
