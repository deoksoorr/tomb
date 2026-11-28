import { describe, expect, it } from "vitest";
import { AVATAR_BODIES, isDyeableCosmetic, itemById, RAFT_GEAR, RAFT_GEAR_IDS } from "@tomb/protocol";
import { AV_COLS, AV_H, AV_W, avatarColorSpec, avatarFrameGrid, avatarPoseGroup } from "./avatar";
import { GEAR_DYE_REGIONS } from "./gearDye";
import type { Grid } from "./pixel";
import { CLIP, colGroup, JW_DYE, JW_ITEMS, STICKY } from "./raftGear";
import { SEASON_SHEET_IDS, seasonGearIcon } from "./seasonSetGear";

// 11/27 좌대 전용 코디 잘림 검사 (시안 검사 스크립트 check_clip.mts를 그대로 옮겼다 — 메모리 「아이템 절대 잘리면 안 된다」).
// 모든 몸(AVATAR_BODIES 16) × 앞·왼·오른·뒤 × 시트 28열(서기·걷기·뛰기·앉기·점프·매달리기·수영·잠수·그네·손 흔들기·환호·해먹)을
// 실제 아바타 칸(20×28)에 그려
//  ① 꾸미기가 칸 밖·가장자리라 버려진 칠(붓이 막은 것 = 그림이 잘렸다)이 하나라도 있으면 실패
//  ② 꾸미기 때문에 바뀐 불투명 픽셀이 칸 가장자리 1px(x 0·19, y 0·27)에 닿으면 실패
// 뺀 것 두 가지 (시안 때 정한 그대로):
//  - 머리 꾸미기: 모자를 쓰면 몸 그림이 바뀌는 외형(우산·왕관 등)이 있다 → 게임에 있는 덮는 모자(비니)를 쓴 프레임과 같은 가장자리 픽셀은 몸 그림 변화로 본다
//  - 수영·잠수의 수면 띠(수면선 줄과 그 아래 한 줄): 장면이 실루엣보다 넓게 긋는 물결선과 그 둘레 등급 테라 꾸미기 칠이 아니다

const MARGIN = 1;
const COLOR = "#9fb8d8";
const WATER = 0xcfe8f4;
const VIEWS = [
  ["down", "down", false],
  ["left", "side", true],
  ["right", "side", false],
  ["up", "up", false],
] as const;
const BODIES = AVATAR_BODIES.map((b) => b.id);

type Hit = { body: string; dir: string; col: number; drops: number; edge: number };

/** item 하나를 입힌 프레임을 비교 기준(with — 같이 입은 다른 좌대 코디)과 견준다 */
function clipHits(item: string, withIds: readonly string[] = []): { hits: Hit[]; frames: number } {
  const hits: Hit[] = [];
  let frames = 0;
  const head = !!JW_ITEMS[item]?.head && JW_ITEMS[item]?.headWorn !== false;
  for (const body of BODIES)
    for (const [dir, view, flip] of VIEWS)
      for (let col = 0; col < AV_COLS; col++) {
        frames++;
        const base = avatarFrameGrid(body, view, col, COLOR, [...withIds]);
        CLIP.drops.length = 0;
        const g0 = avatarFrameGrid(body, view, col, COLOR, [...withIds, item]);
        const drops = CLIP.drops.length;
        const ref0 = head ? avatarFrameGrid(body, view, col, COLOR, ["hat_beanie"]) : null;
        const fl = (g: Grid | null) => (g && flip ? g.mirrored() : g);
        const a = fl(g0)!;
        const b = fl(base)!;
        const r0 = fl(ref0);
        // 수면선 줄 (수영·잠수)
        let wl = -1;
        for (let y = 0; y < AV_H && wl < 0; y++)
          for (let x = 0; x < AV_W; x++)
            if (a.get(x, y) & 255 && a.get(x, y) >>> 8 === WATER) {
              wl = y;
              break;
            }
        let edge = 0;
        for (let y = 0; y < AV_H; y++)
          for (let x = 0; x < AV_W; x++) {
            const v = a.get(x, y);
            if (!(v & 255) || v === b.get(x, y)) continue;
            if (v >>> 8 === WATER || (wl >= 0 && (y === wl || y === wl + 1))) continue;
            const gap = Math.min(x, AV_W - 1 - x, y, AV_H - 1 - y);
            if (gap < MARGIN && r0 && r0.get(x, y) === v) continue;
            if (gap < MARGIN) edge++;
          }
        if (drops || edge) hits.push({ body, dir, col, drops, edge });
      }
  return { hits, frames };
}

