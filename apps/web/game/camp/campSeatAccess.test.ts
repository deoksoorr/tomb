import { CAMP_LOTS, CAMP_SEATS, type CampYard, type Seat } from "@tomb/protocol";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { installFakeCanvas } from "./campTestCanvas";
import { campHomePlan, campHomeSeatsOf, homeSeatOpen, type PlanRect } from "./campHousingPlan";
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

describe("11/26 원두막·평상·정자는 정해진 쪽에서만 앉아요", () => {
  it("오르는 자리: 원두막 1 (싸리울집) · 평상 2 · 정자 1 (감나무집) — 방석 넷씩", () => {
    expect(CAMP_SEAT_ZONES.map((z) => `${z.lot}:${z.kind}:${z.seats.length}`).sort()).toEqual(["15:ladder:4", "15:pyeong:4", "16:pavilion:4", "16:pyeong:4"]);
  });

  for (const z of CAMP_SEAT_ZONES) {
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
        // 원두막 바로 밑(마루 아래)·뒤 기둥 사이에서도 안 된다
        for (const [x, y] of [
          [cx, box.y - 20],
          [cx, box.y - 30],
          [box.x + 4, box.y - 10],
          [box.x + box.w - 4, box.y - 10],
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
      expect(tried).toBeGreaterThan(70);
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
            expect(campZonesAt(x, y).includes(z), `${yd}단계 ${q.id} (${x},${y})`).toBe(false);
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
