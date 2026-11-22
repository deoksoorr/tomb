// 서버·클라이언트가 공유하는 상수. 용량 관련 값은 실제로는 Worker 환경변수로 덮어쓴다(기본값만 여기 둔다).

export const DEFAULT_CHANNEL_CAPACITY = 60;
export const DEFAULT_MAX_CHANNELS = 10;
/**
 * 평소 열어 두는 채널 수 (1..BASE). 그 위 채널은 열린 채널이 모두 혼잡(AUTO_OPEN_THRESHOLD)하면 하나씩 열리고,
 * 사람이 있거나 최근(로비 재확인 간격 안)에 있었던 동안 열려 있다. 닫힌 채널도 직접 들어갈 수는 있다(채널별 주거 구역의 집 주인)
 */
export const DEFAULT_BASE_CHANNELS = 2;
export const DEFAULT_AUTO_OPEN_THRESHOLD = 0.8;
export const DEFAULT_RECONNECT_GRACE_SEC = 20;

/**
 * 서버 브로드캐스트 틱 (델타 SNAPSHOT 주기).
 * 명세는 100ms였지만, 운영 실측(한국 → Cloudflare apac DO 왕복 약 76ms)에서 틱 대기(0~100ms)가 더해져
 * 이동→상대 수신 지연 p95가 193ms로 기준(150ms)을 넘었다. 명세 8절에 따라 틱을 50ms로 줄였다.
 * 클라이언트 전송(MOVE)은 그대로 최대 10Hz라 DO 요청 수(=요금)는 늘지 않는다. 송신은 무료.
 */
export const TICK_MS = 50;
/** 클라이언트 MOVE 최대 전송 주기 (10Hz) */
export const SEND_INTERVAL_MS = 100;
/**
 * 11/17 상태·방향은 그대로인 채 위치만 바뀌는(꾸준히 걷는) 동안의 MOVE 간격. 상태·방향이 바뀌면 SEND_INTERVAL_MS 그대로 바로 보낸다.
 * 수신 메시지 20건 = DO 요청 1건이라 MOVE가 Channel DO 요청의 대부분이다. 받는 쪽 보간(경로 따라가기 + 적응형 버퍼)이
 * 도착 간격에 맞춰 버퍼를 늘리므로 매끄러움은 그대로이고(netsim: 속도 변동·멈칫·뒤로 밀림 같음), 원격 아바타가 약 50ms 늦게 보인다.
 * 꾸준히 걷는 동안 MOVE 수 약 30% 감소 (10Hz → 약 6.7Hz)
 */
export const MOVE_STEADY_MS = 150;
/**
 * 11/17 방(집·사냥터)에 나 혼자일 때의 꾸준한 걷기 MOVE 간격. 받을 사람이 없어 서버 위치만 맞추면 된다.
 * 누가 들어오면 바로 지금 자세를 한 번 보내고 MOVE_STEADY_MS로 돌아간다 (걷기 0.5초 ≈ 28px — 순간이동 거리 96px보다 짧아 들어온 사람 화면에서도 미끄러져 맞는다)
 */
export const ROOM_SOLO_STEADY_MS = 500;
/**
 * 원격 아바타 보간 지연 버퍼. 명세는 120ms였지만 틱을 50ms로 줄인 뒤에는 한 사람의 샘플 간격이
 * 전송 간격(≥100ms, 프레임 단위로 ~117ms)+틱 대기(≤50ms) ≈ 최대 170ms가 되어, 120ms 버퍼가 자주 비고
 * 외삽 후 되돌림(뒤로 1~3px)이 생겼다. 걷는 중엔 외삽 없이 보간만 하도록 버퍼를 샘플 간격에 맞췄다.
 */
export const INTERP_DELAY_MS = 170;
/** 패킷이 끊겼을 때 외삽 최대 시간 */
export const EXTRAPOLATE_MAX_MS = 200;
/** 이 거리보다 멀리 이동하면 보간 없이 즉시 이동 */
export const TELEPORT_DIST = 96;

export const MAX_MESSAGE_BYTES = 512;
/** 연결당 초당 메시지 상한 */
export const RATE_LIMIT_PER_SEC = 20;
/** 상한 초과가 이 시간(초) 연속되면 4008로 끊는다 */
export const RATE_LIMIT_KICK_SEC = 10;

export const JOIN_TOKEN_TTL_SEC = 60;

/** 채널 목록 폴링 (입장 화면·채널 창). 11/17 5초 → 10초: 화면 하나당 로비 DO 요청을 줄인다 (탭이 숨으면 아예 멈춘다) */
export const LOBBY_POLL_MS = 10_000;
/** GET /lobby 캐시 (Worker 아이솔레이트 메모·엣지·Vercel 서버 메모). 11/17 2초 → 5초 */
export const LOBBY_CACHE_SEC = 5;
export const SPECTATOR_POLL_MS = 30_000;
/** 접속자 목록 자가 복구 주기 (C2S sync) */
export const PEER_SYNC_MS = 60_000;
export const EMPTY_CHANNEL_HIDE_MS = 5 * 60_000;
export const LOBBY_DEBOUNCE_MS = 1_000;
export const LOBBY_SNAPSHOT_MS = 30_000;
export const MAX_JOIN_RETRIES = 3;

/** WebSocket close codes */
export const CLOSE = {
  CHANNEL_FULL: 4001,
  REPLACED: 4002, // 같은 visitorId가 다른 탭/기기에서 접속
  INVALID_TOKEN: 4003,
  BAD_REQUEST: 4004,
  RATE_LIMITED: 4008,
  OUTDATED: 4010, // 클라이언트가 MIN_CLIENT_VERSION보다 낮다 → 새로고침해야 한다 (자동 재접속하지 않음)
  // 47번 운영: 옛 클라이언트는 모르는 코드라 평소처럼 재접속을 시도하고, 입장 토큰 거절(403)에서 멈춘다
  KICKED: 4011, // 운영자가 지금 내보냄 (정지는 아님) → 자동 재접속하지 않고 안내만
  BANNED: 4012, // 이용 제한(정지·IP 차단) → 자동 재접속하지 않고 제한 화면으로
} as const;
export type CloseCode = (typeof CLOSE)[keyof typeof CLOSE];

