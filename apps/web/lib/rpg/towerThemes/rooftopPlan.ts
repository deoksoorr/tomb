import { MONSTERS, type MonsterId } from "../catalog";
import { seeded } from "../formulas";
import type { HuntWave } from "../plan";
import { RF_ELITE, RF_PACKABLE } from "./rooftop";

// 11/15 옥상 정원 폭풍 층 계획 손질 (lib/rpg/tower towerPlan이 기본 계획을 만든 뒤 부른다 — 서버 검증도 같은 계획):
//  - 물탱크 누수는 한 층에 넷까지 (잡으면 물방울 둘 — 처치 속도 상한 안에 들게), 넘치면 그 층 다른 몬스터로
//  - 무리는 몰려다니는 것만 (비둘기 떼가 가장 자주, 서류 뭉치)
//  - 정예 「풍향계 수탉」이 있는 웨이브는 바람에 서류 뭉치가 더 날아든다 (adds — 서버 출현 상한에 들어간다)

export const RF_LEAK_CAP = 4;
/** 풍향계 수탉 한 마리가 살아 있는 동안 날려 오는 서류 뭉치 최대 수 */
export const rfVaneAdds = (visit: number) => (visit >= 2 ? 8 : 5);

const LEAK: MonsterId = "rf_leak";

export function rooftopPlan(base: HuntWave[], o: { seed: number; loop: number }): HuntWave[] {
  const r = seeded((o.seed ^ 0x52464c50) >>> 0);
  const solos = base.flatMap((w) => w.monsters.slice(w.boss ? 1 : 0, w.monsters.length - w.pack));
  const roster = [...new Set(solos)].filter((id) => id !== RF_ELITE);
  const calm = roster.filter((id) => id !== LEAK);
  const fill = calm.length ? calm : (["rf_umbrella"] as MonsterId[]);
  const packs = RF_PACKABLE.filter((id) => roster.includes(id));
  let leaks = 0;
  return base.map((w0) => {
    const w: HuntWave = { ...w0, monsters: [...w0.monsters] };
    const solo = w.monsters.length - w.pack;
    for (let k = w.boss ? 1 : 0; k < solo; k++) {
      if (w.monsters[k] !== LEAK) continue;
      if (++leaks > RF_LEAK_CAP) w.monsters[k] = fill[Math.floor(r() * fill.length)];
    }
    if (w.pack > 0 && !(RF_PACKABLE as readonly MonsterId[]).includes(w.monsters[solo])) {
      const id: MonsterId = packs.length ? packs[Math.floor(r() * packs.length)] : "rf_pigeon";
      for (let k = solo; k < w.monsters.length; k++) w.monsters[k] = id;
    }
    if (w.elite !== undefined && w.monsters[w.elite] === RF_ELITE) w.adds = [{ id: "rf_papers", n: rfVaneAdds(o.loop) }];
    if (w.elite !== undefined && MONSTERS[w.monsters[w.elite]].minion) delete w.elite;
    return w;
  });
}
