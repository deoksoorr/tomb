import type { Difficulty } from "./catalog";
import { seeded } from "./formulas";
import type { StarNote } from "./plan";

// 별자리 잇기 계획 1판 (별자리 하나에 별 5~7개, 2026-11-14 첫 개편) — 서버 검사 전용으로 얼려 둔다.
// 판 번호가 없는 티켓(1판 화면·1판 서버가 시작한 판)은 이 계획으로 검사한다 → 배포가 판 중간에 겹쳐도 정상 판이 거절되지 않게.
// 별 자리(x·y)는 서버가 쓰지 않으므로 0. 박자·무리 크기·무리 번호·별자리 id는 1판과 한 치도 다르지 않아야 한다 (시험이 지킨다).

/** 1판 별자리 표 (그때의 순서·별 수·희귀도 그대로) */
export const V1_TABLE: readonly (readonly [id: string, size: number, rarity: 1 | 2 | 3 | 5])[] = [
  ["c_newyear", 5, 1],
  ["c_gym", 6, 1],
  ["c_words", 6, 1],
  ["c_diary", 5, 1],
  ["c_ledger", 5, 1],
  ["c_hometrain", 6, 1],
  ["c_license", 5, 1],
  ["c_reading", 6, 1],
  ["c_diet", 7, 1],
  ["c_guitar", 7, 2],
  ["c_morning", 6, 2],
  ["c_resign", 5, 1],
  ["c_coding", 7, 2],
  ["c_blog", 7, 2],
  ["c_cooking", 7, 1],
  ["c_marathon", 5, 3],
  ["c_mountain", 5, 3],
  ["c_piano", 6, 3],
  ["c_driving", 6, 3],
  ["c_balloon", 7, 3],
  ["c_startup", 7, 3],
  ["c_bucket", 5, 5],
  ["c_jeju", 6, 5],
  ["c_house", 7, 5],
];
export const V1_SIZE = new Map(V1_TABLE.map(([id, n]) => [id, n]));

const APPROACH: Record<Difficulty, number> = { easy: 1500, normal: 1200, hard: 950, hell: 780 };
const BEAT: Record<Difficulty, number> = { easy: 820, normal: 640, hard: 500, hell: 400 };
const HALF: Record<Difficulty, number> = { easy: 0, normal: 0.12, hard: 0.25, hell: 0.35 };
const WEIGHT = { 1: 10, 2: 6, 3: 3.5, 5: 2.5 } as const;

export function starsPlanV1(seed: number, d: Difficulty, durationSec: number, starry = false): StarNote[] {
  const r = seeded(seed ^ 0x53544152);
  const rc = seeded(seed ^ 0x434f4e53);
  const used = new Set<string>();
  const allowed = (rarity: number) => (rarity === 5 ? starry : rarity === 3 ? d === "hard" || d === "hell" : true);
  const pickCon = (len: number): string => {
    const fits = V1_TABLE.filter(([, n, rr]) => n === len && allowed(rr));
    const fresh = fits.filter(([id]) => !used.has(id));
    const pool = fresh.length ? fresh : fits;
    let x = rc() * pool.reduce((a, c) => a + WEIGHT[c[2]], 0);
    const c = pool.find((c) => (x -= WEIGHT[c[2]]) < 0) ?? pool[pool.length - 1];
    used.add(c[0]);
    return c[0];
  };
  const out: StarNote[] = [];
  const end = durationSec * 1000 - 400;
  let t = APPROACH[d] + 600;
  let group = 0;
  while (t < end) {
    const len = 5 + Math.floor(r() * 3);
    const con = pickCon(len);
    r();
    r();
    for (let i = 0; i < len && t < end; i++) {
      out.push({ t: Math.round(t), x: 0, y: 0, group, idx: i, con });
      r();
      r();
      t += BEAT[d] * (r() < HALF[d] ? 0.5 : 1);
    }
    group++;
    t += BEAT[d] * 1.8;
  }
  return out;
}