// ── 클라이언트 버전 (큰 패치 강제 새로고침) ──
/**
 * 이 빌드의 클라이언트 호환 버전. **맵·프로토콜이 바뀌는 큰 패치에서만 1 올린다 (이 한 줄).**
 * - 웹 클라이언트는 실시간 접속 URL에 `&v=CLIENT_VERSION`을 붙인다.
 * - 실시간 서버는 자기 빌드의 MIN_CLIENT_VERSION보다 낮은 클라이언트를 CLOSE.OUTDATED(4010)로 거절한다.
 * - /api/version이 minClient로 이 값을 알려 주므로, 옛 화면은 접속이 끊기기 전에도 업데이트 창을 띄운다.
 * 평소 패치(버전 그대로)는 배포 id만 바뀌어 아래쪽 배너로 안내된다.
 */
// 2 = 가을·겨울 마을 맵 개편(1·50번: 넓은 고정 맵·강·광장·주거 구역, 해먹 상태 STATE.hammock=10, 다시 피어날 자리 제거)
// 3 = 조각배·광장 놀거리(50번: STATE.boat~carousel=11~14 — 옛 클라이언트는 모르는 상태 값이 든 SNAPSHOT을 통째로 버린다)
// 4 = 컴팩트한 묘지 마을 맵(F1: 1440×1024, 좌석·낚시 자리·배·필지 좌표가 바뀜 — 옛 화면은 없는 좌석 id를 보낸다)
// 5 = 집 안 개편(3번: STATE.lie~bath=15~17 — 옛 클라이언트는 모르는 상태 값이 든 SNAPSHOT을 통째로 버린다, 방 좌석·use 이벤트)
// 6 = 낚시터(호수 북동쪽 데크·낚시 자리 재배치·벤치 lE 이동 — 옛 화면은 없어진 낚시 자리·옛 벤치 좌표로 앉기를 보낸다)
// 7 = 동물원(버드나무 묘역 자리 — 울타리·우리 충돌, 묘비 자리 재배치, 벤치 bX 이동)·타는 펫(ride 이벤트) — 옛 화면은 우리 안을 걷고 묘비를 옛 자리에 그린다
// 8 = 관람차·열기구(STATE.ferris·balloon=18·19 — 옛 클라이언트는 모르는 상태 값이 든 SNAPSHOT을 통째로 버린다, 광장 남쪽 관람차 받침 충돌)
// 11 = 말풍선 자유 채팅(chat 이벤트, Enter 키가 상호작용 대신 채팅 입력칸 — 옛 화면은 남의 채팅을 못 본다)
// 12 = 저장소(Redis) 사용량 절감 — 예전 화면의 잦은 확인 호출을 끊으려고 모두 한 번 새로고침시킨다 (11/14)
// 13 = 휴식 중 어두운 막 없앰 — 창을 옆에 띄워 두고 구경하는 플레이가 되게 모두 한 번 새로고침 (11/14)
// 14 = 지옥 사냥터 2곳·사냥터 기준 EXP·레이스 — 모두 한 번 새로고침 (11/15)
// 15 = 사냥 끝판 1단계(초월 레벨·번아웃 단계)·끝판 칭호 id — 모두 한 번 새로고침 (11/15)
// 16 = 운영자 이름표·전용 칭호(운영자도 닉네임 그대로, 머리 위 「운영자」) — 모두 한 번 새로고침 (11/15)
// 17 = 야근 빌딩·스킬 자동·떠다니는 조이스틱·수집 의뢰·의뢰 보상·귀여운 꾸미기·오리배 — 모두 한 번 새로고침 (11/15)
// 18 = 야근 빌딩 서버실·회의실 테마·엘리베이터·능력 카드, 지도 개편(분양 3칸·동물원·오리 연못·납품 부두), 초월 하루 제한 없앰 — 모두 한 번 새로고침 (11/15)
// 19 = 분양 1~9번지·버스 정류장 광장 이동·의뢰는 납품 부두 게시판에서만·이달의 교환소·새 보상 6종·야근 빌딩 층 순서표·렉 줄이기·기본 공격 직접 — 모두 한 번 새로고침 (11/15)
// 20 = 기록 수족관 → 주말 버스 정류장(납품 부두), 쉼터 광장, 이달의 교환소 11월 큰 목표·미리 보기 3칸 — 모두 한 번 새로고침 (11/15)
// 21 = 야근 빌딩 테마 6곳·무작위 순서, 세트 장비·강화·재료·장비창, 우두머리 상자(빔·제한 없음·꾸미기 기간 무작위), 체크포인트 도착 기준 — 모두 한 번 새로고침 (11/15)
// 22 = 능력 카드 5등급(일반·매직·레어·유니크·전설)·새 카드 16장·사냥 중 능력치 판, 세트 장비 입은 모습·강화 수치 표시·장신구 따로 강화·재료 절반, 야근 빌딩 캐릭터 밝기 — 모두 한 번 새로고침 (11/15)
// 23 = 사냥 중 상점 장비도 입기·세트 머리 장비 크게, 같이 사냥하는 사람에게도 사냥 장비가 보이게(입장 토큰 서명), 강화 몫 주황 — 모두 한 번 새로고침 (11/15)
// 24 = 상자·머그잔·튜브 몸에서도 갑옷이 보이게, 어두운 갑옷 밝은 테 — 모두 한 번 새로고침 (11/15)
// 25 = 스킬 배율·SP 회복 상향, 야근 빌딩 카드 등급만큼 스킬 피해 +·속성 카드가 스킬에도, 카드 문구 주어 정리 — 모두 한 번 새로고침 (11/15)
// 26 = 어디서 보든 같은 몸·색(운영자 표시는 낫·오라·칭호만), 사냥 장비창 인형에 갑옷·머리·장신구, 사냥 중 운영자 오라 뒤로·연하게, 마을 색조 캐릭터엔 절반 — 모두 한 번 새로고침 (11/15)
// 27 = 긴급 의뢰(20분·다 같이 채우기·축제·사이렌 모자), 게임 전체 문구 쉬운 말로·유령 마을 컨셉, 별자리(망원경 두 대·보는 중 캐릭터 그대로·권장 DEX), 내 정보 오늘 포인트 게이지, 낚시 조금 어렵게 — 모두 한 번 새로고침 (11/15)
// 28 = 긴급 의뢰 100% 축하 폭죽(양옆까지)·불꽃축제 30초 타이머·시험 버튼도 내 기여·뒷주머니 상자는 가방에서 직접 열기, 운영은 URGENT_ENABLED=1일 때만 긴급 의뢰 — 모두 한 번 새로고침 (11/15)
// 29 = 언젠가 캠핑장 1차(여러 맵·같은 채널 안 맵 이동·주말 버스·캠핑장 맵·NPC 5명, 테스트 서버만 — 운영은 CAMP_ENABLED=1일 때만) — 모두 한 번 새로고침 (11/15)
// 30 = 캠핑장 수정(정류장·전망대 망원 뷰·캠핑카 앞마당·캠핑장 채집·버스 유턴·돌아가는 창밖 반대로·채널 전체 인원), 납품 부두 좁힘, 긴급 의뢰 끝 문구·마을 공지 바로 뜨기 — 모두 한 번 새로고침 (11/15)
// 31 = 버스 유턴 없앰(마을은 오른쪽에서 와서 왼쪽으로, 캠핑장은 섰다가 흐려짐)·창밖 끊김 고침(미리 나눠 굽기)·IC 표지판, 납품 부두 없앰(어부 노점 호박밭 옆), 캠핑장 바베큐장(먹으면 잠깐 커짐) — 모두 한 번 새로고침 (11/15)
// 32 = 범퍼카장(강 아래 묘역 자리)·묘역 하나로 합침(32칸), 캠핑장 먹거리·술(취기)·잔상 메뉴·3배 통삼겹·한도 없음, 모바일 채팅 기록 창 — 모두 한 번 새로고침 (11/15)
// 33 = 캠핑장 음료 자판기·컨디숑·효과 게이지, 커진 동안 탈 것 금지, 범퍼카 벽에서 내리기, 채팅 최근 50줄 — 모두 한 번 새로고침 (11/16)
// 34 = 캠핑장 이동 답이 늦으면 두 번 더 보내 봄(내리자마자 마을로 돌아오던 문의) — 모두 한 번 새로고침 (11/16)
// 35 = 같은 채널이면 마을·캠핑장 채팅이 서로 보임(다른 맵 줄 앞에 [캠핑장]·[마을]), 지난 채팅 기록도 채널 하나 — 모두 한 번 새로고침 (11/16)
// 36 = 캠핑장 의자에 앉은 다른 사람이 의자 뒤에 보이던 것·정류장 벤치 뒷벽 가림 고침, 커지면 운영자 낫·소품도 같이 커짐, 2배 넘게 커지면 캠핑카 문간·정류장 벤치에 못 앉음 — 모두 한 번 새로고침 (11/16)
// 37 = 귓속말·행운권 판매대·창 단축키·운영자 포인트 현황·추천 코드·몬스터 도감·범퍼카장/오리 연못 넓힘·오리배 아무 둑에서 내리기·1위 배지 「지난주」 — 모두 한 번 새로고침 (11/16)
// 38 = 귓속말 최근 상대 칩·/답 답장·접속 확인(whoOn), 포인트 이벤트 공지·즉시 반영, 레이스 창 표준 크기, 랭킹 창 넓힘 — 모두 한 번 새로고침 (11/16)
// 39 = 꽉 찬 채널 이동 막기·이름표 묶음째 비키기·오리배/조각배 앞뒤 모습·폰 안내 문구·모바일 채팅 늘 보이기·부동산 이름 겹침·축제 금빛 모닥불·긴급 의뢰 한 사람 몫·닉네임 8자·보안 패치 — 모두 한 번 새로고침 (11/16)
// 40 = 세 번째 맵 달물결 포구 1차 바탕(옛 묘역 아래 바닷가행 정류장·바닷가 버스·물때·갈매기, 테스트 서버만 — 운영은 SEA_ENABLED=1일 때만), 서쪽 모닥불 치움 — 모두 한 번 새로고침 (11/16)
// 41 = 바닷가 다시 칠하기·사냥터별 랭킹·야근 빌딩 먼저 도달 순·칭호 능력 개편·칭호 창 자세히 칸·렌더 최적화 — 모두 한 번 새로고침 (11/16)
// 42 = 달물결 포구 길 줄이기·오두막 터 배치·갯바위·유령선 자리 (바닷가 맵 3) — 모두 한 번 새로고침 (11/16)
// 43 = 바닷가 파도 이어짐·세게, 간조 갯벌 무늬 정리, 갯바위·선착장 끝 낚시, 바닷가 벤치 앉기 고침 (바닷가 맵 4) — 모두 한 번 새로고침 (11/16)
// 44 = 바닷가 낚시 물때 규칙(물 빠지면 못 낚음, 서버도 막음)·방파제 곶 낚시 자리 옮김 — 모두 한 번 새로고침 (11/16)
// 45 = 바닷가 쉴거리 자리(벤치·선베드·파라솔 돗자리·돗자리·선착장/방파제 끝)·바다 보기(V)·갈매기 소리 (바닷가 맵 5) — 모두 한 번 새로고침 (11/16)
// 46 = 해변 선베드·파라솔 줄 배치·선베드 수건·쉴거리 앉기 안내, 그림 오른쪽 잘림 공통 수정, 앉기 거절 다시 청하기 (바닷가 맵 6) — 모두 한 번 새로고침 (11/16)
// 47 = 바닷물고기 10종·갯벌 캐기 10종·포구 시장, 포구 매점(술), 선베드 두 줄·막힘, 파라솔 겹침, 벤치 바다 보기 앞줄, 물때 범위 조정 (바닷가 맵 7) — 모두 한 번 새로고침 (11/16)
// 48 = 바닷가 맵 세로 줄임·포구 시장 뺌·별장 흩어 놓기·선착장/방파제 짧게·바다 보기 좌우 원근·등대 오르기·등대지기·안개 무적 (바닷가 맵 8) — 모두 한 번 새로고침 (11/16)
// 49 = 바닷가 오두막 분양·등대 등불·매점/자판기·피크닉 탁자·해변 모닥불·바다 아래 확장·튜브·제트스키·낚싯배 뺌·방파제 늘림·탈것 탄 채 사냥터 막기 (바닷가 맵 11) — 모두 한 번 새로고침 (11/16)
// 50 = 바닷가 가운데 정렬·건물 문 막기·제트스키 부잔교·놀거리 헤엄 충돌·튜브 머리만/떠밀림·결 넣기, 오두막 해먹 진짜 자세·소라·튜브 끼기·부동산 창 마을과 같게·문 앞 들어가기, 사냥 버튼 자동 걷기, 마을 배 헤엄 충돌 (바닷가 맵 12) — 모두 한 번 새로고침 (11/16)
// 51 = 먼바다 배·뱃고동·밤 오징어잡이배, 바닷가 정류장 동쪽으로, 해먹 바다 보기 장면 (바닷가 맵 13) — 모두 한 번 새로고침 (11/16)
// 52 = 선착장 늘림·서쪽 낚시 가지·끝 데크 걸터앉기·넓은 부잔교 다리·데크 난간, 배가 물에 잠겨 보이게·바다 장면 배 도트, 바닷가 재질 결(캠핑장 수준) (바닷가 맵 14) — 모두 한 번 새로고침 (11/16)
// 53 = 바닷가 톤을 마을·캠핑장에 맞춤(진한 테두리·그늘·땅 한 톤), 부동산·이름표 마을과 같게, 갯바위 5가지 모양, 바다 보기 장면 고침 (11/16)
// 54 = 바닷가 데크 난간 두껍게·헤엄쳐 데크로 튀어 들어가던 것 막음, 테두리를 물건마다 제 색에서 (11/16)
// 55 = 카약 선착장(2인), 끝자리 가장자리 걸터앉기, 데크·물가 움찔거림, 튜브·제트스키·카약 탄 모습, 카약 선착장은 선착장 서쪽 (바닷가 맵 16) — 모두 한 번 새로고침 (11/16)
// 56 = 카약 선착장 서쪽 이전·외치기 삭제, 미니맵 비율, 부딪히면 튕기기, 망원경 9대 추가(마을 맵 15·캠핑장 3), 바닷가·캠핑장 주민 — 모두 한 번 새로고침 (11/16)
// 57 = 바닷가 망원경 E 늘 별자리·V 바다 보기·자리 옮김, 카약 다리 넓힘·입구 판, 난간 이음매 떨림, 가구 공용 창고 (바닷가 맵 17) — 모두 한 번 새로고침 (11/16)
// 58 = 바닷가 망원경 바다 보기를 쌍안경 전용 장면으로 (방파제 대신 먼바다) — 모두 한 번 새로고침 (11/16)
// 59 = 바라보는 장면(바다 보기·등대·망원경·캠핑장 전망대) 동안 단축키 막기, 채팅·V·Esc만 — 모두 한 번 새로고침 (11/16)
// 60 = 오징어잡이배·등대 불빛 아주 밝게, 지나가는 배에 부딪히면 튕김·뱃머리 물결, 비 옅게 — 모두 한 번 새로고침 (11/16)
// 61 = 바다→마을 버스 멈춤 고침(망원경 정리 예외로 게임 루프 정지) — 모두 한 번 새로고침 (11/16)
// 62 = 비·안개·눈·구름 그림자 반복 무늬 없앰(바람·빗발 노이즈, 안개 조각) — 모두 한 번 새로고침 (11/16)
// 63 = 바다에서 다른 사람·다른 사람이 탄 것과도 튕기기, 포인트 부족 금액 표시, 몬스터 도감 번호 잘림 — 모두 한 번 새로고침 (11/16)
// 64 = 이스터에그 「다람쥐를 뿌려라」(채널 10분 쿨, 하늘에서 다람쥐 와다다) — 모두 한 번 새로고침 (11/16)
// 65 = 다람쥐 쿨타임 운영자에게만 남은 시간·운영자 「다람쥐 초기화」 버튼 — 모두 한 번 새로고침 (11/17)
// 66 = 사냥터·야근 빌딩 채팅([사냥터] 꼬리표), 능력 카드 전수조사(팀장 승진 빠진 곳·법인카드/연차 겹침), 다람쥐 안내에 외친 사람 이름, 빌딩 남은 시간 표시 — 모두 한 번 새로고침 (11/17)
// 67 = 연차 몰아 쓰기 떨어지는 순간에만·설명 5초, 사내 정치 승진은 피해에만 — 모두 한 번 새로고침 (11/17)
// 68 = 지옥 사냥터 경험치 배율 11→4 (한 판 약 3레벨 → 약 1레벨, 초월 경험치는 그대로) — 모두 한 번 새로고침 (11/17)
// 69 = 주간 레이스 1위 1주일 혜택(사냥왕·낚시왕·포인트왕, 다관왕 이동 속도), 레이스 창 1위 보상 안내, 상점 할인 표시 — 모두 한 번 새로고침 (11/17)
// 70 = 확성기 고정 공지, 폰 사냥 중 채팅 끄기, 마을 이름 「기억숲 마을」·화면 위 채널 표시·채널 창 문구, 레이스 창 1주일 혜택 상자 — 모두 한 번 새로고침 (11/17)
// 71 = 겨울·크리스마스 맵 컨셉(마을·캠핑장·바닷가·사냥터·야근 빌딩·NPC 옷), 유령선 특가 장터, 갈매기 과자, 낙법, 넋 흡혈 조정, 새 폭죽·코디·펫·루돌프 썰매, 접속자 전체 선물, 배경음악 목록 교체 — 모두 한 번 새로고침 (11/17)
// 72 = 캠핑장 눈사람 만들기(겨울·크리스마스 판 — 눈더미·굴리기·쌓기, 세운 눈사람은 같은 채널 모두에게·1시간 뒤 녹음, snowman 이벤트) — 모두 한 번 새로고침 (11/17)
// 73 = 캠핑장 눈사람 만드는 과정도 같은 캠핑장에(안고 다니기·굴리기·쌓는 중인 덩이), 다른 사람 자리엔 못 놓음, 눈사람은 못 지나감 (snowHold·snowPut·snowAdd·snowTake) — 모두 한 번 새로고침 (11/18)
// 74 = 눈사람은 한 사람이 서 있는 것과 쌓는 중인 것을 합쳐 2개까지 (다 차면 녹을 때까지 새로 못 만든다), 마을·캠핑장 눈싸움 (snowball·snowHit) — 모두 한 번 새로고침 (11/18)
// 75 = 11/19 「편하게 노는 게임」 개편 묶음: 옛 묘역을 별 보기 언덕 서쪽으로(묘비 16기·작게, 계단·아치·성황당 없앰, 입구는 달빛 연못 쪽, 열기구 출발장 옮김),
//      언덕 아래 등불 골목 10~15번지 집터·2단지 닫음, 포구 오두막 터 11곳, 스킬트리 v3(삽자루 일꾼·초월 수련)·야근 빌딩 카드 조정, 강화 개편·강화 승계,
//      야근 빌딩 상자 규칙·초월 경험치 줄임, 가방 300, 왼쪽 위 음악·확성기 한 줄 — 모두 한 번 새로고침 (11/19)
// 76 = 사냥 포인트 적정 레벨(★58부터 사냥터 포인트 없음·야근 빌딩 적정 층)과 경고 배너, 집 외관 겨울·크리스마스 파츠,
//      긴급 의뢰 무작위 꾸미기·행운의 배달부·받은 의뢰 목록 정리 — 모두 한 번 새로고침 (11/19)
// 77 = 11/20 겨울 업데이트: 계절·가구 보따리상(코디 13벌 주 1회·2주 판매, 시즌 가구), 분양사 보리·품종 펫, 총무팀 문대리(맵 지문 바뀜), 강화 증폭권·하락 없음·천장,
//      다른 마을 채팅 이름 꾸미기(ns), 닉네임 바로 반영, 야근 빌딩 분위기 층·층 포인트, 범퍼카 미션 — 모두 한 번 새로고침 (11/20)
// 78 = 11/21 판교의 등대·회장님 독대(1위 꾸미기·칭호), 분양 사무소·야근 빌딩 자리 이동(맵 지문 바뀜), 새 폭죽·광역 불꽃쇼(쇼 한 번에 하나),
//      운영자 순간이동·정원 제외, 확성기 → 마을 소식 — 모두 한 번 새로고침 (11/21)
// 79 = 회장님 독대 2관왕 전용 꾸미기·칭호(chair_duo_crown·chair_aura_stamp·t_chairDuo) — 모두 한 번 새로고침 (11/21)
// 80 = 골목 붕어빵 수레 한정 꾸미기 12종·외형 「붕어빵 장수 유령」(vendor)·칭호 둘(t_ssCampus·t_ssDate) — 모두 한 번 새로고침 (11/22)
// 81 = 물고기 크기 등급(대물·월척 — 가방 칸 id f_x~1/~2)·물고기 값 ×1.3·자동 낚시 시간 제한 없앰, 위쪽 HUD 정리 — 옛 화면은 등급 칸·새 값을 몰라 한 번 새로고침 (11/22)
export const CLIENT_VERSION = 81;
/** 실시간 서버가 받는 최소 클라이언트 버전. 따로 올리지 않는다 — 언제나 이 빌드의 CLIENT_VERSION */
export const MIN_CLIENT_VERSION = CLIENT_VERSION;
/** v 파라미터가 없는 옛 클라이언트(버전을 보내기 전 빌드)는 1로 본다. 1과 프로토콜이 같다 */
export const LEGACY_CLIENT_VERSION = 1;

