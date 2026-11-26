import { CAMP_LOTS, CAMP_SEATS, type CampYard, type Seat } from "@tomb/protocol";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { installFakeCanvas } from "./campTestCanvas";
import { campHomePlan, campHomeSeatsOf, homeSeatOpen, type CampSeatZone, type PlanRect } from "./campHousingPlan";
import { CAMP_SEAT_ZONES, campPickSeat, campZoneSeat, campZonesAt, isCampZoneSeat } from "./campSit";

/**
 * 11/26 운영자 「원두막을 뒤에서 접근했더니 바로 걸터앉을 수 있어」·「평상을 뒤에서 들어갔더니 바로 위로 올라가져」:
 * 높은·큰 자리(원두막 · 평상 · 정자)는 정해진 쪽에서만 앉는다 — 자리마다 8방향(뒤·옆·아래·대각선)에서 다가가 E를 눌러 본다.
 * 고르는 법은 CampScene.pickSeat와 같다: 오르는 자리 안이면 그 가구 방석(campZoneSeat), 아니면 가까운 자리 중 오르는 자리 방석은 뺀다.
 */
installFakeCanvas();
const none = new Map<string, number>();

function plan(lot: (typeof CAMP_LOTS)[number], yard: CampYard) {
  return campHomePlan(lot, { owned: true, yard, wide: false, snowy: false, xmas: false, night: false });
}
/** CampScene.pickSeat와 같은 순서 (그 단계 집이 있는 터 — open) */
function pick(x: number, y: number, yard: CampYard): Seat | null {
  const open = (id: string) => {
    if (!id.startsWith("qH")) return true;
    const s = campHomeSeatsOf(CAMP_LOTS.find((l) => id.startsWith(`qH${l.lot}_`))!).find((q) => q.id === id);
    return s ? homeSeatOpen(s, { yard }, false) : !id.startsWith("qH");
  };
  return campZoneSeat(x, y, none, null, open) ?? campPickSeat(x, y, none, null, undefined, (id) => !isCampZoneSeat(id) && open(id));
}
const inRect = (r: PlanRect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const bodyHits = (r: PlanRect, x: number, y: number) => x - 4 < r.x + r.w && r.x < x + 4 && y - 5 < r.y + r.h && r.y < y;

/** 가구 하나 (터 · 종류)의 오르는 자리를 합친 것 — 11/26 평상은 위·앞·왼쪽·오른쪽 오르는 자리마다 그쪽 방석만 (zone 넷) */
type SeatGroup = { lot: number; kind: CampSeatZone["kind"]; seats: string[]; rects: PlanRect[]; zones: CampSeatZone[] };
const GROUPS: SeatGroup[] = [];
for (const z of CAMP_SEAT_ZONES) {
  let g = GROUPS.find((q) => q.lot === z.lot && q.kind === z.kind);
  if (!g) GROUPS.push((g = { lot: z.lot, kind: z.kind, seats: [], rects: [], zones: [] }));
  for (const id of z.seats) if (!g.seats.includes(id)) g.seats.push(id);
  g.rects.push(...z.rects);
  g.zones.push(z);
}

describe("11/26 원두막·평상·정자는 정해진 쪽에서만 앉아요", () => {
  it("오르는 자리: 원두막 1 (싸리울집) · 평상 2 · 정자 1 (감나무집) — 방석 넷씩", () => {
    expect(GROUPS.map((z) => `${z.lot}:${z.kind}:${z.seats.length}`).sort()).toEqual(["15:ladder:4", "15:pyeong:4", "16:pavilion:4", "16:pyeong:4"]);
    // 평상은 위·앞·왼쪽·오른쪽 넷 (방석 둘씩)
    expect(CAMP_SEAT_ZONES.filter((z) => z.kind === "pyeong").map((z) => `${z.lot}:${z.seats.length}`)).toEqual(["15:2", "15:2", "15:2", "15:2", "16:2", "16:2", "16:2", "16:2"]);
  });

  for (const z of GROUPS) {
    const lot = CAMP_LOTS.find((l) => l.lot === z.lot)!;
    const yard: CampYard = z.kind === "pyeong" ? 1 : 3;
    const seats = z.seats.map((id) => CAMP_SEATS.find((s) => s.id === id)!);
    // 가구 막는 상자 (평상·정자 마루 · 원두막 밑동) — 다가가는 방향은 이 상자 둘레 바깥 8곳 (6px · 14px 떨어진 곳)
    const p = plan(lot, yard);
    const cx = seats.reduce((a, s) => a + s.x, 0) / seats.length;
    const box = p.furniture.filter((r) => inRect({ x: r.x - 2, y: r.y - 30, w: r.w + 4, h: r.h + 34 }, cx, r.y)).reduce((a, r) => (r.w > a.w ? r : a), { x: cx, y: 0, w: 0, h: 0 });
    for (const yd of z.kind === "pyeong" ? ([1, 2] as CampYard[]) : ([3] as CampYard[]))
      it(`${z.lot}번 ${z.kind} ${yd}단계: 뒤·옆·대각선·밑에서는 아무 일도 없고, 오르는 자리에서만 앉아요`, () => {
        const dirs: [string, number, number][] = [
          ["뒤", 0, -1],
          ["뒤 오른쪽", 1, -1],
          ["오른쪽", 1, 0],
          ["앞 오른쪽", 1, 1],
          ["앞", 0, 1],
          ["앞 왼쪽", -1, 1],
          ["왼쪽", -1, 0],
          ["뒤 왼쪽", -1, -1],
        ];
        let sat = 0;
        for (const [name, dx, dy] of dirs)
          for (const gap of [6, 14]) {
            const x = dx === 0 ? cx : dx > 0 ? box.x + box.w + gap : box.x - gap;
            const y = dy === 0 ? box.y + box.h / 2 : dy > 0 ? box.y + box.h + gap : box.y - gap;
            const inZone = z.rects.some((r) => inRect(r, x, y));
            const got = pick(x, y, yd);
            const mine = !!got && z.seats.includes(got.id);
            expect(mine, `${name} ${gap}px (${x},${y}) — 오르는 자리 ${inZone ? "안" : "밖"}`).toBe(inZone);
            if (inZone) sat++;
          }
        // 원두막은 앞 사다리(앞 가운데보다 왼쪽)라 8방향 점에 안 걸릴 수 있다 — 사다리 밑에서 따로 본다
        if (z.kind !== "ladder") expect(sat, "앞에서는 앉아요").toBeGreaterThan(0);
        // 원두막 바로 밑(마루 아래)·뒤 기둥 사이에서도 안 된다 (평상은 뒤 12px까지가 윗방석 오르는 자리 — 그 너머만)
        for (const [x, y] of [
          [cx, box.y - 20],
          [cx, box.y - 30],
          ...(z.kind === "pyeong"
            ? []
            : [
                [box.x + 4, box.y - 10],
                [box.x + box.w - 4, box.y - 10],
              ]),
        ])
          expect(z.seats.includes(pick(x, y, yd)?.id ?? ""), `마루 밑·뒤 ${x},${y}`).toBe(false);
        // 오르는 자리 안 어디서든 그 가구 방석을 고른다
        for (const r of z.rects)
          for (const [x, y] of [
            [r.x + 1, r.y + 1],
            [r.x + r.w / 2, r.y + r.h / 2],
            [r.x + r.w - 1, r.y + r.h - 1],
          ])
            expect(z.seats.includes(pick(x, y, yd)?.id ?? ""), `오르는 자리 ${x},${y}`).toBe(true);
      });

    it(`${z.lot}번 ${z.kind}: 방석마다 8방향 (8·16·24px)에서 — 오르는 자리 밖이면 그 가구 방석을 안 골라요`, () => {
      const yd: CampYard = z.kind === "pyeong" ? 2 : 3;
      let tried = 0;
      for (const s of seats)
        for (let k = 0; k < 8; k++)
          for (const d of [8, 16, 24]) {
            const a = (k / 8) * Math.PI * 2;
            const x = Math.round(s.x + Math.cos(a) * d);
            const y = Math.round(s.y + Math.sin(a) * d);
            if (z.rects.some((r) => inRect(r, x, y))) continue;
            tried++;
            expect(z.seats.includes(pick(x, y, yd)?.id ?? ""), `${s.id} ${k * 45}° ${d}px (${x},${y})`).toBe(false);
          }
      // 평상은 네 쪽이 다 오르는 자리라 그 밖의 점이 적다
      expect(tried).toBeGreaterThan(z.kind === "pyeong" ? 50 : 70);
    });

    it(`${z.lot}번 ${z.kind}: 방석에서 일어서는 자리는 오르는 자리 안이고 막는 상자 밖이에요`, () => {
      const boxes = [...p.solid, ...p.furniture];
      for (const s of campHomeSeatsOf(lot).filter((q) => z.seats.includes(q.id))) {
        const sx = s.x + (s.standDx ?? 0);
        const sy = s.y + (s.standDy ?? 9);
        expect(z.rects.some((r) => inRect(r, sx, sy)), `${s.id} 일어서는 자리 ${sx},${sy}`).toBe(true);
        for (const b of boxes) expect(bodyHits(b, sx, sy), `${s.id} 일어서는 자리가 ${JSON.stringify(b)}에`).toBe(false);
      }
    });

    it(`${z.lot}번 ${z.kind}: 오르는 자리 안에는 다른 자리·일어서는 자리가 없어요 (원두막 사다리는 다른 자리와 48px 넘게)`, () => {
      const yards = z.kind === "pyeong" ? ([1, 2] as CampYard[]) : ([3] as CampYard[]);
      for (const yd of yards) {
        const others = campHomeSeatsOf(lot).filter((q) => !z.seats.includes(q.id) && homeSeatOpen(q, { yard: yd }, false));
        for (const q of others)
          for (const [x, y] of [
            [q.x, q.y],
            [q.x + (q.standDx ?? 0), q.y + (q.standDy ?? 9)],
          ]) {
            expect(campZonesAt(x, y).some((zz) => z.zones.includes(zz)), `${yd}단계 ${q.id} (${x},${y})`).toBe(false);
            const d = Math.min(...z.rects.map((r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h))));
            expect(d, `${yd}단계 ${q.id}와 ${z.kind} 오르는 자리 거리`).toBeGreaterThanOrEqual(z.kind === "ladder" ? 48 : 12);
          }
      }
    });
  }
});

