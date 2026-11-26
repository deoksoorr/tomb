import { CAMP_LOTS, CARAVAN_MODELS, type CampYard } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import * as P4 from "./campHomeArtPension";
import { LOWER_DECK_STAIR_W } from "./campHomeArtYard";
import { FLAT_TAG, HOME_PATH_HALF, campHomePlan, campHomeSeatsOf, homeSeatOpen, type HomePlan, type PlanRect } from "./campHousingPlan";
import { drawnBox, installFakeCanvas, type Box } from "./campTestCanvas";

/**
 * 11/26 운영자 「입구를 모닥불로 가리는 게 맞냐」 (싸리울집 3단계 — 대문 한가운데 화톳불·통나무, 대문 → 문 줄 위에 원두막).
 * 모든 캠핑장 집(카라반·펜션·촌캉스) × 단계 × 모양(넓힌 집·카라반 모델·겨울·크리스마스)마다 그림을 실제로 칠해 보고,
 * 길(대문·터 앞 끝, plan.entry) → 집 문(plan.door) 곧은 길 (폭 28px = 두 사람) 위에
 * 소품이 칠한 칸(투명 아닌 픽셀의 테두리 상자) · 막는 상자(solid·furniture) · 앉을 자리(몸 8×5)가 하나도 없는지 본다.
 * 밟고 지나가는 바닥(마당 흙·디딤돌·러그·자갈 — FLAT 깊이)과 데크 바닥(테라스·아래 단 데크)·발매트는 빼고, 대신 데크 계단 폭이 길을 다 품는지 본다.
 */

installFakeCanvas();

/** 밟고 지나가는 데크 바닥·문 앞 발매트 (데크 계단 폭은 따로 본다) */
const DECK = /chome-(terrace|lowDeck)-|chome-doormat$/;
const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const rectBox = (r: PlanRect): Box => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });

type Case = { name: string; lot: (typeof CAMP_LOTS)[number]; plan: HomePlan; yard: CampYard; owned: boolean; model?: (typeof CARAVAN_MODELS)[number] };
function cases(): Case[] {
  const out: Case[] = [];
  for (const l of CAMP_LOTS)
    for (const owned of [true, false])
      for (const yard of [1, 2, 3] as CampYard[])
        for (const wide of [false, true])
          for (const xmas of [false, true])
            for (const model of l.kind === "caravan" ? CARAVAN_MODELS : [undefined]) {
              // 빈 카라반 자리는 집이 없다 (분양 팻말만) · 빈 터는 1단계 그대로
              if (!owned && (l.kind === "caravan" || yard > 1 || wide)) continue;
              const design = model ? { model, color: 0, awning: 0 } : undefined;
              const plan = campHomePlan(l, { owned, yard, wide, snowy: xmas, xmas, night: xmas, design });
              out.push({ name: `${l.lot}번 ${l.kind} ${owned ? `${yard}단계` : "빈 터"}${wide ? " 넓힘" : ""}${xmas ? " 크리스마스" : ""}${model ? ` ${model}` : ""}`, lot: l, plan, yard, owned, model });
            }
  return out;
}

describe("11/26 캠핑장 집 문 앞 곧은 길 (대문·터 앞 → 문, 폭 28px)", () => {
  const all = cases();

  it("길은 문에서 곧장 앞(아래)으로 터 앞 끝까지 — 기울지 않는다", () => {
    for (const c of all) {
      const { door, entry } = c.plan;
      expect(Math.abs(entry.x - door.x), c.name).toBeLessThanOrEqual(0.5);
      expect(entry.y, c.name).toBeGreaterThan(door.y + 20);
      if (c.lot.kind !== "caravan") expect(entry.y, c.name).toBe(c.lot.y + c.lot.h);
    }
  });

  it("길 위에 소품 그림·막는 상자·앉을 자리가 없어요 (그림을 칠해 본 칸으로 — 문 점 하나가 아니라 길 전체)", () => {
    let checked = 0;
    for (const c of all) {
      const { door, entry } = c.plan;
      const band: Box = { x0: door.x - HOME_PATH_HALF, x1: door.x + HOME_PATH_HALF, y0: door.y, y1: entry.y };
      for (const q of c.plan.props) {
        if (q.depth < FLAT_TAG / 2 || DECK.test(q.key)) continue;
        const b = drawnBox(q);
        expect(b, `${c.name} — 그림을 모르는 소품 ${q.key}`).not.toBeNull();
        expect(hits(band, b!), `${c.name} — ${q.key} 그림 ${JSON.stringify(b)}가 길 ${JSON.stringify(band)}에`).toBe(false);
        checked++;
      }
      for (const r of [...c.plan.solid, ...c.plan.furniture]) expect(hits(band, rectBox(r)), `${c.name} — 막는 상자 ${JSON.stringify(r)}`).toBe(false);
      const design = c.model ? { model: c.model, color: 0, awning: 0 } : undefined;
      for (const s of campHomeSeatsOf(c.lot).filter((q) => homeSeatOpen(q, c.owned ? { yard: c.yard, design } : null, false)))
        expect(hits(band, { x0: s.x - 4, x1: s.x + 4, y0: s.y - 5, y1: s.y }), `${c.name} — 자리 ${s.id}`).toBe(false);
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("펜션 테라스·아래 단 데크 계단(난간 열린 칸)이 길 폭을 다 품어요", () => {
    expect(P4.TERRACE_STAIR_W).toBeGreaterThanOrEqual(HOME_PATH_HALF * 2 + 2);
    expect(LOWER_DECK_STAIR_W).toBeGreaterThanOrEqual(HOME_PATH_HALF * 2 + 2);
    for (const c of all.filter((q) => q.lot.kind === "pension")) {
      const { door } = c.plan;
      const terrace = c.plan.props.find((q) => q.key.startsWith("chome-terrace-"))!;
      expect(Math.abs(terrace.x - door.x) + HOME_PATH_HALF, c.name).toBeLessThanOrEqual(P4.TERRACE_STAIR_W / 2);
      const deck = c.plan.props.find((q) => q.key.startsWith("chome-lowDeck-"));
      if (!deck) continue;
      // 키 = lowDeck-{폭}-{깊이}-{계단 가운데(그림 기준)}-… · 그림 왼쪽 끝 = deck.x (ox 0)
      const stairX = Number(deck.key.split("-")[4]);
      expect(Math.abs(deck.x + stairX - door.x) + HOME_PATH_HALF, c.name).toBeLessThanOrEqual(LOWER_DECK_STAIR_W / 2);
    }
  });
});