/** 접속 URL의 v 값 → 버전. 없거나 이상하면 LEGACY_CLIENT_VERSION */
export function parseClientVersion(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || !/^\d{1,6}$/.test(raw)) return LEGACY_CLIENT_VERSION;
  return Number(raw);
}

/** text 프레임 heartbeat. DO는 setWebSocketAutoResponse로 응답해서 깨어나지 않는다. */
export const PING = "ping";
export const PONG = "pong";

// ── 이동 (월드 좌표 = 스케일 전 픽셀, 16px 타일. 화면에는 3배 줌으로 그린다) ──
export const WALK_SPEED = 56; // px/s
export const RUN_MULTIPLIER = 1.8;
export const RUN_SPEED = WALK_SPEED * RUN_MULTIPLIER;
/** 서버 검증: 달리기 최대 속도 × 1.5를 넘는 이동은 무시 */
export const SPEED_TOLERANCE = 1.5;
export const MAX_VALID_SPEED = RUN_SPEED * SPEED_TOLERANCE;
/** 점프: 체공 시간과 최고 높이(화면 연출용, 월드 좌표는 바뀌지 않는다). 체공 중엔 묘비 충돌을 끈다 */
export const JUMP_MS = 450;
export const JUMP_HEIGHT = 10;
/** 앉기 키를 눌렀을 때 의자를 찾는 반경 */
export const SEAT_SEARCH_RADIUS = 24;
/** 서버가 좌석 점유 요청을 받을 때 허용하는 플레이어-좌석 거리 (지연 여유 포함) */
export const SEAT_SERVER_RADIUS = 40;
/** 랭킹 클릭 순간이동(warp) 최소 간격 */
export const WARP_COOLDOWN_MS = 1_000;

