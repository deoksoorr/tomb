import { RpgError } from "./rpg/character";
import { equipSg } from "./rpg/enhance";
import { effectiveLevel } from "./rpg/service";
import { decodeSg, encodeSg, SG_INV_MAX, SG_PIECES, SG_SETS, type SgItem, type SgOpt } from "./rpg/setGear";
import type { CharacterState } from "./rpg/types";

// 11/20 로컬 개발 전용 장비 프리셋 (app/api/dev/gear · lib/devStaffSeed가 같이 쓴다). 운영에서는 부르는 곳이 모두 막혀 있다

// 프리셋: 세트·직급·옵션(그 직급 최대값)·전설·강화. 임원급(3) 옵션 범위의 위쪽 끝 — decodeSg가 범위를 다시 확인한다
type Preset = { set: number; g: 0 | 1 | 2 | 3; e: number; pieces: Record<(typeof SG_PIECES)[number], { o: [SgOpt, number][]; L?: number }> };
export const PRESETS: Record<"finalMagic15", Preset> = {
  // 회의 세트(마법서 · 범위 마법) 임원급 +15, 마법 피해·공격력 위주
  finalMagic15: {
    set: SG_SETS.indexOf("meeting"),
    g: 3,
    e: 15,
    pieces: {
      weapon: { o: [["g", 10], ["a", 8], ["d", 20]], L: 1 },
      armor: { o: [["h", 10], ["r", 6], ["p", 30]] },
      head: { o: [["k", 8], ["c", 6], ["h", 10]] },
      acc1: { o: [["g", 10], ["a", 8], ["c", 6]] },
      acc2: { o: [["g", 10], ["a", 8], ["k", 8]] },
    },
  },
};

export type DevGearPreset = keyof typeof PRESETS;

/** 프리셋 다섯 부위를 가방에 넣고 낀다 (가방이 가득이면 BAG_FULL) */
export function addPresetGear(s: CharacterState, preset: DevGearPreset, sup: boolean): CharacterState {
  const p = PRESETS[preset];
  const sg = [...(s.sg ?? [])];
  if (sg.length + SG_PIECES.length > SG_INV_MAX) throw new RpgError(409, "BAG_FULL", `세트 장비 가방이 가득 찼어요 (${sg.length}/${SG_INV_MAX}).`);
  let u = s.sgN ?? 1;
  const uids: number[] = [];
  SG_PIECES.forEach((piece, i) => {
    const it: SgItem = { s: p.set, p: i, g: p.g, u, e: p.e, o: p.pieces[piece].o, L: p.pieces[piece].L ?? 0, rr: 0, f: 0 };
    const code = encodeSg(it);
    if (!decodeSg(code)) throw new RpgError(500, "BAD_PRESET", `프리셋 코드가 맞지 않아요: ${code}`);
    sg.push(code);
    uids.push(u++);
  });
  let next: CharacterState = { ...s, sg, sgN: u };
  SG_PIECES.forEach((slot, i) => {
    next = equipSg(next, slot, uids[i], effectiveLevel(s.level, sup));
  });
  return next;
}

/** 이미 이 프리셋(같은 세트·직급·강화) 다섯 부위를 가지고 있나 (로컬 운영자 계정에 한 번만 넣으려고) */
export function hasPresetGear(s: CharacterState, preset: DevGearPreset): boolean {
  const p = PRESETS[preset];
  const got = new Set<number>();
  for (const c of s.sg ?? []) {
    const it = decodeSg(c);
    if (it && it.s === p.set && it.g === p.g && it.e >= p.e) got.add(it.p);
  }
  return got.size >= SG_PIECES.length;
}
