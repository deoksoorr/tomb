import { champBoards, type ChampBoard } from "@tomb/protocol";
import { titlesOf } from "./forage/dexReward";
import { getForageStore } from "./forage/store";
import { getHouseStore, houseIdFor } from "./housing/service";
import { champBitsFor, getChamp } from "./store/champ";
import { getTitleMarks } from "./store/titleMarks";
import { earnedTitleIds, type TitleFacts } from "./titles";

// 칭호를 얻었는지 서버에서 확인 (가방 [칭호] 칸 목록·착용 검증). 읽기에 실패한 갈래는 "아직 없음"으로 본다
// (그 갈래 칭호를 잠깐 못 낄 뿐, 이미 낀 칭호는 그대로).

/** 명예의 전당에서 훑는 주 수 (10년) */
const HALL_WEEKS = 520;

export async function titleFacts(accountId: string, now = Date.now()): Promise<TitleFacts> {
  const [dexTitleNames, champ, houseScore] = await Promise.all([
    getForageStore()
      .dex(accountId)
      .then((d) => titlesOf(d.dex, d.claims, d.pay.marks))
      .catch(() => [] as string[]),
    Promise.all([getChamp().hall(HALL_WEEKS), champBitsFor(accountId, now)])
      .then(([hall, bits]) => {
        const set = new Set<ChampBoard>(champBoards(bits));
        for (const w of hall) for (const x of w.winners) if (x.accountId === accountId) set.add(x.board);
        return [...set];
      })
      .catch(() => [] as ChampBoard[]),
    getHouseStore()
      .get(houseIdFor(accountId))
      .then((h) => (h ? h.score : null))
      .catch(() => null),
  ]);
  return { dexTitleNames, champBoards: champ, houseScore };
}

/** 얻은 칭호 id */
export async function earnedTitles(accountId: string, now = Date.now()): Promise<string[]> {
  return earnedTitleIds(await titleFacts(accountId, now));
}

/**
 * 칭호 알림 상태: 얻은 칭호, 새로 알릴 칭호(fresh = 얻었는데 아직 알림 창을 안 띄운 것),
 * 가방에서 아직 안 본 칭호(unseen), first = 이 계정을 처음 확인 (기능 전에 얻어 둔 칭호를 "칭호가 n개 생겼어요"로 묶어 알린다)
 */
export async function titleStatus(accountId: string, now = Date.now()): Promise<{ earned: string[]; fresh: string[]; unseen: string[]; first: boolean }> {
  const [earned, marks] = await Promise.all([earnedTitles(accountId, now), getTitleMarks().get(accountId)]);
  return {
    earned,
    fresh: earned.filter((id) => !marks.announced.includes(id)),
    unseen: earned.filter((id) => !marks.seen.includes(id)),
    first: !marks.init,
  };
}