/** 아바타 색 프리셋. 토큰에는 이 중 하나의 hex 문자열이 들어간다. */
export const AVATAR_COLORS = [
  "#e8d9b0", // 뼛빛
  "#9fc5a8", // 이끼
  "#8fb3d9", // 새벽안개
  "#d9a38f", // 황토
  "#c3a6d9", // 라벤더
  "#e0c36a", // 촛불
] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

/** 처음 고르는 몸 모양 6종 (무료. 새로 시작할 때 고른다. 계정에 저장되어 코드·이어서 들어가기에선 그대로) */
export const STARTER_BODIES = [
  { id: "hood", label: "후드 유령" },
  { id: "cat", label: "고양이 유령" },
  { id: "bun", label: "토끼 유령" },
  { id: "sheet", label: "이불 유령" },
  { id: "tall", label: "키다리 유령" },
  { id: "round", label: "동글 유령" },
] as const;

/**
 * 프리미엄 외형 등급과 선택권 값 (포인트). 선택권 = 영구 해금 + 그 외형으로 바꾸기 한 번.
 * 해금한 외형끼리(처음 6종 포함)는 그 뒤로 무료로 바꾼다 (소장).
 * I0d 경제 기준(하루 약 200P): 일반 ≈ 1주, 고급 ≈ 작은 집값, 희귀 ≈ 2주 반, 전설 ≈ 한 달
 */
