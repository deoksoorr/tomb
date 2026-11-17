import { describe, expect, it } from "vitest";
import { mergeOnline, VisitorRegistry } from "./lobbyState";

// 11/17 관리자 선물 「지금 접속 중인 사람 모두」: 채널 명단 + 로비 등록을 한 번씩

describe("접속 중인 방문자 모으기", () => {
  it("여러 채널 명단과 로비 등록을 합치고 같은 방문자는 한 번만", () => {
    const rosters = [[{ visitorId: "a" }, { visitorId: "b" }], [{ visitorId: "b" }, { visitorId: "c" }], []];
    expect(mergeOnline(rosters, ["c", "d", "a"])).toEqual(["a", "b", "c", "d"]);
    expect(mergeOnline([], [])).toEqual([]);
  });

  it("로비 등록 목록은 채널을 옮겨도 한 번, 나가면 빠진다", () => {
    const reg = new VisitorRegistry(100);
    reg.claim("a", 1);
    reg.claim("b", 2);
    reg.claim("a", 3);
    expect(reg.ids().sort()).toEqual(["a", "b"]);
    reg.release("b", 2);
    reg.release("a", 1); // 옛 채널의 늦은 퇴장은 무시
    expect(reg.ids()).toEqual(["a"]);
  });
});
