import { AVATAR_COLORS, signJoinToken } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { admit, corsHeaders, decodeTicket, encodeTicket, isAllowedOrigin, parseOrigins } from "./auth";
import { readConfig } from "./config";

const SECRET = "test-secret";

describe("origins", () => {
  const allowed = parseOrigins(" http://localhost:3000, https://Example.com/ ,");
  it("parses and normalizes the allow list", () => {
    expect([...allowed]).toEqual(["http://localhost:3000", "https://example.com"]);
  });
  it("matches exact origins only", () => {
    expect(isAllowedOrigin("http://localhost:3000", allowed)).toBe(true);
    expect(isAllowedOrigin("https://example.com", allowed)).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com", allowed)).toBe(false);
    expect(isAllowedOrigin(null, allowed)).toBe(false);
    expect(isAllowedOrigin("http://localhost:3000", parseOrigins(undefined))).toBe(false);
  });
  it("echoes allowed origins in CORS headers", () => {
    expect(corsHeaders("http://localhost:3000", allowed)["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
    expect(corsHeaders("https://evil.com", allowed)["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

describe("admit", () => {
  const claims = { visitorId: "V1StGXR8_Z5jdHi6B-myT", name: "  달빛   산책 ", color: AVATAR_COLORS[2], channel: 3 };

  it("verifies the token and builds a ticket", async () => {
    const t = await admit(SECRET, await signJoinToken(SECRET, claims), 3, { x: 1, y: 2 });
    expect(t).toEqual({ visitorId: claims.visitorId, name: "달빛 산책", color: AVATAR_COLORS[2], channel: 3, spawn: { x: 1, y: 2 } });
  });

  it("rejects bad signatures, expired tokens, missing secret, odd visitor ids and other channels", async () => {
    const good = await signJoinToken(SECRET, claims);
    expect(await admit(SECRET, good, 3, undefined)).not.toBeNull();
    expect(await admit(SECRET, good, 4, undefined)).toBeNull(); // 3채널용 토큰으로 4채널에 들어갈 수 없다
    expect(await admit("other-secret", good, 3, undefined)).toBeNull();
    expect(await admit(undefined, good, 3, undefined)).toBeNull();
    expect(await admit(SECRET, null, 3, undefined)).toBeNull();
    expect(await admit(SECRET, "garbage", 3, undefined)).toBeNull();
    expect(await admit(SECRET, await signJoinToken(SECRET, claims, -1), 3, undefined)).toBeNull();
    expect(await admit(SECRET, await signJoinToken(SECRET, { ...claims, visitorId: "a b" }), 3, undefined)).toBeNull();
  });

  it("clamps the name length and falls back to a preset color", async () => {
    const t = await admit(SECRET, await signJoinToken(SECRET, { ...claims, name: "가".repeat(30), color: "red" }), 3, undefined);
    expect(t?.name).toBe("가".repeat(12));
    expect(t?.color).toBe(AVATAR_COLORS[0]);
  });

  it("round-trips the internal ticket header with Korean names", () => {
    const t = { visitorId: "abc", name: "한때는", color: AVATAR_COLORS[0], channel: 2 };
    const raw = encodeTicket(t);
    expect(raw).toMatch(/^[\x20-\x7e]+$/); // ByteString
    expect(decodeTicket(raw)).toEqual(t);
    expect(decodeTicket("%7Bnope")).toBeNull();
    expect(decodeTicket(null)).toBeNull();
  });
});

describe("readConfig", () => {
  it("uses defaults and rejects invalid values", () => {
    expect(readConfig({})).toEqual({ capacity: 40, maxChannels: 10, threshold: 0.8, graceMs: 20_000 });
    expect(
      readConfig({ CHANNEL_CAPACITY: "25", MAX_CHANNELS: "3", AUTO_OPEN_THRESHOLD: "0.5", RECONNECT_GRACE_SEC: "0" }),
    ).toEqual({ capacity: 25, maxChannels: 3, threshold: 0.5, graceMs: 0 });
    expect(readConfig({ CHANNEL_CAPACITY: "abc", MAX_CHANNELS: "2.5", AUTO_OPEN_THRESHOLD: "3", RECONNECT_GRACE_SEC: "-1" })).toEqual(
      readConfig({}),
    );
  });
});
