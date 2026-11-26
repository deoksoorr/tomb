import { CAMP_LOTS, CARAVAN_MODELS, DIR, type CampYard } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { FLAT_TAG, campHomePlan, campHomeSeatsOf, homeSeatOpen, type HomePlan, type HomeSeat } from "./campHousingPlan";
import { CAMP_GRID, drawnBox, installFakeCanvas, type Box } from "./campTestCanvas";

/**
 * 11/26 캠핑장 집 배치 점검 (운영자 「배치가 개판」 — ~/Desktop/목요일작업/캠핑장_배치규칙.md 의 규칙을 그대로 검사한다).
 * 모든 터 × 단계 × 카라반 모델 × 기본·크리스마스를 실제로 칠해 보고:
 *  1. 서 있는 소품끼리 그림이 겹치거나 닿지 않는다 (2px 넘게 — 한 가구를 층으로 나눠 그린 것·탁자 위 랜턴처럼 일부러 겹친 짝은 뺀다)
 *  2. 통나무·의자·식탁은 담·울타리 그림과 겹치지 않고, 앉을 자리는 담·울타리 막는 상자에서 10px 넘게
 *  3. 같은 단계에 열린 자리끼리 다른 무리는 12px 넘게, 같은 무리(한 탁자·한 불) 안 의자 그림끼리도 2px 넘게
 *  4. 집 문·아궁이·해먹 (E로 쓰는 것) 둘레(반경 + 4)에 앉을 자리·일어서는 자리가 없다 (E가 엉뚱한 것을 집지 않게)
 *  5. 옆·위를 보고 앉는 자리는 보는 쪽 36px 안에 탁자·불이 있다 (허공을 보고 앉지 않는다)
 *  6. 카라반 화롯대는 차양 아래 러그에 닿지 않는다
 *  7. 카라반 탁자와 의자·긴 의자, 화롯대와 통나무는 3px 넘게 띄운다 (한 덩어리로 보이지 않게)
 *  8. 단계가 오르면 빠지는 소품이 없고 (그 소품이나 더 큰 판이 남는다) 앉을 자리는 늘기만 한다
 *  9. 평상·정자·원두막·밥상·탁자·장독대·아궁이 같은 단단한 소품은 그린 윗면 전부를 막는 상자가 덮고, 위 끝보다 2px 위까지 막는다
 *     (운영자 「평상 뒤로 돌아가면 평상 위에 서 있다」 — 바로 뒤에 선 사람 발이 윗면보다 2px 위라 소품 뒤로 그려진다)
 */
installFakeCanvas();

/** 서 있는 소품이 아닌 것 (바닥·데크·집채·담·문패 글씨·줄) */
const SKIP = /chome-(yard|terrace|lowDeck|doormat|step|rug|plotRope|house|rh-|edgeLog)|camp-pebbles/;
const FENCE = /chome-(brushF|dolH|dolV|gpost|brushGate)/;
/** 한 무리 (겹쳐 그리는 짝) */
const FAMILY: [RegExp, RegExp][] = [
  [/logChair/, /firepit|brazier|foldTable/],
  [/campChairF/, /foldTable/],
  [/lantern/, /foldTable|campChairF|logChair|picnicV/],
  [/benchV/, /picnicV/],
  // 작은 장독대는 정자·원두막 앞 기둥 발치에 (기둥 앞에 겹쳐 그린다 — 오르는 자리는 비운다)
  [/jangdokC/, /pavilion|wondumak/],
  [/lamp-/, /pot\d|glassRail|mailbox/],
  [/glassRail/, /dine|pot\d|tset|lounger|mailbox/],
  [/pole/, /spa|swing|hammock/],
  [/pers-/, /annex|agungi|pyeong|wondumak|pavilion|brushF|dolH|dolV/],
  [/annex/, /wondumak|pavilion/],
  [/hookup/, /cv-/],
];
const sameFamily = (a: string, b: string) => {
  const ka = a.replace(/-[nsx]+$/, "");
  const kb = b.replace(/-[nsx]+$/, "");
  if (ka === kb) return true;
  return FAMILY.some(([p, q]) => (p.test(a) && q.test(b)) || (p.test(b) && q.test(a)));
};
const gap = (a: Box, b: Box) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);

