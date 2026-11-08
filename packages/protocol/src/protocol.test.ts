import { describe, expect, it } from "vitest";
import {
  AVATAR_COLORS,
  CLOSE,
  DIR,
  MOVE_BYTES,
  SEATS,
  STATE,
  checkName,
  decodeMove,
  decodeSnapshot,
  encodeMove,
  encodeSnapshot,
  flowerStack,
  graveSlot,
  graveTier,
  mapHeight,
  parseC2S,
  pickChannel,
  signJoinToken,
  verifyJoinToken,
  type LobbyInfo,
} from "./index";

describe("binary", () => {
  it("MOVE is 9 bytes and round-trips", () => {
    const buf = encodeMove({ x: 321.6, y: 70000, state: STATE.run, dir: DIR.left, seq: 65537 });
    expect(buf.byteLength).toBe(MOVE_BYTES);
    expect(decodeMove(buf)).toEqual({ x: 322, y: 65535, state: STATE.run, dir: DIR.left, seq: 1 });
    expect(decodeMove(new Uint8Array(buf))).not.toBeNull();
  });
  it("rejects malformed MOVE", () => {
    expect(decodeMove(new ArrayBuffer(8))).toBeNull();
    const bad = new Uint8Array(encodeMove({ x: 1, y: 1, state: 0, dir: 0, seq: 0 }));
    bad[5] = 9;
    expect(decodeMove(bad)).toBeNull();
  });
  it("SNAPSHOT round-trips, 40 entries fit 512 bytes", () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({ sid: i + 1, x: i * 10, y: i * 20, state: STATE.walk, dir: DIR.up }));
    const buf = encodeSnapshot(70000, entries);
    expect(buf.byteLength).toBe(4 + 40 * 8);
    expect(buf.byteLength).toBeLessThanOrEqual(512);
    const s = decodeSnapshot(buf)!;
    expect(s.tick).toBe(70000 & 0xffff);
    expect(s.entries).toEqual(entries);
  });
});

describe("events", () => {
  it("parses valid and rejects invalid C2S", () => {
    expect(parseC2S('{"t":"sit","seatId":"bA-0"}')).toEqual({ t: "sit", seatId: "bA-0" });
    expect(parseC2S('{"t":"emote","kind":"flower","graveId":"abc_123"}')).toEqual({ t: "emote", kind: "flower", graveId: "abc_123" });
    expect(parseC2S('{"t":"emote","kind":"bomb","graveId":"a"}')).toBeNull();
    expect(parseC2S("not json")).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "sit", seatId: "x".repeat(600) }))).toBeNull();
  });
});

describe("token", () => {
  const secret = "s3cret";
  it("signs and verifies", async () => {
    const t = await signJoinToken(secret, { visitorId: "v1", name: "유령 하나", color: AVATAR_COLORS[0] });
    const c = await verifyJoinToken(secret, t);
    expect(c?.visitorId).toBe("v1");
    expect(c?.name).toBe("유령 하나");
  });
  it("rejects wrong secret, tampering, expiry", async () => {
    const t = await signJoinToken(secret, { visitorId: "v1", name: "a", color: "#fff" }, 60, 1000);
    expect(await verifyJoinToken("other", t, 1000)).toBeNull();
    expect(await verifyJoinToken(secret, t, 1061)).toBeNull();
    expect(await verifyJoinToken(secret, t, 1059)).not.toBeNull();
    const [body, sig] = t.split(".");
    expect(await verifyJoinToken(secret, body + "x." + sig, 1000)).toBeNull();
    expect(await verifyJoinToken(secret, "garbage", 1000)).toBeNull();
  });
});

describe("world", () => {
  it("grid is symmetric around the aisle and deterministic", () => {
    expect(graveSlot(0)).toMatchObject({ x: 72, y: 416, col: 0, row: 0 });
    expect(graveSlot(9).x).toBe(568);
    expect(graveSlot(4).x + graveSlot(5).x).toBe(640);
    expect(graveSlot(23)).toMatchObject({ col: 3, row: 2 });
  });
  it("map grows with graves", () => {
    expect(mapHeight(0)).toBe(960);
    expect(mapHeight(500)).toBeGreaterThan(mapHeight(30));
  });
  it("seat ids are unique", () => {
    expect(new Set(SEATS.map((s) => s.id)).size).toBe(SEATS.length);
  });
  it("tiers and flowers", () => {
    expect(graveTier(3)).toBe("woodSign");
    expect(graveTier(30)).toBe("smallStone");
    expect(graveTier(200)).toBe("largeStone");
    expect(graveTier(400)).toBe("pagoda");
    expect(flowerStack(0)).toBe(0);
    expect(flowerStack(1)).toBe(1);
    expect(flowerStack(10_000)).toBe(8);
  });
});

describe("lobby", () => {
  const base = (counts: number[], open = counts.map(() => true)): LobbyInfo => ({
    channels: counts.map((count, i) => ({ id: i + 1, count, cap: 40, open: open[i] })),
    total: counts.reduce((a, b) => a + b, 0),
    totalCap: 400,
    maxChannels: 10,
    threshold: 0.8,
  });
  it("prefers the busiest calm channel", () => {
    expect(pickChannel(base([10, 25, 5]))).toBe(2);
  });
  it("opens the next channel when all open are busy", () => {
    expect(pickChannel(base([35, 33]))).toBe(3);
  });
  it("returns null when everything is full", () => {
    expect(pickChannel(base(Array(10).fill(40)))).toBeNull();
  });
  it("respects exclusions", () => {
    expect(pickChannel(base([10, 25]), new Set([2]))).toBe(1);
  });
});

describe("names", () => {
  it("validates", () => {
    expect(checkName("  유령   하나 ")).toEqual({ ok: true, name: "유령 하나" });
    expect(checkName("a").ok).toBe(false);
    expect(checkName("가".repeat(13)).ok).toBe(false);
    expect(checkName("hi!").ok).toBe(false);
    expect(checkName("관리 자").ok).toBe(false);
    expect(checkName("Fu_ck").ok).toBe(false);
    expect(checkName("dev_kim 2").ok).toBe(true);
  });
  it("close codes", () => {
    expect(CLOSE.CHANNEL_FULL).toBe(4001);
    expect(CLOSE.REPLACED).toBe(4002);
    expect(CLOSE.RATE_LIMITED).toBe(4008);
  });
});
