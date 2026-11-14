// Redis 키 (spec §6 + v2 계정·포인트·상점). 묘비 저장소와 계정 저장소가 같은 키를 함께 쓴다.

/**
 * 채널별 묘지 키. 채널마다 묘지가 따로라 목록·랭킹도 채널별이다 (목록 = 그 채널 키 3개를 파이프라인 1회).
 * 1채널은 채널 개편 전 키 이름을 그대로 쓴다 → 운영 Redis의 기존 묘비가 옮기지 않고 그대로 1채널 묘비가 된다.
 *  - meta: HASH. 필드 `{id}` → 압축 JSON, `hidden:{id}` → "1"(숨김), `decor:{id}` → 꾸미기 JSON 배열.
 *    숨김·꾸미기를 같은 해시의 별도 필드에 두면 목록은 여전히 HGETALL 한 번이고, 주인의 수정(HSET {id})이 덮어쓰지 못한다.
 *  - created: ZSET 등록 순 / revive: ZSET 살려주세요 랭킹 / flower: ZSET 헌화 순
 */
export function chKeys(channel: number) {
  const p = channel === 1 ? "graves" : `ch:${channel}:graves`;
  return { meta: `${p}:meta`, created: `${p}:created`, revive: `${p}:revive`, flower: `${p}:flower` };
}

