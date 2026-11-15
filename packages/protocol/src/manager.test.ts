import { describe, expect, it } from "vitest";
import {
  AVATAR_BODIES,
  CHAMP_ALL,
  CHAMP_AURA_OFF,
  encodeEvent,
  ITEMS,
  JOIN_TOKEN_MAX_LEN,
  MANAGER_TITLE_ID,
  MAX_MESSAGE_BYTES,
  mgrGateLook,
  parseC2S,
  sanitizeLook,
  signGrant,
  signJoinToken,
  TITLE_IDS,
  titleOfLook,
  verifyGrant,
  verifyJoinToken,
} from "./index";

// 11/16 매니저 표시: 입장 토큰·착용 증서의 mgr (Vercel 서명) — 클라이언트가 스스로 주장할 수 없고, 매니저 전용 칭호는 mgr이 있을 때만

const S = "secret";
const base = { visitorId: "V1StGXR8_Z5jdHi6B-myT", name: "반장", color: "#aabbcc", channel: 3, look: ["hat_cat", MANAGER_TITLE_ID], body: "hood" };

describe("11/16 매니저 입장 토큰", () => {
  it("mgr 표시가 서명과 함께 오가고, 없으면 매니저 전용 칭호를 뺀다", async () => {
    const on = await verifyJoinToken(S, await signJoinToken(S, { ...base, mgr: true }));
    expect(on?.mgr).toBe(true);
    expect(titleOfLook(on?.look)).toBe(MANAGER_TITLE_ID);
    const off = await verifyJoinToken(S, await signJoinToken(S, base));
    expect(off?.mgr).toBeUndefined();
    expect(off?.look).toEqual(["hat_cat"]);
    // 값이 true가 아니면 매니저가 아니다
    expect((await verifyJoinToken(S, await signJoinToken(S, { ...base, mgr: 1 as unknown as true })))?.mgr).toBeUndefined();
  });

  it("서명을 바꿔 mgr을 끼워 넣으면 거절", async () => {
    const t = await signJoinToken(S, base);
    const [body, sig] = t.split(".");
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    const forged = btoa(JSON.stringify({ ...json, mgr: true })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifyJoinToken(S, `${forged}.${sig}`)).toBeNull();
  });

  it("가장 긴 채널 입장 토큰(운영자·매니저·도감·1위·9부위·가장 긴 칭호)도 새 한도 안", async () => {
    const longest = new Map<string, string>();
    for (const i of ITEMS) if (i.kind === "cosmetic" && i.slot && (longest.get(i.slot)?.length ?? 0) < i.id.length) longest.set(i.slot, i.id);
    const look = [...longest.values(), [...TITLE_IDS].sort((a, b) => b.length - a.length)[0]];
    const bodyId = [...AVATAR_BODIES].map((b) => b.id).sort((a, b) => b.length - a.length)[0];
    const token = await signJoinToken(S, {
      ...base,
      name: "가나다라마바사아자차카타",
      channel: 12,
      look,
      body: bodyId,
      dye: { head: "#aabbcc~g", body: "#aabbcc~s", accent: "#aabbcc~r" },
      staff: true,
      dex: 31,
      champ: CHAMP_ALL | CHAMP_AURA_OFF,
      mgr: true,
    });
    expect(token.length).toBeLessThanOrEqual(JOIN_TOKEN_MAX_LEN);
    expect((await verifyJoinToken(S, token))?.mgr).toBe(true);
  });

  it("가장 긴 사냥터 방 토큰(사냥 장비 3개·운영자·매니저)도 새 한도 안 (옛 한도 600은 넘을 수 있다)", async () => {
    const longest = new Map<string, string>();
    for (const i of ITEMS) if (i.kind === "cosmetic" && i.slot && (longest.get(i.slot)?.length ?? 0) < i.id.length) longest.set(i.slot, i.id);
    const gear = ["sgw.a.a_standing_desk+", "sgw.h.h_standing_desk+", "sgw.c.c_standing_desk+"];
    const look = [...longest.values(), ...gear, [...TITLE_IDS].sort((a, b) => b.length - a.length)[0]];
    const bodyId = [...AVATAR_BODIES].map((b) => b.id).sort((a, b) => b.length - a.length)[0];
    const token = await signJoinToken(S, {
      ...base,
      name: "가나다라마바사아자차카타",
      channel: 0,
      room: "hunt:abcdefghijklmnopqrstuvwx:abcdefghij",
      look,
      body: bodyId,
      dye: { head: "#aabbcc~g", body: "#aabbcc~s", accent: "#aabbcc~r" },
      staff: true,
      dex: 31,
      champ: CHAMP_ALL | CHAMP_AURA_OFF,
      mgr: true,
    });
    expect(token.length).toBeLessThanOrEqual(JOIN_TOKEN_MAX_LEN);
    const c = await verifyJoinToken(S, token);
    expect(c?.mgr).toBe(true);
    expect(c?.look).toEqual(sanitizeLook(look));
  });
});

