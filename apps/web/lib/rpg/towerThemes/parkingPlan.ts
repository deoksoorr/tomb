import { MONSTERS, type MonsterId } from "../catalog";
import { seeded } from "../formulas";
import type { HuntWave } from "../plan";
import { PK_BOSS, PK_ELITE, PK_PACKABLE, type PkMonsterId } from "./parking";

// 11/15 지하 주차장 층 계획 손질 (lib/rpg/tower towerPlan이 기본 계획을 만든 뒤 부른다 — 서버 검증도 같은 계획):
//  - 차단기는 한 층에 둘까지 (제자리에서 휘두르는 것이 겹치면 길이 막힌다)
//  - 무리는 몰려다니는 것만 (카트·딱지)
//  - 우두머리 웨이브: 견인차가 끌고 오는 차 중 「경보 울리는 차」가 깨어난다 (adds — 서버 출현 상한에 들어간다)

export const PK_BARRIER_CAP = 2;
/** 견인차가 판 중에 끌고 와 깨우는 경보 차 수 (다시 올 때마다 하나씩 더, 다섯까지) */
export const pkTowAdds = (loop: number) => Math.min(5, 3 + Math.max(0, Math.floor(loop)));

const BARRIER: MonsterId = "pk_barrier";

export function parkingPlan(base: HuntWave[], o: { seed: number; f: number; loop: number }): HuntWave[] {
  const r = seeded((o.seed ^ 0x504b504c) >>> 0);
  const solos = base.flatMap((w) => w.monsters.slice(w.boss ? 1 : 0, w.monsters.length - w.pack));
  const roster = [...new Set(solos)].filter((id) => id !== PK_ELITE && id !== PK_BOSS);
  const calm = roster.filter((id) => id !== BARRIER);
  const fill = calm.length ? calm : (["pk_tire"] as MonsterId[]);
  const packs = PK_PACKABLE.filter((id) => roster.includes(id));
  let bars = 0;
  return base.map((w0) => {
    const w: HuntWave = { ...w0, monsters: [...w0.monsters] };
    const solo = w.monsters.length - w.pack;
    for (let k = w.boss ? 1 : 0; k < solo; k++) {
      if (w.monsters[k] !== BARRIER) continue;
      if (++bars > PK_BARRIER_CAP) w.monsters[k] = fill[Math.floor(r() * fill.length)];
    }
    if (w.pack > 0 && !PK_PACKABLE.includes(w.monsters[solo] as PkMonsterId)) {
      const id: MonsterId = packs.length && r() < 0.7 ? packs[Math.floor(r() * packs.length)] : "pk_cart";
      for (let k = solo; k < w.monsters.length; k++) w.monsters[k] = id;
    }
    if (w.boss) w.adds = [{ id: "pk_alarm_car", n: pkTowAdds(o.loop) }];
    if (w.elite !== undefined && MONSTERS[w.monsters[w.elite]].minion) delete w.elite;
    return w;
  });
}
