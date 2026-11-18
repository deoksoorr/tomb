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
  /** ZSET 계정 id → 총 접속 시간(분). 계정 해시 `stayMin`과 같은 값 (머무르기 기록 수 × 기록 길이, 운영자도 기록한다) */
  rankStay: "rank:stay",
  // ── 유저 활동 (lib/store/userActivity.ts, 관리자 「유저 활동」) ──
  /** SET 그 게임 날짜(YYYYMMDD)에 활동한 계정 (입장·그날 첫 머무르기). 120일 TTL */
  actDay: (day: string) => `act:d:${day}`,
  /** HASH 계정 id → 활동한 날 수 (기록을 시작한 뒤, 날마다 한 번) */
  actDays: "act:days",
  /** STRING 활동 기록이 있는 가장 이른 날 (이 날 전 칸은 「기록 없음」) */
  actSince: "act:since",
  /** ZSET 계정 id → 사냥터 처치 수 합계 (전체 / 그 주) */
  rankHuntKills: "rank:hunt:kills",
  rankHuntKillsWeek: (week: string) => `rank:hunt:kills:w:${week}`,
  /**
   * ZSET 계정 id → 그 사냥터 최단 클리어 ms (작을수록 위, 전체 / 그 주).
   * 11/16 사냥터 id별로 기록한다. 난이도 id(easy·normal·hard·hell) 판은 예전 기록 (더 쓰지 않음 — lib/store/huntBoards)
   */
  rankHuntBest: (zone: string) => `rank:hunt:best:${zone}`,
  rankHuntBestWeek: (zone: string, week: string) => `rank:hunt:best:${zone}:w:${week}`,
  /** ZSET 계정 id → 11/16 그 난이도의 어느 사냥터든 깬 가장 짧은 ms (칭호 「어려움·지옥 완주」용, 전체만) */
  rankHuntClear: (difficulty: string) => `rank:hunt:clear:${difficulty}`,

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
  reports: (id: string) => `grave:${id}:reports`, // SET 숨김 판정에 세는 신고 계정 (11/18 전에는 IP 해시였다 — 남은 값도 한 명으로 센다)
  reporters: (id: string) => `grave:${id}:reporters`, // SET 신고한 visitorId (재신고 판정)
  reportLog: (id: string) => `grave:${id}:reportlog`, // LIST {at, reason, weak?, by?, name?} JSON, 최신 먼저 최대 50개 (by·name = 신고한 계정·캐릭터 이름, 11/18부터)
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
  giftState: (id: string) => `gifts:st:${id}`, // HASH 선물 id → "c:{받은 시각}"(받음) | "d"(지움), `w:{선물 id}` → 지갑에 들어간 포인트(지갑 전용으로 받은 표시). 31일 TTL
  giftLog: "gifts:log", // LIST 관리자 발송 기록 JSON, 최신 먼저 최대 200개
  giftClaims: "gifts:claims", // HASH 선물 id → 받은 계정 수

  // ── 23번 확성기 (lib/store/megaphone.ts) ──
  // ── 주간 랭킹 1위 보상 (lib/weeklyChamp) ──
  champPaid: "champ:paid", // HASH `${주}:${랭킹}` → 받은 계정 (지급 표시, 한 번만)
  champWallet: "champ:wallet", // HASH 지급 표시(mark) → 지갑에 들어간 포인트 (지갑 전용 지급 — 이 표시가 없는 champ:paid는 랭킹에도 들어갔던 이전 지급)
  once: (tag: string) => `fix:${tag}`, // STRING 한 번짜리 정리 표시: "running"(진행 중, TTL) | 결과 JSON(끝남, 영구)
  onceAcct: (tag: string) => `fix:${tag}:acct`, // HASH 계정 → 그 정리로 뺀 양 (계정마다 한 번만)
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
  megaPin: (ch: number) => `mega:pin:ch:${ch}`, // STRING 11/17 그 채널 고정 공지 JSON {scope, ch, text, name, at, accountId} (지울 때까지, TTL 없음)
  megaPinAll: "mega:pin:all", // STRING 11/17 모든 채널 고정 공지 JSON (같은 모양, ch 0)

  // ── 친구 (lib/store/friends.ts) ──
  friends: (id: string) => `fr:${id}`, // ZSET 친구 계정 id → 맺은 시각 (양쪽에 똑같이)
  friendsIn: (id: string) => `fr:in:${id}`, // ZSET 나에게 신청한 계정 → 신청 시각. 답하지 않은 신청 보관 기간 + 1일 TTL
  friendsOut: (id: string) => `fr:out:${id}`, // ZSET 내가 신청한 계정 → 신청 시각. 같은 TTL

  // ── 구글 계정 연결 (lib/store/googleLinks.ts). 구글 고유 번호(sub)는 원문 없이 서버 비밀값 HMAC(subHash)로만 ──
  googleSub: (subHash: string) => `google:sub:${subHash}`, // STRING → 연결된 계정 id
  googleAcct: (id: string) => `acct:${id}:google`, // HASH h = subHash, at = 연결 시각(ms)

  // ── 50번 소원 분수 (lib/store/wishDay.ts) ──
  wishDay: (id: string, day: string) => `wish:day:${day}:${id}`, // STRING NX EX 계정별 그날(KST) 한 번
  // ── 주간 행운권 추첨 (lib/store/lottery.ts). 회차 id = 추첨하는 토요일 YYYYMMDD ──
  lotTickets: (round: string) => `lot:t:${round}`, // HASH 계정 → 산 시각 (회차마다 한 장)
  lotClosed: (round: string) => `lot:closed:${round}`, // STRING 판매 마감 표시 (추첨이 표를 읽기 전에 건다)
  lotSubsidy: (round: string) => `lot:sub:${round}`, // STRING 정수 관리자 지원금 합계
  lotResult: (id: string) => `lot:r:${id}`, // STRING 추첨 결과 JSON (처음 것만 — 한 번만)
  lotHistory: "lot:hist", // LIST 결과 id, 최신 먼저
  lotCarry: "lot:carry", // STRING 정수 다음 추첨으로 넘어가는 상금
  lotLast: "lot:last", // STRING 마지막으로 추첨을 마친 회차 (정식 회차만)
  lotPaid: (id: string) => `lot:paid:${id}`, // HASH 등수·"notice" → 지급·공지 표시
  lotLock: (round: string) => `lot:lock:${round}`, // STRING NX EX 추첨 잠금
  // ── 추천 코드 (lib/store/referrals.ts). 공개 추천 코드라 개인 코드(code:{해시})와 따로 둔다 ──
  refCode: "ref:code", // HASH 추천 코드 → 계정 id
  refMine: "ref:mine", // HASH 계정 id → 추천 코드 (처음 볼 때 만든다)
  refRec: (refereeId: string) => `ref:r:${refereeId}`, // HASH by(추천인)·at·via(signup|later)·ip(가입 IP 해시)·same(같은 사람 1/0)·rs(판정 이유)·hold·q(조건 달성 ms, 0 = 아직)·rr·er(추천인·새 이웃 보상 1/0)·gb(추천인의 추천인)·gr(2단계 보상 paid|cap|skip:이유)
  refOf: (referrerId: string) => `ref:of:${referrerId}`, // ZSET 데려온 이웃 → 정한 시각
  refRecent: "ref:recent", // ZSET 데려온 이웃 → 정한 시각 (관리자 최근 목록)
  refJoined: "ref:joined", // ZSET 추천인 → 가입 수
  refQual: "ref:qual", // ZSET 추천인 → 조건 달성 수
  refCredit: "ref:credit", // ZSET 추천인 → 칭호에 세는 수 (조건 달성 중 같은 곳 가입이 아닌 것)
  refPaid: "ref:paid", // ZSET 추천인 → 포인트를 받은 수
  refMonth: (month: string) => `ref:mon:${month}`, // HASH 추천인 → 그달(KST YYYYMM) 받은 수. 70일 TTL
  refStats: "ref:stats", // HASH entered·qualified·paidReferrer·paidReferee·same → 전체 합계
  refCfg: "ref:cfg", // HASH mode → review(모두 확인, 없을 때 기본) | auto(점수로 자동) | off(기록만). 예전 auto = "0"은 off로 읽는다
  refGJoined: "ref:gjoined", // ZSET 추천인의 추천인 → 친구가 데려온 이웃 수 (2단계, 칭호와 무관)
  refGPaid: "ref:gpaid", // ZSET 추천인의 추천인 → 2단계 보상을 받은 수
  refGMonth: (month: string) => `ref:gmon:${month}`, // HASH 추천인의 추천인 → 그달(KST) 2단계 보상 받은 수. 70일 TTL
  refHeld: "ref:held", // ZSET 확인 기다리는 새 이웃 → 조건 달성 시각 (관리자 확인 목록, 오래된 것 먼저)
  // ── 같은 사람 신호 (lib/store/signals.ts). kind = dev(기기 표시) · fp(브라우저 환경) · net(IP 대역). 값은 모두 서버 비밀값 HMAC ──
  sig: (kind: string, hash: string) => `sig:${kind}:${hash}`, // ZSET 계정 → 마지막으로 본 시각. 90일 TTL
  sigOf: (kind: string, accountId: string) => `sig:${kind}:a:${accountId}`, // ZSET 해시 → 마지막으로 본 시각. 90일 TTL

  // ── 11/15 캠핑장 바베큐 (lib/store/bbqDay.ts) ──
  // 하루 접시·잔 한도는 없앴다 (예전 camp:bbq:{day}:{id} 키는 2일 뒤 저절로 사라진다)
  campDrunk: (id: string) => `camp:drunk:${id}`, // STRING JSON {lv, at} EX 다 깨는 시각까지(+10분) 계정별 지금 취기
};

export const HIDDEN = "hidden:";
export const DECOR = "decor:";
