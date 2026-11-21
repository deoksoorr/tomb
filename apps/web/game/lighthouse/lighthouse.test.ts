import { describe, expect, it } from "vitest";
import { HOUSING_DOOR, HOUSING_OFFICE, PORTAL_RADIUS, TILE } from "@tomb/protocol";
import { groundKind, inWater, interactables, LANDMARKS, officeCollider, staticColliders, standable, type Rect } from "../world/layout";
import { MAP_ICONS } from "../world/minimapIcons";
import { OFFICE_STALL, officeColliders } from "../world/officeStallLayout";
import { TOWER, towerColliders } from "../tower/towerLayout";
import { LIGHTHOUSE, LIGHTHOUSE_TOAST, lighthouseColliders, lighthouseInteractables } from "./lighthouseLayout";

// 11/20 북쪽 길 위 자리 바꿈: 야근 빌딩(예전 분양 사무소 자리) → 총무팀 문대리 카트 → 판교의 등대(예전 빌딩 자리) 순서로 겹치지 않고,
// 등대 문 앞 E 자리에 설 수 있고, 분양 사무소는 광장 큰 모닥불 오른쪽·해먹 아래 포석 위에 문 앞이 열려 있다

const PATH = ["dirt", "gravel", "cobble"];
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("판교의 등대 배치", () => {
  it("야근 빌딩 → 문대리 카트 → 등대 순서로 서쪽에서 동쪽, 충돌이 서로 겹치지 않는다", () => {
    expect(TOWER.x).toBeLessThan(OFFICE_STALL.x);
    expect(OFFICE_STALL.x).toBeLessThan(LIGHTHOUSE.x);
    const groups = [towerColliders(), officeColliders(), lighthouseColliders()];
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) for (const a of groups[i]) for (const b of groups[j]) expect(overlap(a, b), `${i}-${j}`).toBe(false);
  });

  it("충돌은 맵 충돌 목록에 들어 있고 길·물을 덮지 않는다", () => {
    const all = staticColliders();
    for (const r of lighthouseColliders()) {
      expect(all.some((c) => c.x === r.x && c.y === r.y && c.w === r.w && c.h === r.h)).toBe(true);
      for (let y = r.y; y < r.y + r.h; y += 2)
        for (let x = r.x; x < r.x + r.w; x += 2) {
          expect(PATH.includes(groundKind(Math.floor(x / TILE), Math.floor(y / TILE))), `${x},${y}`).toBe(false);
          expect(inWater(x, y), `${x},${y}`).toBe(false);
        }
    }
  });

  it("문 앞 E 자리 하나 — 서 있을 수 있고 맵 상호작용 목록에 들어 있다, 안내 한마디", () => {
    const list = lighthouseInteractables();
    expect(list.map((i) => i.portal)).toEqual(["lighthouse"]);
    for (const i of list) {
      expect(standable(i.x, i.y), i.id).toBe(true);
      expect(interactables().some((o) => o.id === i.id)).toBe(true);
    }
    expect(LIGHTHOUSE_TOAST).toContain("회장님 독대");
  });

  it("미니맵 장소와 등대 그림", () => {
    expect(LANDMARKS.find((l) => l.kind === "lighthouse")?.label).toBe("판교의 등대");
    expect(MAP_ICONS.lighthouse).toBeDefined();
  });
});

describe("분양 사무소 (11/20 광장으로)", () => {
  it("광장 포석 위, 큰 모닥불 오른쪽·해먹 아래, 문 앞에 설 수 있다", () => {
    const office = officeCollider();
    for (let y = office.y; y < office.y + office.h; y += 2)
      for (let x = office.x; x < office.x + office.w; x += 2) expect(groundKind(Math.floor(x / TILE), Math.floor(y / TILE)), `${x},${y}`).toBe("stone");
    expect(HOUSING_OFFICE.x).toBeGreaterThan(720);
    expect(HOUSING_OFFICE.y - 54).toBeGreaterThan(470);
    expect(standable(HOUSING_DOOR.x, HOUSING_DOOR.y + 4)).toBe(true);
    const door = interactables().find((i) => i.id === "portal:housing");
    expect(door && Math.hypot(door.x - HOUSING_DOOR.x, door.y - HOUSING_DOOR.y)).toBeLessThan(PORTAL_RADIUS);
  });
});
