import { describe, expect, it } from "vitest";
import { CAMP_NPCS } from "@tomb/protocol";
import { campLines } from "../../camp/campTalk";
import { CAMP_FOLK } from "../../camp/campLifeData";
import { SEA_FOLK } from "../../sea/seaLifeData";
import { avatarFrameGrid, lookKey } from "../../sprites/avatar";
import { npcWearOf, NW_PREFIX } from "../../sprites/npcWear";
import { seasonKey } from "../../sprites/npcSeasonArt";
import { FOLK_LINE_MAX } from "./folkLint";
import { conceptLines, conceptLook, NPC_OUTFITS, pickConceptLine } from "./npcOutfits";
import { RESIDENTS } from "./residentData";

// 11/17 NPC 겨울·크리스마스 옷: 모든 사람 주민이 두 벌을 갖고, 시트 키가 갈리고, 그림이 실제로 바뀌고, 계절 한마디는 짧은 해요체

const PEOPLE = [...RESIDENTS, ...CAMP_FOLK.filter((d) => d.kind === "ghost"), ...SEA_FOLK.filter((d) => d.kind === "ghost")].map((d) => ({ id: d.id, body: d.body ?? "hood", color: d.color ?? "#e8d9b0", look: d.look ?? [] }));

function same(a: { px: Uint32Array }, b: { px: Uint32Array }): boolean {
  return a.px.length === b.px.length && a.px.every((v, i) => v === b.px[i]);
}

describe("npc concept outfits", () => {
  it("모든 사람 주민(마을·캠핑장·바닷가)이 겨울·크리스마스 옷과 한마디를 갖는다", () => {
    for (const p of PEOPLE) {
      const o = NPC_OUTFITS[p.id];
      expect(o, p.id).toBeTruthy();
      expect(o.say.winter.length, p.id).toBeGreaterThanOrEqual(1);
      expect(o.say.christmas.length, p.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("기본판은 원래 착용 목록 그대로, 겨울·크리스마스는 판마다 다른 시트 키", () => {
    for (const p of PEOPLE) {
      expect(conceptLook(p.id, p.look, "default")).toBe(p.look);
      const w = conceptLook(p.id, p.look, "winter");
      const x = conceptLook(p.id, p.look, "christmas");
      expect(w.filter((id) => id.startsWith(NW_PREFIX)), p.id).toHaveLength(1);
      expect(lookKey(w)).not.toBe(lookKey(x));
      expect(lookKey(w)).not.toBe(lookKey(p.look));
      expect(npcWearOf(w)).toBe(NPC_OUTFITS[p.id].winter);
    }
  });

  it("계절 모자를 쓰면 원래 머리 꾸미기는 벗고, 손에 든 것은 그대로 (귀마개는 후광 위로)", () => {
    const woodman = conceptLook("woodman", ["hat_beanie"], "christmas");
    expect(woodman).not.toContain("hat_beanie");
    const firekeeper = conceptLook("firekeeper", ["hand_lantern"], "winter");
    expect(firekeeper).toContain("hand_lantern");
    expect(conceptLook("jungcj", ["hat_halo"], "winter")).toContain("hat_halo");
    expect(conceptLook("jungcj", ["hat_halo"], "christmas")).not.toContain("hat_halo");
    // 캠핑카 아빠는 겨울에도 요리사 모자
    expect(conceptLook("griller", ["hat_chef"], "winter")).toContain("hat_chef");
  });

  it("앞·옆·뒤, 걷기·앉기·손 흔들기 모든 자세에서 그림이 바뀌고 프레임 밖으로 나가지 않는다", () => {
    for (const p of PEOPLE)
      for (const c of ["winter", "christmas"] as const) {
        const look = conceptLook(p.id, p.look, c);
        for (const view of ["down", "side", "up"] as const)
          for (const col of [0, 3, 6, 12, 13, 23, 25]) {
            const g = avatarFrameGrid(p.body, view, col, p.color, look);
            const base = avatarFrameGrid(p.body, view, col, p.color, p.look);
            if (col === 0) expect(same(g, base), `${p.id} ${c} ${view}`).toBe(false);
            // 맨 윗줄은 비워 둔다 (외곽선 자리 — 원래 그림이 닿는 곳(후광)만 예외)
            for (let x = 0; x < g.w; x++) if (!(base.get(x, 0) & 255)) expect(g.get(x, 0) & 255, `${p.id} ${c} ${view} ${col}`).toBe(0);
          }
      }
  });

  it("계절 한마디: 짧은 해요체, 콜론·가운뎃점 나열 없음, 원래 대사 수(5~8줄)는 그대로", () => {
    for (const p of PEOPLE)
      for (const c of ["winter", "christmas"] as const)
        for (const t of conceptLines(p.id, c)) {
          expect([...t].length, t).toBeLessThanOrEqual(FOLK_LINE_MAX);
          expect(t, t).not.toMatch(/[:：·]/);
          // 해요체 (인사 「메리 크리스마스!」로 시작하는 짧은 감탄은 그대로)
          expect(/[요죠]/.test(t) || t.startsWith("메리 크리스마스"), t).toBe(true);
        }
    for (const r of RESIDENTS) expect(r.lines.length).toBeLessThanOrEqual(8);
    expect(conceptLines("kimdr", "default")).toHaveLength(0);
  });

  it("계절 한마디는 가끔만 (기본판은 하지 않는다), 바로 전 줄은 피한다", () => {
    expect(pickConceptLine("kimdr", "default", () => 0)).toBeNull();
    expect(pickConceptLine("kimdr", "winter", () => 0.99)).toBeNull();
    const first = pickConceptLine("kimdr", "winter", () => 0);
    expect(first).toBe(NPC_OUTFITS.kimdr.say.winter[0]);
    expect(pickConceptLine("kimdr", "winter", () => 0, first)).toBe(NPC_OUTFITS.kimdr.say.winter[1]);
  });

  it("캠핑장 NPC: 판이 켜지면 계절 묶음이 맨 앞, 기본판 차례는 그대로", () => {
    for (const n of CAMP_NPCS) {
      expect(campLines(n.id, 0, "winter")).not.toEqual(campLines(n.id, 0));
      expect(campLines(n.id, 1, "christmas")).toEqual(campLines(n.id, 0));
      for (const t of [...campLines(n.id, 0, "winter"), ...campLines(n.id, 0, "christmas")]) expect(t).not.toMatch(/[:：·]/);
    }
  });

  it("자리 지키는 NPC 텍스처 키: 기본판은 예전 키 그대로", () => {
    expect(seasonKey("zoo-keeper-0", "default")).toBe("zoo-keeper-0");
    expect(seasonKey("zoo-keeper-0", "winter")).not.toBe(seasonKey("zoo-keeper-0", "christmas"));
  });
});
