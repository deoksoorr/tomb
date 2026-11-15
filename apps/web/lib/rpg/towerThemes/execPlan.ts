import { MONSTERS, type MonsterId } from "../catalog";
import { seeded } from "../formulas";
import type { HuntWave } from "../plan";
import { EX_CARDS_CAP, EX_ELITE, EX_KEY_CAP, EX_PACKABLE } from "./exec";

// 11/15 임원층 층 계획 손질 (lib/rpg/tower towerPlan이 기본 계획을 만든 뒤 부른다 — 서버 검증도 같은 계획):
//  - 임원 차 키는 한 층에 셋까지 (차가 너무 자주 달리지 않게), 명함 뭉치는 넷까지 (잡으면 명함 셋 — 처치 속도 상한 안에 들게)
//  - 무리는 몰려다니는 것만 (와인 잔이 가장 자주, 금장 만년필)
//  - 우두머리 웨이브: 대표이사가 화날 때 수행 임원을 부른다 (catalog summon — 두 번 몫이 서버 상한에 들어간다)

const CAPS: [MonsterId, number][] = [
  ["ex_car_key", EX_KEY_CAP],
  ["ex_cards", EX_CARDS_CAP],
];

export function execPlan(base: HuntWave[], o: { seed: number }): HuntWave[] {
  const r = seeded((o.seed ^ 0x4558504c) >>> 0);
  const solos = base.flatMap((w) => w.monsters.slice(w.boss ? 1 : 0, w.monsters.length - w.pack));
  const roster = [...new Set(solos)].filter((id) => id !== EX_ELITE);
  const calm = roster.filter((id) => !CAPS.some(([c]) => c === id));
  const fill = calm.length ? calm : (["ex_pen"] as MonsterId[]);
  const packs = EX_PACKABLE.filter((id) => roster.includes(id));
  const used = new Map<MonsterId, number>();
  return base.map((w0) => {
    const w: HuntWave = { ...w0, monsters: [...w0.monsters] };
    const solo = w.monsters.length - w.pack;
    for (let k = w.boss ? 1 : 0; k < solo; k++) {
      const cap = CAPS.find(([c]) => c === w.monsters[k]);
      if (!cap) continue;
      const n = (used.get(cap[0]) ?? 0) + 1;
      used.set(cap[0], n);
      if (n > cap[1]) w.monsters[k] = fill[Math.floor(r() * fill.length)];
    }
    if (w.pack > 0 && !(EX_PACKABLE as readonly MonsterId[]).includes(w.monsters[solo])) {
      const id: MonsterId = packs.length ? packs[Math.floor(r() * packs.length)] : "ex_wine";
      for (let k = solo; k < w.monsters.length; k++) w.monsters[k] = id;
    }
    if (w.elite !== undefined && MONSTERS[w.monsters[w.elite]].minion) delete w.elite;
    return w;
  });
}
