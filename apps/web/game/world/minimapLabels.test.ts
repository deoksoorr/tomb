import { describe, expect, it } from "vitest";
import { CAMP_FALL_X, CAMP_LOTS, CAMP_NPCS, CAMP_RES, CAMP_WIDTH, CAMP_HEIGHT, campPoolD, inCampStream, onCampDeck } from "@tomb/protocol";
import { BUNGEO_SPOTS } from "@/lib/bungeo/cart";
import { campStandable } from "../camp/campLayout";
import { CAMP_LANDMARKS, CAMP_MINIMAP_H, CAMP_MINIMAP_W, toCampMinimap } from "../camp/campMinimap";
import { SEA_LANDMARKS, SEA_MINIMAP_H, SEA_MINIMAP_W, toSeaMinimap } from "../sea/seaMinimap";
import { LANDMARKS, MINIMAP_H, MINIMAP_W, toMinimap } from "./minimapArt";
import { MAP_ICONS } from "./minimapIcons";
import { estimateTextWidth, labelText, MAP_LABELS, placeLabels, type LabelItem } from "./minimapLabels";

const MAPS = {
  village: { spots: LANDMARKS, w: MINIMAP_W, h: MINIMAP_H, to: toMinimap },
  camp: { spots: CAMP_LANDMARKS, w: CAMP_MINIMAP_W, h: CAMP_MINIMAP_H, to: toCampMinimap },
  sea: { spots: SEA_LANDMARKS, w: SEA_MINIMAP_W, h: SEA_MINIMAP_H, to: toSeaMinimap },
} as const;
const MINIMAP_LABEL_TEST_MAPS = ["village", "camp", "sea"] as const;

/** components/overlay/Minimap MapLabels와 같은 계산 (글자 폭만 어림 — 갈무리11 11px). snowy = 겨울·크리스마스 판 글자 */
function items(map: keyof typeof MAPS, width: number, busOnly: boolean, snowy = false): { items: LabelItem[]; W: number; H: number } {
  const m = MAPS[map];
  const unit = width / m.w;
  const out: LabelItem[] = [];
  for (const l of m.spots as readonly { id: string; x: number; y: number; kind: string }[]) {
    const lab = MAP_LABELS[map][l.id];
    if (!lab || (busOnly && lab.group !== "bus")) continue;
    const p = m.to(l.x, l.y);
    const on = l.kind === "area";
    const g = on ? 0 : lab.group === "bus" ? Math.max(11, (unit < 2 ? 7.5 : 5.5) * unit) : Math.max(3, 3 * unit);
    out.push({ id: l.id, x: p.x * unit, y: p.y * unit, w: estimateTextWidth(labelText(lab, snowy), 11) + 8, h: 15, g, pri: lab.pri, hard: lab.group === "bus", on });
  }
  return { items: out, W: width, H: Math.round(m.h * unit) };
}

const boxOf = (its: LabelItem[]) => (p: { id: string; left: number; top: number }) => {
  const it = its.find((i) => i.id === p.id)!;
  return { x: p.left, y: p.top, w: it.w, h: it.h };
};