describe("11/27 좌대 전용 코디 그림", () => {
  it("카탈로그 일곱 점이 모두 시트 그림·아이콘·염색 묶음을 가진다 (금·찌 띠·눈은 염색 묶음 밖)", () => {
    expect(Object.keys(JW_ITEMS).sort()).toEqual([...RAFT_GEAR_IDS].sort());
    for (const g of RAFT_GEAR) {
      expect(SEASON_SHEET_IDS, g.id).toContain(g.id);
      expect(itemById(g.id)?.slot, g.id).toBe(g.slot);
      expect(isDyeableCosmetic(g.id), g.id).toBe(true);
      const icon = seasonGearIcon(g.id);
      expect(icon, g.id).not.toBeNull();
      expect([...icon!.px].some((v) => v & 255), g.id).toBe(true);
      // 염색 묶음은 시안 JW_DYE와 같다 (gearDye는 avatarCore 첫 묶음에 들어가 raftGear를 부르지 않고 숫자로 둔다)
      expect(GEAR_DYE_REGIONS[g.id], g.id).toEqual(JW_DYE[g.id]);
      for (const c of [0xf6c83c, 0xfff2a8, 0xb88418, 0xfffcf4, 0x1a1620, 0xfaf6ee]) expect(JW_DYE[g.id].colors, g.id).not.toContain(c);
    }
  });

  it("시트 열 → 동작 묶음 (avatarCore 자세에서 고른 이름이 시안 colGroup과 같다)", () => {
    for (const view of ["down", "side", "up"] as const) for (let col = 0; col < AV_COLS; col++) expect(avatarPoseGroup(view, col), `${view}/${col}`).toBe(colGroup(col));
  });

  it("염색: 바탕 천만 바뀌고 금테·금방울·찌 흰 띠는 그대로 (빨강으로)", () => {
    const colors = (g: Grid) => new Set([...g.px].filter((v) => v & 255).map((v) => v >>> 8));
    for (const [id, keep] of [
      ["jw_sedge", 0xf6c83c],
      ["jw_bell", 0xfaf6ee],
      ["jw_cape", 0xf6c83c],
      ["jw_carphat", 0xfffcf4],
    ] as const) {
      const plain = colors(avatarFrameGrid("hood", "down", 0, COLOR, [id]));
      const dyed = colors(avatarFrameGrid("hood", "down", 0, avatarColorSpec(COLOR, { items: { [id]: "#d83a3a" } }), [id]));
      expect(plain.has(JW_DYE[id].main), id).toBe(true);
      expect(dyed.has(JW_DYE[id].main), id).toBe(false);
      expect(plain.has(keep) && dyed.has(keep), id).toBe(true);
    }
  });

  it("11/28 조끼 낚싯대: 몸 명암 칠에 덮이지 않고 4방향 모두 초릿대가 보인다 · 염색해도 대·찌는 그대로", () => {
    const has = (g: Grid, c: number) => [...g.px].some((v) => v & 255 && v >>> 8 === c);
    for (const body of ["hood", "cat", "round", "tall"])
      for (const view of ["down", "side", "up"] as const) {
        const g = avatarFrameGrid(body, view, 0, COLOR, ["jw_vest"]);
        expect(has(g, 0xff4a2a), `${body}/${view} 초릿대`).toBe(true);
        expect(has(g, 0xa8682e) || has(g, 0xd4954c), `${body}/${view} 대나무`).toBe(true);
      }
    const red = avatarFrameGrid("hood", "down", 0, avatarColorSpec(COLOR, { items: { jw_vest: "#d83a3a" } }), ["jw_vest"]);
    expect(has(red, JW_DYE.jw_vest.main)).toBe(false);
    for (const keep of [0xff4a2a, 0xe8392c, 0xfbf8f0]) expect(has(red, keep), keep.toString(16)).toBe(true);
  });

  // 7점 × 16몸 × 4방향 × 28열 (+ 맨몸·비니 비교) — 몇 초 걸린다
  for (const id of RAFT_GEAR_IDS)
    it(`잘림 없음: ${id} (16몸 × 4방향 × 28열, 1px 여백)`, () => {
      const { hits, frames } = clipHits(id);
      expect(frames).toBe(BODIES.length * 4 * AV_COLS);
      expect(BODIES.length).toBeGreaterThanOrEqual(16);
      expect(hits.slice(0, 8)).toEqual([]);
    }, 120_000);

  // 11/28 조끼(낚싯대) + 함께 입는 좌대 코디: 조끼 때문에 바뀐 픽셀이 가장자리에 닿거나 버려진 칠이 없다
  for (const withIds of [
    ["jw_sedge", "jw_bell", "jw_cape"],
    ["jw_sedge", "jw_bell", "jw_net"],
    ["jw_carphat", "jw_net"],
    ["jw_carphat", "jw_bell", "jw_cape"],
  ])
    it(`잘림 없음: jw_vest + ${withIds.join("+")} (16몸 × 4방향 × 28열, 1px 여백)`, () => {
      const { hits, frames } = clipHits("jw_vest", withIds);
      expect(frames).toBe(BODIES.length * 4 * AV_COLS);
      expect(hits.slice(0, 8)).toEqual([]);
    }, 120_000);

  it("줄임 단계는 몸·방향·동작 묶음마다 하나 (걷는 프레임끼리 크기가 같다)", () => {
    // 위 검사로 채워진 기록: 같은 꾸미기·자리·몸·방향·묶음이면 프레임과 상관없이 한 값
    expect(STICKY.size).toBeGreaterThan(0);
    for (const k of STICKY.keys()) expect(k.split("|")).toHaveLength(5);
  });
});