export const BODY_TIERS = ["common", "fine", "rare", "legend"] as const;
export type BodyTier = (typeof BODY_TIERS)[number];
export const BODY_TIER_INFO: Readonly<Record<BodyTier, { label: string; price: number }>> = {
  common: { label: "일반", price: 1200 },
  fine: { label: "고급", price: 2000 },
  rare: { label: "희귀", price: 3200 },
  legend: { label: "전설", price: 5000 },
};

/** 상점 「염색·외형」에서 선택권으로 해금하는 몸. 그림은 처음 6종 중 하나를 바탕(web sprites/avatar BODY_BASE)으로 덧그린다 */
export const PREMIUM_BODIES = [
  { id: "suit", label: "정장 유령", tier: "common", desc: "넥타이까지 맨 출근 완성형. 포인트 색은 넥타이예요." },
  { id: "box", label: "박스 유령", tier: "common", desc: "택배 상자에서 나오기 싫은 날. 포인트 색은 테이프예요." },
  { id: "umbrella", label: "우산 유령", tier: "fine", desc: "비 예보만 보면 노란 비옷에 장화, 큰 우산까지 펴 들고 출근하는 유령. 포인트 색은 우산과 장화예요." },
  { id: "catmask", label: "고양이 탈 직장인", tier: "fine", desc: "고양이 탈을 쓰면 아무도 일을 안 시킬 거라 믿는 직장인. 포인트 색은 사원증 줄이에요." },
  { id: "cup", label: "커피잔 유령", tier: "rare", desc: "커피잔에 몸을 담그고 하루를 버텨요. 포인트 색은 컵 띠예요." },
  { id: "tube", label: "오리 튜브 유령", tier: "rare", desc: "마음만은 이미 휴가지. 포인트 색은 오리 튜브예요." },
  { id: "king", label: "왕관 유령", tier: "legend", desc: "망토와 왕관을 두른 이 구역의 진짜 주인. 포인트 색은 왕관이에요." },
] as const;

