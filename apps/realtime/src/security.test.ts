// 11/18 보안 검토로 막은 실시간 서버 구멍들 (scratchpad rt/poc.test.ts 시나리오)
//  - 정상 종료(1000)로 나갔다 새로 들어오기를 거듭해 채팅 버킷·재접속 제한을 초기화하던 것
//  - 입장 스폰·재접속 위치·좌석으로 옮겨 앉기로 고블린 「순간이동 뒤 2초」 제한을 피하던 것, 실내(away)에서 잡던 것
//  - 캠핑장 눈덩이 놓기·들기 반복으로 저장·방송을 늘리던 것
import { AVATAR_COLORS, CAMP_BOUNDS, CLOSE, DIR, STATE, campSnowSpotOk, encodeEvent, encodeMove, seatById, type C2S } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, DEPART_MEMO_MS, REJOIN_MAX, SNOW_ACTS_PER_MINUTE, type ChannelHost } from "./channel";

type Conn = { id: string; out: (string | ArrayBuffer)[]; closed?: { code: number; reason: string } };

function setup(extra: Partial<ChannelHost<Conn>> = {}) {
  let stackWrites = 0;
  const lobby: string[] = [];
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: (c, code, reason) => void (c.closed = { code, reason }),
    persist: () => {},
    saveReservation: () => {},
    dropReservation: () => {},
    requestTick: () => {},
    countChanged: () => {},
    lastPing: () => 0,
    visitorJoined: (v) => void lobby.push(`+${v}`),
    visitorLeft: (v) => void lobby.push(`-${v}`),
    verifyGrant: async () => null,
    claimNonce: () => true,
    snowStacksChanged: () => void stackWrites++,
    ...extra,
  };
  const core = new ChannelCore<Conn>({ capacity: 40, graceMs: 20_000 }, host);
  const join = (v: string, now: number, o: { spawn?: { x: number; y: number }; camp?: boolean } = {}) => {
    const c: Conn = { id: v, out: [] };
    core.join(c, { visitorId: v, name: v, color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood", ...(o.spawn ? { spawn: o.spawn } : {}), ...(o.camp ? { camp: true, map: "camp" as const } : {}) }, now);
    return c;
  };
  return { core, join, lobby, stackWrites: () => stackWrites };
}
const send = (m: C2S) => encodeEvent(m);
const lines = (c: Conn, t: string) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d)).filter((e) => e.t === t);

describe("정상 종료(1000) 뒤 다시 들어오기", () => {
  it("채팅 버킷이 이어져서 들락날락해도 도배가 안 된다", () => {
    const { core, join } = setup();
    const watcher = join("w", 0);
    let now = 1000;
    for (let i = 0; i < 10; i++) {
      const a = join("att", now);
      if (a.closed) break;
      for (let k = 0; k < 3; k++) core.message(a, send({ t: "chat", text: `spam${i}${k}` }), now);
      core.disconnect(a, 1000, now);
      now += 50;
    }
    // 예전에는 0.5초에 30줄. 이제 버킷 한 통(처음 몇 줄)만 지나간다
    expect(lines(watcher, "chat").length).toBeLessThanOrEqual(6);
  });

  it("짧은 시간에 거듭 다시 들어오면 REJOIN_MAX번째부터 4008로 거절하고, 로비·입장 방송도 부르지 않는다", () => {
    const { core, join, lobby } = setup();
    const watcher = join("w", 0);
    let now = 1000;
    let refused: Conn | null = null;
    for (let i = 0; i < REJOIN_MAX + 3; i++) {
      expect(core.rejoinBlocked("att", now)).toBe(!!refused || i > REJOIN_MAX);
      const a = join("att", now);
      if (a.closed) {
        refused = a;
        break;
      }
      core.disconnect(a, 1000, now);
      now += 100;
    }
    expect(refused?.closed?.code).toBe(CLOSE.RATE_LIMITED);
    expect(core.rejoinBlocked("att", now)).toBe(true);
    // 받아들인 입장은 REJOIN_MAX+1번(처음 한 번 + 이어 센 재입장)까지
    expect(lobby.filter((x) => x === "+att").length).toBeLessThanOrEqual(REJOIN_MAX + 1);
    expect(lines(watcher, "join").length).toBeLessThanOrEqual(REJOIN_MAX + 1);
    // 기록은 DEPART_MEMO_MS가 지나면 잊는다
    expect(core.rejoinBlocked("att", now + DEPART_MEMO_MS)).toBe(false);
  });

  it("새로고침처럼 띄엄띄엄 다시 들어오면 그대로 들어온다", () => {
    const { core, join } = setup();
    let now = 0;
    for (let i = 0; i < 20; i++) {
      const a = join("me", now);
      expect(a.closed).toBeUndefined();
      core.disconnect(a, 1000, now);
      now += 3_000;
    }
  });
});

