import { AVATAR_COLORS, CLOSE, CONN_LOG_BATCH, CONN_LOG_FLUSH_MS, INTERNAL_SIG_HEADER, MAINT_OFF, connDeviceOf, connWhyOf, maintRejects, parseMaint, publicMaint, verifyInternal, type ConnLogWire } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type PeerRecord, type Reservation } from "./channel";
import { CONN_LOG_PATH, ConnLogBuffer, logOrigin, sendConnLog } from "./connLog";

// 11/26 점검 모드(운영자 빼고 4013으로 끊기·새 입장 거절)와 접속 기록(나감 종류·기기·묶어 보내기)

type Conn = { id: string; out: (string | ArrayBuffer)[]; closed?: { code: number; reason: string }; att?: PeerRecord | null };

function setup() {
  const reservations = new Map<number, Reservation>();
  const left: [string, number | undefined][] = [];
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: (c, code, reason) => void (c.closed = { code, reason }),
    persist: (c, rec) => void (c.att = rec),
    saveReservation: (r) => void reservations.set(r.sid, r),
    dropReservation: (sid) => void reservations.delete(sid),
    requestTick: () => {},
    countChanged: () => {},
    lastPing: () => 0,
    visitorJoined: () => {},
    visitorLeft: (v, code) => void left.push([v, code]),
    verifyGrant: async () => null,
    claimNonce: () => true,
  };
  const core = new ChannelCore<Conn>({ capacity: 5, graceMs: 20_000, room: false }, host);
  const join = (id: string, staff = false, at = 0) => {
    const c: Conn = { id, out: [] };
    core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood", ...(staff ? { staff: true as const } : {}) }, at);
    return c;
  };
  return { core, reservations, left, join };
}

describe("점검 모드 — 채널", () => {
  it("운영자 빼고 접속 중인 사람·유예 중인 사람을 모두 4013으로 정리한다", () => {
    const { core, join, reservations, left } = setup();
    const a = join("a");
    const b = join("b");
    const staff = join("boss", true);
    core.disconnect(b, 1006, 1); // 유예 중
    expect(reservations.size).toBe(1);
    expect(core.expelForMaintenance()).toBe(2);
    expect(a.closed).toEqual({ code: CLOSE.MAINTENANCE, reason: "maintenance" });
    expect(staff.closed).toBeUndefined();
    expect(reservations.size).toBe(0);
    expect(left).toEqual([
      ["a", CLOSE.MAINTENANCE],
      ["b", CLOSE.MAINTENANCE],
    ]);
    // 두 번 불러도 운영자는 그대로
    expect(core.expelForMaintenance()).toBe(0);
  });

  it("점검 중 입장 거절: 운영자 토큰만 통과", () => {
    const on = parseMaint({ on: true, msg: "점검", until: null, at: 1 });
    expect(maintRejects(on, false)).toBe(true);
    expect(maintRejects(on, true)).toBe(false);
    expect(maintRejects(MAINT_OFF, false)).toBe(false);
  });

  it("상태 모양: 문구 길이·통과 해시 형식을 거르고, 브라우저용에는 통과 목록이 없다", () => {
    const s = parseMaint({ on: true, msg: "가".repeat(500), until: -1, at: 5, skip: ["0123456789abcdef", "nope", 3] });
    expect([...s.msg].length).toBe(120);
    expect(s.until).toBeNull();
    expect(s.skip).toEqual(["0123456789abcdef"]);
    expect(publicMaint(s)).toEqual({ on: true, msg: s.msg, until: null, at: 5 });
    expect(parseMaint(null)).toEqual(MAINT_OFF);
  });
});