/** 운영자(31번) 계정만 쓸 수 있는 몸. 서버(web 외형 바꾸기·입장 토큰, 실시간 서버)가 운영자가 아니면 막는다 */
export const STAFF_BODIES = [{ id: "reaper", label: "저승사자", desc: "갓과 검은 도포의 저승사자. 운영자 전용이에요. 포인트 색은 갓끈 구슬이에요." }] as const;

/**
 * 11/15 수집 의뢰 보상 외형: 선택권으로 살 수 없고, 도장 교환소에서 받은(items q_body_collector) 계정만 바꿀 수 있다
 * (web 외형 바꾸기가 소장 목록을 확인한다). 등급 연출은 프리미엄 외형과 같다
 */
export const QUEST_BODIES = [
  { id: "collector", label: "수집가 유령", tier: "legend", item: "q_body_collector", desc: "등불을 들고 표본 가방을 멘 채집 장인 유령. 수집 의뢰 전용이에요. 포인트 색은 가방 끈과 탐험 모자 띠예요." },
] as const;

/**
 * 11/22 골목 붕어빵 수레 한정 외형: 선택권으로 살 수 없고, 수레에서 산 계정만 바꿀 수 있다 (소장 기록 bodies — web lib/bungeo·lib/dye/service).
 * 사기 전에는 꾸미기 창에도 나오지 않는다 (이스터에그). 등급 연출은 프리미엄 외형과 같다
 */
export const ALLEY_BODIES = [
  { id: "vendor", label: "붕어빵 장수 유령", tier: "legend", desc: "머리에 수건 질끈, 누빔 조끼에 앞치마, 집게로 갓 구운 붕어빵을 든 유령. 포인트 색은 앞치마예요." },
] as const;
/** 붕어빵 수레 한정 외형이면 그 정의 */
export function alleyBody(b: unknown): (typeof ALLEY_BODIES)[number] | undefined {
  return ALLEY_BODIES.find((x) => x.id === b);
}

/**
 * 11/20 소장한 수집 의뢰 외형: 교환소 기록(bodies)에 있거나, 그 해금 아이템(QUEST_BODIES.item)을 가방에 가졌으면 (선물·운영자 지급).
 * 교환소 기록에 있는 다른 외형 id도 그대로 둔다 (프리미엄 외형 소장 기록과 같은 목록)
 */
export function ownedQuestBodies(bodies: readonly string[], inventory: Readonly<Record<string, number>> | null | undefined): string[] {
  const out = [...bodies];
  for (const b of QUEST_BODIES) if (!out.includes(b.id) && (inventory?.[b.item] ?? 0) > 0) out.push(b.id);
  return out;
}

/** 아바타 몸 모양 전부 (검증·그리기용). 옛 클라이언트는 모르는 몸을 후드 유령으로 그린다 */
export const AVATAR_BODIES = [...STARTER_BODIES, ...PREMIUM_BODIES, ...STAFF_BODIES, ...QUEST_BODIES, ...ALLEY_BODIES] as const;
export type AvatarBody = (typeof AVATAR_BODIES)[number]["id"];
export type PremiumBody = (typeof PREMIUM_BODIES)[number];
export function isAvatarBody(b: unknown): b is AvatarBody {
  return typeof b === "string" && AVATAR_BODIES.some((x) => x.id === b);
}
/** 처음 고를 수 있는(무료) 몸인지 */
export function isStarterBody(b: unknown): b is (typeof STARTER_BODIES)[number]["id"] {
  return typeof b === "string" && STARTER_BODIES.some((x) => x.id === b);
}
/** 프리미엄 외형이면 그 정의 */
export function premiumBody(b: unknown): PremiumBody | undefined {
  return PREMIUM_BODIES.find((x) => x.id === b);
}
/** 수집 의뢰 보상 외형이면 그 정의 */
export function questBody(b: unknown): (typeof QUEST_BODIES)[number] | undefined {
  return QUEST_BODIES.find((x) => x.id === b);
}
/** 외형 등급 (프리미엄·의뢰 보상 외형, 아니면 null) — 등급 연출·꾸미기 점수용 */
export function bodyTier(b: unknown): BodyTier | null {
  return premiumBody(b)?.tier ?? questBody(b)?.tier ?? alleyBody(b)?.tier ?? null;
}
/** 운영자 전용 몸인지 */
export function isStaffBody(b: unknown): boolean {
  return typeof b === "string" && STAFF_BODIES.some((x) => x.id === b);
}
/** 프리미엄 외형 선택권 값 (프리미엄이 아니면 null) */
export function bodyUnlockPrice(b: unknown): number | null {
  const p = premiumBody(b);
  return p ? BODY_TIER_INFO[p.tier].price : null;
}
/** 화면에 보일 몸 이름 */
export function bodyLabel(b: unknown): string {
  return AVATAR_BODIES.find((x) => x.id === b)?.label ?? String(b ?? "");
}
/** 운영자가 아니면 운영자 전용 몸은 후드 유령으로 (입장 토큰·실시간 서버가 쓴다) */
export function staffGateBody<T extends string>(body: T, staff: boolean): T | "hood" {
  return !staff && isStaffBody(body) ? "hood" : body;
}

/**
 * 한 번 하는 동작 (같은 채널에 보이고 들린다): 종 치기·물 튀기기·손 흔들기·환호·오리배 꽥(11/15)·범퍼카 빵빵(11/16)·등대 등불 켬(11/16, 바닷가).
 * 서버가 이 목록으로 받을 동작을 정한다 (늘리면 realtime 재배포). 옛 클라이언트는 모르는 동작을 그냥 버린다
 */
// 11/17 gull = 포구 갈매기에게 과자 던지기 · gullHot = 매운 새우 과자 (같은 바닷가 사람 화면에 갈매기가 몰려들어요 — 매운 과자는 받아먹은 갈매기가 30초 빨개져요)
export const ACT_KINDS = ["bell", "splash", "wave", "cheer", "quack", "honk", "lamp", "gull", "gullHot"] as const;
export type ActKind = (typeof ACT_KINDS)[number];

