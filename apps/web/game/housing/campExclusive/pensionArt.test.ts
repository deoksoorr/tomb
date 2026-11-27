import { describe, expect, it } from "vitest";
import { Grid } from "../../sprites/pixel";
import { cxSpots } from "../interact";
import { CX_ACT, cxLit, cxToggleVariant } from "@/lib/housing/campExclusive";
import { cxAnimIndex } from "@/lib/housing/campExclusive/types";
import { PENSION_CX, PN_DINE_SEATS as LIB_DINE } from "@/lib/housing/campExclusive/pension";
import type { Placed } from "@/lib/housing/types";
import { heldArt, heldPose, PENSION_ART, PN_DINE_SEATS } from "./pensionArt";

// 11/27 펜션 전용 가구 그림·동작 (운영자 확인한 시안을 옮긴 것) — 크기·변형·자리·손에 들기

const FURN = PENSION_CX.filter((r) => !r.skin);
const SKINS = PENSION_CX.filter((r) => r.skin);

/** art.ts furnitureGrid와 같은 길 (d = 0 앞 · 1 왼쪽 · 2 뒤, 테 포함) */
function grid(id: string, v: string, d = 0): Grid {
  const row = FURN.find((r) => r.id === id)!;
  const side = d % 2 === 1;
  const W = (side ? row.h : row.w) * 16;
  const H = (side ? row.w : row.h) * 16 + (PENSION_ART.up[id] ?? 0);
  const g = new Grid(W, H);
  const v2 = [v, d ? `d${d}` : ""].filter(Boolean).join("-");
  const s = d ? PENSION_ART.spin[id] : undefined;
  (s ? (d === 2 ? s.back : s.side) : PENSION_ART.draw[id])(g, W, H, v2);
  g.outline(PENSION_ART.edge.color, false, PENSION_ART.edge.a);
  return g;
}
const same = (a: Grid, b: Grid) => a.w === b.w && a.h === b.h && a.px.every((p, i) => p === b.px[i]);
const opaque = (g: Grid) => g.px.filter((p) => (p & 255) > 1).length;

