import { describe, expect, it } from "vitest";
import { CAMP_NPCS, CAMP_SEATS } from "@tomb/protocol";
import { campFootSeatReachable, campNeighborSeat, campPickSeat, CAMP_MULTI_SEAT } from "./campSit";
import { campBgmPlaylist, campLines, campNpcAround, campNpcName, CAMP_WELCOME } from "./campTalk";

describe("캠핑장 앉기 (campSit)", () => {
  it("가까운 빈 좌석, 남이 앉은 자리는 건너뛰고 내 자리는 빈 것으로", () => {
    const log = CAMP_SEATS.find((s) => s.id === "qL1")!;
    expect(campPickSeat(log.x, log.y + 6, new Map(), null)?.id).toBe("qL1");
    expect(campPickSeat(log.x, log.y + 6, new Map([["qL1", 4]]), 9)?.id).not.toBe("qL1");
    expect(campPickSeat(log.x, log.y + 6, new Map([["qL1", 9]]), 9)?.id).toBe("qL1");
  });
  it("11/26 족욕탕 방석·폭포 다리 의자에 앉을 수 있다", () => {
    const bath = CAMP_SEATS.find((s) => s.id === "qT1")!;
    expect(campPickSeat(bath.x, bath.y + 2, new Map(), null)?.id).toBe("qT1");
    const view = CAMP_SEATS.find((s) => s.id === "qW1-0")!;
    expect(campPickSeat(view.x, view.y + 9, new Map(), null)?.furnitureId).toBe("qW1");
  });
  it("폭포 다리 긴 의자는 옆자리로 옮겨 앉는다", () => {
    expect(CAMP_MULTI_SEAT.has("qW1")).toBe(true);
    const left = CAMP_SEATS.find((s) => s.id === "qW1-0")!;
    expect(campNeighborSeat(left, 1, new Map(), null)?.id).toBe("qW1-1");
    expect(campNeighborSeat(left, -1, new Map(), null)).toBeNull();
    expect(campNeighborSeat(left, 1, new Map([["qW1-1", 2]]), 1)).toBeNull();
  });
  it("11/26 족욕탕 자리는 데크 위·앞 계단에서만 (울타리 밖에서 앉았다 일어나 데크로 넘어 들어가지 않게)", () => {
    const open = (x: number, y: number) => (id: string) => campFootSeatReachable(id, x, y);
    // 울타리 밖 (왼쪽 옆·오른쪽 옆·앞 모서리)에서는 족욕 자리가 안 잡힌다
    expect(campPickSeat(345, 114, new Map(), null, undefined, open(345, 114))?.id ?? "").not.toMatch(/^qT/);
    expect(campPickSeat(439, 146, new Map(), null, undefined, open(439, 146))?.id ?? "").not.toMatch(/^qT/);
    expect(campPickSeat(364, 190, new Map(), null, undefined, open(364, 190))?.id ?? "").not.toMatch(/^qT/);
    // 데크 위·앞 계단에서는 잡힌다
    expect(campPickSeat(361, 117, new Map(), null, undefined, open(361, 117))?.id).toBe("qT1");
    expect(campPickSeat(370, 178, new Map(), null, undefined, open(370, 178))?.id).toBe("qT9");
    expect(campFootSeatReachable("qT9", 392, 190)).toBe(true);
    // 다른 자리는 상관없다
    expect(campFootSeatReachable("qL1", 0, 0)).toBe(true);
  });
});

describe("캠핑장 NPC 말 걸기 (campTalk)", () => {
  it("여섯 명 모두 이름과 대사가 있고, 말 걸 때마다 다음 묶음", () => {
    for (const n of CAMP_NPCS) {
      expect(campNpcName(n.id)).toBe(n.name);
      expect(campLines(n.id, 0).length).toBeGreaterThan(0);
      expect(campLines(n.id, 0)).not.toEqual(campLines(n.id, 1));
    }
    expect(campLines("keeper", 0)[0]).toBe("다들 언젠가 온다고 했어요. 진짜 온 사람은 처음이네.");
    expect(campLines("clerk", 0)[0]).toBe("중고로 올라온 장비가 반이에요.");
    expect(campLines("granny", 0)[0]).toBe("물고기는 서두르면 안 와.");
  });
  it("11/26 처음 도착 안내: 인사 + 폭포·낚시·분양 세 사람 (없어진 데크·전망대 이야기는 없다)", () => {
    expect(CAMP_WELCOME).toHaveLength(4);
    const all = CAMP_WELCOME.join(" ");
    expect(all).toMatch(/폭포/);
    expect(all).toMatch(/윤슬 낚시터/);
    expect(all).toMatch(/소슬댁/);
    expect(all).toMatch(/순이 할머니/);
    expect(all).not.toMatch(/데크|전망대|타프|요리/);
  });
  it("기타 캠퍼는 밤 9~11시, 나머지는 늘", () => {
    expect(campNpcAround("guitarist", 20.9)).toBe(false);
    expect(campNpcAround("guitarist", 21)).toBe(true);
    expect(campNpcAround("guitarist", 23)).toBe(false);
    expect(campNpcAround("keeper", 3)).toBe(true);
  });
  it("캠핑장 음악: 기타 캠퍼가 있는 밤 9~11시는 어쿠스틱, 그 밖엔 앰비언트", () => {
    expect(campBgmPlaylist(21.5)).toBe("acoustic");
    expect(campBgmPlaylist(14)).toBe("ambient");
    expect(campBgmPlaylist(23)).toBe("ambient");
  });
});