/**
 * 5번 이모티콘: 머리 위에 3~4초 뜨는 그림 (말풍선과 같은 자리·쌓기 규칙). id만 주고받고 그림은 클라이언트가 그린다.
 * 옛 클라이언트는 모르는 이벤트(emo)라 그냥 버린다. 새 id도 마찬가지 — 받는 쪽이 isEmoId로 걸러 모르는 그림은 조용히 버린다.
 * 서버가 isEmoId로 받을 id를 정하므로 id를 늘리면 realtime도 다시 배포해야 한다.
 * 순서 = 이모티콘 판 순서 (손 흔들기·환호 다음 3번부터 단축키 — 앞 14개 순서는 바꾸지 않는다)
 */
export const EMOS = [
  { id: "heart", label: "하트" },
  { id: "laugh", label: "웃음" },
  { id: "cry", label: "눈물" },
  { id: "wow", label: "놀람" },
  { id: "what", label: "물음표" },
  { id: "bang", label: "느낌표" },
  { id: "clap", label: "박수" },
  { id: "angry", label: "화남" },
  { id: "zzz", label: "졸려요" },
  { id: "coffee", label: "커피" },
  { id: "fire", label: "불꽃" },
  { id: "note", label: "음표" },
  { id: "sweat", label: "진땀" },
  { id: "idea", label: "번뜩" },
  // 얼굴 (여기부터는 단축키 없이 창에서 고른다 — 앞 14개 순서는 그대로 둔다: 단축키 1~9)
  { id: "grin", label: "씨익" },
  { id: "wink", label: "윙크" },
  { id: "blank", label: "멍" },
  { id: "panic", label: "당황" },
  { id: "shy", label: "부끄" },
  { id: "moved", label: "감동" },
  { id: "tongue", label: "메롱" },
  { id: "annoyed", label: "짜증" },
  { id: "doubt", label: "의심" },
  { id: "zen", label: "해탈" },
  { id: "faint", label: "기절" },
  { id: "yawn", label: "하품" },
  { id: "proud", label: "뿌듯" },
  { id: "gloom", label: "현타" },
  // 회사
  { id: "leave", label: "퇴근" },
  { id: "overtime", label: "야근" },
  { id: "payday", label: "월급날" },
  { id: "meeting", label: "회의" },
  { id: "approve", label: "결재" },
  { id: "laptop", label: "노트북" },
  { id: "excel", label: "엑셀" },
  { id: "subway", label: "지옥철" },
  { id: "vacation", label: "연차" },
  { id: "clockout", label: "칼퇴" },
  { id: "beer", label: "회식" },
  { id: "soju", label: "소주" },
  // 반응
  { id: "thumbs", label: "엄지척" },
  { id: "ok", label: "OK" },
  { id: "thanks", label: "감사" },
  { id: "vein", label: "빠직" },
  { id: "lol", label: "ㅋㅋ" },
  { id: "sob", label: "ㅠㅠ" },
  { id: "gg", label: "GG" },
  { id: "party", label: "축하" },
  { id: "gift", label: "선물" },
  { id: "check", label: "확인" },
  // 자연·묘역
  { id: "sun", label: "맑음" },
  { id: "rain", label: "비" },
  { id: "moon", label: "달" },
  { id: "rainbow", label: "무지개" },
  { id: "flower", label: "꽃" },
  { id: "cat", label: "고양이" },
  { id: "dog", label: "강아지" },
  { id: "ghost", label: "유령" },
  { id: "tomb", label: "묘비" },
  { id: "candle", label: "촛불" },
  // 11/15 수집 의뢰 이모티콘 묶음 (items qe_pack을 가진 계정만 — 창에서 잠금 표시. 실시간 서버는 소유를 모른다)
  { id: "bigfish", label: "월척 자랑" },
  { id: "nobasket", label: "빈 바구니" },
  { id: "goldbug", label: "금빛 곤충" },
  { id: "orevein", label: "광맥 발견" },
  { id: "digfind", label: "발굴 성공" },
  { id: "dexdone", label: "도감 완성" },
  { id: "rodbend", label: "낚싯대 휘청" },
  { id: "qstamp", label: "의뢰 완료 도장" },
] as const;
/** 수집 의뢰 이모티콘 묶음 (qe_pack) — EMOS 맨 끝 8개 */
export const QUEST_EMO_IDS = ["bigfish", "nobasket", "goldbug", "orevein", "digfind", "dexdone", "rodbend", "qstamp"] as const;
export type EmoId = (typeof EMOS)[number]["id"];
export function isEmoId(id: unknown): id is EmoId {
  return typeof id === "string" && EMOS.some((e) => e.id === id);
}

/**
 * 24번 벤치 상태: 의자·벤치에 앉아 있는 동안 고르는 지금 하는 일. 머리 위 작은 아이콘 + 손에 든 소품으로 보인다.
 * 서버가 앉은 사람만 받고, 자리에서 일어나면 저절로 풀린다(입장 정보 PeerInfo.mood로 늦게 온 사람에게도 보인다).
 */
export const SEAT_MOODS = [
  { id: "study", label: "공부 중" },
  { id: "work", label: "일하는 중" },
  { id: "meal", label: "밥 먹는 중" },
  { id: "rest", label: "쉬는 중" },
  { id: "music", label: "음악 듣는 중" },
  { id: "call", label: "통화 중" },
  { id: "coffee", label: "커피 마시는 중" },
] as const;
export type SeatMood = (typeof SEAT_MOODS)[number]["id"];
export function isSeatMood(id: unknown): id is SeatMood {
  return typeof id === "string" && SEAT_MOODS.some((m) => m.id === id);
}

/**
 * 정해진 문장 말풍선 (채팅 대신). id만 주고받고 문장은 클라이언트가 이 표로 그린다 → 욕설·스팸이 원천적으로 없다.
 */
export const PHRASES = [
  { id: "hi", text: "반가워요" },
  { id: "bye", text: "잘 가요" },
  { id: "thanks", text: "고마워요" },
  { id: "sit", text: "같이 앉을래요?" },
  { id: "follow", text: "따라와요!" },
  { id: "nice", text: "멋져요" },
  { id: "rip", text: "편히 쉬길…" },
  { id: "same", text: "저도 그런 적 있어요" },
  { id: "cheer", text: "다음 건 꼭 끝내요" },
  { id: "hunt", text: "사냥 같이 가요" },
  { id: "house", text: "우리 집 놀러 와요" },
] as const;
export type PhraseId = (typeof PHRASES)[number]["id"];
export function isPhraseId(id: unknown): id is PhraseId {
  return typeof id === "string" && PHRASES.some((p) => p.id === id);
}