describe("고블린 순간이동 제한", () => {
  const teleportAt = (core: ChannelCore<Conn>, sid: number) => (core as unknown as { peers: Map<number, { lastTeleportAt?: number }> }).peers.get(sid)?.lastTeleportAt;

  it("새 입장 스폰과 재접속 위치 옮기기도 순간이동으로 센다", () => {
    const { core, join } = setup();
    const a = join("att", 100, { spawn: { x: 900, y: 600 } });
    expect(teleportAt(core, 1)).toBe(100);
    core.disconnect(a, 1006, 200); // 비정상 종료 → 유예
    join("att", 5_000, { spawn: { x: 400, y: 400 } }); // 같은 자리(sid) 이어받기 + 위치 옮기기
    expect(core.peer(1)).toMatchObject({ x: 400, y: 400 });
    expect(teleportAt(core, 1)).toBe(5_000);
  });

  it("먼 좌석 좌표를 MOVE로 찍고 앉아 순간이동할 수 없고, 가까운 좌석으로 옮겨 앉으면 순간이동으로 센다", () => {
    const { core, join } = setup();
    const chair = seatById("cA")!;
    // 의자에서 멀리 서 있다가 의자 좌표를 MOVE로 보내고 바로 앉기
    const far = { x: chair.x + 300 < 1200 ? chair.x + 300 : chair.x - 300, y: chair.y };
    const a = join("att", 0, { spawn: far });
    core.message(a, encodeMove({ x: chair.x, y: chair.y, state: STATE.walk, dir: DIR.down, seq: 1 }), 10);
    core.message(a, send({ t: "sit", seatId: "cA" }), 20);
    expect(lines(a, "seatDenied").length).toBe(1);
    expect(core.peer(1)?.seatId ?? null).toBeNull();
    // 가까이에서 앉으면 된다
    const b = join("ok", 0, { spawn: { x: chair.x, y: chair.y + 4 } });
    core.message(b, send({ t: "sit", seatId: "cA" }), 3_000);
    expect(core.peer(2)?.seatId).toBe("cA");
  });
});

describe("캠핑장 눈덩이 놓기·들기 반복", () => {
  it("1분에 SNOW_ACTS_PER_MINUTE번까지만 받고, 그 뒤는 wait", () => {
    const { core, join, stackWrites } = setup();
    let spot: { x: number; y: number } | null = null;
    for (let x = CAMP_BOUNDS.minX + 30; x < CAMP_BOUNDS.maxX && !spot; x += 7)
      for (let y = CAMP_BOUNDS.minY + 40; y < CAMP_BOUNDS.maxY && !spot; y += 7) if (campSnowSpotOk(x, y)) spot = { x, y };
    const a = join("att", 0, { camp: true, spawn: spot! });
    let now = 1000;
    for (let i = 0; i < 40; i++) {
      core.message(a, send({ t: "snowPut", x: spot!.x, y: spot!.y, s: 2 }), now);
      now += 200;
      const st = lines(a, "snowStack").pop();
      core.message(a, send({ t: "snowTake", id: st?.st?.id ?? "x" }), now);
      now += 200;
    }
    // 받아들인 놓기·들기마다 목록 저장을 부른다 (예전엔 16초에 80번)
    expect(stackWrites()).toBeLessThanOrEqual(SNOW_ACTS_PER_MINUTE);
    expect(stackWrites()).toBeGreaterThan(10);
    expect(lines(a, "snowmanDenied").some((d) => d.why === "wait")).toBe(true);
  });
});
