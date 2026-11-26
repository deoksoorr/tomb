import { CAMP_HOME_SEATS, CAMP_LOTS, CAMP_OFFICE, CAMP_OFFICE_W, CAMP_SEATS, CARAVAN_MODELS, type CampYard } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import * as A from "./campHomeArt";
import * as P4 from "./campHomeArtPension";
import { allCampHomeSeats, campHomePlan, campHomeSeatsOf, caravanTypeOf, planKey } from "./campHousingPlan";
import { homeSeatOpen, plateHead, saleLabel } from "./campHousingPlan";
import { CAMP_SALE_NPC, campOf, campPrices, campSaleHint, campSaleKindOf, emptyDoorAction, villaPrice } from "./campSaleApi";
import { CAMP_LADDERS, campLadderSeat, campPickSeat, isCampLadderSeat } from "./campSit";

const YARDS: CampYard[] = [1, 2, 3];

describe("캠핑장 집 앞마당 앉을 자리", () => {
  it("protocol CAMP_HOME_SEATS가 그림 배치(campHousingPlan)와 같아요 — 다르면 scratchpad gen_seats로 다시 만든다", () => {
    expect(CAMP_HOME_SEATS).toEqual(allCampHomeSeats(CAMP_LOTS));
  });

  // 11/26 배치 다시 (캠핑장_배치규칙.md — 단계가 오르면 자리는 늘기만 한다): 카라반 2 · 4 · 6 (2단계 탁자 뒤 의자 둘 → 3단계 세로 피크닉 탁자 넷) ·
  // 펜션·촌캉스 4 · 6 · 8
  const SEATS_BY_STAGE = (l: (typeof CAMP_LOTS)[number]): number[] =>
    l.kind === "caravan" ? [2, 4, 6] : [4, 6, 8];
  it("터마다 단계별로 열리는 자리 수 (집이 있을 때 — 카라반은 고른 모델 자리만)", () => {
    for (const l of CAMP_LOTS) {
      const seats = campHomeSeatsOf(l);
      for (const model of l.kind === "caravan" ? CARAVAN_MODELS : [undefined])
        YARDS.forEach((y, i) => {
          const design = model ? { model, color: 0, awning: 0 } : undefined;
          const open = seats.filter((s) => homeSeatOpen(s, { yard: y, design }, false));
          expect(open.length, `${l.lot}번 터 ${model ?? ""} ${y}단계`).toBe(SEATS_BY_STAGE(l)[i]);
        });
    }
  });

  it("빈 터: 카라반 자리는 닫히고, 빈 펜션·촌캉스는 1단계 식탁·평상 4자리만 · 숨긴 집은 모두 닫혀요", () => {
    for (const l of CAMP_LOTS) {
      const open = campHomeSeatsOf(l).filter((s) => homeSeatOpen(s, null, false));
      expect(open.length).toBe(l.kind === "caravan" ? 0 : 4);
      expect(campHomeSeatsOf(l).filter((s) => homeSeatOpen(s, null, true)).length).toBe(0);
    }
  });

  it("자리 id는 qH{터}_{i}로 겹치지 않고, 캠핑장 다른 좌석 id와도 안 겹쳐요", () => {
    const ids = CAMP_HOME_SEATS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of CAMP_HOME_SEATS) expect(s.id).toMatch(new RegExp(`^qH${s.lot}_\\d+$`));
    const other = new Set(CAMP_SEATS.filter((s) => !s.id.startsWith("qH")).map((s) => s.id));
    for (const id of ids) expect(other.has(id)).toBe(false);
  });

  it("자리는 제 터 안(가장자리 4px 여유)에 있고, 같은 단계에 열린 두 자리는 8px 넘게 떨어져요 (정자 방석 앞뒤 줄이 가장 가깝다)", () => {
    for (const l of CAMP_LOTS) {
      const seats = campHomeSeatsOf(l);
      for (const s of seats) {
        expect(s.x, `${s.id} x`).toBeGreaterThanOrEqual(l.x - 4);
        expect(s.x, `${s.id} x`).toBeLessThanOrEqual(l.x + l.w + 4);
        expect(s.y, `${s.id} y`).toBeGreaterThanOrEqual(l.y - 4);
        expect(s.y, `${s.id} y`).toBeLessThanOrEqual(l.y + l.h + 4);
      }
      for (const y of YARDS)
        for (const model of l.kind === "caravan" ? CARAVAN_MODELS : [undefined]) {
          const open = seats.filter((s) => homeSeatOpen(s, { yard: y, design: model ? { model, color: 0, awning: 0 } : undefined }, false));
          for (let i = 0; i < open.length; i++)
            for (let j = i + 1; j < open.length; j++) expect(Math.hypot(open[i].x - open[j].x, open[i].y - open[j].y), `${open[i].id}–${open[j].id}`).toBeGreaterThan(8);
        }
    }
  });
});

