import { AVATAR_COLORS, CAMP_ARRIVE, CHAT_HISTORY_MS, CHAT_STORE_MAX, CLOSE, encodeEvent, type C2S, type MapId, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type JoinTicket } from "./channel";

// 월드 채널의 맵별 최근 채팅 저장 (DO 저장소 흉내): 서버가 잠들었다 깨도(새 ChannelCore) 늦게 온 사람이 최근 대화를 받는다.
// ChannelDO는 chatsChanged를 CHAT_SAVE_MS로 모아 chatSnapshot을 "chat:{map}"에 쓰고, 처음 쓸 때 loadChats로 읽는다 — 여기선 flush()가 모아 쓰기.

type Conn = { id: string; out: (string | ArrayBuffer)[] };

/** 잠들어도 남는 저장소 (키 = 맵) */
type Disk = Map<MapId, unknown>;

function boot(disk: Disk) {
  const pending = new Set<MapId>();
  const loads: MapId[] = [];
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: () => {},
    persist: () => {},
    saveReservation: () => {},
    dropReservation: () => {},
    requestTick: () => {},
    countChanged: () => {},
    lastPing: () => 0,
    visitorJoined: () => {},
    visitorLeft: () => {},
    verifyGrant: async () => null,
    claimNonce: () => true,
    loadChats: (map) => {
      loads.push(map);
      return disk.get(map) ?? null;
    },
    chatsChanged: (map) => void pending.add(map),
  };
  const core = new ChannelCore<Conn>({ capacity: 20, graceMs: 20_000 }, host);
  /** 모아 둔 저장을 지금 쓴다 (DO의 CHAT_SAVE_MS 타이머) — JSON을 거쳐 저장소처럼 */
  const flush = (now: number) => {
    for (const map of pending) disk.set(map, JSON.parse(JSON.stringify(core.chatSnapshot(map, now))));
    pending.clear();
  };
  const join = (id: string, now: number, map?: "camp") => {
    const c: Conn = { id, out: [] };
    const t: JoinTicket = { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood", ...(map ? { camp: true as const, map, spawn: CAMP_ARRIVE } : {}) };
    core.join(c, t, now);
    return c;
  };
  return { core, flush, join, pending, loads };
}

const send = (m: C2S) => encodeEvent(m);
const chatLog = (c: Conn) =>
  c.out
    .filter((d): d is string => typeof d === "string")
    .map((d) => JSON.parse(d) as S2C)
    .find((e): e is Extract<S2C, { t: "chatLog" }> => e.t === "chatLog");
const texts = (c: Conn) => chatLog(c)?.lines.map((l) => l.text) ?? [];

