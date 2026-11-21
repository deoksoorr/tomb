import { STAFF_TP_GONE_MSG, type InternalPerson } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { FRIEND_BIG_MSG } from "./friendRoute";
import { filterPeople, findPerson, otherMapNames, staffPeopleOf, staffTpPlan, staffWhereText } from "./staffPeople";

// 11/20 운영자 「접속 중인 사람」·순간이동 계획

const all: InternalPerson[] = [
  { visitorId: "me", ch: 1, sid: 1, name: "달빛관리", x: 0, y: 0 },
  { visitorId: "a", ch: 2, sid: 3, name: "별", x: 10, y: 10, map: "camp" },
  { visitorId: "b", ch: 1, sid: 4, name: "구름", x: 20, y: 20, inside: true, place: "house" },
  { visitorId: "c", ch: 1, sid: 5, name: "바다 소년", x: 30, y: 30, map: "sea" },
  { visitorId: "d", ch: 1, sid: 6, name: "가람", x: 40, y: 40 },
];

describe("staffPeopleOf", () => {
  it("나를 빼고 방문자 id를 지우고 채널·맵·이름 순", () => {
    const out = staffPeopleOf(all, "me");
    expect(out.map((p) => p.name)).toEqual(["가람", "구름", "바다 소년", "별"]);
    expect(out.some((p) => "visitorId" in p)).toBe(false);
  });
});

describe("목록 문구·검색", () => {
  const list = staffPeopleOf(all, "me");
  it("장소 한 줄", () => {
    expect(list.map(staffWhereText)).toEqual(["1채널 마을", "1채널 집 안", "1채널 바닷가", "2채널 캠핑장"]);
  });
  it("이름 검색은 띄어쓰기·대소문자 무시", () => {
    expect(filterPeople(list, "바다소").map((p) => p.name)).toEqual(["바다 소년"]);
    expect(filterPeople(list, "")).toHaveLength(4);
  });
  it("채널 창(운영자): 이 채널 다른 맵·실내 이름을 곳마다 전부", () => {
    expect(otherMapNames(list, 1, "village")).toEqual([
      { label: "집 안", names: ["구름"] },
      { label: "달물결 포구", names: ["바다 소년"] },
    ]);
    expect(otherMapNames(list, 2, "camp")).toEqual([]);
  });
});

describe("staffTpPlan", () => {
  const list = staffPeopleOf(all, "me");
  const find = (name: string) => list.find((p) => p.name === name);
  it("없으면·실내면 막는다", () => {
    expect(staffTpPlan(undefined, 1, "village", 1)).toEqual({ do: "block", message: STAFF_TP_GONE_MSG });
    expect(staffTpPlan(find("구름"), 1, "village", 1)).toMatchObject({ do: "block", message: "구름님은 지금 들어갈 수 없는 곳에 있어요." });
  });
  it("같은 채널이면 맵이 달라도 바로 (버스 연출 없이), 커져 있으면 다른 맵은 막는다", () => {
    expect(staffTpPlan(find("가람"), 1, "village", 1)).toMatchObject({ do: "go" });
    expect(staffTpPlan(find("바다 소년"), 1, "village", 1)).toMatchObject({ do: "go" });
    expect(staffTpPlan(find("바다 소년"), 1, "village", 1.5)).toEqual({ do: "block", message: FRIEND_BIG_MSG });
    expect(staffTpPlan(find("가람"), 1, "village", 1.5)).toMatchObject({ do: "go" });
  });
  it("다른 채널이면 채널부터", () => {
    expect(staffTpPlan(find("별"), 1, "camp", 1)).toMatchObject({ do: "hop" });
    expect(staffTpPlan(find("별"), 1, "village", 1.5)).toMatchObject({ do: "block" });
  });
  it("다시 받은 명단에서는 채널·sid·이름이 모두 같아야 같은 사람", () => {
    expect(findPerson(list, { ch: 1, sid: 6, name: "가람" })?.name).toBe("가람");
    expect(findPerson(list, { ch: 1, sid: 6, name: "다른 사람" })).toBeUndefined();
  });
});
