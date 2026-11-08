import { EMPTY_CHANNEL_HIDE_MS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { applyReport, computeLobby, emptyLobby } from "./lobbyState";

const cfg = { capacity: 40, maxChannels: 10, threshold: 0.8 };
const openIds = (s: ReturnType<typeof emptyLobby>, now: number) =>
  computeLobby(s, cfg, now).info.channels.filter((c) => c.open).map((c) => c.id);

describe("computeLobby", () => {
  it("lists every channel id with channel 1 always open", () => {
    const { info, opened } = computeLobby(emptyLobby(), cfg, 0);
    expect(info.channels.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(info.channels.filter((c) => c.open).map((c) => c.id)).toEqual([1]);
    expect(info).toMatchObject({ total: 0, totalCap: 400, maxChannels: 10, threshold: 0.8 });
    expect(opened).toBeNull();
  });

  it("keeps an emptied channel listed for 5 minutes, then hides it (channel 1 never hides)", () => {
    const s = emptyLobby();
    applyReport(s, 1, 0, 0);
    applyReport(s, 3, 5, 0);
    expect(openIds(s, 10)).toEqual([1, 3]);
    applyReport(s, 3, 0, 1_000);
    expect(openIds(s, 1_000 + EMPTY_CHANNEL_HIDE_MS - 1)).toEqual([1, 3]);
    expect(openIds(s, 1_000 + EMPTY_CHANNEL_HIDE_MS)).toEqual([1]);
  });

  it("opens the next channel when every open channel is ≥ threshold, one at a time", () => {
    const s = emptyLobby();
    applyReport(s, 1, 31, 0);
    expect(computeLobby(s, cfg, 0).opened).toBeNull();
    applyReport(s, 1, 32, 0); // 40 × 0.8
    const r = computeLobby(s, cfg, 0);
    expect(r.opened).toBe(2);
    expect(r.info.channels.filter((c) => c.open).map((c) => c.id)).toEqual([1, 2]);
    // 새로 연 2채널은 비어 있으므로 3채널은 열리지 않는다
    expect(computeLobby(s, cfg, 1).opened).toBeNull();
    expect(openIds(s, 1)).toEqual([1, 2]);
  });

  it("keeps an auto-opened empty channel listed for 5 minutes", () => {
    const s = emptyLobby();
    applyReport(s, 1, 40, 0);
    computeLobby(s, cfg, 0);
    applyReport(s, 1, 10, 1);
    expect(openIds(s, EMPTY_CHANNEL_HIDE_MS - 1)).toEqual([1, 2]);
    expect(openIds(s, EMPTY_CHANNEL_HIDE_MS)).toEqual([1]);
  });

  it("does nothing once all channels are open and full", () => {
    const s = emptyLobby();
    for (let id = 1; id <= 10; id++) applyReport(s, id, 40, 0);
    const { info, opened } = computeLobby(s, cfg, 0);
    expect(opened).toBeNull();
    expect(info.total).toBe(400);
    expect(info.channels.every((c) => c.open && c.count === 40)).toBe(true);
  });

  it("applyReport tells whether the count changed", () => {
    const s = emptyLobby();
    expect(applyReport(s, 2, 0, 0)).toBe(false);
    expect(applyReport(s, 2, 12, 0)).toBe(true);
    expect(applyReport(s, 2, 12, 1)).toBe(false);
    expect(applyReport(s, 2, 0, 2)).toBe(true);
    expect(computeLobby(s, cfg, 3).info.channels[1]).toMatchObject({ count: 0, open: true });
  });
});