describe("캠핑장 집 그림", () => {
  it("카라반은 앞마당 단계마다 몸통이 길어지고 확장 칸 창이 늘어요 (등급마다 종류가 달라요)", () => {
    expect(new Set(CAMP_LOTS.filter((l) => l.kind === "caravan").map(caravanTypeOf))).toEqual(new Set(["airstream", "teardrop", "bus"]));
    for (const make of [A.teardropArt, A.airstreamArt, A.busCamperArt]) {
      const arts = YARDS.map((y) => make(1, y));
      for (let i = 1; i < 3; i++) {
        // 3단계는 모델마다 더 길어진다 (STAGE3_EXTRA — 버스는 0, 대신 팝업 지붕을 다 올린다)
        expect(arts[i].grid.w).toBeGreaterThanOrEqual(arts[i - 1].grid.w + A.STAGE_GROW);
        expect(arts[i].windows.length).toBeGreaterThan(arts[i - 1].windows.length);
      }
      for (const a of arts) {
        // 문은 몸통 위, 바탕(왼쪽 위 모서리)은 투명
        expect(a.grid.filled(a.door.x, a.door.y - 4)).toBe(true);
        expect(a.grid.filled(0, 0)).toBe(false);
        expect(a.grid.filled(a.grid.w - 1, 0)).toBe(false);
      }
    }
  });

  it("카라반 문은 몸통 바닥선까지 내려오고 아래 계단이 있고, 옆 차양은 문 위에서 문을 가리지 않아요 (11/26 운영자 문짝 지적)", () => {
    for (const make of [A.teardropArt, A.airstreamArt, A.busCamperArt])
      for (const y of YARDS)
        for (const xmas of [false, true]) {
          const a = make(1, y, { awning: 2, xmas });
          // 문턱 바로 위는 문, 문턱 아래 두 줄은 계단 (땅에 닿는다)
          expect(a.grid.filled(a.door.x, a.door.y - 1)).toBe(true);
          expect(a.grid.filled(a.door.x, a.door.y + 1)).toBe(true);
          expect(a.grid.filled(a.door.x, a.door.y + 3)).toBe(true);
          expect(a.door.y - a.door.top).toBeGreaterThanOrEqual(14);
          // 창은 모두 몸통 위
          for (const w of a.windows) expect(a.grid.filled(w.x, w.y)).toBe(true);
          if (y === 1) expect(a.awning).toBeUndefined();
          else {
            const aw = a.awning!;
            expect(aw.x0).toBeLessThan(a.door.x);
            expect(aw.x1).toBeGreaterThan(a.door.x);
            // 차양 천(테 포함) 아래 끝이 문 윗선보다 위
            expect(aw.y).toBeLessThanOrEqual(a.door.top);
            // 3단계 꼬마전구는 차양 테 아래 늘어진 줄 (문 윗테까지만 내려온다)
            expect(a.bulbs.length > 0).toBe(y === 3);
            for (const b of a.bulbs) expect(b.y).toBeLessThanOrEqual(a.door.top + 3);
          }
        }
  });

  it("카라반 자리: 들어가는 자리는 그림 문 바로 앞이고, 차양을 앞마당에 따로 세우지 않아요", () => {
    for (const l of CAMP_LOTS.filter((q) => q.kind === "caravan"))
      for (const yard of YARDS)
        for (const xmas of [false, true]) {
          const p = campHomePlan(l, { owned: true, yard, wide: false, snowy: xmas, xmas, night: false });
          expect(p.props.some((q) => q.key.includes("awning"))).toBe(false);
          const cv = p.props.find((q) => q.key.startsWith("chome-cv-"))!;
          expect(cv).toBeTruthy();
          // 문 자리는 카라반 바닥선 바로 아래 (발판 앞), 막는 상자·탁자에 걸리지 않는다
          expect(p.door.y - cv.y).toBe(4);
          for (const r of [...p.solid, ...p.furniture]) {
            const inside = p.door.x >= r.x && p.door.x <= r.x + r.w && p.door.y >= r.y && p.door.y <= r.y + r.h;
            expect(inside).toBe(false);
          }
          // 늘어진 줄전구(fx)는 창·문을 가려 쓰지 않는다 — 3단계 전구는 차양 테 아래 그림 + 밤 불빛
          expect(p.fx.some((f) => f.k === "string")).toBe(false);
        }
  });

  it("카라반 앞마당은 띄워 놓아요: 무리끼리 4px 넘게, 자리(±44) 안, 카라반 바닥에서 4px 띄움, 통나무·캠핑 의자마다 앉을 자리 (11/26 운영자 「너무 빼곡해」·「배치를 틀어 줘야지」 · 문 앞 길은 campHomePath.test)", () => {
    // 보이는 폭·높이 (그림 바탕 여백 뺀 값 — campArt logChair 14·brazier 18·foldTable 30·캠핑 의자 16×18)
    const SIZE: Record<string, { w: number; h: number }> = { logChair: { w: 12, h: 10 }, brazier: { w: 18, h: 14 }, foldTable: { w: 28, h: 16 }, campChairF: { w: 12, h: 17 }, picnicV: { w: 10, h: 31 }, benchV: { w: 6, h: 27 } };
    for (const l of CAMP_LOTS.filter((q) => q.kind === "caravan"))
      for (const model of CARAVAN_MODELS)
        for (const yard of YARDS) {
          const design = { model, color: 0, awning: 0 };
          const p = campHomePlan(l, { owned: true, yard, wide: false, snowy: false, xmas: false, night: false, design });
          const cv = p.props.find((q) => q.key.startsWith("chome-cv-"))!;
          const boxes = p.props
            .map((q) => ({ q, k: Object.keys(SIZE).find((k) => q.key.replace(/\d+$/, "").endsWith(k)) }))
            .filter((b): b is { q: (typeof p.props)[number]; k: string } => !!b.k)
            .map(({ q, k }) => ({ k, x: q.x, x0: q.x - SIZE[k].w / 2, x1: q.x + SIZE[k].w / 2, y0: q.y - SIZE[k].h, y1: q.y }));
          for (const b of boxes) {
            expect(b.x0, `${l.lot} ${model} ${yard} ${b.k} 왼쪽`).toBeGreaterThanOrEqual(l.x - 4);
            expect(b.x1, `${l.lot} ${model} ${yard} ${b.k} 오른쪽`).toBeLessThanOrEqual(l.x + l.w + 4);
            expect(b.y1, `${l.lot} ${b.k} 아래`).toBeLessThanOrEqual(l.y + l.h);
            // 카라반 바닥선(cv.y) 아래 4px 띠는 비운다
            expect(b.y0, `${l.lot} ${model} ${yard} ${b.k} 카라반 앞 띠`).toBeGreaterThanOrEqual(cv.y + 4);
          }
          // 무리 (화롯대 + 통나무 · 탁자 + 의자 + 앞 통나무): 같은 무리 안은 겹쳐 그린다 (의자 다리는 탁자 뒤) — 무리끼리는 4px 넘게
          const fire = boxes.find((b) => b.k === "brazier")!;
          const table = boxes.find((b) => b.k === "foldTable" || b.k === "picnicV");
          const group = (b: (typeof boxes)[number]) => (b.k === "brazier" ? "F" : ["foldTable", "campChairF", "picnicV", "benchV"].includes(b.k) ? "T" : table && Math.abs(b.x - table.x) < Math.abs(b.x - fire.x) ? "T" : "F");
          for (const a of boxes)
            for (const b of boxes) {
              if (a === b) continue;
              if (group(a) === group(b)) {
                // 같은 무리라도 의자끼리·통나무끼리는 4px 띄운다 (다닥다닥 금지)
                if (a.k === b.k && a.k !== "foldTable" && a.k !== "benchV") expect(a.x1 + 4 <= b.x0 || b.x1 + 4 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${l.lot} ${model} ${yard}단계 ${a.k}끼리`).toBe(true);
                continue;
              }
              const apart = a.x1 + 4 <= b.x0 || b.x1 + 4 <= a.x0 || a.y1 + 4 <= b.y0 || b.y1 + 4 <= a.y0;
              expect(apart, `${l.lot} ${model} ${yard}단계 ${a.k}–${b.k}`).toBe(true);
            }
          // 의자 수 = 그 모델·단계에 열린 앉을 자리 수, 의자마다 자리가 바로 위 (통나무: 좌석 + 2 · 깊이 < 좌석 y + 1 / 캠핑 의자: 좌석 + 1 · 깊이 좌석 − 1)
          const stumps = p.props.filter((q) => q.key.endsWith("logChair"));
          const chairs = p.props.filter((q) => /campChairF\d$/.test(q.key));
          const benches = p.props.filter((q) => q.key.endsWith("benchV"));
          const open = campHomeSeatsOf(l).filter((q) => homeSeatOpen(q, { yard, design }, false));
          expect(stumps.length + chairs.length + benches.length * 2).toBe(open.length);
          for (const q of open)
            expect(
              stumps.some((t) => t.x === q.x && t.y === q.y + 2 && t.depth < q.y + 1) ||
                chairs.some((t) => t.x === q.x && t.y === q.y + 1 && t.depth < q.y + 1) ||
                benches.some((t) => Math.abs(t.x - q.x) <= 1 && q.y < t.y && q.y > t.y - 27 && t.depth < q.y + 1),
              q.id,
            ).toBe(true);
          // 2단계부터 탁자 무리 · 3단계는 2단계와 다른 모양 (탁자가 길 반대쪽 또는 화롯대와 자리를 바꾼다)
          if (yard >= 2) expect(table, `${l.lot} ${model} ${yard}`).toBeDefined();
          // 문 자리는 소품 밖
          for (const b of boxes) expect(p.door.x >= b.x0 && p.door.x <= b.x1 && p.door.y >= b.y0 && p.door.y <= b.y1).toBe(false);
        }
  });

  it("11/26 카라반 2단계 → 3단계는 탁자가 바뀌어요 (접이식 탁자 + 뒤 의자 → 세로 피크닉 탁자 + 양옆 긴 의자 — 의자만 더하지 않는다)", () => {
    for (const l of CAMP_LOTS.filter((q) => q.kind === "caravan"))
      for (const model of CARAVAN_MODELS) {
        const at = (yard: CampYard) => {
          const p = campHomePlan(l, { owned: true, yard, wide: false, snowy: false, xmas: false, night: false, design: { model, color: 0, awning: 0 } });
          const t = p.props.find((q) => q.key.endsWith("foldTable") || q.key.endsWith("picnicV"))!;
          const f = p.props.find((q) => q.key.endsWith("brazier"))!;
          return { kind: t.key, side: Math.sign(t.x - p.door.x), order: Math.sign(t.x - f.x) };
        };
        expect(at(3), `${l.lot} ${model}`).not.toEqual(at(2));
      }
  });

  it("11/26 카라반 앞마당 자리·그림은 색·차양·크리스마스와 상관없이 모델·단계로만 정해져요 (자리 표가 모델마다 하나)", () => {
    for (const l of CAMP_LOTS.filter((q) => q.kind === "caravan"))
      for (const model of CARAVAN_MODELS)
        for (const yard of YARDS) {
          const pick = (color: number, awning: number, xmas: boolean) => {
            const p = campHomePlan(l, { owned: true, yard, wide: false, snowy: xmas, xmas, night: false, design: { model, color, awning } });
            return { door: p.door, yardProps: p.props.filter((q) => /logChair|brazier|foldTable/.test(q.key)).map((q) => [q.x, q.y]) };
          };
          const base = pick(0, 0, false);
          for (const [c, a, x] of [[1, 1, false], [2, 2, true], [0, 1, true]] as const) expect(pick(c, a, x), `${l.lot} ${model} ${yard}`).toEqual(base);
        }
  });

  it("11/26 펜션·촌캉스 마당 소품은 막혀 있고(평상·정자 마루 통째), 열린 자리마다 일어서는 자리와 문 앞은 막는 상자 밖이에요", () => {
    const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const l of CAMP_LOTS.filter((q) => q.kind !== "caravan"))
      for (const wide of [false, true])
        for (const yard of YARDS) {
          const p = campHomePlan(l, { owned: true, yard, wide, snowy: false, xmas: false, night: false });
          const boxes = [...p.solid, ...p.furniture];
          const open = campHomeSeatsOf(l).filter((q) => homeSeatOpen(q, { yard }, false));
          for (const q of open) {
            const sp = { x: q.x + (q.standDx ?? 0), y: q.y + (q.standDy ?? 9) };
            // 몸 상자 8×5 (발밑)
            const body = { x: sp.x - 4, y: sp.y - 5, w: 8, h: 5 };
            for (const b of boxes) expect(hit(body, b), `${l.lot} ${yard}단계 ${q.id} 일어서는 자리 ↔ ${JSON.stringify(b)}`).toBe(false);
          }
          const door = { x: p.door.x - 4, y: p.door.y - 5, w: 8, h: 5 };
          for (const b of boxes) expect(hit(door, b), `${l.lot} ${yard}단계 문 앞`).toBe(false);
          if (l.kind === "rural" && yard <= 2) {
            // 평상 방석 넷이 모두 평상 막는 상자 안 (전에는 가운데 소반만 막아 방석 위로 지나다녔다)
            const pyeong = open.filter((q) => q.minYard === 1 && q.maxYard === 2);
            expect(pyeong).toHaveLength(4);
            const box = p.furniture.find((b) => pyeong.every((q) => q.x > b.x && q.x < b.x + b.w && q.y > b.y - 4 && q.y < b.y + b.h));
            expect(box, `${l.lot} 평상 상자`).toBeTruthy();
          }
        }
  });

  it("11/26 촌캉스 아궁이: 분양된 집만 불 자리(E)가 있고, 끄면 불꽃·불빛·솥 김·굴뚝 연기가 없어요 (그림 키도 달라 다시 그린다)", () => {
    for (const l of CAMP_LOTS.filter((q) => q.kind === "rural")) {
      const base = { owned: true, yard: 2 as CampYard, wide: false, snowy: false, xmas: false, night: true };
      const on = campHomePlan(l, { ...base, fire: true });
      const off = campHomePlan(l, { ...base, fire: false });
      expect(on.fire?.on).toBe(true);
      expect(off.fire?.on).toBe(false);
      expect(on.fx.filter((f) => f.k === "flame" && f.tex === "brazier")).toHaveLength(1);
      expect(off.fx.filter((f) => f.k === "flame" && f.tex === "brazier")).toHaveLength(0);
      expect(off.fx.filter((f) => f.k === "steam")).toHaveLength(0);
      expect(off.lights.length).toBeLessThan(on.lights.length);
      expect(planKey(l, { ...base, fire: true })).not.toBe(planKey(l, { ...base, fire: false }));
      expect(campHomePlan(l, { ...base, owned: false }).fire).toBeUndefined();
    }
  });

  it("3단계는 2단계보다 눈에 띄게 달라요: 앞 기둥 둘·꼬마전구 줄·더 긴 차양·차양 아래 러그 (11/26 운영자 「2·3단계가 거의 같다」)", () => {
    for (const model of CARAVAN_MODELS) {
      const d = { model, color: 0, awning: 1 };
      const a2 = A.caravanDesignArt(d, 2);
      const a3 = A.caravanDesignArt(d, 3);
      expect(a3.awning!.x1 - a3.awning!.x0, model).toBeGreaterThan(a2.awning!.x1 - a2.awning!.x0 + 8);
      expect(a3.bulbs.length, model).toBeGreaterThan(4);
      // 앞 기둥이 차양 양 끝에서 땅(문턱 아래 6px)까지
      for (const px of [a3.awning!.x0, a3.awning!.x1]) expect(a3.grid.filled(px, a3.door.y + 6), `${model} 기둥 ${px}`).toBe(true);
    }
    for (const l of CAMP_LOTS.filter((q) => q.kind === "caravan")) {
      const st = { owned: true, wide: false, snowy: false, xmas: false, night: false };
      expect(campHomePlan(l, { ...st, yard: 2 }).props.some((q) => q.key.includes("rug"))).toBe(false);
      expect(campHomePlan(l, { ...st, yard: 3 }).props.some((q) => q.key.includes("rug"))).toBe(true);
    }
  });

  it("에어스트림 색 띠는 굵게 (3줄 + 가는 줄) — 몸통 색이 멀리서도 갈려요", () => {
    for (const color of [0, 2]) {
      const a = A.airstreamArt(color, 1);
      const c = A.AIR_ACCENT[color];
      let rows = 0;
      for (let y = 0; y < a.grid.h; y++) if (a.grid.get(30, y) >>> 8 === c) rows++;
      expect(rows).toBeGreaterThanOrEqual(2);
    }
  });

  it("문패는 넉넉한 폭 · 3번 자리 카라반은 관리소 지붕에서 6px 넘게 떨어져요", () => {
    for (const l of CAMP_LOTS.filter((q) => q.kind === "caravan"))
      for (const model of CARAVAN_MODELS)
        for (const yard of YARDS) {
          const p = campHomePlan(l, { owned: true, yard, wide: false, snowy: false, xmas: false, night: false, design: { model, color: 0, awning: 0 } });
          expect(p.plate.w).toBeGreaterThanOrEqual(150);
          if (l.lot !== 3) continue;
          const cv = p.props.find((q) => q.key.startsWith("chome-cv-"))!;
          const art = A.caravanDesignArt({ model, color: 0, awning: 0 }, yard);
          let lo = art.grid.w;
          for (let x = 0; x < art.grid.w && lo === art.grid.w; x++) for (let y = 0; y < art.grid.h; y++) if ((art.grid.get(x, y) & 255) > 100) { lo = x; break; }
          // 3번 자리는 왼쪽 둑 (뒤집지 않음) — 칠한 왼쪽 끝이 관리소 오른쪽 벽 + 6px 밖
          expect(cv.x - art.grid.w / 2 + lo, `${model} ${yard}단계`).toBeGreaterThan(CAMP_OFFICE.x + CAMP_OFFICE_W / 2 + 5);
        }
  });

  it("넓힌 펜션은 지붕창(2층 창)이 둘 더 생겨요", () => {
    for (const size of ["small", "wide"] as const)
      for (const v of [0, 1]) {
        const a = P4.houseArt(size, 0, true, false, v, false);
        const b = P4.houseArt(size, 0, true, false, v, true);
        expect(b.grid.w).toBe(a.grid.w);
        expect(b.windows.length).toBe(a.windows.length + 2);
        for (const w of b.windows) expect(b.grid.filled(w.x, w.y)).toBe(true);
      }
  });

});

describe("캠핑장 집 문구·값", () => {
  it("11/26 빈 터엔 분양 팻말이 없다 (카라반·펜션·촌캉스 모두 — 분양은 NPC에게만), 빈 카라반 자리는 둘레 줄만", () => {
    for (const l of CAMP_LOTS)
      for (const xmas of [false, true]) {
        const plan = campHomePlan(l, { owned: false, yard: 1, wide: false, snowy: xmas, xmas, night: false });
        expect(plan.props.filter((p) => /post-(p|r)?sale/.test(p.key)), `${l.lot}번`).toHaveLength(0);
        if (l.kind === "caravan") {
          expect(plan.props.filter((p) => /plotRope/.test(p.key)), `${l.lot}번`).toHaveLength(1);
          // 옛 팻말 막는 상자도 없다 (빈 자리 가운데를 지나다닐 수 있다)
          expect(plan.furniture, `${l.lot}번`).toEqual([]);
        }
      }
  });

  it("11/26 빈 터 E: 세 종류 모두 「분양 안내」 → 그 종류 분양 NPC 안내 토스트만 (분양 창은 NPC에게서만)", () => {
    for (const l of CAMP_LOTS) expect(emptyDoorAction(l), `${l.lot}번`).toEqual({ label: "분양 안내", toast: campSaleHint(l.kind) });
    expect(campSaleHint("caravan")).toBe("카라반 분양은 언젠가 씨에게 물어보세요.");
    expect(campSaleHint("pension")).toBe("펜션 분양은 소슬댁에게 물어보세요.");
    expect(campSaleHint("rural")).toBe("촌캉스 분양은 순이 할머니에게 물어보세요.");
    expect(CAMP_SALE_NPC).toEqual({ caravan: "keeper", pension: "sosul", rural: "suni" });
    expect(["keeper", "sosul", "suni", "clerk", "granny", "guitarist"].map((id) => campSaleKindOf(id as never))).toEqual(["caravan", "pension", "rural", null, null, null]);
  });

  it("빈 터 팻말과 문패 머리", () => {
    expect(saleLabel(CAMP_LOTS[0])).toBe("분양 중 · 폭포 앞 자리");
    expect(saleLabel(CAMP_LOTS.find((l) => l.lot === 2)!)).toBe("분양 중 · 강가 자리");
    expect(saleLabel(CAMP_LOTS.find((l) => l.lot === 8)!)).toBe("분양 중 · 숲 쪽 자리");
    expect(saleLabel(CAMP_LOTS.find((l) => l.lot === 13)!)).toBe("분양 중 · 솔바람채");
    expect(plateHead(CAMP_LOTS[2], "콩이네")).toBe("3번 · ");
    expect(
      plateHead(
        CAMP_LOTS.find((l) => l.lot === 15)!,
        "싸리울집",
      ),
    ).toBe("");
    expect(
      plateHead(
        CAMP_LOTS.find((l) => l.lot === 15)!,
        "우리 별장",
      ),
    ).toBe("싸리울집 · ");
  });

  it("값: 서버 prices가 없으면 규칙대로 (11/26 포구 오두막과 같은 9,000 · 13,500 · 22,500, 카라반 강가 ×1.25 · 폭포 앞 ×1.5, 별장 4/3)", () => {
    const p = campPrices(undefined, false);
    expect(p.lots[1]).toBe(13_500);
    expect(p.lots[2]).toBe(11_250);
    expect(p.lots[8]).toBe(9_000);
    expect(p.lots[13]).toBe(9_000);
    expect(p.lots[15]).toBe(9_000);
    expect(p.yard[1]).toEqual({ 2: 20_250, 3: 33_750 });
    expect(p.yard[2]).toEqual({ 2: 16_880, 3: 28_130 });
    expect(p.yard[13]).toEqual({ 2: 13_500, 3: 22_500 });
    const v = campPrices(undefined, true);
    expect(v.villa).toBe(true);
    expect(v.lots[1]).toBe(18_000);
    expect(v.lots[15]).toBe(12_000);
    // 앞마당도 별장 값
    expect(v.yard[1]).toEqual({ 2: 27_000, 3: 45_000 });
    expect(v.yard[2]).toEqual({ 2: 22_510, 3: 37_510 });
    expect(villaPrice(9_000)).toBe(12_000);
  });

  it("값: 서버가 준 값은 그대로 (배열·맵 모양 모두)", () => {
    expect(campPrices({ villa: true, lots: [{ lot: 3, price: 12_345 }] }, false).lots[3]).toBe(12_345);
    expect(campPrices({ lots: { 13: 9_999 }, yard: { 13: { 2: 1, 3: 2 } } }, false).yard[13]).toEqual({ 2: 1, 3: 2 });
    expect(campPrices({ lots: { 13: 9_999 } }, false).lots[13]).toBe(9_999);
  });

  it("집 정보가 camp를 안 주면 터 번호로 종류, 앞마당 1단계", () => {
    expect(campOf({ lot: 14 })).toEqual({ kind: "pension", yard: 1 });
    // 11/26 카라반은 디자인도 (안 주면 그 자리 기본 모습 — 5번 강가 = 티어드롭 5 % 4 색 · 5 % 4 차양)
    expect(campOf({ lot: 5, camp: { kind: "caravan", yard: 3 } })).toEqual({ kind: "caravan", yard: 3, design: { model: "teardrop", color: 1, awning: 1 } });
  });
});

describe("11/26 원두막은 앞 사다리로만 (싸리울집 3단계)", () => {
  // 11/26 두 집 자리 맞바꿈: 싸리울집은 왼쪽 15번 터
  const lot = CAMP_LOTS.find((l) => l.lot === 15)!;
  const none = new Map<string, number>();
  it("사다리 하나 · 방석 넷, 방석에서 일어서면 사다리 밑 (막는 상자 밖)", () => {
    expect(CAMP_LADDERS).toHaveLength(1);
    const lad = CAMP_LADDERS[0];
    expect(lad.lot).toBe(15);
    expect(lad.seats).toHaveLength(4);
    const p = campHomePlan(lot, { owned: true, yard: 3, wide: false, snowy: false, xmas: false, night: false });
    const boxes = [...p.solid, ...p.furniture];
    for (const id of lad.seats) {
      const s = CAMP_HOME_SEATS.find((q) => q.id === id)!;
      expect(s.minYard).toBe(3);
      expect({ x: s.x + (s.standDx ?? 0), y: s.y + (s.standDy ?? 9) }).toEqual({ x: lad.x, y: lad.y });
    }
    const body = { x: lad.x - 4, y: lad.y - 5, w: 8, h: 5 };
    for (const b of boxes) expect(body.x < b.x + b.w && b.x < body.x + body.w && body.y < b.y + b.h && b.y < body.y + body.h, JSON.stringify(b)).toBe(false);
  });
  it("사다리 밑에서만 오른다 — 옆·뒤·앞 멀리서는 원두막 방석을 안 고른다", () => {
    const lad = CAMP_LADDERS[0];
    const open = () => true;
    expect(campLadderSeat(lad.x, lad.y, none, null, open)?.id).toMatch(/^qH15_/);
    expect(lad.seats).toContain(campLadderSeat(lad.x + 3, lad.y + 4, none, null, open)!.id);
    // 다 차 있으면 못 오른다 · 닫힌(3단계 아닌) 집이면 못 오른다
    const full = new Map(lad.seats.map((id, i) => [id, i + 10]));
    expect(campLadderSeat(lad.x, lad.y, full, null, open)).toBeNull();
    expect(campLadderSeat(lad.x, lad.y, none, null, () => false)).toBeNull();
    const seats = lad.seats.map((id) => CAMP_HOME_SEATS.find((q) => q.id === id)!);
    const cx = seats.reduce((a, s) => a + s.x, 0) / 4;
    const sy = seats[0].y;
    // 원두막 왼쪽·오른쪽 옆, 뒤(위), 사다리에서 옆으로 비켜선 앞
    for (const [x, y] of [
      [cx - 30, sy],
      [cx + 30, sy],
      [cx, sy - 14],
      [lad.x + 14, lad.y],
      [lad.x - 14, lad.y],
    ]) {
      expect(campLadderSeat(x, y, none, null, open), `${x},${y}`).toBeNull();
      const picked = campPickSeat(x, y, none, null, undefined, (id) => !isCampLadderSeat(id));
      expect(picked && isCampLadderSeat(picked.id), `${x},${y}`).toBeFalsy();
    }
  });
});