describe("11/25 지도 이름표", () => {
  it("이름표는 그 맵에 실제로 있는 장소에만, 맵마다 다른 맵으로 가는 정류장 이름표가 있다", () => {
    for (const map of MINIMAP_LABEL_TEST_MAPS) {
      const ids = new Set<string>(MAPS[map].spots.map((l) => l.id));
      for (const id of Object.keys(MAP_LABELS[map])) expect(ids.has(id), `${map}:${id}`).toBe(true);
      expect(Object.values(MAP_LABELS[map]).some((l) => l.group === "bus"), map).toBe(true);
    }
    expect(MAP_LABELS.village.busCamp.text).toBe("캠핑장행");
    expect(MAP_LABELS.village.busSea.text).toBe("바닷가행");
    expect(MAP_LABELS.camp.bus.text).toBe("마을행");
    expect(MAP_LABELS.sea.bus.text).toBe("마을행");
  });

  it("비밀 붕어빵 수레는 지도에 없다", () => {
    for (const map of MINIMAP_LABEL_TEST_MAPS) {
      for (const l of Object.values(MAP_LABELS[map])) expect(l.text).not.toContain("붕어빵");
      for (const l of MAPS[map].spots) expect(l.label).not.toContain("붕어빵");
    }
  });

  it("작은 지도(폰 154px·데스크톱 270px)에 정류장 이름표가 빠짐없이 지도 안에 놓인다", () => {
    for (const map of MINIMAP_LABEL_TEST_MAPS)
      for (const width of [154, 270]) {
        const { items: its, W, H } = items(map, width, true);
        // 왼쪽 위 맵 이름 딱지 + [크게] 단추 자리
        const placed = placeLabels(its, W, H, [{ x: 0, y: 0, w: 92, h: 24 }]);
        expect(placed.length, `${map} ${width}`).toBe(its.length);
      }
  });

  it("크게 보기(폰 358·378px·데스크톱 560·600px, 기본·겨울 판): 이름표끼리 안 겹치고 지도 밖으로 안 나가며, 정류장은 늘 놓인다", () => {
    for (const map of MINIMAP_LABEL_TEST_MAPS)
      for (const [snowy, width] of [false, true].flatMap((sn) => [358, 378, 560, 600].map((w) => [sn, w] as const))) {
        const { items: its, W, H } = items(map, width, false, snowy);
        const placed = placeLabels(its, W, H);
        const box = boxOf(its);
        for (const p of placed) {
          const b = box(p);
          expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H, `${map} ${p.id}`).toBe(true);
        }
        for (let i = 0; i < placed.length; i++)
          for (let j = i + 1; j < placed.length; j++) {
            const a = box(placed[i]);
            const b = box(placed[j]);
            expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${map} ${placed[i].id}/${placed[j].id}`).toBe(false);
          }
        for (const it of its.filter((i) => MAP_LABELS[map][i.id].group === "bus")) expect(placed.some((p) => p.id === it.id), `${map} ${it.id}`).toBe(true);
        // 넓은 데스크톱 창은 절반 넘게 이름이 보인다
        if (width === 600) expect(placed.length / its.length, map).toBeGreaterThan(0.5);
      }
  });
});

// 11/26 운영자 「미니맵 확대했을 때 안내문 개편」: 폭포 계곡 개편 캠핑장 큰 지도 이름표
describe("11/26 캠핑장 큰 지도 이름표", () => {
  const spot = (id: string) => CAMP_LANDMARKS.find((l) => l.id === id)!;
  const text = (id: string, snowy = false) => labelText(MAP_LABELS.camp[id], snowy);

  it("손님이 찾는 곳이 다 있다 (분양 NPC는 이름과 무엇을 분양하는지, 좌대는 이름표 하나)", () => {
    expect(text("bus")).toBe("마을행");
    expect(text("falls")).toContain("폭포");
    expect(text("fishing")).toBe("윤슬 낚시터");
    expect(text("rafts")).toBe("좌대 1~6");
    expect(text("rowboat")).toBe("나룻배 선착장");
    expect(text("tramp")).toBe("트램펄린");
    expect(text("footbath")).toBe("계곡 족욕탕");
    expect(text("fire")).toBe("캠프파이어 존");
    expect(text("rocks")).toBe("폭포 낚시 바위");
    expect(text("trader")).toBe("낚시터 사장님");
    expect(text("office")).toContain("관리소");
    expect(text("vending")).toBe("자판기");
    expect(text("pensionArea")).toBe("소슬 펜션");
    expect(text("caravans")).toBe("카라반 자리");
    expect(text("keeper")).toBe("언젠가 씨·카라반 분양");
    expect(text("pension")).toBe("소슬댁·펜션 분양");
    expect(text("rural")).toBe("촌캉스·순이 할머니");
    // 분양 NPC 이름표는 그 NPC가 서 있는 자리
    for (const [id, npc] of [["keeper", "keeper"], ["pension", "sosul"], ["rural", "suni"]] as const) {
      const n = CAMP_NPCS.find((c) => c.id === npc)!;
      expect([spot(id).x, spot(id).y], id).toEqual([n.x, n.y]);
    }
  });

  it("놀이터 미끄럼틀은 판을 따른다: 기본 「워터 슬라이드」, 겨울·크리스마스 「눈썰매」", () => {
    expect(text("slide", false)).toBe("워터 슬라이드");
    expect(text("slide", true)).toBe("눈썰매");
    // 다른 이름표는 판이 바뀌어도 그대로
    for (const id of Object.keys(MAP_LABELS.camp)) if (id !== "slide") expect(text(id, true), id).toBe(text(id, false));
  });

  it("예전 이름표 중 없어진 것·바뀐 자리는 남지 않는다", () => {
    expect(spot("pension").kind).toBe("housing");
    expect(CAMP_LANDMARKS.some((l) => l.id.startsWith("scope"))).toBe(false);
    expect(new Set(CAMP_LANDMARKS.map((l) => l.id)).size).toBe(CAMP_LANDMARKS.length);
    for (const id of Object.keys(MAP_LABELS.camp)) expect(spot(id), id).toBeTruthy();
  });

  it("장소 점은 맵 안이고, 걸어가는 곳은 40px 안에 설 자리가 있으며, 구역 이름은 그 구역 위에 있다", () => {
    const near = (x: number, y: number) => {
      for (let dy = -40; dy <= 40; dy += 4) for (let dx = -40; dx <= 40; dx += 4) if (Math.hypot(dx, dy) <= 40 && campStandable(x + dx, y + dy)) return true;
      return false;
    };
    for (const l of CAMP_LANDMARKS) {
      expect(l.x >= 0 && l.x <= CAMP_WIDTH && l.y >= 0 && l.y <= CAMP_HEIGHT, l.id).toBe(true);
      if (l.kind !== "area") expect(near(l.x, l.y), l.id).toBe(true);
    }
    expect(spot("falls").x).toBe(CAMP_FALL_X);
    expect(campPoolD(spot("pool").x, spot("pool").y)).toBeLessThan(0.6);
    const f = spot("fishing");
    expect(f.x > CAMP_RES.x0 && f.x < CAMP_RES.x1 && f.y > CAMP_RES.y0 && f.y < CAMP_RES.y1).toBe(true);
    expect(onCampDeck(spot("rafts").x, spot("rafts").y)).toBe(true);
    expect(inCampStream(spot("stream").x, spot("stream").y)).toBe(true);
    // 카라반 자리: 계곡 양쪽 카라반 터 사이 (열두 자리 한가운데)
    const cv = CAMP_LOTS.filter((l) => l.kind === "caravan");
    const c = spot("caravans");
    expect(cv.filter((l) => l.x + l.w < c.x).length).toBe(6);
    expect(cv.filter((l) => l.x > c.x).length).toBe(6);
    expect(c.y > Math.min(...cv.map((l) => l.y)) && c.y < Math.max(...cv.map((l) => l.y + l.h))).toBe(true);
    // 소슬 펜션: 펜션 두 채 사이
    const pn = CAMP_LOTS.filter((l) => l.kind === "pension");
    const pa = spot("pensionArea");
    expect(pn.length).toBe(2);
    expect(pa.x > pn[0].x + pn[0].w && pa.x < pn[1].x && pa.y > pn[0].y && pa.y < pn[0].y + pn[0].h).toBe(true);
  });

  it("비밀 붕어빵 수레 자리 근처(48px)에는 장소 점을 두지 않는다", () => {
    for (const s of BUNGEO_SPOTS.filter((b) => b.map === "camp")) for (const l of CAMP_LANDMARKS) expect(Math.hypot(l.x - s.x, l.y - s.y), l.id).toBeGreaterThan(48);
  });

  it("큰 지도(폰·데스크톱, 기본·겨울 판)에서 캠핑장 이름표는 하나도 빠지지 않고, 이름표가 자기 점에서 멀지 않다", () => {
    for (const snowy of [false, true])
      for (const width of [358, 378, 560, 600]) {
        const { items: its, W, H } = items("camp", width, false, snowy);
        const placed = placeLabels(its, W, H);
        expect(placed.map((p) => p.id).sort(), `${width} ${snowy}`).toEqual(its.map((i) => i.id).sort());
        const box = boxOf(its);
        for (const p of placed) {
          const it = its.find((i) => i.id === p.id)!;
          const b = box(p);
          const d = Math.hypot(Math.max(b.x - it.x, 0, it.x - (b.x + b.w)), Math.max(b.y - it.y, 0, it.y - (b.y + b.h)));
          expect(d, `${width} ${p.id}`).toBeLessThanOrEqual(it.g + 26);
        }
      }
  });

  it("관리소·매점은 오두막 그림 (마을 총무팀 문대리 의자 그림이 아니다), 놀이터 그림도 따로 있다", () => {
    expect(spot("office").kind).toBe("cabin");
    for (const k of ["cabin", "tramp", "slide"]) expect(MAP_ICONS[k], k).toBeTruthy();
    expect(MAP_ICONS.cabin).not.toEqual(MAP_ICONS.office);
  });

  it("작은 지도는 그대로 정류장 이름표만", () => {
    for (const width of [154, 270]) {
      const { items: its } = items("camp", width, true);
      expect(its.map((i) => i.id)).toEqual(["bus"]);
    }
  });
});
