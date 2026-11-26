import { describe, expect, it } from "vitest";
import { CAMP_ARRIVE, CAMP_MAP_VERSION, MAP_VERSION, SEA_ARRIVE, SEA_MAP_VERSION } from "@tomb/protocol";
import { parseResume, saveResume, takeResume } from "./resume";

// 11/15 캠핑장에서 새로고침: 캠핑장 자리로 돌아온다 (마을 좌표와 섞이지 않게 where·campMap을 따로 둔다)

function memStore() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const camp = { channel: 3, x: 640, y: 470, seatId: "qL1", pose: "sitChair" as const, dir: 1, savedAt: 1_000_000, name: "캠퍼", color: "#e8d9b0", where: "camp" as const };

describe("resume — 캠핑장 기록", () => {
  it("캠핑장 자리·좌석을 그대로 잇는다 (배치 버전도 같이 저장)", () => {
    const st = memStore();
    saveResume(camp, st);
    const raw = JSON.parse(st.m.values().next().value!);
    expect(raw.campMap).toBe(CAMP_MAP_VERSION);
    expect(takeResume(camp.savedAt + 1000, st)).toEqual({ ...camp, bgm: false, map: MAP_VERSION, campMap: CAMP_MAP_VERSION, body: undefined });
  });
  it("캠핑장 배치가 바뀐 뒤의 기록은 버스에서 내리는 자리에서, 서 있기로", () => {
    const r = parseResume(JSON.stringify({ ...camp, campMap: CAMP_MAP_VERSION - 1 }), camp.savedAt);
    expect(r).toMatchObject({ where: "camp", x: CAMP_ARRIVE.x, y: CAMP_ARRIVE.y, pose: "idle", seatId: null });
  });
  it("캠핑장엔 그네·배가 없다 → 서 있기로", () => {
    const r = parseResume(JSON.stringify({ ...camp, pose: "boat", seatId: "b_1_2", campMap: CAMP_MAP_VERSION }), camp.savedAt);
    expect(r).toMatchObject({ where: "camp", pose: "idle", seatId: null, x: 640, y: 470 });
  });
  it("11/26 캠핑장 나룻배 자리(qN…)는 배 자세·자리 id를 잇는다", () => {
    const r = parseResume(JSON.stringify({ ...camp, pose: "boat", seatId: "qN2-0", campMap: CAMP_MAP_VERSION }), camp.savedAt);
    expect(r).toMatchObject({ where: "camp", pose: "boat", seatId: "qN2-0", x: 640, y: 470 });
  });
  it("나룻배라도 배치가 바뀌었거나 모르는 자리 id면 서 있기로", () => {
    expect(parseResume(JSON.stringify({ ...camp, pose: "boat", seatId: "qN9-0", campMap: CAMP_MAP_VERSION }), camp.savedAt)).toMatchObject({ pose: "idle", seatId: null });
    expect(parseResume(JSON.stringify({ ...camp, pose: "boat", seatId: "qN1-1", campMap: CAMP_MAP_VERSION - 1 }), camp.savedAt)).toMatchObject({ pose: "idle", seatId: null });
    expect(parseResume(JSON.stringify({ ...camp, where: "sea", pose: "boat", seatId: "qN1-0", seaMap: SEA_MAP_VERSION }), camp.savedAt)).toMatchObject({ where: "sea", pose: "idle", seatId: null });
  });
  it("마을 기록에는 where가 없다 (예전과 같다)", () => {
    const r = parseResume(JSON.stringify({ ...camp, where: undefined, seatId: "lA-0", map: MAP_VERSION }), camp.savedAt);
    expect(r?.where).toBeUndefined();
    expect(r?.seatId).toBe("lA-0");
  });
});

// 11/16 바닷가에서 새로고침: 캠핑장과 같은 규칙 (where "sea"·seaMap)
describe("resume — 바닷가 기록", () => {
  const sea = { channel: 2, x: 700, y: 640, seatId: null, pose: "sitGround" as const, dir: 0, savedAt: 2_000_000, name: "바다", color: "#e8d9b0", where: "sea" as const };
  it("바닷가 자리를 그대로 잇는다 (배치 버전도 같이 저장)", () => {
    const st = memStore();
    saveResume(sea, st);
    const raw = JSON.parse(st.m.values().next().value!);
    expect(raw.seaMap).toBe(SEA_MAP_VERSION);
    expect(raw.campMap).toBeUndefined();
    expect(takeResume(sea.savedAt + 1000, st)).toEqual({ ...sea, bgm: false, map: MAP_VERSION, seaMap: SEA_MAP_VERSION, body: undefined });
  });
  it("바닷가 배치가 바뀐 뒤의 기록은 정류장에서", () => {
    const r = parseResume(JSON.stringify({ ...sea, seaMap: SEA_MAP_VERSION + 1 }), sea.savedAt);
    expect(r).toMatchObject({ where: "sea", x: SEA_ARRIVE.x, y: SEA_ARRIVE.y, pose: "idle" });
  });
});
