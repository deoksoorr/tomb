import { describe, expect, it } from "vitest";
import { CAMP_FISHING_SPOTS, CAMP_PIER, CAMP_RAFTS, campRaftDeck, campRaftWalks, campWet, onCampDeck } from "./camp";
import { parseC2S } from "./events";
import { signGrant, verifyGrant } from "./grants";
import { signJoinToken, verifyJoinToken } from "./token";
import {
  campRaftAt,
  campRaftExit,
  campRaftOfSpot,
  campRaftSpots,
  isRaftBoard,
  RAFT_DAILY_MIN,
  RAFT_GEAR_ODDS,
  RAFT_GEAR_ON,
  RAFT_PRICE,
  RAFT_TICKET_MS,
  raftGearTier,
  raftGrantMin,
  raftHm,
  raftOutText,
  raftPriceFor,
  raftSetWorn,
  raftGearOfTier,
  RAFT_GEAR_IDS,
  RAFT_SET_IDS,
} from "./raft";

describe("11/27 좌대 입장권 규칙", () => {
  it("2시간 270P, 짧으면 분 비례 (10P 단위, 최소 30P)", () => {
    expect(raftPriceFor(120)).toBe(RAFT_PRICE);
    expect(raftPriceFor(200)).toBe(270);
    expect(raftPriceFor(60)).toBe(140); // 135 → 140
    expect(raftPriceFor(90)).toBe(200); // 202.5 → 200
    expect(raftPriceFor(10)).toBe(30); // 22.5 → 최소 30
    expect(raftPriceFor(1)).toBe(30);
    expect(raftPriceFor(0)).toBe(0);
  });
  it("하루 4시간: 남은 시간이 2시간보다 짧으면 그만큼만", () => {
    expect(RAFT_DAILY_MIN).toBe(240);
    expect(raftGrantMin(240)).toBe(120);
    expect(raftGrantMin(130)).toBe(120);
    expect(raftGrantMin(72.9)).toBe(72);
    expect(raftGrantMin(0)).toBe(0);
    expect(raftGrantMin(-5)).toBe(0);
    expect(raftHm(192)).toBe("3:12");
    expect(raftHm(5)).toBe("0:05");
  });
  it("마루 판정: 마루 위만 (판자 다리·잔교·사다리 칸은 아님)", () => {
    for (const r of CAMP_RAFTS) {
      const d = campRaftDeck(r);
      expect(campRaftAt(r.x, r.y - 12)).toBe(r.n);
      expect(campRaftAt(d.x + 1, d.y + 1)).toBe(r.n);
      expect(campRaftAt(r.x, r.y + 2)).toBeNull(); // 사다리 칸 · 앞 물
      for (const w of campRaftWalks(r)) expect(campRaftAt(w.x + w.w / 2, w.y + w.h / 2)).toBeNull();
    }
    expect(campRaftAt(1100, CAMP_PIER.y)).toBeNull();
  });
  it("낚시 자리 → 좌대 번호 (11/27 좌대마다 의자 하나 — 1~3 앞 가운데, 4~6 사다리 오른쪽), 둑·잔교 자리는 아님", () => {
    for (const r of CAMP_RAFTS) {
      const ids = campRaftSpots(r.n);
      expect(ids).toEqual([`f_${r.link ? r.x : r.x + 11}_${r.y - 12}`]);
      for (const id of ids) {
        const s = CAMP_FISHING_SPOTS.find((f) => f.id === id)!;
        expect(s).toBeTruthy();
        expect(campRaftAt(s.x, s.y)).toBe(r.n);
        expect(campRaftOfSpot(id)).toBe(r.n);
      }
    }
    const other = CAMP_FISHING_SPOTS.filter((f) => campRaftOfSpot(f.id) === null);
    expect(other.length).toBe(CAMP_FISHING_SPOTS.length - 6);
    for (const f of other) expect(campRaftAt(f.x, f.y), f.id).toBeNull();
  });
  it("잔교 낚시 자리 여섯: 마른 잔교 위, 위쪽 물을 본다, 좌대 그림·사다리 줄과 안 겹친다", () => {
    const pier = CAMP_FISHING_SPOTS.filter((f) => f.water === "reservoir" && Math.abs(f.y - CAMP_PIER.y) <= CAMP_PIER.w / 2);
    expect(pier).toHaveLength(6);
    for (const f of pier) {
      expect(onCampDeck(f.x, f.y), f.id).toBe(true);
      expect(campWet(f.x, f.y - 20), f.id).toBe(true); // 바라보는 쪽이 물
      for (const r of CAMP_RAFTS.filter((q) => !q.link)) expect(Math.abs(f.x - r.x), `${f.id} 사다리 ${r.n}`).toBeGreaterThanOrEqual(14);
    }
  });
  it("내려보낼 자리: 1~3 판자 다리 가운데(마른 판), 4~6 사다리 밑 물속", () => {
    for (const r of CAMP_RAFTS) {
      const e = campRaftExit(r.n, { x: r.x + 20, y: r.y - 12 });
      expect(campRaftAt(e.x, e.y)).toBeNull();
      if (r.link) {
        expect(e.swim).toBe(false);
        expect(onCampDeck(e.x, e.y)).toBe(true);
      } else {
        expect(e).toEqual({ x: r.x, y: r.y + 9, swim: true });
        expect(campWet(e.x, e.y)).toBe(true);
      }
    }
    // 1번: 오른쪽에서 내리면 오른쪽 다리
    const r1 = CAMP_RAFTS[0];
    expect(campRaftExit(1, { x: r1.x + 30, y: r1.y }).x).toBeGreaterThan(r1.x);
    expect(campRaftExit(1, { x: r1.x - 30, y: r1.y }).x).toBeLessThan(r1.x);
  });
  it("안내 글귀", () => {
    expect(raftOutText(3, "ticket")).toBe("입장권이 있어야 3번 좌대에 올라갈 수 있어요.");
    expect(raftOutText(3, "end")).toBe("입장권 시간이 끝나 좌대에서 내려왔어요.");
  });
  it("주인 표 모양 검사", () => {
    expect(isRaftBoard([{ n: 1, name: "달빛", u: 1 }])).toBe(true);
    expect(isRaftBoard([{ n: 7, name: "달빛", u: 1 }])).toBe(false);
    expect(isRaftBoard("x")).toBe(false);
  });
  it("좌대 전용 코디: 11/27 그림 확정으로 켜졌다, 영구 → 30일 → 7일 순 (끄면 안 나온다)", () => {
    expect(RAFT_GEAR_ON).toBe(true);
    expect(raftGearTier(0)).toBe("perm");
    expect(raftGearTier(0, false)).toBeNull();
    expect(RAFT_GEAR_ODDS).toEqual({ d7: 1 / 7_000, d30: 1 / 35_000, perm: 1 / 200_000 });
    expect(raftGearTier(0, true)).toBe("perm");
    expect(raftGearTier(RAFT_GEAR_ODDS.perm + 1e-9, true)).toBe("d30");
    expect(raftGearTier(RAFT_GEAR_ODDS.perm + RAFT_GEAR_ODDS.d30 + 1e-9, true)).toBe("d7");
    expect(raftGearTier(0.5, true)).toBeNull();
    expect(RAFT_SET_IDS).toEqual(["jw_sedge", "jw_bell", "jw_waders", "jw_cape"]);
    expect(raftSetWorn([...RAFT_SET_IDS, "jw_carphat"])).toBe(true);
    expect(raftSetWorn(RAFT_SET_IDS.slice(0, 3))).toBe(false);
    expect(raftGearOfTier("d7")).toEqual(["jw_carphat"]);
    expect(raftGearOfTier("d30")).toEqual(["jw_vest", "jw_net"]);
    expect(RAFT_GEAR_IDS).toHaveLength(7);
  });
});