describe("최근 채팅 저장 (월드 채널)", () => {
  it("잠들었다 깨면(새 코어) 저장된 기록을 늦게 온 사람에게 보낸다. 새 줄은 기록 뒤에 붙고 저장을 덮어쓰지 않는다", () => {
    const disk: Disk = new Map();
    const s1 = boot(disk);
    const a = s1.join("a", 0);
    s1.core.message(a, send({ t: "chat", text: "안녕하세요" }), 1_000);
    s1.core.message(a, send({ t: "chat", text: "다들 어디 있어요?" }), 2_000);
    expect([...s1.pending]).toEqual(["village"]);
    s1.flush(3_000);

    // 서버가 잠들었다 깸 → 메모리는 비고 저장소만 남는다
    const s2 = boot(disk);
    const b = s2.join("b", 600_000);
    expect(texts(b)).toEqual(["안녕하세요", "다들 어디 있어요?"]);
    expect(s2.loads).toEqual(["village"]);
    // 깬 뒤 새 줄: 저장된 기록 뒤에 붙는다
    s2.core.message(b, send({ t: "chat", text: "광장이요" }), 601_000);
    s2.flush(602_000);
    const s3 = boot(disk);
    const c = s3.join("a", 603_000);
    expect(texts(c)).toEqual(["안녕하세요", "다들 어디 있어요?", "광장이요"]);
    // 내 줄은 mine
    expect(chatLog(c)?.lines.map((l) => l.mine === true)).toEqual([true, true, false]);
  });

  it("저장은 최근 50줄: 넘으면 앞에서 버린다. 하루 지난 줄은 깨어나도 보내지 않는다", () => {
    const disk: Disk = new Map();
    const s1 = boot(disk);
    const a = s1.join("a", 0);
    // 도배 제한(1초에 1개 충전)을 넘지 않게 2초 간격
    for (let i = 0; i < CHAT_STORE_MAX + 5; i++) s1.core.message(a, send({ t: "chat", text: `줄${i}` }), 10_000 + i * 2_000);
    s1.flush(200_000);
    expect(disk.get("village")).toHaveLength(CHAT_STORE_MAX);

    const s2 = boot(disk);
    const got = texts(s2.join("b", 300_000));
    expect(got).toHaveLength(CHAT_STORE_MAX);
    expect(got[0]).toBe("줄5");
    expect(got.at(-1)).toBe(`줄${CHAT_STORE_MAX + 4}`);

    // 하루 지나 깨어난 서버: 지난 줄은 보내지 않는다 (chatLog 자체가 없다)
    const s3 = boot(disk);
    const late = s3.join("c", 10_000 + (CHAT_STORE_MAX + 5) * 2_000 + CHAT_HISTORY_MS);
    expect(chatLog(late)).toBeUndefined();
  });

  it("강퇴·이용 제한된 사람의 줄은 메모리와 저장 기록에서 빠진다 (이 채널에 없어도, 아직 안 읽은 저장 기록도)", () => {
    const disk: Disk = new Map();
    const s1 = boot(disk);
    const bad = s1.join("bad", 0);
    const good = s1.join("good", 0);
    s1.core.message(bad, send({ t: "chat", text: "나쁜 말" }), 1_000);
    s1.core.message(good, send({ t: "chat", text: "좋은 말" }), 2_000);
    s1.flush(3_000);

    // 깨어난 서버에 이용 제한 (그 사람은 접속 중이 아니다)
    const s2 = boot(disk);
    expect(s2.core.expel("bad", CLOSE.BANNED, "banned", 3_500)).toBe(false);
    expect([...s2.pending]).toEqual(["village"]);
    s2.flush(4_000);
    expect(texts(s2.join("late", 5_000))).toEqual(["좋은 말"]);
    expect(JSON.stringify(disk.get("village"))).not.toContain("나쁜 말");

    // 접속 중인 사람 강퇴: 메모리 기록에서도 바로 빠진다
    const s3 = boot(disk);
    const g2 = s3.join("good", 6_000);
    s3.core.message(g2, send({ t: "chat", text: "또 좋은 말" }), 7_000);
    const k = s3.join("kick", 7_000);
    s3.core.message(k, send({ t: "chat", text: "도배" }), 8_000);
    s3.core.expel("kick", CLOSE.KICKED, "kicked", 8_500);
    expect(texts(s3.join("late2", 9_000))).toEqual(["좋은 말", "또 좋은 말"]);
    // 지울 게 없으면 저장도 하지 않는다
    s3.flush(9_500);
    s3.core.expel("nobody", CLOSE.KICKED, "kicked", 9_600);
    expect(s3.pending.size).toBe(0);
  });

  it("마을·캠핑장 기록은 따로 저장되고, 그 맵 사람에게만 간다", () => {
    const disk: Disk = new Map();
    const s1 = boot(disk);
    const v = s1.join("v", 0);
    const c = s1.join("c", 0, "camp");
    s1.core.message(v, send({ t: "chat", text: "마을 얘기" }), 1_000);
    s1.core.message(c, send({ t: "chat", text: "모닥불 얘기" }), 2_000);
    expect([...s1.pending].sort()).toEqual(["camp", "village"]);
    s1.flush(3_000);
    expect(JSON.stringify(disk.get("village"))).toContain("마을 얘기");
    expect(JSON.stringify(disk.get("village"))).not.toContain("모닥불");
    expect(JSON.stringify(disk.get("camp"))).toContain("모닥불 얘기");

    const s2 = boot(disk);
    expect(texts(s2.join("v2", 10_000))).toEqual(["마을 얘기"]);
    expect(texts(s2.join("c2", 10_000, "camp"))).toEqual(["모닥불 얘기"]);
  });
});
