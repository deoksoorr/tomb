import { describe, expect, it } from "vitest";
import { AVATAR_BODIES, itemById } from "@tomb/protocol";
import { avatarFrameGrid, lookKey, SPRITE_COSMETICS } from "./avatar";
import { GEAR_DYE_REGIONS, toHsl } from "./gearDye";
import { hasItemIcon } from "./itemIcons";
import { SEASON_SHEET_IDS, seasonGearIcon } from "./seasonSetGear";
import { GEAR5, SHOP_WEAR_TONES } from "./shopWearGear";

// 11/22 잡화점 「옷」 다섯 벌: 그림·아이콘·염색 묶음이 있고, 천은 한 색 계열 4톤, 벌마다 윤곽이 달라 같은 색으로 칠해도 서로 갈린다.
// 옷 깃은 목 꾸미기보다 먼저 그려 사원증·목도리·넥타이가 깃 위로 보인다 (avatarCore 그리기 순서).

const IDS = ["wr_shirt", "wr_puffer", "wr_robe", "wr_apron", "wr_coat"];
const COLOR = "#9fb8d8";
const GREY = "#8a8f98";
const frame = (look: string[], view: "down" | "side" | "up" = "down", body = "hood", spec = COLOR): number[] => [...avatarFrameGrid(body, view, 0, spec, look).px];
/** 칠해진 칸 (알파 > 0) */
const mask = (px: readonly number[]): number[] => px.map((v) => (v & 255 ? 1 : 0));

describe("잡화점 옷 다섯 벌", () => {
  it("카탈로그·시트·아이콘·염색 묶음에 모두 있다", () => {
    expect(Object.keys(GEAR5)).toEqual(IDS);
    for (const id of IDS) {
      const it = itemById(id);
      expect(it?.kind, id).toBe("cosmetic");
      expect(it?.slot, id).toBe("back");
      expect(SEASON_SHEET_IDS, id).toContain(id);
      expect(SPRITE_COSMETICS as readonly string[], id).toContain(id);
      expect(lookKey([id])).toBe(id);
      expect(hasItemIcon(id), id).toBe(true);
      const icon = seasonGearIcon(id)!;
      expect([icon.w, icon.h]).toEqual([16, 16]);
      expect(icon.px.filter((v) => v & 255).length, id).toBeGreaterThan(60);
      const region = GEAR_DYE_REGIONS[id];
      expect(region?.colors, id).toEqual(SHOP_WEAR_TONES[id]);
      expect(region?.main, id).toBe(SHOP_WEAR_TONES[id][1]);
    }
  });

  it("천 4톤 규칙: 한 색 계열 · 채도 0.15 이상 · 바탕 밝기 0.25~0.6 (흰 천은 0.9 이상) · 톤 간격 0.07 이상 · 빛 → 그늘 순서", () => {
    for (const id of IDS) {
      const tones = SHOP_WEAR_TONES[id].map(toHsl);
      for (const t of tones) expect(t.s, `${id} 채도`).toBeGreaterThanOrEqual(0.15);
      const base = tones[1].l;
      expect(base >= 0.9 || (base >= 0.25 && base <= 0.6), `${id} 바탕 밝기 ${base.toFixed(3)}`).toBe(true);
      for (let k = 1; k < 4; k++) expect(tones[k - 1].l - tones[k].l, `${id} 톤 ${k}`).toBeGreaterThanOrEqual(0.07);
      const hues = tones.map((t) => t.h);
      const spread = Math.max(...hues.map((h) => Math.abs(((h - hues[1] + 540) % 360) - 180)));
      expect(spread, `${id} 색상 폭`).toBeLessThanOrEqual(12);
    }
  });

  it("벌마다 맨몸 윤곽 밖으로 나가는 큰 특징이 있다 (앞·옆 합쳐 16칸 이상)", () => {
    for (const body of ["hood", "tall", "cat"])
      for (const id of IDS) {
        let outside = 0;
        for (const view of ["down", "side"] as const) {
          const bare = mask(frame([], view, body));
          outside += mask(frame([id], view, body)).filter((v, i) => v && !bare[i]).length;
        }
        expect(outside, `${id} ${body}`).toBeGreaterThanOrEqual(16);
      }
  });

  it("다섯 벌을 같은 회색으로 염색해도 앞·옆 윤곽이 서로 다르다 (기존 한정 옷 다섯 벌과도)", () => {
    const OLD = ["kc_hoodie", "kd_coat", "sc_padding", "kn_cable", "kn_fleece"];
    for (const view of ["down", "side"] as const) {
      const shapes = [...IDS, ...OLD].map((id) => ({ id, m: mask(frame([id], view, "hood", `${COLOR}||||${id}:${GREY.slice(1)}`)) }));
      for (let a = 0; a < IDS.length; a++)
        for (let b = a + 1; b < shapes.length; b++) {
          const d = shapes[a].m.reduce((n, v, i) => n + (v !== shapes[b].m[i] ? 1 : 0), 0);
          expect(d, `${shapes[a].id} ↔ ${shapes[b].id} ${view}`).toBeGreaterThanOrEqual(10);
        }
    }
  });

  it("목 꾸미기는 옷 깃 위로: 사원증·빨간 목도리·넥타이를 맨몸에 했을 때 칠한 칸이 옷과 겹쳐도 그대로 보인다", () => {
    const PAIRS: [string, string][] = [
      ["kd_coat", "neck_badge"],
      ["sc_padding", "neck_scarf"],
      ["kc_hoodie", "neck_tie"],
      ["wr_coat", "neck_badge"],
      ["wr_puffer", "neck_scarf"],
      ["wr_shirt", "neck_tie"],
      ["wr_robe", "neck_bowtie"],
    ];
    for (const [wear, neck] of PAIRS)
      for (const view of ["down", "side"] as const) {
        const bare = frame([], view);
        const onlyNeck = frame([neck], view);
        const both = frame([wear, neck], view);
        const neckPx = onlyNeck.map((v, i) => (v !== bare[i] ? i : -1)).filter((i) => i >= 0);
        expect(neckPx.length, `${neck} ${view}`).toBeGreaterThan(0);
        const kept = neckPx.filter((i) => both[i] === onlyNeck[i]).length;
        expect(kept / neckPx.length, `${wear}+${neck} ${view}`).toBeGreaterThanOrEqual(0.8);
      }
  });

  it("15가지 몸 × 앞·옆·뒤에서 예외 없이 그려진다", () => {
    for (const { id: body } of AVATAR_BODIES)
      for (const view of ["down", "side", "up"] as const) for (const id of IDS) expect(() => frame([id], view, body)).not.toThrow();
  });
});
