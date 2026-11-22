// 진입 화면 등 게임 화면에서 쓰는 개발자 노트 [제목, 쓴 시각] (posts.ts의 id·title·createdAt만 — 큰 본문을 게임 번들에 싣지 않으려고). posts.ts를 고치면 같이 고친다 (devNotes.test.ts가 확인)
export const STATIC_NOTE_TITLES: Readonly<Record<string, readonly [string, number]>> = {
  "Fdnq9-pR0k": [
    "처음 오신 분들께 안내드립니다",
    1794743573688
  ],
  "DXvWB5lsd6": [
    "낚시 개편, 대물과 월척",
    1795310050475
  ],
  "IJsACTCCh9": [
    "긴급 밸런스 패치, 넋 카드와 삽자루",
    1795249741599
  ],
  "63hThUnh4v": [
    "11월 21일 업데이트",
    1795204800000
  ],
  "qALW3m3LA_": [
    "11월 19일 업데이트",
    1795069008786
  ],
  "tynKf9JlFH": [
    "11월 18일 겨울 마을 업데이트",
    1794974415662
  ],
  "QHTXLpxKlt": [
    "11월 17일 업데이트",
    1794907996388
  ],
  "PVygvvXo0k": [
    "11월 17일 오전 접속 장애",
    1794870639292
  ],
  "Fibfr4Ex_f": [
    "11월 16일 업데이트 #3",
    1794837776379
  ],
  "_vy5isPKro": [
    "11월 16일 업데이트 #2",
    1794791670422
  ],
  "x9GNs0wTqK": [
    "11월 16일 업데이트 #1",
    1794791654949
  ],
  "Q8CqFwNRvT": [
    "11월 15일 업데이트",
    1794731248880
  ],
  "P98nTHNMFv": [
    "11월 14일 업데이트",
    1794636992372
  ],
  "8ApLG11nhJ": [
    "11월 14일 긴급 수정",
    1794636904323
  ],
  "nZwaKF12Tf": [
    "11월 13일 업데이트 #3",
    1794577975280
  ],
  "j2sqYOAnMr": [
    "11월 13일 업데이트 #2",
    1794556316451
  ],
  "Nwnld2LPkc": [
    "11월 13일 업데이트 #1",
    1794532540243
  ],
  "LXu_9H38K5": [
    "11월 12일 업데이트",
    1794487226844
  ],
  "1I7txJCDm2": [
    "앞으로의 업데이트 계획",
    1794384155809
  ]
};

/** 정적 글 + 공지 저장소 공지 중 가장 최근 글 (제목: 관리자 편집기로 고친 글(rich)이면 그 제목, 아니면 다시 쓴 정적 제목 우선) */
export function latestDevNote(notices: readonly { id: string; title: string; createdAt: number; rich?: true }[] | null): { id: string; title: string } | null {
  let best: { id: string; title: string; at: number } | null = null;
  const edited = new Map((notices ?? []).filter((n) => n.rich).map((n) => [n.id, n.title]));
  for (const [id, [title, at]] of Object.entries(STATIC_NOTE_TITLES)) if (!best || at > best.at) best = { id, title: edited.get(id) ?? title, at };
  for (const n of notices ?? [])
    if (!best || n.createdAt > best.at) best = { id: n.id, title: n.rich ? n.title : (STATIC_NOTE_TITLES[n.id]?.[0] ?? n.title), at: n.createdAt };
  return best && { id: best.id, title: best.title };
}