describe("접속 기록 — 나감 종류", () => {
  it("마지막 닫힘 코드가 최종 퇴장 때 넘어간다 (창 닫음은 유예가 끝난 뒤)", () => {
    const { core, join, left } = setup();
    const a = join("a");
    core.disconnect(a, 1001, 0);
    expect(left).toEqual([]); // 유예 중
    core.expire(30_000);
    expect(left).toEqual([["a", 1001]]);
    const b = join("b", false, 40_000);
    core.disconnect(b, 1000, 40_001); // 정상 종료는 바로
    expect(left[1]).toEqual(["b", 1000]);
  });

  it("유예 안에 돌아오면 닫힘 코드를 잊는다", () => {
    const { core, join, left } = setup();
    const a = join("a");
    core.disconnect(a, 1006, 0);
    const a2 = join("a", false, 5_000);
    core.disconnect(a2, 1000, 6_000);
    expect(left).toEqual([["a", 1000]]);
  });

  it("코드 → 종류, 기기 종류", () => {
    expect([1000, 1001, 1006, 4000, 1011, 4010, 4011, 4012, 4013, 4002, undefined].map(connWhyOf)).toEqual([
      "normal", "closed", "drop", "timeout", "error", "outdated", "kicked", "kicked", "maint", "replaced", "drop",
    ]);
    expect(connDeviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit KAKAOTALK 10.4")).toBe("phone·카카오톡");
    expect(connDeviceOf("Mozilla/5.0 (iPad; CPU OS 17_0) Safari")).toBe("tablet");
    expect(connDeviceOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe("pc");
    expect(connDeviceOf(null)).toBe("pc");
  });
});

describe("접속 기록 — 묶어 보내기", () => {
  const row = (i: number): ConnLogWire => [`v${i}`, "i", 1000 + i, 1, "pc", ""];

  it("1분마다 또는 한 묶음이 차면 보낸다", () => {
    const b = new ConnLogBuffer();
    expect(b.due()).toBeNull();
    expect(b.add(row(0), 100)).toBe(false);
    expect(b.due()).toBe(100 + CONN_LOG_FLUSH_MS);
    for (let i = 1; i < CONN_LOG_BATCH - 1; i++) b.add(row(i), 200);
    expect(b.add(row(CONN_LOG_BATCH), 300)).toBe(true);
    b.add(row(999), 300);
    expect(b.take(400)).toHaveLength(CONN_LOG_BATCH);
    expect(b.size).toBe(1);
    expect(b.due()).toBe(1_400); // 남은 것은 곧바로 다음 묶음
    const rest = b.take(500);
    expect(rest).toHaveLength(1);
    expect(b.due()).toBeNull();
    b.putBack(rest, 600); // 실패한 묶음은 다음 주기에
    expect(b.size).toBe(1);
    expect(b.due()).toBe(600 + CONN_LOG_FLUSH_MS);
  });

  it("11/26 저장해 둔 줄을 깨어나서 되살리면 곧 보낸다 (한가한 로비가 내려가도 잃지 않게)", () => {
    const a = new ConnLogBuffer();
    a.add(row(1), 100);
    a.add(row(2), 200);
    const saved = JSON.parse(JSON.stringify(a.snapshot())) as unknown;
    const b = new ConnLogBuffer();
    b.restore(saved, 5_000);
    expect(b.size).toBe(2);
    expect(b.due()).toBe(6_000);
    expect(b.take(6_000)).toEqual([row(1), row(2)]);
    b.restore(null, 7_000);
    b.restore("x", 7_000);
    expect(b.size).toBe(0);
  });

  it("웹 주소는 ALLOWED_ORIGINS의 첫 주소 (로컬은 localhost, 운영 주소로 새지 않는다)", () => {
    expect(logOrigin("http://localhost:3123,http://127.0.0.1:3123")).toBe("http://localhost:3123");
    expect(logOrigin("")).toBeNull();
    expect(logOrigin(undefined)).toBeNull();
  });

  it("서명해서 보내고, 웹이 4xx면 버리고 네트워크 실패면 다시 보낼 수 있게 false", async () => {
    const env = { ALLOWED_ORIGINS: "http://localhost:3123", JOIN_SECRET: "s" };
    let got: { url: string; body: string; sig: string | null } | null = null;
    const ok = await sendConnLog(env, [row(1)], (async (url: string, init: RequestInit) => {
      got = { url, body: String(init.body), sig: new Headers(init.headers).get(INTERNAL_SIG_HEADER) };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch);
    expect(ok).toBe(true);
    expect(got!.url).toBe("http://localhost:3123" + CONN_LOG_PATH);
    const r = await verifyInternal("s", got!.body, got!.sig);
    expect(r).toMatchObject({ op: "connLog", rows: [row(1)] });
    expect(await sendConnLog(env, [row(1)], (async () => new Response("", { status: 404 })) as unknown as typeof fetch)).toBe(true);
    expect(await sendConnLog(env, [row(1)], (async () => { throw new Error("down"); }) as unknown as typeof fetch)).toBe(false);
    // 보낼 곳이 없으면 버린다
    expect(await sendConnLog({ ALLOWED_ORIGINS: "", JOIN_SECRET: "s" }, [row(1)], (async () => { throw new Error("x"); }) as unknown as typeof fetch)).toBe(true);
  });

  it("서명 검사: 모양이 틀린 줄이 섞이면 묶음째 버린다", async () => {
    const { signInternal } = await import("@tomb/protocol");
    const bad = await signInternal("s", { op: "connLog", rows: [["v", "x" as "i", 1, 1, "pc", ""]], exp: Math.floor(Date.now() / 1000) + 10 });
    expect(await verifyInternal("s", bad.body, bad.sig)).toBeNull();
    const m = await signInternal("s", { op: "maint", on: true, msg: "점검", until: null, skip: [], exp: Math.floor(Date.now() / 1000) + 10 });
    expect(await verifyInternal("s", m.body, m.sig)).toMatchObject({ op: "maint", on: true, msg: "점검", until: null });
  });
});
