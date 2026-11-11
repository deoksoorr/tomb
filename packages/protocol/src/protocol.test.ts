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
  plotLabel,
  inServerBounds,
  ALTAR,
  GRID_COLS,
  GRID_Y0,
  MAP_MIN_HEIGHT,
  MAP_WIDTH,
  REVIVE_SLOTS,
  SPAWN,
  WALL_THICKNESS,
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
    bad[5] = 99;
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
    const t = await signJoinToken(secret, { visitorId: "v1", name: "유령 하나", color: AVATAR_COLORS[0], channel: 3 });
    const c = await verifyJoinToken(secret, t);
    expect(c?.visitorId).toBe("v1");
    expect(c?.name).toBe("유령 하나");
    expect(c?.channel).toBe(3);
  });
  it("rejects wrong secret, tampering, expiry", async () => {
    const t = await signJoinToken(secret, { visitorId: "v1", name: "a", color: "#fff", channel: 1 }, 60, 1000);
    expect(await verifyJoinToken("other", t, 1000)).toBeNull();
    expect(await verifyJoinToken(secret, t, 1061)).toBeNull();
    expect(await verifyJoinToken(secret, t, 1059)).not.toBeNull();
    const [body, sig] = t.split(".");
    expect(await verifyJoinToken(secret, body + "x." + sig, 1000)).toBeNull();
    expect(await verifyJoinToken(secret, "garbage", 1000)).toBeNull();
  });
});

describe("world", () => {
  it("grid is symmetric around the center aisle and deterministic", () => {
    expect(GRID_COLS).toBe(16);
    expect(graveSlot(0)).toMatchObject({ x: 88, y: GRID_Y0, col: 0, row: 0 });
    expect(graveSlot(15).x).toBe(936);
    for (let c = 0; c < GRID_COLS / 2; c++) expect(graveSlot(c).x + graveSlot(GRID_COLS - 1 - c).x).toBe(MAP_WIDTH);
    // 블록 안은 48px, 블록 사이 산책로는 +32, 가운데 통로는 +64
    expect(graveSlot(1).x - graveSlot(0).x).toBe(48);
    expect(graveSlot(4).x - graveSlot(3).x).toBe(80);
    expect(graveSlot(8).x - graveSlot(7).x).toBe(112);
    expect(graveSlot(23)).toMatchObject({ col: 7, row: 1 });
    // 모든 자리가 돌담 안쪽
    for (let c = 0; c < GRID_COLS; c++) {
      expect(graveSlot(c).x).toBeGreaterThan(WALL_THICKNESS + 16);
      expect(graveSlot(c).x).toBeLessThan(MAP_WIDTH - WALL_THICKNESS - 16);
    }
  });
  it("plot labels are 1-based row/column", () => {
    expect(plotLabel(0)).toBe("1번째 줄 · 1번 자리");
    expect(plotLabel(GRID_COLS + 6)).toBe("2번째 줄 · 7번 자리");
  });
  it("map grows with graves", () => {
    expect(mapHeight(0)).toBe(MAP_MIN_HEIGHT);
    expect(mapHeight(500)).toBeGreaterThan(mapHeight(30));
    expect(mapHeight(500)).toBe(GRID_Y0 + Math.ceil(500 / GRID_COLS) * 64 + 96);
  });
  it("spawn, altar and revive slots are centered", () => {
    expect(SPAWN.x).toBe(MAP_WIDTH / 2);
    expect(ALTAR.x).toBe(MAP_WIDTH / 2);
    expect(REVIVE_SLOTS[0].x).toBe(MAP_WIDTH / 2);
    for (const s of SEATS) expect(inServerBounds(s.x, s.y)).toBe(true);
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

describe("클라이언트 버전", () => {
  it("v가 없거나 이상하면 버전 개념 이전 클라이언트(1)로 본다", async () => {
    const { parseClientVersion, LEGACY_CLIENT_VERSION, CLIENT_VERSION, MIN_CLIENT_VERSION } = await import("./constants");
    expect(parseClientVersion(null)).toBe(LEGACY_CLIENT_VERSION);
    expect(parseClientVersion("")).toBe(LEGACY_CLIENT_VERSION);
    expect(parseClientVersion("abc")).toBe(LEGACY_CLIENT_VERSION);
    expect(parseClientVersion("-3")).toBe(LEGACY_CLIENT_VERSION);
    expect(parseClientVersion("1.5")).toBe(LEGACY_CLIENT_VERSION);
    expect(parseClientVersion("3")).toBe(3);
    // 지금 빌드는 자기 자신을 받아야 한다 (올릴 때 MIN도 함께 따라 오른다)
    expect(MIN_CLIENT_VERSION).toBe(CLIENT_VERSION);
    expect(CLOSE.OUTDATED).toBe(4010);
  });
});