/**
 * 방(room): 채널 묘지 말고 따로 모이는 공간 — 분양 마을, 개인 집, 사냥터.
 * 같은 방에 들어온 사람끼리 서로 보인다(위치·상태·말풍선만, 좌석·묘비 이벤트 없음).
 * id 형식: "village" | "house:{houseId}" | "hunt:{zone}:{difficulty}". 토큰의 room 클레임과 같아야 들어갈 수 있다.
 */
export const ROOM_CAPACITY = 30;
export const ROOM_ID_RE = /^(village|house:[A-Za-z0-9_-]{4,24}|hunt:[a-z0-9_-]{1,24}:[a-z]{1,10})$/;
export function isAvatarColor(c: unknown): c is AvatarColor {
  return typeof c === "string" && (AVATAR_COLORS as readonly string[]).includes(c);
}

/**
 * 도감 100% 배지: 종류별 비트 (입장 토큰·PeerInfo의 dex). 이름표 옆 작은 배지로 그린다.
 * 순서는 web lib/forage/catalog의 LIFE_CATS와 같다 (물고기·곤충·약초·광석·발굴품)
 */
export const DEX_BADGE_CATS = ["fish", "bug", "herb", "ore", "dig"] as const;
export type DexBadgeCat = (typeof DEX_BADGE_CATS)[number];
export const DEX_BADGE_ICON: Record<DexBadgeCat, string> = { fish: "🐟", bug: "🦋", herb: "🌿", ore: "💎", dig: "🏺" };
export const DEX_BADGE_ALL = (1 << DEX_BADGE_CATS.length) - 1;
export function isDexBadge(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= DEX_BADGE_ALL;
}
/** 비트 묶음 → 달성한 종류 (순서대로) */
export function dexBadgeCats(v: number | undefined): DexBadgeCat[] {
  return isDexBadge(v) ? DEX_BADGE_CATS.filter((_, i) => v & (1 << i)) : [];
}

/**
 * 주간 랭킹 1위(챔피언) 표시: 랭킹별 비트 (입장 토큰·PeerInfo의 champ). 지난주(월요일 새벽 5시 한국 시간 마감) 1위만 Vercel이 넣는다.
 * 이름표 위 작은 배지("지난주 포인트왕")와 몸 둘레 1위 오라로 그린다. 옛 클라이언트는 모르는 필드라 무시한다
 */
export const CHAMP_BOARDS = ["points", "huntKills", "fish"] as const;
export type ChampBoard = (typeof CHAMP_BOARDS)[number];
/** 배지 글자 ("이번 주 " 뒤에 붙는다) */
export const CHAMP_TITLE: Record<ChampBoard, string> = { points: "포인트왕", huntKills: "사냥왕", fish: "낚시왕" };
/** 랭킹별 1위 전용 꾸미기 (상점에 없다. 1위가 되면 다음 1위가 정해질 때까지 빌려 입는다) */
export const CHAMP_HAT: Record<ChampBoard, string> = { points: "champ_crown", huntKills: "champ_plume", fish: "champ_fishhat" };
/**
 * 다관왕 전용 꾸미기 (2개 이상 1위면 랭킹 모자 여러 개 대신 이것 하나): 2관왕은 차지한 두 랭킹 조합마다 색이 다른 쌍둥이 왕관, 3관왕은 무지개 대관.
 * 키 = 1위 비트 묶음 (3 포인트+사냥 · 5 포인트+낚시 · 6 사냥+낚시 · 7 셋 다)
 */
export const CHAMP_MULTI_HAT: Readonly<Record<number, string>> = { 3: "champ_duo_ph", 5: "champ_duo_pf", 6: "champ_duo_hf", 7: "champ_triple" };
/** 1위 랭킹 → 받을 전용 모자 하나 (하나면 그 랭킹 모자, 둘·셋이면 다관왕 모자) */
export function champHatOf(boards: readonly ChampBoard[]): string {
  const set = CHAMP_BOARDS.filter((b) => boards.includes(b));
  if (set.length === 1) return CHAMP_HAT[set[0]];
  return CHAMP_MULTI_HAT[set.reduce((n, b) => n | (1 << CHAMP_BOARDS.indexOf(b)), 0)] ?? CHAMP_HAT[CHAMP_BOARDS[0]];
}
export const CHAMP_ALL = (1 << CHAMP_BOARDS.length) - 1;
/** 본인이 "1위 오라 보이기"를 끈 표시 (배지는 그대로, 오라만 숨긴다). 1위 비트와 같은 값에 함께 싣는다 */
export const CHAMP_AURA_OFF = 1 << CHAMP_BOARDS.length;
/** 1위 비트가 하나 이상 있는 값 (오라 끔 표시 포함 1~15) */
export function isChampBits(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= (CHAMP_ALL | CHAMP_AURA_OFF) && (v & CHAMP_ALL) > 0;
}
/**
 * 입장 토큰·착용 증서·접속자 정보에 실리는 champ 값 전체 (1~15): 1위 비트(+ 오라 끔) 또는 CHAMP_AURA_OFF 하나만
 * (31번 운영자가 "운영자 오라 보이기"를 껐을 때 — 1위가 아니어도 오라 끔을 전한다)
 */
export function isChampValue(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= (CHAMP_ALL | CHAMP_AURA_OFF);
}
/** 비트 묶음 → 1위 랭킹 (CHAMP_BOARDS 순서) */
export function champBoards(v: number | undefined): ChampBoard[] {
  return isChampBits(v) ? CHAMP_BOARDS.filter((_, i) => v & (1 << i)) : [];
}
/** 1위 오라를 그릴지 (1위이고 본인이 끄지 않았을 때) */
export function champAuraOn(v: number | undefined): boolean {
  return isChampBits(v) && (v & CHAMP_AURA_OFF) === 0;
}
/** 1위 랭킹 목록 → 비트 묶음 (없으면 0). auraOff면 오라 끔 표시도 */
export function champBitsOf(boards: readonly ChampBoard[], auraOff = false): number {
  const n = boards.reduce((v, b) => v | (1 << CHAMP_BOARDS.indexOf(b)), 0);
  return n && auraOff ? n | CHAMP_AURA_OFF : n;
}
/** 배지 글자: 하나면 "지난주 포인트왕", 둘·셋이면 "지난주 2관왕"·"지난주 3관왕" (없으면 ""). 11/16 지난주 레이스 1위가 이번 주에 다는 배지라 "지난주" */
export function champBadgeText(v: number | undefined): string {
  const b = champBoards(v);
  if (!b.length) return "";
  return b.length === 1 ? `지난주 ${CHAMP_TITLE[b[0]]}` : `지난주 ${b.length}관왕`;
}