describe("11/27 좌대 증서·입장 토큰", () => {
  const secret = "s".repeat(32);
  it("증서: 번호·채널·끝 시각을 검사한다", async () => {
    const nowSec = 1_800_000_000;
    const now = nowSec * 1000;
    const ok = await signGrant(secret, { kind: "raft", visitorId: "v1", ch: 2, n: 3, until: now + RAFT_TICKET_MS, exp: nowSec + 60 });
    expect(await verifyGrant(secret, ok, nowSec)).toEqual({ kind: "raft", visitorId: "v1", ch: 2, n: 3, until: now + RAFT_TICKET_MS, exp: nowSec + 60 });
    const bad = await signGrant(secret, { kind: "raft", visitorId: "v1", ch: 2, n: 7, until: now, exp: nowSec + 60 });
    expect(await verifyGrant(secret, bad, nowSec)).toBeNull();
    const far = await signGrant(secret, { kind: "raft", visitorId: "v1", ch: 2, n: 3, until: now + 5 * RAFT_TICKET_MS, exp: nowSec + 60 });
    expect(await verifyGrant(secret, far, nowSec)).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "raft", grant: ok }))).toEqual({ t: "raft", grant: ok });
  });
  it("입장 토큰: 막기 켬(rafts)·내 입장권(raft)", async () => {
    const t = await signJoinToken(secret, { visitorId: "v1", name: "달빛", color: "#ffffff", channel: 1, rafts: true, raft: { n: 2, u: 123 } });
    const c = await verifyJoinToken(secret, t);
    expect(c?.rafts).toBe(true);
    expect(c?.raft).toEqual({ n: 2, u: 123 });
    const t2 = await signJoinToken(secret, { visitorId: "v1", name: "달빛", color: "#ffffff", channel: 1, raft: { n: 9, u: 1 } } as never);
    expect((await verifyJoinToken(secret, t2))?.raft).toBeUndefined();
  });
});
