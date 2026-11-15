import { MONSTERS, type MonsterId } from "../catalog";
import { seeded } from "../formulas";
import type { HuntWave } from "../plan";
import { MT_ELITE, MT_MID, MT_PACKABLE, type MtMonsterId } from "./meetingRoom";

// 11/15 끝없는 회의실 층 계획 손질 (lib/rpg/tower towerPlan이 기본 계획을 만든 뒤 부른다 — 서버 검증도 같은 계획):
//  - 참조 메일은 한 층에 셋까지, 무리로는 안 나온다 (잡으면 7통 — 처치 속도 상한 안에 들게)
//  - 무리는 몰려다니는 것만 (단톡방 알림·의견 없음·의자 인턴·커피)
//  - 각 바퀴 3층째(8·18·28 …층)는 둘째 웨이브에 중간 우두머리 「회의록 담당」이 정예로
//  - 밤샘 회의(4바퀴째)부터는 보통 층마다 정예 「안건 추가」
//  - 「안건 추가」가 있는 웨이브는 그 층 몬스터가 더 들어올 수 있다 (adds — 서버 출현 상한에 들어간다)

export const MT_MAIL_CAP = 3;
/** 안건 추가 한 마리가 살아 있는 동안 불러들이는 최대 수 */
export const mtAgendaAdds = (loop: number) => (loop >= 3 ? 8 : 6);

const MAIL: MonsterId = "mt_cc_mail";

export function meetingPlan(base: HuntWave[], o: { seed: number; f: number; loop: number }): HuntWave[] {
  const r = seeded((o.seed ^ 0x4d544d52) >>> 0);
  const solos = base.flatMap((w) => w.monsters.slice(w.boss ? 1 : 0, w.monsters.length - w.pack));
  // 이 층에 고른 몬스터 (기본 계획이 테마 몬스터 몇 종을 골라 둔 것)
  const roster = [...new Set(solos)].filter((id) => id !== MT_ELITE && id !== MT_MID);
  const calm = roster.filter((id) => id !== MAIL);
  const fill = calm.length ? calm : (["mt_marker"] as MonsterId[]);
  const packs = MT_PACKABLE.filter((id) => roster.includes(id));
  const mid = Math.floor(o.f) % 5 === 3;
  let mails = 0;
  return base.map((w0, i) => {
    const w: HuntWave = { ...w0, monsters: [...w0.monsters] };
    const solo = w.monsters.length - w.pack;
    for (let k = w.boss ? 1 : 0; k < solo; k++) {
      if (w.monsters[k] !== MAIL) continue;
      if (++mails > MT_MAIL_CAP) w.monsters[k] = fill[Math.floor(r() * fill.length)];
    }
    if (w.pack > 0 && !MT_PACKABLE.includes(w.monsters[solo] as MtMonsterId)) {
      const id: MonsterId = packs.length && r() < 0.6 ? packs[Math.floor(r() * packs.length)] : "mt_chat_ping";
      for (let k = solo; k < w.monsters.length; k++) w.monsters[k] = id;
    }
    // 정예 자리: 중간 우두머리 층은 둘째 웨이브에 회의록 담당, 밤샘 회의부터는 늘 안건 추가
    if (!w.boss && i === 1 && solo > 0) {
      if (mid) {
        const k = w.elite ?? 0;
        w.monsters[k] = MT_MID;
        w.elite = k;
      } else if (o.loop >= 3 && w.elite === undefined) {
        w.monsters[0] = MT_ELITE;
        w.elite = 0;
      }
    }
    if (w.elite !== undefined && w.monsters[w.elite] === MT_ELITE) {
      const n = mtAgendaAdds(o.loop);
      const a = fill[Math.floor(r() * fill.length)];
      const others = fill.filter((id) => id !== a);
      const b = others.length ? others[Math.floor(r() * others.length)] : a;
      w.adds = a === b ? [{ id: a, n }] : [{ id: a, n: Math.ceil(n / 2) }, { id: b, n: Math.floor(n / 2) }];
    }
    // 졸개가 정예 자리에 들어가지 않게 (기본 계획과 같은 규칙)
    if (w.elite !== undefined && MONSTERS[w.monsters[w.elite]].minion) delete w.elite;
    return w;
  });
}
