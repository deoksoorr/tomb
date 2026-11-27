import { describe, expect, it } from "vitest";
import { DIR, RAFT_SET_IDS } from "@tomb/protocol";
import { CosmeticFxSim, FX_ART, type FxCmd, type FxInput } from "./cosmeticFx";
import { RAFT_CARP_CYCLE } from "./raftSetFx";

// 11/27 좌대 영구 한 벌 세트 연출 「금빛 월척」 (CosmeticFxSim — 내 화면·남 화면·입어 보기 같은 길)

const input = (o: Partial<FxInput> = {}): FxInput => ({
  now: 1000,
  dt: 16,
  x: 100,
  y: 200,
  headY: 200,
  dir: DIR.down,
  moving: false,
  hidden: false,
  artTop: 18,
  shoulder: 7,
  hand: { dx: 5.5, up: 6 },
  reduced: false,
  ...o,
});
const jw = (out: FxCmd[]) => out.filter((c) => String(c.art).startsWith("jw"));
function run(look: readonly string[], o: Partial<FxInput> = {}): FxCmd[] {
  const sim = new CosmeticFxSim();
  sim.setLook(look);
  const out: FxCmd[] = [];
  sim.step(input(o), out);
  return out;
}

describe("11/27 좌대 영구 한 벌 「금빛 월척」", () => {
  it("영구 넷을 다 입었을 때만 (셋이면 없음, 다른 꾸미기를 더 입어도 그대로)", () => {
    expect(jw(run(RAFT_SET_IDS, { now: 1000 })).length).toBeGreaterThan(0);
    expect(jw(run([...RAFT_SET_IDS, "jw_carphat", "aura_sparkle"], { now: 1000 })).length).toBeGreaterThan(0);
    for (let i = 0; i < RAFT_SET_IDS.length; i++) expect(jw(run(RAFT_SET_IDS.filter((_, k) => k !== i), { now: 1000 }))).toEqual([]);
    expect(jw(run(["jw_carphat", "jw_vest", "jw_net"], { now: 1000 }))).toEqual([]);
  });

  it("잉어가 발 둘레를 돈다: 한 바퀴 동안 앞(몸 앞)·뒤(몸 뒤)를 다 지나고, 그림 프레임은 그림 안", () => {
    let front = 0;
    let back = 0;
    const sim = new CosmeticFxSim();
    sim.setLook(RAFT_SET_IDS);
    for (let t = 0; t < RAFT_CARP_CYCLE; t += 40) {
      const out: FxCmd[] = [];
      sim.step(input({ now: t, depth: 200 }), out);
      for (const c of jw(out)) {
        expect(c.frame).toBeLessThan(FX_ART[c.art].frames);
        expect(Math.abs(c.x - 100)).toBeLessThan(20);
        if (c.art === "jwCarp" && c.layer === "body") {
          if (c.depth > 200) front++;
          else back++;
        }
      }
    }
    expect(front).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(0);
  });

  it("움직임 줄이기: 시각이 달라도 같은 그림 (잉어는 발 왼쪽 앞에 멈춤, 알갱이·물방울 없음)", () => {
    const a = jw(run(RAFT_SET_IDS, { reduced: true, now: 1234 }));
    const b = jw(run(RAFT_SET_IDS, { reduced: true, now: 98765 }));
    expect(a).toEqual(b);
    expect(a.some((c) => c.art === "jwCarp" && c.x < 100)).toBe(true);
    expect(a.some((c) => c.art === "jwMote" || c.art === "jwDrop")).toBe(false);
  });

  it("밤(미리보기는 늘 밤처럼): 발밑 금빛 웅덩이를 빛 층에 · 숨은 자세(잠수 등)엔 없음", () => {
    const night = jw(run(RAFT_SET_IDS, { still: true }));
    expect(night.some((c) => c.art === "jwPool" && c.layer === "light")).toBe(true);
    expect(jw(run(RAFT_SET_IDS, { hidden: true }))).toEqual([]);
  });
});
