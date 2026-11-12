import { describe, expect, it } from "vitest";
import { FAV_DEFAULTS, FAV_MAX, isFavKey, parseFavs, toggleFav, type FavKey } from "./sayFavorites";

describe("표현 즐겨찾기", () => {
  it("기본값은 모두 보낼 수 있는 표현이고 최대 개수 안이다", () => {
    expect(FAV_DEFAULTS.every(isFavKey)).toBe(true);
    expect(FAV_DEFAULTS.length).toBeLessThanOrEqual(FAV_MAX);
  });

  it("저장본이 없거나 깨졌으면 기본값", () => {
    expect(parseFavs(null)).toEqual([...FAV_DEFAULTS]);
    expect(parseFavs("{")).toEqual([...FAV_DEFAULTS]);
    expect(parseFavs('{"a":1}')).toEqual([...FAV_DEFAULTS]);
  });

  it("빈 목록은 그대로 비어 있다 (사용자가 다 뺀 경우)", () => {
    expect(parseFavs("[]")).toEqual([]);
  });

  it("모르는 칸·중복은 버리고 최대 개수로 자른다", () => {
    const raw = JSON.stringify(["p:hi", "p:hi", "e:nope", "a:dance", 3, "e:heart", "a:wave", "e:cry", "e:wow", "e:zzz", "e:fire", "e:idea", "p:bye"]);
    const favs = parseFavs(raw);
    expect(favs[0]).toBe("p:hi");
    expect(favs).not.toContain("e:nope");
    expect(favs).not.toContain("a:dance");
    expect(new Set(favs).size).toBe(favs.length);
    expect(favs.length).toBe(FAV_MAX);
  });

  it("별 누르기: 넣고 빼고, 가득 차면 null", () => {
    expect(toggleFav(["p:hi"], "e:heart")).toEqual(["p:hi", "e:heart"]);
    expect(toggleFav(["p:hi", "e:heart"], "p:hi")).toEqual(["e:heart"]);
    const full: FavKey[] = ["p:hi", "p:bye", "p:thanks", "e:heart", "e:cry", "e:wow", "a:wave", "a:cheer"];
    expect(toggleFav(full, "e:zzz")).toBeNull();
    expect(toggleFav(full, "p:hi")).toHaveLength(FAV_MAX - 1);
  });
});
