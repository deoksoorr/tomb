import { zoneFor, type Difficulty, type ZoneId } from "./catalog";
import { huntPlan } from "./plan";
import { floorMinSec, isBossFloor, TOWER_BOSS_EVERY, towerPlan } from "./tower";

// 11/18 드롭 시드 알려 주기(/api/rpg/run/reveal) 시각: 판 시작부터 첫 우두머리가 나올 수 있는 가장 이른 시각 (ms, 여유 3초 뺌).
// 서버는 이보다 일찍 물으면 알려 주지 않고, 화면은 게임 시간이 이만큼(+여유) 지난 뒤에 묻는다 (게임 시간은 멈춘 만큼 서버 시간보다 짧다).
// 사냥터는 마지막 웨이브(우두머리)가 나오는 가장 이른 시각, 야근 빌딩은 첫 우두머리 층 전까지 층 최소 시간 합

export function dropRevealMs(seed: number, difficulty: Difficulty, zone: ZoneId | string | undefined, towerStart?: number): number {
  if (towerStart) {
    let sec = 0;
    for (let f = towerStart; !isBossFloor(f) && f < towerStart + TOWER_BOSS_EVERY; f++) sec += floorMinSec(towerPlan(seed, f, towerStart));
    return Math.max(0, sec * 1000 - 3000);
  }
  const plan = huntPlan(seed, difficulty, zoneFor(difficulty, zone as ZoneId | undefined).id);
  return Math.max(0, (plan[plan.length - 1]?.earliestSec ?? 0) * 1000 - 3000);
}
