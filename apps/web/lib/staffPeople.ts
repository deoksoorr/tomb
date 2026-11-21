import { MAP_NAME, AWAY_PLACE_LABEL, STAFF_TP_GONE_MSG, STAFF_TP_INSIDE_MSG, mapOf, type InternalPerson, type MapId, type StaffPerson } from "@tomb/protocol";
import { FRIEND_BIG_MSG, friendRoute } from "./friendRoute";
import { PLACE_TITLE } from "./placeName";

// 11/20 운영자 「접속 중인 사람」 (순수 함수 — API·친구 창·채널 창이 같이 쓴다). 테스트: staffPeople.test.ts

export type StaffPeopleResponse = { people: StaffPerson[]; /** 실시간 서버에 닿았는지 */ reached: boolean };

/** 실시간 서버 명단 → 브라우저용: 나를 빼고 방문자 id를 지우고 채널·맵·이름 순 */
export function staffPeopleOf(all: readonly InternalPerson[], me: string): StaffPerson[] {
  const order: Record<MapId, number> = { village: 0, camp: 1, sea: 2 };
  return all
    .filter((p) => p.visitorId !== me && typeof p.name === "string" && p.name)
    .map(({ ch, sid, name, x, y, map, inside, place }): StaffPerson => ({ ch, sid, name, x, y, ...(map ? { map } : {}), ...(inside ? { inside } : {}), ...(place ? { place } : {}) }))
    .sort((a, b) => a.ch - b.ch || order[mapOf(a.map)] - order[mapOf(b.map)] || a.name.localeCompare(b.name, "ko"));
}

/** 11/22 맵 안에 있는 실내(집·잡화점)는 어느 맵인지 붙인다: 「기억숲 마을 집 안」. 버스·분양 마을·사냥터 같은 곳은 이름 그대로 */
const MAP_INSIDE: ReadonlySet<string> = new Set(["house", "shop"]);
export function insideLabel(p: Pick<StaffPerson, "place" | "map">, names: Record<MapId, string> = PLACE_TITLE): string {
  if (!p.place) return "실내";
  return MAP_INSIDE.has(p.place) ? `${names[mapOf(p.map)]} ${AWAY_PLACE_LABEL[p.place]}` : AWAY_PLACE_LABEL[p.place];
}

/** 한 줄 장소: 「2채널 캠핑장」, 실내면 「2채널 마을 집 안」 */
export function staffWhereText(p: StaffPerson): string {
  if (p.inside) return `${p.ch}채널 ${insideLabel(p, MAP_NAME)}`;
  return `${p.ch}채널 ${MAP_NAME[mapOf(p.map)]}`;
}

/** 이름 검색 (대소문자·띄어쓰기 무시) */
export function filterPeople(list: readonly StaffPerson[], q: string): StaffPerson[] {
  const k = q.replace(/\s+/g, "").toLowerCase();
  return k ? list.filter((p) => p.name.replace(/\s+/g, "").toLowerCase().includes(k)) : [...list];
}

/** 채널 창: 이 채널에서 지금 내 맵이 아닌 곳의 사람 이름 (맵마다, 실내에 있는 사람은 그 실내 이름으로 묶는다) */
export function otherMapNames(list: readonly StaffPerson[], ch: number, myMap: MapId): { label: string; names: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const p of list) {
    if (p.ch !== ch) continue;
    const label = p.inside ? insideLabel(p) : mapOf(p.map) === myMap ? null : PLACE_TITLE[mapOf(p.map)];
    if (!label) continue;
    groups.set(label, [...(groups.get(label) ?? []), p.name]);
  }
  return [...groups].map(([label, names]) => ({ label, names }));
}

/**
 * [순간이동]을 눌렀을 때 할 일 (fresh = 방금 다시 받은 그 사람, 없으면 접속을 끊었다).
 *  - 실내(집 안·사냥터 …)는 막는다. 다른 맵인데 바베큐로 커져 있으면 버스 규칙처럼 막는다 (lib/friendRoute)
 *  - 같은 채널이면 바로(go), 다른 채널이면 채널부터 옮긴다(hop)
 */
export type StaffTpPlan = { do: "block"; message: string } | { do: "go"; p: StaffPerson } | { do: "hop"; p: StaffPerson };
export function staffTpPlan(fresh: StaffPerson | undefined, myCh: number | null, myMap: MapId, big: number): StaffTpPlan {
  if (!fresh) return { do: "block", message: STAFF_TP_GONE_MSG };
  if (fresh.inside) return { do: "block", message: `${fresh.name}님은 ${STAFF_TP_INSIDE_MSG}` };
  if (fresh.ch !== myCh) {
    // 채널을 옮겨도 맵은 그대로라 맵이 다르면 도착한 뒤 같은 규칙을 다시 본다 — 커져 있으면 미리 막는다
    if (mapOf(fresh.map) !== myMap && big > 1) return { do: "block", message: FRIEND_BIG_MSG };
    return { do: "hop", p: fresh };
  }
  const r = friendRoute(myMap, mapOf(fresh.map), big);
  return r.do === "block" ? { do: "block", message: r.message } : { do: "go", p: fresh };
}

/** 다시 받은 명단에서 같은 사람 (채널·sid·이름이 모두 같아야 — 나간 자리를 다른 사람이 받았을 수 있다) */
export const findPerson = (list: readonly StaffPerson[], p: Pick<StaffPerson, "ch" | "sid" | "name">): StaffPerson | undefined =>
  list.find((q) => q.ch === p.ch && q.sid === p.sid && q.name === p.name);