describe("펜션 전용 가구 그림", () => {
  it("가구 8 · 바닥 3 · 벽지 3이 모두 진짜 그림 (임시 그림 없음)", () => {
    expect(Object.keys(PENSION_ART.draw).sort()).toEqual(FURN.map((r) => r.id).sort());
    // 러그는 90°씩 돌리는 바닥층이라 옆·뒤 그림이 없다
    expect(Object.keys(PENSION_ART.spin).sort()).toEqual(FURN.filter((r) => !r.rug).map((r) => r.id).sort());
    expect(Object.keys(PENSION_ART.floors).sort()).toEqual(SKINS.filter((r) => r.skin === "floor").map((r) => r.id).sort());
    expect(Object.keys(PENSION_ART.papers).sort()).toEqual(SKINS.filter((r) => r.skin === "wall").map((r) => r.id).sort());
    expect(Object.keys(PENSION_ART.wallCap).sort()).toEqual(Object.keys(PENSION_ART.papers).sort());
  });

  it("네 방향 그림이 모두 그려지고 칸 크기 + 솟는 높이에 맞는다", () => {
    for (const r of FURN) {
      for (const d of r.rug ? [0] : [0, 1, 2]) {
        const g = grid(r.id, "", d);
        expect(opaque(g), `${r.id} d${d}`).toBeGreaterThan(40);
      }
    }
  });

  it("체크무늬 러그는 테가 붙지 않는다 (빈 칸 없이 메워 art.ts 테가 들어갈 자리가 없다)", () => {
    const g = new Grid(48, 32);
    PENSION_ART.draw.cx_pn_check_rug(g, 48, 32, "");
    const before = Uint32Array.from(g.px);
    g.outline(PENSION_ART.edge.color, false, PENSION_ART.edge.a);
    expect(g.px.every((p, i) => p === before[i])).toBe(true);
  });

  it("쓰기·켜기 그림 변형이 앞·옆·뒤 모두 달라진다", () => {
    const pairs: [string, string, string][] = [
      ["cx_pn_firewood", "", "low"],
      ["cx_pn_ski_rack", "", "taken"],
      ["cx_pn_boardgame", "", "roll1"],
      ["cx_pn_karaoke", "", cxToggleVariant("cx_pn_karaoke", 1)],
      ["cx_pn_karaoke", cxToggleVariant("cx_pn_karaoke", 1), `${cxToggleVariant("cx_pn_karaoke", 1)}-sing`],
      ["cx_pn_stove", cxToggleVariant("cx_pn_stove", 0), cxToggleVariant("cx_pn_stove", 1)],
    ];
    for (const [id, a, b] of pairs) for (const d of [0, 1, 2]) expect(same(grid(id, a, d), grid(id, b, d)), `${id} ${a}→${b} d${d}`).toBe(false);
    // 흔들의자: 옆모습은 f1(뒤로)·f2(앞으로)가 가운데와 다르다
    expect(same(grid("cx_pn_rocking", "", 1), grid("cx_pn_rocking", "f1", 1))).toBe(false);
    expect(same(grid("cx_pn_rocking", "", 1), grid("cx_pn_rocking", "f2", 1))).toBe(false);
  });

  it("불꽃·미러볼 두 번째 장면(f1)은 켜졌을 때만 다르다", () => {
    expect(same(grid("cx_pn_stove", "on"), grid("cx_pn_stove", "on-f1"))).toBe(false);
    expect(same(grid("cx_pn_karaoke", "s1-on"), grid("cx_pn_karaoke", "s1-on-f1"))).toBe(false);
    expect(same(grid("cx_pn_karaoke", ""), grid("cx_pn_karaoke", "f1"))).toBe(true);
  });

  it("바닥·벽지 타일은 변형 0~3 모두 칠해진다 (벽지는 천장 테·걸레받이 사이)", () => {
    for (const f of Object.values(PENSION_ART.floors))
      for (let v = 0; v < 4; v++) {
        const g = new Grid(16, 16);
        f(g, v);
        expect(opaque(g)).toBe(256);
      }
    for (const p of Object.values(PENSION_ART.papers))
      for (let v = 0; v < 4; v++) {
        const g = new Grid(16, 40);
        p(g, v);
        for (let y = 6; y <= 34; y++) for (let x = 0; x < 16; x++) expect(g.filled(x, y)).toBe(true);
      }
  });
});

