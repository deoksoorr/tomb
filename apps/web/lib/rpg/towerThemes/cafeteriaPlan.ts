import { MONSTERS, type MonsterId } from "../catalog";
import { seeded } from "../formulas";
import type { HuntWave } from "../plan";
import { CF_BOSS, CF_ELITE, CF_PACKABLE, type CfMonsterId } from "./cafeteria";

// 11/15 구내식당 층 계획 손질 (lib/rpg/tower towerPlan이 기본 계획을 만든 뒤 부른다 — 서버 검증도 같은 계획):
//  - 디저트 젤리는 한 층에 셋까지 (한 마리 = 조각 셋 — 처치 속도 상한 안에 들게), 잔반통은 웨이브마다 하나까지 (빨아들이는 것이 겹치면 못 빠져나온다)
//  - 무리는 몰려다니는 것만 (식권·단무지)
//  - 정예 「압력밥솥」이 있는 웨이브는 주먹밥을 튀겨 낼 몫(adds), 우두머리 웨이브는 특식 때 더 들어오는 배식 도우미 몫

export const CF_JELLY_CAP = 3;
export const CF_BIN_CAP = 1;
/** 압력밥솥 한 마리가 살아 있는 동안 튀겨 내는 주먹밥 최대 수 (다시 올 때마다 둘씩 더, 열까지) */
export const cfRiceAdds = (loop: number) => Math.min(10, 6 + 2 * Math.max(0, Math.floor(loop)));
/** 영양사 「특식」 때 더 들어오는 배식 도우미 */
export const CF_SPECIAL_SERVERS = 4;

export function cafeteriaPlan(base: HuntWave[], o: { seed: number; f: number; loop: number }): HuntWave[] {
  const r = seeded((o.seed ^ 0x43465046) >>> 0);
  const solos = base.flatMap((w) => w.monsters.slice(w.boss ? 1 : 0, w.monsters.length - w.pack));
  const roster = [...new Set(solos)].filter((id) => id !== CF_ELITE && id !== CF_BOSS);
  const calm = roster.filter((id) => id !== "cf_jelly" && id !== "cf_bin");
  const fill = calm.length ? calm : (["cf_tray"] as MonsterId[]);
  const packs = CF_PACKABLE.filter((id) => roster.includes(id));
  let jellies = 0;
  return base.map((w0) => {
    const w: HuntWave = { ...w0, monsters: [...w0.monsters] };
    const solo = w.monsters.length - w.pack;
    let bins = 0;
    for (let k = w.boss ? 1 : 0; k < solo; k++) {
      const id = w.monsters[k];
      if ((id === "cf_jelly" && ++jellies > CF_JELLY_CAP) || (id === "cf_bin" && ++bins > CF_BIN_CAP)) w.monsters[k] = fill[Math.floor(r() * fill.length)];
    }
    if (w.pack > 0 && !CF_PACKABLE.includes(w.monsters[solo] as CfMonsterId)) {
      const id: MonsterId = packs.length && r() < 0.7 ? packs[Math.floor(r() * packs.length)] : "cf_meal_ticket";
      for (let k = solo; k < w.monsters.length; k++) w.monsters[k] = id;
    }
    if (w.elite !== undefined && MONSTERS[w.monsters[w.elite]].minion) delete w.elite;
    if (w.elite !== undefined && w.monsters[w.elite] === CF_ELITE) w.adds = [{ id: "cf_riceball", n: cfRiceAdds(o.loop) }];
    if (w.boss) w.adds = [{ id: "cf_server", n: CF_SPECIAL_SERVERS }];
    return w;
  });
}
