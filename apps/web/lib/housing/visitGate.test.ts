import { describe, expect, it } from "vitest";
import { houseTargetText, ownerOfflineMessage, visitVerdict, type VisitInput } from "./visitGate";

const base: VisitInput = { mine: false, staff: false, reached: true, owner: undefined, me: { ch: 1, sid: 3, x: 10, y: 10, map: "sea" }, house: { ch: 1, map: "camp" } };

describe("visitGate (11/27 남의 집은 주인이 접속 중일 때만)", () => {
  it("주인이 접속 안 했고 다른 맵이면 막는다 (바닷가에서 친구 창으로 캠핑장 카라반)", () => {
    expect(visitVerdict(base)).toEqual({ ok: false, why: "offline" });
    // 다른 채널의 같은 맵도 막는다
    expect(visitVerdict({ ...base, me: { ch: 2, sid: 1, x: 0, y: 0, map: "camp" } })).toEqual({ ok: false, why: "offline" });
    // 내 위치를 모르면(접속 중이 아니면) 막는다
    expect(visitVerdict({ ...base, me: undefined })).toEqual({ ok: false, why: "offline" });
  });

  it("주인이 접속 중이면 (실내·사냥터·다른 채널이어도) 들어간다", () => {
    expect(visitVerdict({ ...base, owner: { ch: 2, sid: 9, x: 0, y: 0, away: true, place: "hunt" } })).toEqual({ ok: true });
  });

  it("그 집 채널·맵에 서 있으면(문 앞 E) 주인이 없어도 들어간다 (마을 집은 map 없음)", () => {
    expect(visitVerdict({ ...base, me: { ch: 1, sid: 3, x: 0, y: 0, map: "camp" } })).toEqual({ ok: true });
    expect(visitVerdict({ ...base, house: { ch: 1, map: "village" }, me: { ch: 1, sid: 3, x: 0, y: 0 } })).toEqual({ ok: true });
  });

  it("내 집·운영자는 언제나, 실시간 서버를 모르면 화면에 맡긴다", () => {
    expect(visitVerdict({ ...base, mine: true })).toEqual({ ok: true });
    expect(visitVerdict({ ...base, staff: true })).toEqual({ ok: true });
    expect(visitVerdict({ ...base, reached: false, me: undefined })).toEqual({ ok: true, unknown: true });
  });

  it("안내·기록 문구", () => {
    expect(ownerOfflineMessage("GBT")).toBe("GBT님이 접속해 있을 때만 놀러 갈 수 있어요.");
    expect(houseTargetText({ ownerName: "GBT", ch: 1, lot: 7, zone: "camp", camp: { kind: "caravan" } })).toBe("GBT의 카라반 · 1채널 캠핑장 7번");
    expect(houseTargetText({ ownerName: "빈구", ch: 1, lot: 4, zone: "sea" })).toBe("빈구의 오두막 · 1채널 포구 4번");
    expect(houseTargetText({ ownerName: "a", ch: 2, lot: 12 })).toBe("a의 집 · 2채널 12번지");
  });
});