describe("11/16 매니저 착용 증서", () => {
  const exp = 1_999_999_999;
  it("mgr 1·0이 실리고, 다른 값은 버린다 (옛 증서처럼 없음)", async () => {
    expect(await verifyGrant(S, await signGrant(S, { kind: "look", visitorId: "v", look: [MANAGER_TITLE_ID], exp, mgr: 1 }), exp - 10)).toMatchObject({ look: [MANAGER_TITLE_ID], mgr: 1 });
    expect(await verifyGrant(S, await signGrant(S, { kind: "look", visitorId: "v", look: [], exp, mgr: 0 }), exp - 10)).toMatchObject({ mgr: 0 });
    const odd = await verifyGrant(S, await signGrant(S, { kind: "look", visitorId: "v", look: [], exp, mgr: 2 as unknown as 1 }), exp - 10);
    expect(odd && "mgr" in odd).toBe(false);
  });

  it("가장 긴 착용 증서에 mgr이 실려도 소켓 메시지 한도 안", async () => {
    const longest = new Map<string, string>();
    for (const i of ITEMS) if (i.kind === "cosmetic" && i.slot && (longest.get(i.slot)?.length ?? 0) < i.id.length) longest.set(i.slot, i.id);
    const look = [...longest.values(), [...TITLE_IDS].sort((a, b) => b.length - a.length)[0]];
    const bodyId = [...AVATAR_BODIES].map((b) => b.id).sort((a, b) => b.length - a.length)[0];
    const g = await signGrant(S, { kind: "look", visitorId: "V1StGXR8_Z5jdHi6B-myT", look, exp, dye: { head: "#aabbcc~g", body: "#aabbcc~s", accent: "#aabbcc~r" }, body: bodyId, champ: CHAMP_ALL | CHAMP_AURA_OFF, mgr: 1 });
    const wire = encodeEvent({ t: "look", grant: g });
    expect(wire.length).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    expect(parseC2S(wire)).toEqual({ t: "look", grant: g });
  });

  it("mgrGateLook: 매니저가 아니면 매니저 칭호만 빠지고 나머지는 그대로", () => {
    const look = sanitizeLook(["hat_cat", MANAGER_TITLE_ID]);
    expect(mgrGateLook(look, true)).toEqual(look);
    expect(mgrGateLook(look, false)).toEqual(["hat_cat"]);
    const plain = sanitizeLook(["hat_cat", "t_star50"]);
    expect(mgrGateLook(plain, false)).toBe(plain);
  });
});

describe("11/16 매니저 확성기 증서", () => {
  it("확성기 증서의 mgr는 true만 싣는다", async () => {
    const exp = 1_999_999_999;
    const g = { kind: "megaphone" as const, visitorId: "v", nonce: "n1", name: "반장", text: "안녕", scope: "channel" as const, ch: 1, exp };
    expect(await verifyGrant(S, await signGrant(S, { ...g, mgr: true }), exp - 10)).toMatchObject({ kind: "megaphone", mgr: true });
    const plain = await verifyGrant(S, await signGrant(S, g), exp - 10);
    expect(plain && "mgr" in plain).toBe(false);
  });
});

