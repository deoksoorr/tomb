// Redis 키 (spec §6 + v2 계정·포인트·상점). 묘비 저장소와 계정 저장소가 같은 키를 함께 쓴다.

export const K = {
  // HASH. 필드 `{id}` → 압축 JSON, `hidden:{id}` → "1"(숨김), `decor:{id}` → 꾸미기 JSON 배열.
  // 숨김·꾸미기를 같은 해시의 별도 필드에 두면 목록은 여전히 HGETALL 한 번이고, 주인의 수정(HSET {id})이 덮어쓰지 못한다.
  meta: "graves:meta",
  created: "graves:created", // ZSET 등록 순
  revive: "graves:revive", // ZSET 살려주세요 랭킹
  flower: "graves:flower", // ZSET 헌화 순
  reported: "graves:reported", // ZSET 신고 기록이 있는 묘비 → 지금 세는 신고 수 (관리자 목록용)
  revivers: (id: string) => `grave:${id}:revivers`, // SET visitorId (지금 살려주세요 중)
  reviveEarned: (id: string) => `grave:${id}:reviveEarned`, // SET visitorId (포인트를 한 번 받은 사람, 취소해도 남김)
  reports: (id: string) => `grave:${id}:reports`, // SET 신고한 IP 해시 (숨김 판정에 센다)
  reporters: (id: string) => `grave:${id}:reporters`, // SET 신고한 visitorId (재신고 판정)
  reportLog: (id: string) => `grave:${id}:reportlog`, // LIST {at, reason} JSON, 최신 먼저 최대 50개
  decor: (id: string) => `grave:${id}:decor`, // ZSET `${itemId}|${nonce}` → 만료 시각(ms)
  flowerMark: (id: string, visitorId: string) => `flower:${id}:${visitorId}`, // STRING NX EX 86400

  // ── 계정 (id = 방문자 쿠키 vid) ──
  acct: (id: string) => `acct:${id}`, // HASH points, name, createdAt, streak, lastAttend(YYYYMMDD), codeHash
  inv: (id: string) => `acct:${id}:inv`, // HASH itemId → 개수
  look: (id: string) => `acct:${id}:look`, // HASH 부위 → `${itemId}|${만료 ms}`
  acctGraves: (id: string) => `acct:${id}:graves`, // SET 세운 묘비 id
  earn: (id: string, day: string) => `acct:${id}:earn:${day}`, // HASH source → 점수, `_total`. 2일 TTL
  code: (codeHash: string) => `code:${codeHash}`, // STRING → 계정 id
  attendIp: (ipHash: string, day: string) => `attend:${ipHash}:${day}`, // SET 그 IP에서 오늘 출석 포인트를 받은 계정. 2일 TTL
};

export const HIDDEN = "hidden:";
export const DECOR = "decor:";