export const K = {
  /** HASH 묘비 id → 채널. 없으면 1채널(채널 개편 전 묘비) */
  graveChannel: "graves:ch",
  reported: "graves:reported",
  /** HASH 묘비 id → 성황당 보관 JSON (계정별) */
  shrine: (accountId: string) => `shrine:${accountId}`,
  /** ZSET `${accountId}|${묘비 id}` → 만료 시각(ms). 만료된 것을 찾아 이미지·키를 정리하는 색인 */
  shrineAll: "shrine:all",
  /** ZSET 계정 id → 모은 포인트 (포인트 랭킹) */
  rankPoints: "rank:points",
  /** ZSET 계정 id → 그 주(KST 월요일 YYYYMMDD)에 모은 포인트. 3주 TTL */
  rankPointsWeek: (week: string) => `rank:points:w:${week}`,
  /** ZSET 계정 id → 사냥터 처치 수 합계 (전체 / 그 주) */
  rankHuntKills: "rank:hunt:kills",
  rankHuntKillsWeek: (week: string) => `rank:hunt:kills:w:${week}`,
  /** ZSET 계정 id → 그 사냥터(난이도) 최단 클리어 ms (작을수록 위, 전체 / 그 주) */
  rankHuntBest: (zone: string) => `rank:hunt:best:${zone}`,
  rankHuntBestWeek: (zone: string, week: string) => `rank:hunt:best:${zone}:w:${week}`,

  // ── 49번 성불 ──
  /** HASH 성불한 묘비 id → 보관 JSON (묘비·채널·반응 수·숨김·꾸미기·성불 시각·이유) */
  passedMeta: "passed:meta",
  /** ZSET 성불한 묘비 id → 성불 시각(ms). 최신 순 목록·최근 성불(빛 연출)용 */
  passedAt: "passed:at",
  /** HASH 묘지 설정: passDays(성불 기간), passEpoch(성불 규칙을 처음 켠 시각 — 그 전에 세운 묘비는 이때부터 센다) */
  graveCfg: "graves:cfg",
  /** STRING 성불 정리 잠금 (여러 함수가 동시에 같은 정리를 하지 않게, 짧은 TTL) */
  passSweep: "graves:passSweep",
  ledger: (id: string) => `acct:${id}:ledger`, // LIST 최근 포인트 사용 기록 {at, amount, reason}, 최대 100개
  activity: (id: string) => `acct:${id}:activity`, // LIST 내 소식 JSON, 최신 먼저 최대 50개
  econ: (day: string) => `econ:${day}`, // HASH earn:{source}/spend:{분류}/refund → 그날 합계 (90일)
  econStaff: (day: string) => `econstaff:${day}`, // HASH econ과 같은 필드, 운영자 계정 활동만 (관리자 경제 통계에서 뺀 것, 90일)
  earnIp: (ipHash: string, day: string) => `earnip:${ipHash}:${day}`, // HASH source → 그 IP 합계. 2일 TTL // ZSET 신고 기록이 있는 묘비 → 지금 세는 신고 수 (관리자 목록용)
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
  stash: (id: string) => `acct:${id}:stash`, // HASH 벗어 둔 꾸미기 itemId → 만료 ms (look과 겹치지 않는다)
  acctGraves: (id: string) => `acct:${id}:graves`, // SET 세운 묘비 id
  earn: (id: string, day: string) => `acct:${id}:earn:${day}`, // HASH source → 점수, `_total`. 2일 TTL
  code: (codeHash: string) => `code:${codeHash}`, // STRING → 계정 id
  // 닉네임 중복 금지: HASH 이름 비교 키(@tomb/protocol nameKey) → 계정 id. 계정 해시의 `nameKey` = 이 계정이 차지한 키,
  // `nameDup` = 색인을 채울 때 이미 다른 계정이 그 이름을 차지해 있었다(기존 중복, 이름은 그대로), `seenAt` = 마지막 입장,
  // `renameRequired` = 휴면(90일)에서 돌아와 닉네임을 다시 정해야 한다
  names: "names",
  attendIp: (ipHash: string, day: string) => `attend:${ipHash}:${day}`, // SET 그 IP에서 오늘 출석 포인트를 받은 계정. 2일 TTL
  // ── 10번 출석 달력 ──
  cal: (id: string, month: string) => `acct:${id}:cal:${month}`, // HASH DD → 그날 받은 포인트, `_month` → 한 달 개근 보상. 100일 TTL
  // (계정 해시 `calInit` = 달력 개편 전 출석을 도장으로 옮겼음, 오늘 적립 해시 `_stay` = 오늘 머무르기 기록 수, `_bonus` = 오늘 받은 접속 보너스 구간 수)

  // ── 11번 선물함 (lib/store/gifts.ts) ──
  giftsAll: "gifts:all", // HASH 선물 id → JSON (전체 발송, 받을 때 계정별 상태만 만든다)
  giftsTo: (id: string) => `gifts:to:${id}`, // HASH 선물 id → JSON (그 계정 앞으로 보낸 것)
  giftState: (id: string) => `gifts:st:${id}`, // HASH 선물 id → "c:{받은 시각}"(받음) | "d"(지움). 31일 TTL
  giftLog: "gifts:log", // LIST 관리자 발송 기록 JSON, 최신 먼저 최대 200개
  giftClaims: "gifts:claims", // HASH 선물 id → 받은 계정 수

  // ── 23번 확성기 (lib/store/megaphone.ts) ──
  // ── 주간 랭킹 1위 보상 (lib/weeklyChamp) ──
  champPaid: "champ:paid", // HASH `${주}:${랭킹}` → 받은 계정 (지급 표시, 한 번만)
  champWeek: (week: string) => `champ:w:${week}`, // STRING 그 주 1위 기록 JSON (처음 정한 것만 — SET NX)
  champWeeks: "champ:weeks", // ZSET 주 → 그 주 월요일 0시(ms) (명예의 전당 목록)
  champLock: (week: string) => `champ:lock:${week}`, // STRING NX EX 지급 잠금
  champSeen: "champ:seen", // HASH 계정 → 1위 알림 창을 본 주
  champAuraOff: "champ:auraoff", // HASH 계정 → "1" (1위 오라 끔)
  champLead: (week: string) => `champ:lead:${week}`, // HASH 랭킹 → 지금 1위 계정 (레이스 1위 바뀜 공지용, 3주 TTL)
  champLeadCool: (board: string) => `champ:lead:cool:${board}`, // STRING NX PX 같은 랭킹 1위 바뀜 공지 간격
  champTest: "champ:test", // HASH 계정 → 시험 1위 JSON {id, bits, until} (테스트 서버 운영자 시험 지급 전용, 주간 기록과 따로)
  megaLog: "mega:log", // LIST 확성기 기록 JSON, 최신 먼저 최대 MEGA_KEEP개
  megaHidden: "mega:hidden", // SET 관리자가 숨긴 기록 id
  megaCool: (id: string) => `mega:cool:${id}`, // STRING NX PX 계정별 도배 제한

  // ── 친구 (lib/store/friends.ts) ──
  friends: (id: string) => `fr:${id}`, // ZSET 친구 계정 id → 맺은 시각 (양쪽에 똑같이)
  friendsIn: (id: string) => `fr:in:${id}`, // ZSET 나에게 신청한 계정 → 신청 시각. 답하지 않은 신청 보관 기간 + 1일 TTL
  friendsOut: (id: string) => `fr:out:${id}`, // ZSET 내가 신청한 계정 → 신청 시각. 같은 TTL

  // ── 50번 소원 분수 (lib/store/wishDay.ts) ──
  wishDay: (id: string, day: string) => `wish:day:${day}:${id}`, // STRING NX EX 계정별 그날(KST) 한 번
};

export const HIDDEN = "hidden:";
export const DECOR = "decor:";