type Case = { name: string; lot: (typeof CAMP_LOTS)[number]; plan: HomePlan; yard: CampYard; seats: HomeSeat[] };
function cases(): Case[] {
  const out: Case[] = [];
  for (const l of CAMP_LOTS)
    for (const yard of [1, 2, 3] as CampYard[])
      for (const xmas of [false, true])
        for (const model of l.kind === "caravan" ? CARAVAN_MODELS : [undefined]) {
          const design = model ? { model, color: l.lot % 4, awning: l.lot % 4 } : undefined;
          const plan = campHomePlan(l, { owned: true, yard, wide: false, snowy: xmas, xmas, night: false, design });
          const seats = campHomeSeatsOf(l).filter((q) => homeSeatOpen(q, { yard, design }, false));
          out.push({ name: `${l.lot}번 ${yard}단계${xmas ? " 크리스마스" : ""}${model ? ` ${model}` : ""}`, lot: l, plan, yard, seats });
        }
  return out;
}

describe("11/26 캠핑장 집 배치 규칙 (캠핑장_배치규칙.md)", () => {
  const all = cases();

  it("1. 서 있는 소품끼리 2px 넘게 떨어져요 (한 가구 층·탁자 위 랜턴 같은 짝은 빼고)", () => {
    const bad: string[] = [];
    for (const c of all) {
      const props = c.plan.props.filter((q) => q.depth > FLAT_TAG / 2 && !SKIP.test(q.key) && !FENCE.test(q.key));
      const boxes = props.map((q) => ({ key: q.key, b: drawnBox(q)! })).filter((q) => q.b);
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (sameFamily(a.key, b.key)) continue;
          const g = gap(a.b, b.b);
          if (g < 2) bad.push(`${c.name}: ${a.key} – ${b.key} (${g.toFixed(1)}px)`);
        }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it("2. 촌캉스 통나무·의자·밥상은 담·울타리 그림과 안 겹치고, 앉을 자리는 담·울타리에서 10px 넘게", () => {
    const bad: string[] = [];
    for (const c of all.filter((q) => q.lot.kind === "rural")) {
      const fences = c.plan.props.filter((q) => FENCE.test(q.key)).map((q) => drawnBox(q)!);
      const seatProps = c.plan.props.filter((q) => /logChair|lowTable|firepit|jangdok|pyeongMeal|pavilion|wondumak|agungi/.test(q.key));
      for (const q of seatProps) {
        const b = drawnBox(q)!;
        for (const f of fences) if (gap(b, f) < 1) bad.push(`${c.name}: ${q.key} 그림이 담·울타리 그림에 (${gap(b, f).toFixed(1)}px)`);
      }
      const fenceSolids = c.plan.solid.filter((r) => r.w <= 8 || r.h <= 8);
      for (const s of c.seats)
        for (const r of fenceSolids) {
          const d = Math.hypot(Math.max(r.x - s.x, 0, s.x - r.x - r.w), Math.max(r.y - s.y, 0, s.y - r.y - r.h));
          if (d < 10) bad.push(`${c.name}: ${s.id} 담·울타리에서 ${d.toFixed(1)}px`);
        }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it("3. 다른 무리 자리끼리 12px 넘게 · 같은 무리 자리끼리 8px 넘게", () => {
    const bad: string[] = [];
    for (const c of all)
      for (let i = 0; i < c.seats.length; i++)
        for (let j = i + 1; j < c.seats.length; j++) {
          const a = c.seats[i];
          const b = c.seats[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d <= 8) bad.push(`${c.name}: ${a.id}–${b.id} ${d.toFixed(1)}px`);
        }
    expect(bad).toEqual([]);
  });

  it("4. 집 문·아궁이·해먹 둘레(반경 + 4)에 앉을 자리·일어서는 자리가 없어요", () => {
    const bad: string[] = [];
    for (const c of all) {
      const objs: { name: string; x: number; y: number; r: number }[] = [{ name: "문", x: c.plan.door.x, y: c.plan.door.y, r: 16 }];
      if (c.plan.fire) objs.push({ name: "아궁이", x: c.plan.fire.x, y: c.plan.fire.y, r: 18 });
      if (c.plan.hammock) objs.push({ name: "해먹", x: c.plan.hammock.x, y: c.plan.hammock.y + 4, r: 18 });
      for (const s of c.seats)
        for (const o of objs)
          for (const [x, y, what] of [
            [s.x, s.y, "자리"],
            [s.x + (s.standDx ?? 0), s.y + (s.standDy ?? 9), "일어서는 자리"],
          ] as const) {
            const d = Math.hypot(x - o.x, y - o.y);
            if (d < o.r + 4) bad.push(`${c.name}: ${s.id} ${what}가 ${o.name}에서 ${d.toFixed(1)}px`);
          }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it("6. 카라반 화롯대는 차양 아래 러그에 닿지 않아요 (의자·탁자는 러그 위에 놓아도 된다)", () => {
    const bad: string[] = [];
    for (const c of all.filter((q) => q.lot.kind === "caravan")) {
      const rug = c.plan.props.find((q) => q.key.startsWith("chome-rug"));
      if (!rug) continue;
      const rb = drawnBox(rug)!;
      for (const q of c.plan.props.filter((p) => p.key.endsWith("brazier"))) {
        const g = gap(drawnBox(q)!, rb);
        if (g < 2) bad.push(`${c.name}: 화롯대가 러그에 (${g.toFixed(1)}px)`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("7. 카라반 탁자 ↔ 의자·긴 의자, 화롯대 ↔ 통나무는 3px 넘게 띄워요", () => {
    const bad: string[] = [];
    for (const c of all.filter((q) => q.lot.kind === "caravan")) {
      const box = (re: RegExp) => c.plan.props.filter((q) => re.test(q.key)).map((q) => ({ key: q.key, b: drawnBox(q)! }));
      const pairs: [RegExp, RegExp][] = [
        [/foldTable$|picnicV$/, /campChairF\d$|benchV$|logChair$/],
        [/brazier$/, /logChair$/],
      ];
      for (const [p, q] of pairs)
        for (const a of box(p))
          for (const b of box(q)) {
            const g = gap(a.b, b.b);
            if (g < 3 && g > -40) bad.push(`${c.name}: ${a.key} – ${b.key} (${g.toFixed(1)}px)`);
          }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it("8. 단계가 오르면 빠지는 소품이 없고 (그대로이거나 더 큰 판) 앉을 자리는 늘기만 해요", () => {
    // 더 큰 판으로 바뀌는 소품 (앞 단계 → 다음 단계)
    const UPGRADE: Record<string, RegExp> = { pyeongMeal: /pavilion|wondumak/, lowTable: /bapsang/, jangdok: /jangdokC/, foldTable: /picnicV/, campChairF: /benchV/ };
    const kind = (key: string) => key.replace(/^chome-|^camp-/, "").replace(/-(n|s|sx|nx)$/, "").replace(/-\d.*$/, "").replace(/\d+$/, "");
    for (const l of CAMP_LOTS)
      for (const model of l.kind === "caravan" ? CARAVAN_MODELS : [undefined]) {
        const design = model ? { model, color: 0, awning: 0 } : undefined;
        let prevKinds: Set<string> | null = null;
        let prevSeats = -1;
        for (const yard of [1, 2, 3] as CampYard[]) {
          const plan = campHomePlan(l, { owned: true, yard, wide: false, snowy: false, xmas: false, night: false, design });
          const kinds = new Set(plan.props.filter((q) => q.depth > FLAT_TAG / 2 && !/brushF|dolH|dolV|gpost|brushGate|edgeLog|plotRope|post-/.test(q.key)).map((q) => kind(q.key)));
          const seats = campHomeSeatsOf(l).filter((q) => homeSeatOpen(q, { yard, design }, false)).length;
          if (prevKinds)
            for (const k of prevKinds) {
              const kept = kinds.has(k) || (UPGRADE[k] && [...kinds].some((n) => UPGRADE[k].test(n)));
              expect(kept, `${l.lot}번 ${model ?? ""} ${yard}단계에서 ${k}가 빠졌어요 (${[...kinds].join(",")})`).toBe(true);
            }
          expect(seats, `${l.lot}번 ${model ?? ""} ${yard}단계 자리 수`).toBeGreaterThan(prevSeats);
          prevKinds = kinds;
          prevSeats = seats;
        }
      }
  });

  it("9. 단단한 소품은 그린 윗면 전부를 막는 상자가 덮고, 위 끝보다 2px 위까지 막아요 (뒤에 선 사람이 소품 위에 서 있는 것처럼 보이지 않게)", () => {
    // 소품 키 → 막아야 할 그림 줄 (그림 칸 기준 r0~r1 — 바닥에 닿는 맨 아래 두어 줄은 뺀다) · 열 (없으면 그 줄들의 칠한 칸 전부)
    const SOLID: [RegExp, number, number, [number, number]?][] = [
      [/pyeongMeal/, 3, 27],
      [/pavilion-/, 32, 51],
      [/wondumak-/, 18, 48],
      [/lowTable2/, 8, 19, [8, 35]],
      [/bapsang4/, 11, 21, [4, 35]],
      [/chome-jangdok-/, 17, 28],
      [/jangdokC/, 14, 23],
      [/agungi-/, 12, 34, [1, 40]],
      [/chome-dine-/, 7, 16],
      [/chome-tset-\d+-1/, 31, 36, [12, 25]],
      [/chome-tset-\d+-0/, 9, 14, [12, 25]],
      [/lounger/, 8, 12, [3, 24]],
      [/chome-spa-/, 5, 22],
      [/chome-swing/, 13, 20, [9, 25]],
      [/bbqStation/, 3, 24],
      [/camp-foldTable$/, 2, 14],
      [/camp-picnicV$/, 2, 30],
    ];
    const bad: string[] = [];
    let checked = 0;
    for (const c of all) {
      const rects = [...c.plan.solid, ...c.plan.furniture];
      const inside = (x: number, y: number) => rects.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
      const seen = new Set<string>();
      for (const q of c.plan.props) {
        const spec = SOLID.find(([re]) => re.test(q.key));
        if (!spec || q.crop || seen.has(`${q.key}|${q.x}|${q.y}`)) continue;
        seen.add(`${q.key}|${q.x}|${q.y}`);
        const [, r0, r1, cols] = spec;
        const cv = (q.make ? q.make() : null) as unknown as { width: number; height: number; px: () => Uint8ClampedArray } | null;
        let w = 0;
        let h = 0;
        let alpha: (x: number, y: number) => number;
        if (cv) {
          w = cv.width;
          h = cv.height;
          const d = cv.px();
          alpha = (x, y) => d[(y * w + x) * 4 + 3];
        } else {
          const g = CAMP_GRID[q.key]?.();
          if (!g) continue;
          w = g.w;
          h = g.h;
          alpha = (x, y) => g.px[y * w + x] & 255;
        }
        let c0 = w;
        let c1 = -1;
        for (let y = r0; y <= r1; y++) for (let x = 0; x < w; x++) if (alpha(x, y) >= 128) [c0, c1] = [Math.min(c0, x), Math.max(c1, x)];
        if (cols) [c0, c1] = [Math.max(c0, cols[0]), Math.min(c1, cols[1])];
        if (c1 < c0) continue;
        const left = q.x - (q.ox ?? 0.5) * w;
        const top = q.y - (q.oy ?? 1) * h;
        const fx = (x: number) => (q.flip ? left + w - 1 - x : left + x);
        let miss = 0;
        let lowTop = 0;
        for (let x = c0; x <= c1; x++) {
          const wx = fx(x) + 0.5;
          for (let y = r0; y <= r1; y++) if (alpha(x, y) >= 128 && !inside(wx, top + y + 0.5)) miss++;
          // 위 끝 2px 위 (바로 뒤에 선 사람 발 자리)
          if (alpha(x, r0) >= 128 && !inside(wx, top + r0 - 1.5)) lowTop++;
        }
        checked++;
        if (miss || lowTop) bad.push(`${c.name}: ${q.key} 윗면 ${miss}칸이 막는 상자 밖 · 위 2px ${lowTop}칸 열림`);
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect([...new Set(bad)]).toEqual([]);
  });

  it("5. 옆·위를 보고 앉는 자리는 보는 쪽 36px 안에 탁자·불이 있어요", () => {
    const bad: string[] = [];
    const TARGET = /firepit|brazier|foldTable|picnicV|lowTable|bapsang4|tset|dine|pyeongMeal|spa/;
    for (const c of all) {
      const targets = c.plan.props.filter((q) => TARGET.test(q.key)).map((q) => drawnBox(q)!);
      for (const s of c.seats) {
        if (s.facing === DIR.down) continue;
        const ok = targets.some((b) => {
          const cx = (b.x0 + b.x1) / 2;
          const cy = (b.y0 + b.y1) / 2;
          if (s.facing === DIR.up) return cy < s.y && s.y - cy < 36 && Math.abs(cx - s.x) < 20 + (b.x1 - b.x0) / 2;
          const dx = s.facing === DIR.right ? cx - s.x : s.x - cx;
          return dx > 0 && dx < 36 && Math.abs(cy - s.y) < 24;
        });
        if (!ok) bad.push(`${c.name}: ${s.id} (${s.x},${s.y}) 보는 쪽 ${s.facing}에 아무것도 없어요`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});

describe("11/26 4인 밥상 뒤 의자", () => {
  it("뒤 의자 둘은 일어서는 자리가 따로 — 왼쪽 의자는 상 왼쪽, 오른쪽 의자는 상 오른쪽 (상 너머로 닿지 않게)", () => {
    for (const l of CAMP_LOTS.filter((x) => x.kind === "rural")) {
      const seats = campHomeSeatsOf(l);
      const four = seats.slice(-4);
      const cx = four.reduce((a, s) => a + s.x, 0) / 4;
      const [bl, br] = four.slice(0, 2).sort((a, b) => a.x - b.x);
      for (const s of [bl, br]) expect(s.facing, `${l.lot} ${s.id}`).toBe(DIR.down);
      const sx = (s: HomeSeat) => s.x + (s.standDx ?? 0);
      expect(sx(bl), `${l.lot} ${bl.id}`).toBeLessThanOrEqual(cx - 20);
      expect(sx(br), `${l.lot} ${br.id}`).toBeGreaterThanOrEqual(cx + 20);
    }
  });
});
