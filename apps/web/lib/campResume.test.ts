import { describe, expect, it } from "vitest";
import { CAMP_ARRIVE, CAMP_MAP_VERSION, MAP_VERSION } from "@tomb/protocol";
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
  it("마을 기록에는 where가 없다 (예전과 같다)", () => {
    const r = parseResume(JSON.stringify({ ...camp, where: undefined, seatId: "lA-0", map: MAP_VERSION }), camp.savedAt);
    expect(r?.where).toBeUndefined();
    expect(r?.seatId).toBe("lA-0");
  });
});
