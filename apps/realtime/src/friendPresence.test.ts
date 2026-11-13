import { FRIEND_LEAVE_GRACE_MS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { FriendPresence, type PresenceRec } from "./friendPresence";

// 친구 들고 남 알림: 들어오면 바로, 재접속·채널 이동은 한 번만, 끊긴 뒤 5초 안에 안 돌아오면 나감

function setup() {
  const recs = new Map<string, PresenceRec>();
  const fp = new FriendPresence({ get: (v) => recs.get(v), put: (v, r) => void (r ? recs.set(v, r) : recs.delete(v)) });
  return { fp, recs };
}
const KEY = "abcdEFGH_-123456";

describe("친구 들고 남 (밀어 주기)", () => {
  it("입장하면 바로 친구들에게 들어옴, 같은 사람이 다시 자리를 잡아도(채널 이동·새로고침) 다시 알리지 않는다", () => {
    const { fp } = setup();
    fp.hello("b", "보리", KEY, ["a", "c", "b"]);
    expect(fp.joined("b")).toEqual({ to: ["a", "c"], key: KEY, name: "보리", on: true });
    // 새로고침: 웹이 다시 hello → 채널이 다시 claim
    fp.dropped("b", 1_000);
    fp.hello("b", "보리", KEY, ["a", "c"]);
    expect(fp.joined("b")).toBeNull();
    expect(fp.tick(1_000 + FRIEND_LEAVE_GRACE_MS + 1)).toEqual([]); // 돌아왔으니 나감도 없다
    // 웹이 맡기지 않은 사람(친구 없음)은 아무것도 안 한다
    expect(fp.joined("x")).toBeNull();
  });

  it("끊긴 뒤 5초 안에 안 돌아오면 나감 (한 번만), 그 뒤 다시 오면 다시 들어옴", () => {
    const { fp } = setup();
    fp.hello("b", "보리", KEY, ["a"]);
    fp.joined("b");
    fp.dropped("b", 10_000);
    expect(fp.due()).toBe(10_000 + FRIEND_LEAVE_GRACE_MS);
    expect(fp.tick(10_000 + FRIEND_LEAVE_GRACE_MS - 1)).toEqual([]);
    expect(fp.tick(10_000 + FRIEND_LEAVE_GRACE_MS)).toEqual([{ to: ["a"], key: KEY, name: "보리", on: false }]);
    // 재접속 유예가 끝나 채널이 최종 퇴장을 알려도 두 번 알리지 않는다
    fp.dropped("b", 30_000);
    expect(fp.tick(40_000)).toEqual([]);
    expect(fp.due()).toBeNull();
    fp.hello("b", "보리", KEY, ["a"]);
    expect(fp.joined("b")).toMatchObject({ on: true });
  });
});
