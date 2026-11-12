import { describe, expect, it } from "vitest";
import {
  GRAVE_AREAS,
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
  GRID_ROWS,
  GRAVEYARD_CAPACITY,
  MAP_HEIGHT,
  MAP_MIN_HEIGHT,
  graveVisible,
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
  isIndoorSpot,
  seatSlot,
  spotSeatId,
  spotKindOfState,
  STATE_NAMES,
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
    expect(parseC2S('{"t":"away","on":true}')).toEqual({ t: "away", on: true });
    expect(parseC2S('{"t":"away","on":"yes"}')).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "sit", seatId: "x".repeat(600) }))).toBeNull();
  });

  it("5번 이모티콘·24번 벤치 상태: 정해진 id만 받는다", async () => {
    const { EMOS, SEAT_MOODS } = await import("./constants");
    expect(EMOS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(EMOS.map((e) => e.id)).size).toBe(EMOS.length);
    expect(parseC2S('{"t":"emo","id":"heart"}')).toEqual({ t: "emo", id: "heart" });
    expect(parseC2S('{"t":"emo","id":"bomb"}')).toBeNull();
    expect(parseC2S('{"t":"emo"}')).toBeNull();
    expect(SEAT_MOODS.length).toBeGreaterThanOrEqual(6);
    expect(parseC2S('{"t":"mood","m":"study"}')).toEqual({ t: "mood", m: "study" });
    expect(parseC2S('{"t":"mood","m":""}')).toEqual({ t: "mood", m: "" });
    expect(parseC2S('{"t":"mood","m":"dance"}')).toBeNull();
    expect(parseC2S('{"t":"mood"}')).toBeNull();
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
  it("묘역 두 곳(버드나무 묘역은 동물원): 칸 수 합계 = 정원, 묘역마다 가운데 통로 기준 좌우 대칭, 결정적", () => {
    expect(GRAVE_AREAS.map((a) => a.cols * a.rows)).toEqual([20, 12]);
    expect(GRAVE_AREAS.reduce((n, a) => n + a.cols * a.rows, 0)).toBe(GRAVEYARD_CAPACITY);
    expect(GRID_COLS * GRID_ROWS).toBe(GRAVEYARD_CAPACITY); // 옛 이름 호환
    expect(graveSlot(0)).toMatchObject({ x: GRAVE_AREAS[0].x0, y: GRAVE_AREAS[0].y0, col: 0, row: 0, area: "A" });
    for (const a of GRAVE_AREAS) {
      const slots = Array.from({ length: GRAVEYARD_CAPACITY }, (_, i) => graveSlot(i)).filter((s) => s.area === a.id && s.row === 0);
      const xs = slots.map((s) => s.x).sort((p, q) => p - q);
      expect(xs.length).toBe(a.cols);
      for (let c = 0; c < a.cols / 2; c++) expect(xs[c] + xs[a.cols - 1 - c]).toBe(2 * a.aisleX);
    }
    // 묘역이 넘치면 자리를 돌려 쓴다 (index % 32)
    expect(graveSlot(GRAVEYARD_CAPACITY + 5)).toEqual(graveSlot(5));
    expect(graveVisible(0, GRAVEYARD_CAPACITY + 1)).toBe(false);
    expect(graveVisible(GRAVEYARD_CAPACITY, GRAVEYARD_CAPACITY + 1)).toBe(true);
    for (let i = 0; i < GRAVEYARD_CAPACITY; i++) {
      expect(graveSlot(i).x).toBeGreaterThan(WALL_THICKNESS + 16);
      expect(graveSlot(i).y).toBeLessThan(MAP_HEIGHT);
    }
  });
  it("plot labels: 묘역 이름 + 1부터 세는 줄·자리", () => {
    expect(plotLabel(0)).toBe("옛 묘역 1번째 줄 · 1번 자리");
    expect(plotLabel(1)).toBe("다리 건너 묘역 1번째 줄 · 1번 자리");
    expect(plotLabel(3)).toBe("다리 건너 묘역 1번째 줄 · 2번 자리");
    expect(Array.from({ length: GRAVEYARD_CAPACITY }, (_, i) => plotLabel(i)).some((l) => l.includes("버드나무"))).toBe(false);
  });
  it("맵 크기는 고정 (묘비 수와 상관없다), 서버 범위도 맵 안", () => {
    expect(mapHeight(0)).toBe(MAP_HEIGHT);
    expect(mapHeight(500)).toBe(MAP_HEIGHT);
    expect(MAP_MIN_HEIGHT).toBe(MAP_HEIGHT);
    expect(inServerBounds(MAP_WIDTH, MAP_HEIGHT)).toBe(true);
    expect(inServerBounds(10, MAP_HEIGHT + 1)).toBe(false);
    expect(inServerBounds(MAP_WIDTH + 1, 10)).toBe(false);
  });
  it("spawn is centered at the gate; the revive altar is gone (deprecated names stay)", () => {
    expect(SPAWN.x).toBe(MAP_WIDTH / 2);
    expect(REVIVE_SLOTS.length).toBe(0);
    expect(typeof ALTAR.x).toBe("number");
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

describe("1인 자리 (좌석 체계 공통)", () => {
  it("의자·벤치 좌석은 sitChair 자리, 소품 자리는 종류·앵커 좌표가 id에 담긴다", async () => {
    const { seatSlot, spotSeatId, spotKindOfState, SPOT_KINDS, parseC2S: parse } = await import("./index");
    const chair = seatSlot("cA")!;
    expect(chair).toMatchObject({ kind: "seat", state: STATE.sitChair, furnitureId: "cA" });
    expect(seatSlot("bA-1")).toMatchObject({ kind: "seat", furnitureId: "bA" });
    const h = spotSeatId("hang", 60.4, 90);
    expect(h).toBe("h_60_90");
    expect(seatSlot(h)).toEqual({ id: h, kind: "hang", x: 60, y: 90, facing: SPOT_KINDS.hang.facing, state: STATE.hang, furnitureId: null });
    expect(seatSlot(spotSeatId("swing", 140, 96))).toMatchObject({ kind: "swing", state: STATE.swing, x: 140, y: 96 });
    // 정규형만 (같은 자리에 id가 둘이면 두 명이 앉을 수 있다): 앞자리 0·음수·u16 초과·모르는 종류는 거절
    for (const bad of ["h_060_90", "h_60_-1", "h_70000_1", "z_1_1", "h_1", "h_1_1_1", "H_1_1", "nope"]) expect(seatSlot(bad)).toBeUndefined();
    expect(spotKindOfState(STATE.hang)).toBe("hang");
    expect(spotKindOfState(STATE.swing)).toBe("swing");
    expect(spotKindOfState(STATE.hammock)).toBe("hammock");
    expect(seatSlot(spotSeatId("hammock", 872, 579))).toMatchObject({ kind: "hammock", state: STATE.hammock, x: 872, y: 579 });
    expect(spotKindOfState(STATE.sitChair)).toBeNull();
    // 기존 sit 이벤트 형식(16자, [A-Za-z0-9_-]) 안에 들어간다
    expect(parse(JSON.stringify({ t: "sit", seatId: spotSeatId("hang", 65535, 65535) }))).toEqual({ t: "sit", seatId: "h_65535_65535" });
    // 의자 id와 겹치지 않는다
    expect(SEATS.some((s) => s.id.includes("_"))).toBe(false);
  });

  it("50번: 조각배는 정해진 자리만(움직이는 자리), 시소·트램펄린·회전목마는 소품 자리", async () => {
    const { seatSlot, spotSeatId, spotKindOfState, BOATS, BOAT_SEATS, boatSeatById, SPOT_KINDS, STATE_NAMES, isStateId, decodeSnapshot, encodeSnapshot } = await import("./index");
    expect(BOATS.length).toBeGreaterThanOrEqual(2);
    expect(BOATS.some((b) => b.seats === 2)).toBe(true);
    expect(new Set(BOAT_SEATS.map((b) => b.id)).size).toBe(BOAT_SEATS.length);
    for (const b of BOAT_SEATS) {
      expect(b.id).toBe(spotSeatId("boat", b.x, b.y));
      expect(seatSlot(b.id)).toMatchObject({ kind: "boat", state: STATE.boat, mobile: true, furnitureId: b.boatId, radius: SPOT_KINDS.boat.radius });
      expect(boatSeatById(b.id)).toBe(b);
    }
    // 아무 좌표의 배 자리는 없다
    expect(seatSlot(spotSeatId("boat", 600, 860))).toBeUndefined();
    for (const k of ["seesaw", "trampoline", "carousel"] as const) {
      const id = spotSeatId(k, 950, 640);
      expect(seatSlot(id)).toMatchObject({ kind: k, state: STATE[k], x: 950, y: 640, furnitureId: null });
      expect(seatSlot(id)?.mobile).toBeUndefined();
      expect(spotKindOfState(STATE[k])).toBe(k);
    }
    expect(spotKindOfState(STATE.boat)).toBe("boat");
    // 새 상태 값은 바이너리로 오가고, 범위 밖은 여전히 거절
    expect(STATE_NAMES.length).toBe(18);
    expect(STATE_NAMES[STATE.carousel]).toBe("carousel");
    expect(isStateId(14)).toBe(true);
    expect(isStateId(18)).toBe(false);
    const snap = decodeSnapshot(encodeSnapshot(1, [{ sid: 3, x: 1338, y: 868, state: STATE.boat, dir: DIR.right }]));
    expect(snap?.entries[0]).toEqual({ sid: 3, x: 1338, y: 868, state: STATE.boat, dir: DIR.right });
  });
});

describe("3번 집 안 가구 자리·use 이벤트", () => {
  it("집 안 자리는 형식만 맞으면 어느 좌표든 되고, 상태와 indoor 표시가 붙는다", () => {
    const cases = [
      ["chair", STATE.sitChair],
      ["bed", STATE.lie],
      ["book", STATE.read],
      ["tub", STATE.bath],
    ] as const;
    for (const [k, st] of cases) {
      const id = spotSeatId(k, 123, 45);
      expect(seatSlot(id)).toMatchObject({ kind: k, state: st, x: 123, y: 45 });
      expect(isIndoorSpot(k)).toBe(true);
    }
    expect(STATE_NAMES[STATE.lie]).toBe("lie");
    expect(STATE_NAMES[STATE.bath]).toBe("bath");
    // 의자 자리는 sitChair를 함께 쓰므로 MOVE 상태만으로는 자리를 고르지 않는다
    expect(spotKindOfState(STATE.sitChair)).toBeNull();
    expect(spotKindOfState(STATE.lie)).toBe("bed");
    expect(isIndoorSpot("hang")).toBe(false);
    expect(isIndoorSpot("seat")).toBe(false);
  });

  it("use 이벤트 검증: id 형식과 0..255 정수만", () => {
    expect(parseC2S(JSON.stringify({ t: "use", u: "ab12", a: 7 }))).toEqual({ t: "use", u: "ab12", a: 7 });
    expect(parseC2S(JSON.stringify({ t: "use", u: "AB", a: 7 }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "use", u: "ab", a: 256 }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "use", u: "ab", a: 1.5 }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "use", u: "abcdefghi", a: 1 }))).toBeNull();
  });
});

describe("배 위 낚시 (4번)", () => {
  it("rod 메시지는 on이 boolean일 때만 받는다", async () => {
    const { parseC2S } = await import("./events");
    expect(parseC2S(JSON.stringify({ t: "rod", on: true }))).toEqual({ t: "rod", on: true });
    expect(parseC2S(JSON.stringify({ t: "rod", on: false }))).toEqual({ t: "rod", on: false });
    expect(parseC2S(JSON.stringify({ t: "rod", on: "yes" }))).toBeNull();
  });

  it("가상 배 자리와 정해진 낚시 자리의 물 종류", async () => {
    const { boatFishingSpotId, fishingWaterOf, FISHING_SPOTS } = await import("./world");
    expect(boatFishingSpotId("lake")).toBe("boat:lake");
    expect(boatFishingSpotId("river")).toBe("boat:river");
    expect(fishingWaterOf("boat:lake")).toBe("lake");
    expect(fishingWaterOf("boat:river")).toBe("river");
    expect(fishingWaterOf("boat:sea")).toBeNull();
    expect(fishingWaterOf("toString")).toBeNull();
    expect(fishingWaterOf(FISHING_SPOTS[0].id)).toBe(FISHING_SPOTS[0].water);
  });
});