describe("펜션 전용 가구 동작", () => {
  it("손에 드는 것: 종류 파일 hold 이름마다 그림이 있고, 한 장 그림은 한가운데(손 자리)에 물건이 닿아 있다", () => {
    const items = FURN.flatMap((r) => (r.act?.hold ? [r.act.hold.item] : []));
    expect(items.sort()).toEqual(["log", "mic", "ski"]);
    for (const k of ["log", "mic"]) {
      expect(heldArt[k].length, k).toBe(0);
      const g = heldArt[k]();
      expect(g.w % 2 + (g.h % 2), k).toBe(0);
      const cx = g.w / 2;
      const cy = g.h / 2;
      let near = false;
      for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 4; x <= cx + 4; x++) if (g.filled(x, y)) near = true;
      expect(near, k).toBe(true);
    }
  });

  it("스키는 방향마다 그림(등에 비스듬히 — 시안 36×30): 앞·옆은 몸 뒤, 뒤를 보면 몸 앞. 왼쪽은 오른쪽 그림을 뒤집은 것", () => {
    expect(heldArt.ski.length).toBe(1);
    for (const d of [0, 1, 2, 3]) {
      const g = heldArt.ski(d);
      expect([g.w, g.h]).toEqual([36, 30]);
      expect(opaque(g)).toBeGreaterThan(100);
      expect(heldPose.ski(d).behind).toBe(d !== 2);
    }
    expect(same(heldArt.ski(1), heldArt.ski(3).mirrored())).toBe(true);
    expect(same(heldArt.ski(0), heldArt.ski(3))).toBe(false);
  });

  it("앉은 동안·켜진 동안 장면: 흔들의자 seatAnim, 난로·노래방 toggle.anim 조각마다 그림이 바뀐다", () => {
    const sa = CX_ACT.cx_pn_rocking.seatAnim!;
    expect(sa.frames).toEqual(["", "b1", "b2", "b1", "", "w1", "w2", "w1"]);
    expect(CX_ACT.cx_pn_boardgame.seatFx?.label).toBe("주사위 굴리기");
    for (const d of [0, 1, 2]) for (const v of ["b1", "b2", "w1", "w2"]) expect(same(grid("cx_pn_rocking", "", d), grid("cx_pn_rocking", v, d)), `d${d} ${v}`).toBe(false);
    for (const id of ["cx_pn_stove", "cx_pn_karaoke"]) {
      const an = CX_ACT[id].toggle!.anim!;
      const lit = cxToggleVariant(id, CX_ACT[id].toggle!.startOn ? 0 : 1);
      const [a, b] = an.frames.map((f) => [lit, f].filter(Boolean).join("-"));
      for (const d of [0, 1]) expect(same(grid(id, a, d), grid(id, b, d)), `${id} d${d}`).toBe(false);
    }
  });

  it("노래방: 켜 둔 채로 E = 노래하기 (마이크), 끄기는 따로 · 난로: 다가가면 손 녹이기 · 빛은 미러볼·불창 높이", () => {
    const k = CX_ACT.cx_pn_karaoke;
    expect(k.toggle!.useWhileOn).toEqual({ label: "노래하기", offLabel: "노래방 끄기" });
    expect(k.hold?.item).toBe("mic");
    expect(k.fx?.v).toBe("sing");
    expect(CX_ACT.cx_pn_stove.near?.emote).toBe("fire");
    expect(CX_ACT.cx_pn_stove.fx).toBeUndefined();
    const light = (id: string) => FURN.find((r) => r.id === id)!.light!;
    expect(light("cx_pn_karaoke").dy).toBe(-26);
    expect(light("cx_pn_stove").dy).toBe(-20);
    expect(FURN.find((r) => r.id === "cx_pn_rocking")!.noShadow).toBe(true);
  });

  it("켜기·끄기: 노래방은 꺼진 채로 놓이고 난로는 켜진 채로 놓인다 (밤 빛도 그때만)", () => {
    expect(cxLit("cx_pn_karaoke", 0)).toBe(false);
    expect(cxLit("cx_pn_karaoke", 1)).toBe(true);
    expect(cxLit("cx_pn_stove", 0)).toBe(true);
    expect(cxLit("cx_pn_stove", 1)).toBe(false);
    expect(FURN.find((r) => r.id === "cx_pn_karaoke")!.light).toBeDefined();
    expect(FURN.find((r) => r.id === "cx_pn_stove")!.light).toBeDefined();
  });

  const box = (fw: number, fh: number) => ({ L: 100, Tp: 200, R: 100 + fw * 16, B: 200 + fh * 16, fw, fh });
  const place = (i: string): Placed => ({ u: "a", i, x: 5, y: 5, r: 4 });

  it("6인 식탁: 네 방향 모두 칸 안 여섯 자리 (21px 간격 — 그림의 의자·벤치 줄과 같은 값)", () => {
    expect([...LIB_DINE]).toEqual(PN_DINE_SEATS);
    for (const d of [0, 1, 2, 3]) {
      const b = d % 2 ? box(2, 4) : box(4, 2);
      const s = cxSpots(place("cx_pn_long_table"), b, d, CX_ACT.cx_pn_long_table, () => true);
      expect(s, `d${d}`).toHaveLength(6);
      expect(new Set(s.map((x) => x.id)).size).toBe(6);
      for (const x of s) {
        expect(x.inside).toBe(true);
        expect(x.x).toBeGreaterThan(b.L);
        expect(x.x).toBeLessThan(b.R);
        expect(x.y).toBeGreaterThan(b.Tp);
        expect(x.y).toBeLessThan(b.B);
      }
    }
  });

  it("흔들의자 흔들기: 한 바퀴 2.4초, 끝에서 오래·가운데는 짧게, 장면마다 등받이 윗끝이 1px씩", () => {
    const sa = CX_ACT.cx_pn_rocking.seatAnim!;
    const ms = sa.ms as readonly number[];
    expect(ms).toHaveLength(8);
    expect(Math.abs(ms.reduce((a, b) => a + b, 0) - 2400)).toBeLessThanOrEqual(4);
    expect(ms[2]).toBeGreaterThan(ms[1]);
    expect(ms[1]).toBeGreaterThan(ms[0]);
    expect(ms[6]).toBe(ms[2]);
    // 장면 시계: 같은 시각이면 가구 그림과 앉은 사람이 같은 장면
    expect(cxAnimIndex(ms, 8, 0)).toBe(0);
    expect(cxAnimIndex(ms, 8, ms[0] + ms[1] + 1)).toBe(2);
    expect(cxAnimIndex(ms, 8, 2400 + 5)).toBe(0);
    expect(cxAnimIndex(500, 4, 1100)).toBe(2);
    // 옆모습: 등받이 맨 윗줄(y 2)의 가장 오른쪽 칠한 칸이 k만큼 옮겨 간다 (왼쪽을 본 의자 — 뒤로 젖히면 오른쪽)
    const topRight = (v: string) => {
      const g = new Grid(16, 26);
      PENSION_ART.spin.cx_pn_rocking.side(g, 16, 26, [v, "d1"].filter(Boolean).join("-"));
      for (let x = g.w - 1; x >= 0; x--) if (g.filled(x, 3)) return x;
      return -1;
    };
    expect(topRight("b1") - topRight("")).toBe(1);
    expect(topRight("b2") - topRight("")).toBe(2);
    expect(topRight("") - topRight("w2")).toBe(2);
    // 앉은 사람: 옆은 같은 각도로 (왼쪽을 보면 뒤로 젖힐 때 시계 방향, 오른쪽은 반대), 앞·뒤는 1px
    const deg = (Math.atan(2 / 22.5) * 180) / Math.PI;
    expect(sa.sitPose!(1, 2)[2]).toBeCloseTo(deg);
    expect(sa.sitPose!(3, 2)[2]).toBeCloseTo(-deg);
    expect(sa.sitPose!(1, 6)[2]).toBeCloseTo(-deg);
    expect(sa.sitPose!(0, 1).slice(0, 2)).toEqual([0, -1]);
    expect(sa.sitPose!(2, 1).slice(0, 2)).toEqual([0, 1]);
    expect(sa.sitPose!(0, 0)[1] === 0).toBe(true);
  });

  it("흔들의자: 한 자리, 뒤를 보면 등받이가 사람 앞 (발은 칸 위 끝)", () => {
    for (const d of [0, 1, 2, 3]) {
      const s = cxSpots(place("cx_pn_rocking"), box(1, 1), d, CX_ACT.cx_pn_rocking, () => true);
      expect(s).toHaveLength(1);
      expect(!!s[0].behind).toBe(d === 2);
      expect(s[0].y).toBe(d === 2 ? 200 : 216 - 5);
    }
  });

  it("보드게임 탁자: 변마다 가운데 한 자리 (시안 4자리), 그 변 칸이 막히면 그 자리는 없다 · 앉은 채로 E = 주사위", () => {
    const all = cxSpots(place("cx_pn_boardgame"), box(2, 2), 0, CX_ACT.cx_pn_boardgame, () => true);
    expect(all.map((s) => [s.x - 100, s.y - 200]).sort()).toEqual(
      [
        [16, 36],
        [16, 4],
        [-6, 20],
        [38, 20],
      ].sort(),
    );
    // 왼쪽 벽에 붙이면 왼쪽 자리가 없다 · 위 두 칸 중 하나만 막혀도 위 자리가 없다
    expect(cxSpots(place("cx_pn_boardgame"), box(2, 2), 0, CX_ACT.cx_pn_boardgame, (x) => x >= 5)).toHaveLength(3);
    expect(cxSpots(place("cx_pn_boardgame"), box(2, 2), 0, CX_ACT.cx_pn_boardgame, (x, y) => !(x === 6 && y === 4))).toHaveLength(3);
    expect(CX_ACT.cx_pn_boardgame.seatFx?.v).toBe("roll1");
    expect(CX_ACT.cx_pn_boardgame.fx).toBeUndefined();
  });
});
