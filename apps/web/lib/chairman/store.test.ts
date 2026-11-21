import { describe, expect, it } from "vitest";
import { hmgetList } from "./store";

// 11/21 테스트서버에서 잡은 것: redisClient는 HMGET을 이름 없는 배열로 준다 (입장 창 남은 판·최고·순위 시간이 비던 원인)
describe("HMGET 결과 읽기", () => {
  it("배열로 오면 필드 순서대로", () => {
    expect(hmgetList(["20261121", "2", null], ["d", "cn", "ch"])).toEqual(["20261121", "2", null]);
  });
  it("이름 붙은 객체로 와도 같은 결과", () => {
    expect(hmgetList({ d: "20261121", cn: 2, ch: null }, ["d", "cn", "ch"])).toEqual(["20261121", "2", null]);
  });
  it("없으면 모두 null", () => {
    expect(hmgetList(null, ["a", "b"])).toEqual([null, null]);
  });
});