describe("11/26 원두막은 E로만 오른다", () => {
  it("장면에 위로 걸어 오르는 처리(stepLadderUp)가 없어요 — 사다리 밑 E(폰 [상호작용])로만", () => {
    const src = readFileSync(new URL("./CampScene.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/stepLadderUp|ladderHold/);
    // 사다리 밑 안내는 그대로
    expect(src).toContain("사다리로 올라가기");
  });
});

describe("11/26 평상은 다가간 쪽 방석에 앉아요 (운영자 「윗쪽에서 앉기 하면 윗방석에 앉게」)", () => {
  for (const lot of CAMP_LOTS.filter((l) => l.kind === "rural"))
    for (const yard of [1, 2] as CampYard[]) {
      const p = plan(lot, yard);
      const ids = CAMP_SEAT_ZONES.filter((z) => z.lot === lot.lot && z.kind === "pyeong").flatMap((z) => z.seats);
      // ruralSeats 순서: 왼쪽 아랫방석 · 오른쪽 아랫방석 · 왼쪽 윗방석 · 오른쪽 윗방석
      const [lo, ro, lu, ru] = campHomeSeatsOf(lot).filter((q) => ids.includes(q.id));
      const box = p.furniture.find((b) => [lo, ro, lu, ru].every((q) => q.x > b.x && q.x < b.x + b.w && q.y > b.y && q.y < b.y + b.h))!;
      const name = `${lot.lot}번 ${lot.name} ${yard}단계`;

      it(`${name}: 위에서는 윗방석, 앞에서는 아랫방석, 옆에서는 그쪽 방석`, () => {
        expect(box, "평상 막는 상자").toBeTruthy();
        expect(lu.y).toBeLessThan(lo.y);
        // 위 (평상 뒤 — 집과 평상 사이 틈): 윗방석 바로 위에서 그 방석, 가운데에서도 윗방석
        for (const q of [lu, ru]) for (const gap of [1, 3, 6]) expect(pick(q.x, box.y - gap, yard)?.id, `위 ${q.id} ${gap}px`).toBe(q.id);
        expect([lu.id, ru.id]).toContain(pick(box.x + box.w / 2, box.y - 2, yard)?.id);
        // 앞: 아랫방석 (양옆 방석 바로 아래 · 가운데 · 앞 모서리)
        for (const q of [lo, ro]) for (const gap of [2, 6, 10]) expect(pick(q.x, box.y + box.h + gap, yard)?.id, `앞 ${q.id} ${gap}px`).toBe(q.id);
        expect([lo.id, ro.id]).toContain(pick(box.x + box.w / 2, box.y + box.h + 4, yard)?.id);
        expect(pick(box.x - 4, box.y + box.h + 4, yard)?.id, "앞 왼쪽 모서리").toBe(lo.id);
        expect(pick(box.x + box.w + 4, box.y + box.h + 4, yard)?.id, "앞 오른쪽 모서리").toBe(ro.id);
        // 옆: 그쪽 방석
        for (const gap of [2, 6, 10]) {
          expect(pick(box.x - gap, box.y + box.h / 2, yard)?.id, `왼쪽 ${gap}px`).toBe(lo.id);
          expect(pick(box.x + box.w + gap, box.y + box.h / 2, yard)?.id, `오른쪽 ${gap}px`).toBe(ro.id);
        }
      });

      it(`${name}: 윗방석에 누가 있으면 위에서 남은 윗방석 · 윗방석이 다 차면 위에서는 앉지 않아요 (평상 너머 아랫방석으로 건너뛰지 않게)`, () => {
        const occ = new Map<string, number>([[lu.id, 7]]);
        const open = (id: string) => !id.startsWith("qH") || homeSeatOpen(campHomeSeatsOf(lot).find((q) => q.id === id) ?? lu, { yard }, false);
        expect(campZoneSeat(lu.x, box.y - 2, occ, null, open)?.id).toBe(ru.id);
        occ.set(ru.id, 8);
        expect(campZoneSeat(lu.x, box.y - 2, occ, null, open)).toBeNull();
      });

      it(`${name}: 앉는 점은 방석 아래 테 바로 밑 — 앉은 몸(점 3px 위가 바닥)이 방석을 덮어요`, () => {
        // 그림 PYEONG 방석: 가운데 (s.x, s.y − 2) · 테 7줄 (가운데 ±3). 평상 그림 바닥 = pp.y + 2, 높이 32 (+ 위 빈 칸 2)
        const pp = { x: box.x + 26, y: box.y + 29 };
        for (const [q, art] of [
          [lo, { x: 9, y: 16 }],
          [ro, { x: 43, y: 16 }],
          [lu, { x: 19, y: 9 }],
          [ru, { x: 33, y: 9 }],
        ] as const) {
          const cushionBottom = pp.y + 2 - 32 + art.y - 2 + 3;
          expect(q.x, q.id).toBe(pp.x - 26 + art.x);
          expect(q.y - cushionBottom, `${q.id} 앉는 점 − 방석 아래 테`).toBe(1);
        }
      });

      it(`${name}: 위 오르는 자리(윗방석 일어서는 자리)까지 대문에서 걸어갈 수 있어요`, () => {
        // 몸 8×5 (Player BODY_W·BODY_H) 가 막는 상자에 안 닿는 1px 칸을 대문 밖에서부터 채워 본다
        const boxes = [...p.solid, ...p.furniture];
        const x0 = lot.x - 10;
        const y0 = lot.y - 10;
        const W = lot.w + 20;
        const H = lot.h + 30;
        const free = (x: number, y: number) => !boxes.some((b) => bodyHits(b, x, y));
        const seen = new Uint8Array(W * H);
        const q: number[] = [];
        const start = { x: Math.round(p.entry.x), y: Math.round(p.entry.y + 12) };
        expect(free(start.x, start.y), "대문 밖").toBe(true);
        seen[(start.y - y0) * W + (start.x - x0)] = 1;
        q.push(start.x, start.y);
        while (q.length) {
          const y = q.pop()!;
          const x = q.pop()!;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < x0 || ny < y0 || nx >= x0 + W || ny >= y0 + H) continue;
            const k = (ny - y0) * W + (nx - x0);
            if (seen[k] || !free(nx, ny)) continue;
            seen[k] = 1;
            q.push(nx, ny);
          }
        }
        const reach = (x: number, y: number) => seen[(Math.round(y) - y0) * W + (Math.round(x) - x0)] === 1;
        for (const s of [lo, ro, lu, ru]) {
          const sx = s.x + (s.standDx ?? 0);
          const sy = s.y + (s.standDy ?? 9);
          expect(reach(sx, sy), `${s.id} 일어서는 자리 ${sx},${sy}`).toBe(true);
        }
        // 윗방석 바로 위 (오르는 자리 안)
        for (const s of [lu, ru]) expect(reach(s.x, box.y - 1), `${s.id} 위 ${s.x},${box.y - 1}`).toBe(true);
      });
    }
});
