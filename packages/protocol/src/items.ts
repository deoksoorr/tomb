// 상점 아이템 카탈로그 (web 구매·사용, game 렌더링, realtime 폭죽 검증이 함께 쓴다).
// 모든 아이템은 "1회성"이다: 사면 가방에 1개가 들어가고, 쓰면 사라진다.
//  - 폭죽: 쏘는 순간 소모. 같은 채널 모두에게 보이고 들린다.
//  - 캐릭터 꾸미기: 착용하는 순간 소모, 24시간 동안 유지된다(같은 부위에 새로 입으면 입던 것은 남은 시간 그대로 벗어 둔 꾸미기로 간다).
//  - 묘비 꾸미기: 내 묘비 하나에 놓는 순간 소모, 7일 동안 유지된다(묘비당 최대 3개).
//  - 묘비 디자인권: 묘비를 세우거나 내 묘비의 디자인을 바꿀 때 소모, 그 묘비는 그 디자인으로 계속 남는다.

import type { DyeTicketSpec } from "./dye";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// megaphone(23번): 확성기. 쓰는 순간 소모되고, 채널(또는 모든 채널) 사람들의 왼쪽 위 확성기 창에 한마디가 뜬다
// dye(46번): 염색권. 쓰면 부위 하나의 색이 바뀐다 (random = 무작위 팔레트에서 찾기, fixed = 정해진 색)
// unlock(11/15 수집 의뢰): 쓰는 물건이 아니라 가지고 있으면 열리는 것 (이모티콘 묶음 · 외형). 소모되지 않는다
export type ItemKind = "firework" | "cosmetic" | "decor" | "graveStyle" | "megaphone" | "dye" | "unlock";
// nameColor·namePlate(닉네임 꾸미기): 머리 위 이름표 글자 색 · 이름표 바탕판. 몸 그림에는 그려지지 않고 이름표·화면의 이름에만 보인다
export type CosmeticSlot = "head" | "hand" | "aura" | "neck" | "back" | "pet" | "feet" | "nameColor" | "namePlate";

export type ItemDef = {
  id: string;
  kind: ItemKind;
  name: string;
  desc: string;
  price: number;
  /** 캐릭터 꾸미기 부위 */
  slot?: CosmeticSlot;
  /** 효과 지속 시간 (꾸미기류) */
  durationMs?: number;
  /** 폭죽 세기 1~5: 비쌀수록 크게, 넓게, 오래 터진다 (게임이 반경·발수·지속을 이 값으로 정한다) */
  power?: number;
  /** 46번 염색권 종류 (kind = "dye") */
  dye?: DyeTicketSpec;
  /** 운영자(31번) 전용 꾸미기: 상점 목록에 없고, 운영자만 영구로 받아 입는다 (서버·실시간 서버가 운영자가 아니면 뺀다) */
  staff?: true;
  /** 주간 랭킹 1위 전용 꾸미기: 상점 목록에 없고 사거나 영구로 살 수 없다. 1위가 되면 다음 1위가 정해질 때까지 빌려 입는다 (값 0 → 꾸미기 점수 0) */
  champ?: true;
  /** 11/15 수집 의뢰 보상: 상점 목록에 없고 포인트로 살 수 없다. 의뢰 도장 교환소에서 받기만 한다 (꾸미기는 영구로) */
  quest?: true;
  /** 11/15 긴급 의뢰 보상 (가장 많이 낸 사람의 사이렌 모자): 상점 목록에 없고 살 수 없다. 받으면 24시간 빌려 입는다 (값 0 → 꾸미기 점수 0) */
  urgent?: true;
  /** 11/15 수집 의뢰 보상 등급 (프리미엄 외형 등급과 같은 색·연출: 일반·고급·희귀·전설) */
  grade?: "common" | "fine" | "rare" | "legend";
  /** kind = "unlock": 여는 것 (emo = 의뢰 이모티콘 묶음 QUEST_EMO_IDS, body = 외형 body) */
  unlock?: "emo" | "body";
  /** unlock = "body"일 때 여는 몸 id (constants QUEST_BODIES) */
  body?: string;
};

export const COSMETIC_DURATION_MS = DAY;
export const DECOR_DURATION_MS = 7 * DAY;
export const MAX_DECOR_PER_GRAVE = 3;

/** 캐릭터 꾸미기 줄 [id, 부위, 이름, 설명, 가격] → ItemDef (지속 시간은 모두 24시간) */
function cosmetics(rows: readonly (readonly [string, CosmeticSlot, string, string, number])[]): ItemDef[] {
  return rows.map(([id, slot, name, desc, price]) => ({ id, kind: "cosmetic", slot, name, desc, price, durationMs: COSMETIC_DURATION_MS }));
}

export const ITEMS: readonly ItemDef[] = [
  { id: "fw_small", kind: "firework", name: "작은 폭죽", desc: "밤하늘에 한 발. 채널 모두가 함께 봐요.", price: 60, power: 1 },
  { id: "fw_fountain", kind: "firework", name: "분수 폭죽", desc: "발밑에서 금빛 불티가 솟구쳐요. 탕비실 커피 머신보다 화끈하게.", price: 80, power: 1 },
  { id: "fw_ring", kind: "firework", name: "고리 폭죽", desc: "청록 고리가 동그랗게 퍼져요. 회의실 원형 테이블 같은 평화.", price: 100, power: 1 },
  { id: "fw_heart", kind: "firework", name: "하트 폭죽", desc: "하트 모양으로 퍼지는 분홍 불꽃.", price: 120, power: 2 },
  { id: "fw_star", kind: "firework", name: "별 폭죽", desc: "노란 오각별이 반짝. 이번 달 고과는 별 다섯 개.", price: 140, power: 2 },
  { id: "fw_spiral", kind: "firework", name: "나선 폭죽", desc: "불꽃이 빙글빙글 돌며 풀려요. 결재 라인처럼 돌고 돌아.", price: 170, power: 2 },
  { id: "fw_triple", kind: "firework", name: "삼연발 폭죽", desc: "세 발이 연달아 터져요.", price: 200, power: 3 },
  { id: "fw_willow", kind: "firework", name: "버드나무 폭죽", desc: "금빛 가지가 축 늘어지며 오래 남아요. 금요일 오후의 어깨처럼.", price: 220, power: 3 },
  { id: "fw_crossette", kind: "firework", name: "이중 폭발", desc: "한 번 터지고, 그 끝에서 또 터져요. 회식 2차처럼.", price: 240, power: 3 },
  { id: "fw_smile", kind: "firework", name: "스마일 폭죽", desc: "하늘에 웃는 얼굴이 떠요. 월급날 표정 그대로.", price: 280, power: 3 },
  { id: "fw_waterfall", kind: "firework", name: "폭포 폭죽", desc: "불꽃 줄에서 은빛 불티가 커튼처럼 쏟아져요.", price: 300, power: 3 },
  { id: "fw_big", kind: "firework", name: "대형 폭죽", desc: "화면을 가득 채우는 커다란 불꽃.", price: 380, power: 4 },
  { id: "fw_meteor", kind: "firework", name: "별똥별", desc: "하늘을 가로지르는 별똥별 비가 쏟아져요.", price: 260, power: 3 },
  { id: "fw_letter", kind: "firework", name: "글자 폭죽", desc: "내 이름이 불꽃 글자로 떠올라요.", price: 320, power: 3 },
  { id: "fw_grand", kind: "firework", name: "밤하늘 피날레", desc: "채널 하늘 전체를 몇 초 동안 수놓아요.", price: 740, power: 5 },

  { id: "hat_straw", kind: "cosmetic", slot: "head", name: "밀짚모자", desc: "여름휴가 계획만 세 번 세웠다.", price: 80, durationMs: COSMETIC_DURATION_MS },
  { id: "hat_cat", kind: "cosmetic", slot: "head", name: "고양이 귀", desc: "쫑긋.", price: 100, durationMs: COSMETIC_DURATION_MS },
  { id: "hat_flower", kind: "cosmetic", slot: "head", name: "꽃 머리핀", desc: "헌화하다 하나 꽂았어요.", price: 80, durationMs: COSMETIC_DURATION_MS },
  { id: "hand_lantern", kind: "cosmetic", slot: "hand", name: "손등불", desc: "내 주변이 더 환해져요.", price: 120, durationMs: COSMETIC_DURATION_MS },
  { id: "aura_firefly", kind: "cosmetic", slot: "aura", name: "반딧불 오라", desc: "반딧불이 졸졸 따라와요.", price: 140, durationMs: COSMETIC_DURATION_MS },
  { id: "neck_scarf", kind: "cosmetic", slot: "neck", name: "빨간 목도리", desc: "밤바람이 차요.", price: 60, durationMs: COSMETIC_DURATION_MS },
  { id: "hat_halo", kind: "cosmetic", slot: "head", name: "후광", desc: "머리 위에 은은한 빛의 고리.", price: 160, durationMs: COSMETIC_DURATION_MS },
  { id: "back_wings", kind: "cosmetic", slot: "back", name: "작은 날개", desc: "등에서 파닥이는 유령 날개.", price: 180, durationMs: COSMETIC_DURATION_MS },
  { id: "pet_ghost", kind: "cosmetic", slot: "pet", name: "그림자 유령 친구", desc: "작은 그림자 유령이 졸졸 따라와요.", price: 650, durationMs: COSMETIC_DURATION_MS },
  { id: "feet_flowers", kind: "cosmetic", slot: "feet", name: "발자국 꽃", desc: "걷는 자리마다 작은 꽃이 피어요.", price: 140, durationMs: COSMETIC_DURATION_MS },
  { id: "aura_fog", kind: "cosmetic", slot: "aura", name: "안개 망토", desc: "발밑에 푸른 안개가 일렁여요.", price: 120, durationMs: COSMETIC_DURATION_MS },

  // ── F8 캐릭터 꾸미기 추가분 (11/12): 사무실·일상 이름. 시트에 그려지는 것(머리·목·손·배낭·망토)과
  //    따로 붙는 연출(우산·풍선·날개·발자국·오라·펫)은 web game/sprites/avatarGear.ts · cosmeticFx.ts 참고
  ...cosmetics([
    // 머리
    ["hat_beanie", "head", "털 비니", "안 감은 머리를 감쪽같이 숨겨 줘요.", 80],
    ["hat_headphones", "head", "노이즈캔슬링 헤드폰", "팀장님 목소리만 골라서 막아 줘요. (아마도)", 160],
    ["hat_crown", "head", "작은 왕관", "오늘만큼은 내가 이 구역 대표.", 480],
    ["hat_ribbon", "head", "리본 머리띠", "회식 2차 노래방에서 받은 거예요.", 80],
    ["hat_party", "head", "고깔모자", "누군가의 생일. 케이크는 이미 없어요.", 100],
    ["hat_glasses", "head", "뿔테 안경", "엑셀 셀이 한 칸 더 잘 보여요.", 80],
    ["hat_wizard", "head", "마법사 모자", "엑셀 매크로를 쓸 줄 알면 다 마법사.", 240],
    ["hat_cap", "head", "체육대회 모자", "회사 체육대회 기념품. 팀 색깔은 파랑.", 80],
    ["hat_sprout", "head", "새싹 머리핀", "물 주면 자랄지도 몰라요.", 60],
    // 목
    ["neck_tie", "neck", "넥타이", "금요일엔 살짝 풀어도 돼요.", 80],
    ["neck_badge", "neck", "사원증 목걸이", "삑. 출입이 허가되었습니다.", 60],
    ["neck_bowtie", "neck", "나비넥타이", "결혼식 하객 모드 켜짐.", 100],
    ["neck_bell", "neck", "방울 목걸이", "어디 있는지 다 들켜요. 땡그랑.", 80],
    ["neck_lei", "neck", "꽃 목걸이", "휴가 사진에서만 본 그 목걸이.", 120],
    // 손
    ["hand_coffee", "hand", "아이스 아메리카노", "얼음이 다 녹을 때까지 회의 중.", 60],
    ["hand_umbrella", "hand", "편의점 우산", "비 오는 날 회사 앞에서 산 그 우산. 집에 일곱 개 있어요.", 120],
    ["hand_briefcase", "hand", "서류 가방", "안에는 점심 도시락뿐.", 100],
    ["hand_phone", "hand", "스마트폰", "알림 99+. 안 읽은 척하는 중.", 80],
    ["hand_lantern_blue", "hand", "도깨비 등롱", "푸르스름한 불빛이 흔들흔들. 주변도 환해져요.", 180],
    ["hand_balloon", "hand", "풍선", "창립기념일에 받은 풍선. 바람 따라 둥실.", 100],
    // 등
    ["back_backpack", "back", "출근 배낭", "노트북, 충전기, 그리고 한 줌의 희망.", 100],
    ["back_cape", "back", "퇴근 망토", "6시 정각, 망토를 휘날리며 퇴근.", 160],
    ["back_wings_bat", "back", "박쥐 날개", "야근 사흘째에 돋아났어요.", 200],
    ["back_wings_butterfly", "back", "나비 날개", "봄바람 타고 출근하는 날개.", 320],
    // 발
    ["feet_prints", "feet", "발도장", "지나간 자리마다 콩콩 발자국.", 60],
    ["feet_puddle", "feet", "첨벙 장화", "맑은 날에도 걸음마다 첨벙첨벙.", 100],
    ["feet_sparkle", "feet", "반짝이 운동화", "새로 산 운동화라서 반짝반짝.", 160],
    ["feet_leaves", "feet", "낙엽 산책", "바스락바스락, 가을 출근길.", 80],
    ["feet_hearts", "feet", "하트 발자국", "월급날의 발걸음.", 120],
    // 오라
    ["aura_sparkle", "aura", "반짝이 오라", "첫 출근 날의 반짝이는 기분.", 140],
    ["aura_snow", "aura", "나만의 눈", "내 머리 위에만 펑펑 내리는 눈.", 160],
    ["aura_petals", "aura", "벚꽃 바람", "벚꽃 엔딩이 흘러나올 것 같아요.", 180],
    ["aura_raincloud", "aura", "월요병 먹구름", "머리 위에만 보슬보슬. 월요일 아침의 시각화.", 120],
    ["aura_notes", "aura", "흥얼흥얼 음표", "이어폰 없이도 흥얼흥얼.", 120],
    ["aura_zzz", "aura", "회의 시간 졸음", "회의만 시작하면 머리 위로 Zzz.", 80],
    // 펫
    ["pet_cat", "pet", "사무실 고양이", "키보드 위가 제일 따뜻하대요.", 900],
    ["pet_duck", "pet", "고무 오리", "디버깅 상담 전문 오리. 말없이 들어 줘요.", 450],
    ["pet_slime", "pet", "말랑 슬라임", "말랑말랑. 스트레스 볼 대용.", 450],
    ["pet_bird", "pet", "참새", "어깨에 앉고 싶어서 졸졸 날아와요.", 550],
    ["pet_wisp", "pet", "도깨비불 친구", "푸른 불꽃이 둥실둥실 따라와요.", 700],
    ["pet_dog", "pet", "퇴근 강아지", "퇴근하면 제일 먼저 반겨 주는 친구.", 900],
  ]),
  // ── 캐릭터 꾸미기 추가분 2 (11/12): 부위마다 5~6종. 그림은 avatarGear.ts(머리·목·손·등 시트) · cosmeticFx.ts(날개·발자국·오라) ──
  ...cosmetics([
    // 머리
    ["hat_beret", "head", "베레모", "디자인팀 막내의 상징. 시안은 백 번째.", 120],
    ["hat_hardhat", "head", "안전모", "현장 점검 나왔습니다. 안전제일!", 100],
    ["hat_chef", "head", "요리사 모자", "구내식당 셰프님께 잠깐 빌려 왔어요.", 140],
    ["hat_horns", "head", "도깨비 뿔", "마감 사흘 전부터 슬슬 돋아나요.", 180],
    ["hat_santa", "head", "산타 모자", "연말 파티 사회는 결국 내 차지.", 200],
    // 목
    ["neck_collar", "neck", "셔츠 깃", "목 위만 보면 완벽한 출근룩.", 60],
    ["neck_whistle", "neck", "호루라기", "체육대회 심판은 늘 신입 몫.", 80],
    ["neck_camera", "neck", "목걸이 카메라", "워크숍 사진 담당. 정작 내 사진은 없어요.", 160],
    ["neck_pearl", "neck", "진주 목걸이", "돌잔치 하객룩 완성.", 200],
    ["neck_medal", "neck", "금메달", "이달의 사원. 진짜예요.", 300],
    // 손
    ["hand_donut", "hand", "도넛", "탕비실 마지막 도넛. 눈치 싸움 승리.", 60],
    ["hand_clipboard", "hand", "결재판", "결재 부탁드립니다… (세 번째)", 80],
    ["hand_mic", "hand", "마이크", "회식 2차 노래방 마이크 독점.", 120],
    ["hand_bouquet", "hand", "꽃다발", "승진 축하 꽃다발. 남의 거 아니에요.", 160],
    ["hand_wand", "hand", "요술봉", "야근을 없애 주는 요술봉. (효과는 아직)", 240],
    // 등
    ["back_shell", "back", "거북 등껍질", "느긋하게, 그래도 지각은 안 하게.", 140],
    ["back_guitar", "back", "통기타", "퇴근 후엔 밴드 동아리 기타리스트.", 200],
    ["back_jetpack", "back", "제트팩", "지각 1분 전 비상 출근용.", 360],
    ["back_wings_angel", "back", "천사 날개", "칼퇴를 허락받은 자의 날개.", 400],
    ["back_wings_dragon", "back", "용 날개", "결재 반려 세 번이면 돋아나요.", 480],
    // 발
    ["feet_snowprints", "feet", "눈 발자국", "첫눈 온 날 출근길, 뽀득뽀득.", 80],
    ["feet_paws", "feet", "젤리 발도장", "고양이 발바닥 젤리 도장, 꾹꾹.", 100],
    ["feet_bubbles", "feet", "비눗방울 걸음", "걸을 때마다 퐁퐁.", 120],
    ["feet_confetti", "feet", "색종이 걸음", "퇴근길이 매일 축하 파티.", 160],
    ["feet_coins", "feet", "짤랑 동전", "주머니에 구멍이 났어요. 월급날 한정.", 240],
    ["feet_stars", "feet", "별가루 걸음", "밟는 곳마다 별이 반짝.", 300],
    // 오라
    ["aura_steam", "aura", "커피 김", "카페인 충전 완료. 머리에서 김이 모락모락.", 100],
    ["aura_bubbles", "aura", "비눗방울 오라", "머리 위로 비눗방울이 둥실둥실.", 120],
    ["aura_leaves", "aura", "낙엽 비", "내 머리 위에만 가을.", 140],
    ["aura_hearts", "aura", "하트 뿅뿅", "사내 연애 들킴.", 180],
    ["aura_ghosts", "aura", "꼬마 유령 친구들", "꼬마 유령들이 머리 둘레를 빙글빙글.", 300],
    ["aura_money", "aura", "보너스 비", "성과급이 들어왔어요! (꿈)", 480],
  ]),
  // ── 닉네임 꾸미기 (11/14): 이름 글자(nameColor)와 이름표 바탕판(namePlate)은 다른 부위라 함께 낄 수 있다.
  //    값은 같은 등급 꾸미기와 비슷하게: 단색(80~100) < 그라데이션(140~200) < 빛나고 움직이는 이름(300~420), 바탕판은 종류별(100~240).
  //    다른 꾸미기처럼 24시간 이용권·영구 소장(×PERMANENT_MULTIPLIER) 둘 다 상점에서 판다. 색·그림은 web lib/nameStyle.ts.
  //    id가 짧은 까닭: 착용 증서(look)에 실린다 — 옛 실시간 서버의 착용 증서 상한(400자)·소켓 메시지 상한(512바이트) 참고
  ...cosmetics([
    // 단색 (밤·낮 모두 잘 읽히는 밝기)
    ["nc_sakura", "nameColor", "벚꽃 분홍 이름", "이름이 벚꽃잎처럼 분홍빛으로 물들어요.", 80],
    ["nc_sky", "nameColor", "하늘색 이름", "맑은 날 점심시간 하늘색.", 80],
    ["nc_mint", "nameColor", "민트 이름", "민트초코처럼 호불호 없는 산뜻한 민트.", 80],
    ["nc_lemon", "nameColor", "레몬 이름", "졸린 오후를 깨우는 레몬빛.", 80],
    ["nc_lilac", "nameColor", "라벤더 이름", "은은한 라벤더 향이 날 것 같은 보랏빛.", 80],
    ["nc_orange", "nameColor", "귤빛 이름", "탕비실 귤 바구니에서 막 꺼낸 색.", 80],
    ["nc_silver", "nameColor", "은빛 이름", "달빛 아래 반짝이는 은빛.", 100],
    ["nc_dawn", "nameColor", "새벽 남색 이름", "해 뜨기 직전 새벽하늘의 푸른 남빛. 밤에도 또렷해요.", 100],
    // 그라데이션 (글자마다 색이 이어진다)
    ["ng_sunset", "nameColor", "노을 이름", "퇴근길 노을처럼 귤빛에서 분홍·보랏빛으로 물들어요.", 160],
    ["ng_sea", "nameColor", "바다 이름", "얕은 물빛에서 깊은 바다색으로 이어져요.", 160],
    ["ng_aurora", "nameColor", "오로라 이름", "초록·청록·보랏빛이 이어지는 밤하늘 오로라.", 200],
    ["ng_peach", "nameColor", "복숭아 이름", "말랑한 복숭아빛에서 분홍으로.", 140],
    ["ng_forest", "nameColor", "숲 이름", "새순 연두에서 짙은 숲 초록으로.", 140],
    ["ng_grape", "nameColor", "포도 이름", "청포도에서 거봉까지, 보랏빛으로 익어 가요.", 160],
    // 빛나고 움직이는 이름 (움직임 줄이기 설정이면 멈춘 그림)
    ["nf_glow", "nameColor", "은은한 빛 이름", "이름 둘레가 달빛처럼 은은하게 숨 쉬듯 빛나요.", 300],
    ["nf_rainbow", "nameColor", "흐르는 무지개 이름", "무지개 색이 글자를 따라 천천히 흘러가요.", 420],
    ["nf_stars", "nameColor", "별가루 이름", "이름 둘레에 별가루가 반짝반짝 내려앉아요.", 360],
    ["nf_flame", "nameColor", "불꽃 이름", "글자 끝이 모닥불처럼 일렁여요. 열정 과다 주의.", 400],
    // 이름표 바탕판
    ["np_wood", "namePlate", "나무 팻말", "이름을 나무 팻말에 새겨 걸어요.", 100],
    ["np_ribbon", "namePlate", "리본 이름표", "끝이 갈라진 붉은 리본 위에 이름을.", 120],
    ["np_cloud", "namePlate", "구름 이름표", "몽실몽실 구름 위에 이름이 둥실.", 120],
    ["np_wreath", "namePlate", "꽃 화환 이름표", "작은 꽃들이 이름 둘레를 감싸요.", 160],
    ["np_tomb", "namePlate", "묘비석 이름표", "이 마을다운 작은 묘비석에 이름을 새겨요.", 180],
    ["np_star", "namePlate", "별 이름표", "밤하늘 조각에 별이 콕콕 박힌 이름표.", 240],
  ]),
  // ── 11/15: 말랑 꾸미기 묶음 — 작고 말랑한 동물 친구 느낌(파스텔·동그란 귀·볼터치·점 눈). 다른 꾸미기와 같은 24시간·영구 규칙.
  //    그림: 머리·목·손·등 web game/sprites/cuteGear.ts · 발자국·오라·펫 cuteFx.ts. 펫 둘은 동물원 사육사가 판다 (ZOO_PETS)
  ...cosmetics([
    // 머리
    ["hat_bearband", "head", "말랑 곰 귀 머리띠", "쓰는 순간 결재 서류도 조금 말랑해 보여요.", 100],
    ["hat_mochibun", "head", "찹쌀떡 토끼 모자", "귀가 축 처진 찹쌀떡 토끼. 월요일 아침 컨디션 그대로.", 180],
    ["hat_hamhood", "head", "햄찌 털모자", "볼에 간식을 숨긴 채 회의에 들어가요.", 160],
    ["hat_chicknest", "head", "병아리 둥지", "머리 위 둥지에 병아리가 삐약. 신입 시절의 나.", 140],
    // 목
    ["neck_bib", "neck", "딸기우유 턱받이", "점심 메뉴가 짬뽕인 날의 필수품.", 80],
    ["neck_mochi", "neck", "찹쌀 목도리", "말랑한 크림색 털실 목도리. 분홍 줄무늬는 덤.", 100],
    // 손
    ["hand_bungeo", "hand", "붕어빵", "머리부터 먹을지 꼬리부터 먹을지, 오늘의 최대 고민.", 60],
    ["hand_plush", "hand", "곰돌이 인형", "책상 위 모니터 옆을 지키던 그 곰돌이.", 140],
    ["hand_dango", "hand", "삼색 경단 꼬치", "분홍·하양·연두. 하나씩 아껴 먹어요.", 80],
    // 등
    ["back_bunnybag", "back", "토끼 백팩", "뒤에서 보면 토끼가 빤히 쳐다봐요.", 180],
    ["back_milkcape", "back", "딸기우유 망토", "분홍 물방울 망토. 퇴근길이 조금 달콤해져요.", 200],
    // 발
    ["feet_jelly", "feet", "젤리 발자국", "분홍·민트·레몬 젤리 발바닥 도장이 콩콩.", 120],
    ["feet_mochi", "feet", "말랑 찹쌀 걸음", "걸을 때마다 볼 빨간 찹쌀떡이 퐁퐁.", 160],
    // 오라
    ["aura_cotton", "aura", "솜사탕 구름 오라", "분홍·하늘색 솜사탕 구름이 몽실몽실 떠올라요.", 180],
    ["aura_sweets", "aura", "디저트 비", "머리 위로 마카롱·사탕·딸기가 톡톡. 다이어트는 내일부터.", 200],
    // 펫 (동물원 사육사에게서 영구로만 — ZOO_PETS)
    // id가 짧은 까닭: 착용 증서 길이 (옛 실시간 서버 400자 — 부위마다 가장 긴 id보다 길지 않게)
    ["pet_ham", "pet", "꼬마 햄찌", "볼 빵빵한 꼬마 햄스터가 종종걸음으로 따라와요.", 500],
    ["pet_mochi", "pet", "찹쌀 토끼", "말랑말랑 하얀 토끼가 통통 튀며 따라와요.", 600],
  ]),
  // ── 31번 운영자 전용 꾸미기 (값 0: 운영자만 상점에서 영구로 받는다. 일반 계정은 사거나 입을 수 없다) ──
  ...cosmetics([
    ["staff_crown", "head", "운영자 왕관", "마을을 지키는 운영자의 검은 왕관. 운영자 전용.", 0],
    ["staff_armband", "neck", "관리자 완장", "\"관리\"가 박힌 빨간 완장. 운영자 전용.", 0],
    ["staff_ledger", "hand", "저승 명부", "이름이 적혀 있는지 확인해 볼까요? 운영자 전용.", 0],
    ["staff_lamp", "hand", "저승 등불", "길 잃은 유령을 비추는 푸른 등불. 운영자 전용.", 0],
    ["staff_robe", "back", "저승 도포", "붉은 안감의 검은 도포 자락. 운영자 전용.", 0],
    ["staff_steps", "feet", "저승길 발자국", "지나간 자리에 푸른 안개 발자국. 운영자 전용.", 0],
    ["staff_souls", "aura", "혼불", "푸른 혼불이 둘레를 맴돌아요. 운영자 전용.", 0],
  ]).map((it) => ({ ...it, staff: true as const })),
  // ── 주간 랭킹 1위 전용 꾸미기 (값 0: 상점에 없고, 1위가 되면 한 주 동안 빌려 입는다 — constants CHAMP_HAT) ──
  ...cosmetics([
    ["champ_crown", "head", "금화 왕관", "이번 주 포인트를 가장 많이 모은 사람의 금화 왕관. 주간 포인트 1위 전용.", 0],
    ["champ_plume", "head", "붉은 깃털 투구", "붉은 깃털을 꽂은 사냥꾼의 투구 장식. 주간 사냥 처치 1위 전용.", 0],
    ["champ_fishhat", "head", "황금 물고기 모자", "가장 큰 물고기를 낚은 사람의 황금 물고기 모자. 주간 낚시 1위 전용.", 0],
    // 다관왕 전용 (2개 이상 1위면 랭킹 모자 대신 이것 하나 — constants CHAMP_MULTI_HAT)
    ["champ_duo_ph", "head", "금홍 쌍둥이 왕관", "금빛·붉은빛 두 왕관이 겹친 쌍둥이 왕관. 주간 포인트·사냥 2관왕 전용.", 0],
    ["champ_duo_pf", "head", "금청 쌍둥이 왕관", "금빛·푸른빛 두 왕관이 겹친 쌍둥이 왕관. 주간 포인트·낚시 2관왕 전용.", 0],
    ["champ_duo_hf", "head", "홍청 쌍둥이 왕관", "붉은빛·푸른빛 두 왕관이 겹친 쌍둥이 왕관. 주간 사냥·낚시 2관왕 전용.", 0],
    ["champ_triple", "head", "삼관왕 대관", "무지개 보석이 박힌 커다란 대관. 주간 포인트·사냥·낚시 3관왕 전용.", 0],
  ]).map((it) => ({ ...it, champ: true as const })),
  // ── 동물원 펫 (사육사에게서 영구로만 산다 — 가격은 아래 ZOO_PETS. price는 같은 값을 적어 둔다) ──
  { id: "pet_fox", kind: "cosmetic", slot: "pet", name: "달빛 여우", desc: "야근하는 밤에만 슬그머니 따라오는 여우. 꼬리가 은은하게 빛나요.", price: 1200, durationMs: COSMETIC_DURATION_MS },
  { id: "pet_hound", kind: "cosmetic", slot: "pet", name: "듬직한 큰 개", desc: "등에 태워 주는 커다란 개. 출근길이 두 배로 즐거워요. (타고 다닐 수 있어요)", price: 2000, durationMs: COSMETIC_DURATION_MS },
  { id: "pet_goose", kind: "cosmetic", slot: "pet", name: "왕거위", desc: "아무도 못 말리는 거위. 등에 타면 뒤뚱뒤뚱 신나게 달려요. (타고 다닐 수 있어요)", price: 2400, durationMs: COSMETIC_DURATION_MS },
  { id: "pet_deer", kind: "cosmetic", slot: "pet", name: "달빛 사슴", desc: "별빛 뿔을 단 사슴. 등에 타면 바람처럼 가볍게 달려요. (타고 다닐 수 있어요)", price: 3000, durationMs: COSMETIC_DURATION_MS },
  // ── 11/15 수집 의뢰 보상 (도장 교환소 전용 — quest: 상점·포인트로는 못 산다. price = 꾸미기 점수용 가치(영구 가치 = ×4, 펫도 같은 식이라
  //    동물원 펫 값에 맞춰 희귀 펫 240 → 960, 타는 잉어 600 → 2,400), 꾸미기는 영구로 받는다) ──
  //    그림: 머리·손·등 avatarGear.ts · 오라·펫·타는 펫 cosmeticFx.ts · 이름 lib/nameStyle.ts · 외형 avatar.ts · 이모티콘 emoArt.ts
  ...([
    { id: "qe_pack", kind: "unlock", unlock: "emo", grade: "fine", name: "수집가 이모티콘 8종 묶음", desc: "월척 자랑·빈 바구니·금빛 곤충·광맥 발견·발굴 성공·도감 완성·낚싯대 휘청·의뢰 완료 도장. 한 번 받으면 계속 써요.", price: 0 },
    { id: "q_dye_pick", kind: "dye", dye: { mode: "pick" }, grade: "fine", name: "색 확정 염색권", desc: "흔들림도 운도 없이, 원하는 색을 골라 그대로 칠해요. (특수 색 제외)", price: 0 },
    { id: "q_dye_special", kind: "dye", dye: { mode: "special" }, grade: "rare", name: "특수색 확정 염색권", desc: "금빛 광택·반짝이·무지개·야광 중 하나를 골라 부위 하나에 확실하게 입혀요.", price: 0 },
    { id: "q_hat_angler", kind: "cosmetic", slot: "head", grade: "common", name: "낚시꾼 모자", desc: "찌와 바늘이 꽂힌 챙 모자. 월척 이야기는 매번 조금씩 커져요.", price: 160 },
    { id: "q_hand_net", kind: "cosmetic", slot: "hand", grade: "common", name: "채집망", desc: "나비도 매미도 잠자리도. 놓친 건 다음 의뢰 때.", price: 160 },
    { id: "q_hat_miner", kind: "cosmetic", slot: "head", grade: "fine", name: "광부 헬멧", desc: "이마 등불이 어두운 밤길을 비춰요. 광맥은 늘 한 칸 옆에.", price: 240 },
    { id: "q_hand_brush", kind: "cosmetic", slot: "hand", grade: "common", name: "발굴 붓", desc: "살살, 아주 살살. 유물은 서두르면 깨져요.", price: 160 },
    { id: "q_name_wave", kind: "cosmetic", slot: "namePlate", grade: "rare", name: "물결 이름표", desc: "잔잔한 물결이 이름 밑을 일렁이며 흘러가요.", price: 300 },
    { id: "q_name_leaf", kind: "cosmetic", slot: "nameColor", grade: "fine", name: "나뭇잎 이름 글자", desc: "새순 연두에서 짙은 잎 초록으로. 가끔 작은 잎이 팔랑 떨어져요.", price: 240 },
    { id: "q_aura_firefly", kind: "cosmetic", slot: "aura", grade: "rare", name: "반딧불 수집가 오라", desc: "모아 둔 반딧불이 줄지어 몸 둘레를 돌아요. 밤엔 더 환하게.", price: 360 },
    { id: "q_pet_goldfish", kind: "cosmetic", slot: "pet", grade: "rare", name: "금붕어 펫", desc: "동그란 물방울 어항 속 금붕어가 둥실둥실 따라와요.", price: 240 },
    { id: "q_aura_nightfish", kind: "cosmetic", slot: "aura", grade: "rare", name: "밤낚시 오라", desc: "발밑에 물결이 번지고, 달빛 윤슬이 몸 둘레에서 반짝여요. 가끔 은빛 물고기가 뛰어올라요.", price: 480 },
    { id: "q_back_cape", kind: "cosmetic", slot: "back", grade: "rare", name: "채집왕 망토", desc: "등에 금실 나비 문장을 수놓은 보랏빛 금테 망토. 끝자락에서 금가루가 흩날려요.", price: 480 },
    { id: "q_ride_carp", kind: "cosmetic", slot: "pet", grade: "rare", name: "월척 잉어 (타는 펫)", desc: "전설의 월척 비단잉어. 등에 타면 물 흐르듯 미끄러져요. (타고 다닐 수 있어요)", price: 600 },
    { id: "q_body_collector", kind: "unlock", unlock: "body", body: "collector", grade: "legend", name: "수집가 유령 (전설 외형)", desc: "등불과 표본 가방을 든 채집 장인 유령. 받으면 외형에서 언제든 바꿀 수 있어요.", price: 0 },
    // 11/15 월마다 바뀌는 교환소 겨울·새해 묶음 (전설 없음)
    { id: "q_hat_snow", kind: "cosmetic", slot: "head", grade: "common", name: "눈 털모자", desc: "눈꽃 무늬 털모자. 방울에서 가끔 눈송이가 톡 떨어져요.", price: 160 },
    { id: "q_aura_snowglobe", kind: "cosmetic", slot: "aura", grade: "rare", name: "스노볼 오라", desc: "유리 돔 안에 눈이 천천히 소용돌이쳐요. 밤엔 더 반짝여요.", price: 360 },
    { id: "q_hand_wishlamp", kind: "cosmetic", slot: "hand", grade: "fine", name: "새해 소원 등불", desc: "소원을 적은 한지 풍등. 밤이면 둘레를 따뜻하게 밝혀요.", price: 240 },
    { id: "q_name_newyear", kind: "cosmetic", slot: "namePlate", grade: "rare", name: "새해 복 이름표", desc: "금테 두른 다홍 이름표에 복 매듭. 금가루가 둥실 떠올라요.", price: 300 },
    { id: "q_pet_penguin", kind: "cosmetic", slot: "pet", grade: "rare", name: "꼬마 펭귄 펫", desc: "뒤뚱뒤뚱 따라오다가 가끔 배로 쭉 미끄러져요.", price: 240 },
    { id: "q_back_kite", kind: "cosmetic", slot: "back", grade: "fine", name: "연 날리는 등", desc: "등에 맨 얼레에서 방패연이 바람 따라 펄럭여요.", price: 240 },
  ] satisfies ItemDef[]).map((it) => ({ ...it, ...(it.kind === "cosmetic" ? { durationMs: COSMETIC_DURATION_MS } : {}), quest: true as const })),

  // ── 11/15 긴급 의뢰 가장 많이 낸 사람 (24시간 대여 — 상점·교환소에 없다). 그림: 머리 avatarGear.ts · 도는 불빛 cosmeticFx.ts ──
  { id: "u_hat_siren", kind: "cosmetic", slot: "head", grade: "rare", name: "사이렌 모자", desc: "긴급 배달왕의 모자. 머리 위 경광등이 빙글빙글 돌아요.", price: 0, durationMs: COSMETIC_DURATION_MS, urgent: true },

  { id: "decor_candles", kind: "decor", name: "촛불 한 쌍", desc: "묘비 양옆에 작은 촛불.", price: 90, durationMs: DECOR_DURATION_MS },
  { id: "decor_wreath", kind: "decor", name: "꽃 화환", desc: "묘비 앞에 둥근 화환.", price: 150, durationMs: DECOR_DURATION_MS },
  { id: "decor_ribbon", kind: "decor", name: "추모 리본", desc: "검은 리본 하나.", price: 90, durationMs: DECOR_DURATION_MS },
  { id: "decor_lantern", kind: "decor", name: "작은 석등", desc: "묘비 옆을 은은히 밝혀요.", price: 180, durationMs: DECOR_DURATION_MS },
  { id: "decor_ghostcat", kind: "decor", name: "유령 고양이", desc: "묘비 위에서 졸고 있어요.", price: 240, durationMs: DECOR_DURATION_MS },
  { id: "decor_stars", kind: "decor", name: "별빛", desc: "묘비 위로 별가루가 내려요.", price: 360, durationMs: DECOR_DURATION_MS },
  { id: "decor_rainbow", kind: "decor", name: "무지개", desc: "묘비 위에 작은 무지개가 걸려요.", price: 300, durationMs: DECOR_DURATION_MS },
  { id: "decor_butterfly", kind: "decor", name: "나비", desc: "나비 몇 마리가 묘비 둘레를 날아요.", price: 210, durationMs: DECOR_DURATION_MS },
  { id: "decor_snowman", kind: "decor", name: "눈사람", desc: "묘비 옆을 지키는 작은 눈사람.", price: 150, durationMs: DECOR_DURATION_MS },
  { id: "decor_flowerpot", kind: "decor", name: "화분", desc: "묘비 앞에 작은 화분 하나.", price: 90, durationMs: DECOR_DURATION_MS },

  // ── 23번 확성기: 지금 채널 / 모든 채널. 문장은 서버가 금칙어·도배를 거른 뒤 서명한 증서로만 퍼진다 ──
  { id: "mega_ch", kind: "megaphone", name: "확성기", desc: "지금 채널 모두의 확성기 창에 한마디(60자)를 띄워요.", price: 100 },
  { id: "mega_all", kind: "megaphone", name: "전체 확성기", desc: "모든 채널에 한마디(60자)를 크게 외쳐요.", price: 300 },

  // ── 46번 염색권: 부위(머리·몸·포인트) 하나를 무작위 팔레트에서 60초 안에 찾아 칠한다. 종류마다 색 범위·흔들림·특수 색 확률이 다르다 ──
  // 11/12: 원색·파스텔·형광·금속·반짝 추가 (값 순). 특수 색(금빛 광택·반짝이·무지개·야광)은 판 어딘가에 드물게 숨어 있다.
  // 값은 economy.ts 경제 표 기준 (하루 약 200P): 얼룩 450 ~ 무지개 1,500 사이에 끼우고, 특수 색이 잘 나오는 반짝만 1,800
  { id: "dye_basic", kind: "dye", name: "얼룩 염색권", desc: "물감이 몇 가지뿐인 팔레트. 조준점이 많이 흔들려요. 운이 좋으면 마음에 드는 색이!", price: 100, dye: { mode: "random", tier: 1 } },
  { id: "dye_vivid", kind: "dye", name: "원색 염색권", desc: "새빨강·샛노랑·새파랑처럼 쨍한 원색과 흑백이 가득한 팔레트. 조준점은 조금 흔들려요.", price: 150, dye: { mode: "random", tier: 4 } },
  { id: "dye_pastel", kind: "dye", name: "파스텔 염색권", desc: "솜사탕처럼 부드러운 파스텔 색 팔레트. 조준점은 조금 흔들려요.", price: 150, dye: { mode: "random", tier: 5 } },
  { id: "dye_neon", kind: "dye", name: "형광 염색권", desc: "눈이 번쩍 뜨이는 형광 색 팔레트. 어두운 곳에서 빛나는 야광 색이 가끔 숨어 있어요.", price: 200, dye: { mode: "random", tier: 6 } },
  { id: "dye_fine", kind: "dye", name: "고운 염색권", desc: "색이 꽤 다양한 팔레트. 조준점도 덜 흔들려요.", price: 250, dye: { mode: "random", tier: 2 } },
  { id: "dye_metal", kind: "dye", name: "금속 염색권", desc: "금·은·동과 흑백의 금속 팔레트. 번쩍이는 금빛 광택이 비교적 잘 나와요.", price: 300, dye: { mode: "random", tier: 7 } },
  { id: "dye_rainbow", kind: "dye", name: "무지개 염색권", desc: "온갖 색이 다 있는 큰 팔레트. 조준점이 거의 흔들리지 않아요.", price: 400, dye: { mode: "random", tier: 3 } },
  { id: "dye_sparkle", kind: "dye", name: "반짝 염색권", desc: "특수 색(금빛 광택·반짝이·무지개·야광)이 다른 염색권보다 조금 더 잘 나오는 팔레트. 조준점은 덜 흔들려요.", price: 600, dye: { mode: "random", tier: 8 } },

  // 묘비 디자인권 (포인트로 만드는 특별 묘비). id = "gs_" + 디자인 id
  { id: "gs_coffee", kind: "graveStyle", name: "식은 커피잔 묘비", desc: "마지막 한 모금은 끝내 마시지 못했다.", price: 300 },
  { id: "gs_duck", kind: "graveStyle", name: "오리 인형 묘비", desc: "모니터 옆에서 하소연을 끝까지 들어 준 친구.", price: 360 },
  { id: "gs_404", kind: "graveStyle", name: "404호 비석", desc: "아무리 찾아도 안 나오는 그 호실.", price: 360 },
  { id: "gs_monitor", kind: "graveStyle", name: "모니터 묘비", desc: "퇴근하고도 안 끈 모니터. 커서가 아직 깜빡여요.", price: 450 },
  { id: "gs_sakura", kind: "graveStyle", name: "벚꽃 비석", desc: "꽃잎이 내려앉는 비석.", price: 450 },
  { id: "gs_server", kind: "graveStyle", name: "자판기 묘비", desc: "동전만 삼키고 끝내 아무것도 안 내줬다. 불은 아직 깜빡여요.", price: 540 },
  { id: "gs_rocket", kind: "graveStyle", name: "못 쏜 로켓", desc: "카운트다운만 세 번 하고 멈춘 로켓.", price: 600 },
  { id: "gs_angel", kind: "graveStyle", name: "대리석 천사상", desc: "날개를 접은 작은 천사.", price: 900 },
  { id: "gs_crystal", kind: "graveStyle", name: "수정 묘비", desc: "밤에 은은하게 빛나요.", price: 1200 },
  { id: "gs_gold", kind: "graveStyle", name: "황금 비석", desc: "가장 빛나던 아이디어에게.", price: 1500 },
];

/**
 * 묘비 디자인. 맵 분위기는 모두 같고, 묘비마다 디자인을 골라 세운다.
 * free = 누구나 고를 수 있음, 나머지는 같은 id의 "gs_" 디자인권이 있어야 한다(쓰면 소모).
 * "auto"는 명세의 생존 기간 규칙(나무 팻말 → 작은 비석 → 큰 비석 → 석탑)을 따른다.
 */
export const GRAVE_STYLES = [
  { id: "auto", name: "자동 (살아온 기간에 따라)", free: true },
  { id: "wood", name: "나무 팻말", free: true },
  { id: "stone", name: "둥근 비석", free: true },
  { id: "tall", name: "큰 비석", free: true },
  { id: "cross", name: "십자 묘비", free: true },
  { id: "pagoda", name: "석탑", free: true },
  { id: "coffee", name: "식은 커피잔 묘비", free: false },
  { id: "duck", name: "오리 인형 묘비", free: false },
  { id: "404", name: "404호 비석", free: false },
  { id: "monitor", name: "모니터 묘비", free: false },
  { id: "sakura", name: "벚꽃 비석", free: false },
  { id: "server", name: "자판기 묘비", free: false },
  { id: "rocket", name: "못 쏜 로켓", free: false },
  { id: "angel", name: "대리석 천사상", free: false },
  { id: "crystal", name: "수정 묘비", free: false },
  { id: "gold", name: "황금 비석", free: false },
] as const;
export type GraveStyleId = (typeof GRAVE_STYLES)[number]["id"];
const styleMap = new Map<string, (typeof GRAVE_STYLES)[number]>(GRAVE_STYLES.map((g) => [g.id, g]));
export function isGraveStyle(id: unknown): id is GraveStyleId {
  return typeof id === "string" && styleMap.has(id);
}
export function isFreeStyle(id: string): boolean {
  return styleMap.get(id)?.free === true;
}
/** 유료 디자인의 디자인권 아이템 id (무료면 null) */
export function styleItemId(id: string): string | null {
  return isGraveStyle(id) && !isFreeStyle(id) ? `gs_${id}` : null;
}

/**
 * 상점에서 파는 종류 (F8: 묘비 꾸미기는 당분간 상점 목록에서 숨긴다 — 데이터·API·가방의 묘비에 놓기는 그대로).
 */
export const SHOP_KINDS: readonly ItemKind[] = ["firework", "cosmetic", "graveStyle", "megaphone", "dye"];
/** 상점 목록에 나오는지. 펫은 상점에서 팔지 않는다 (동물원 사육사에게서 영구로만 — ZOO_PETS) */
export function isShopListed(item: Pick<ItemDef, "kind"> & { slot?: CosmeticSlot; staff?: true; champ?: true; quest?: true; urgent?: true }): boolean {
  return SHOP_KINDS.includes(item.kind) && item.slot !== "pet" && !item.staff && !item.champ && !item.quest && !item.urgent;
}

const byId = new Map(ITEMS.map((i) => [i.id, i]));
export function itemById(id: string): ItemDef | undefined {
  return byId.get(id);
}
/** 23번 확성기 한마디 최대 글자 수 (코드포인트) */
export const MEGAPHONE_MAX = 60;
/** 확성기 한마디가 보이는 시간 (외친 시각 기준 5분). 지나면 목록·기록에서 빠지고 저장소에서도 지운다 */
export const MEGAPHONE_TTL_MS = 5 * 60_000;
export type MegaphoneScope = "channel" | "all";
/** 확성기 아이템이면 퍼지는 범위 (mega_all = 모든 채널), 아니면 null */
export function megaphoneScope(id: unknown): MegaphoneScope | null {
  if (typeof id !== "string" || byId.get(id)?.kind !== "megaphone") return null;
  return id === "mega_all" ? "all" : "channel";
}
/** 화면에 보일 아이템 이름: 카탈로그 이름, 관리자가 만든 고정 색 염색권(dyefix_*)은 "고정 색 염색권", 모르면 id 그대로 */
export function itemName(id: string): string {
  return byId.get(id)?.name ?? (id.startsWith("dyefix_") ? "고정 색 염색권" : id);
}
/** 운영자 전용 꾸미기인지 */
export function isStaffItem(id: unknown): boolean {
  return typeof id === "string" && byId.get(id)?.staff === true;
}
/** 주간 랭킹 1위 전용 꾸미기인지 (사거나 영구로 살 수 없다) */
export function isChampItem(id: unknown): boolean {
  return typeof id === "string" && byId.get(id)?.champ === true;
}
/** 11/15 수집 의뢰 보상인지 (상점·포인트로 살 수 없다 — 도장 교환소에서 받기만) */
export function isQuestItem(id: unknown): boolean {
  return typeof id === "string" && byId.get(id)?.quest === true;
}
/** 11/15 수집 의뢰 보상 id 전부 (도장 교환소·검증용) */
export const QUEST_ITEM_IDS: readonly string[] = ITEMS.filter((i) => i.quest).map((i) => i.id);
/** 의뢰 이모티콘 묶음 아이템 (가방에 1개 있으면 constants QUEST_EMO_IDS를 쓸 수 있다) */
export const QUEST_EMO_PACK = "qe_pack";
/**
 * 의뢰 보상을 받는 방법: permanent = 영구 꾸미기(착용·벗어 둔 꾸미기에 PERMANENT_UNTIL로, 이미 있으면 못 받음),
 * count = 가방 개수 +1 (염색권 — 쓰면 1개 소모), own = 가방에 1개 (이모티콘 묶음 — 소모되지 않음, 이미 있으면 못 받음),
 * body = 외형 해금 (style 저장소의 소장 외형 목록에 추가)
 */
export function questGrantKind(id: string): "permanent" | "count" | "own" | "body" | null {
  const it = byId.get(id);
  if (!it?.quest) return null;
  if (it.kind === "cosmetic") return "permanent";
  if (it.kind === "dye") return "count";
  if (it.unlock === "body") return "body";
  return it.unlock === "emo" ? "own" : null;
}
/** 주간 랭킹 1위 전용 꾸미기 id 전부 (랭킹 모자 3종 · 쌍둥이 왕관 3종 · 삼관왕 대관) — 새 전용 모자를 줄 때 나머지를 거둔다 */
export const CHAMP_ITEM_IDS: readonly string[] = ITEMS.filter((i) => i.champ).map((i) => i.id);
/** 운영자 전용 꾸미기 id (상점의 운영자 칸·검증용) */
export const STAFF_ITEM_IDS: readonly string[] = ITEMS.filter((i) => i.staff).map((i) => i.id);
/** 운영자가 아니면 착용 목록에서 운영자 전용 꾸미기를 뺀다 (입장 토큰·실시간 서버) */
export function staffGateLook(look: Look, staff: boolean): Look {
  return staff ? look : look.filter((id) => !isStaffItem(id));
}
export function isFireworkId(id: unknown): id is string {
  return typeof id === "string" && byId.get(id)?.kind === "firework";
}
/** 착용 부위 수 = 착용 목록 최대 길이 (몸 7 + 닉네임 꾸미기 2) */
export const LOOK_MAX_PARTS = 9;
/** 착용 중인 꾸미기 (부위별 최대 1개, 최대 LOOK_MAX_PARTS개). 서버 브로드캐스트·렌더링용.
 * 이 빌드가 모르는 id는 버린 뒤에 센다 → 옛 실시간 서버(최대 7개)도 새 닉네임 꾸미기만 버리고 나머지는 그대로 받는다 */
export type Look = string[];
/**
 * 11/15 사냥 장비 표시 (사냥터 방에서만 그린다 — web game/sprites/setGearWear): "sgw.{a|h|c}.{세트}{직급}" 또는 "sgw.{a|h|c}.{상점 장비 id}[+]".
 * 서버(web)가 캐릭터 저장값에서 꺼내 증서에 서명해 넣는다. 꾸미기 칸 수(LOOK_MAX_PARTS)에는 세지 않고 최대 HUNT_GEAR_MAX개
 */
export const HUNT_GEAR_RE = /^sgw\.[ahc]\.(?:[0-3]{2}|[a-z]_[a-z_]{1,30}\+?)$/;
export const HUNT_GEAR_MAX = 4;
export const isHuntGearId = (id: unknown): id is string => typeof id === "string" && HUNT_GEAR_RE.test(id);

export function sanitizeLook(raw: unknown): Look {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<CosmeticSlot>();
  const out: string[] = [];
  const gear: string[] = [];
  // 칭호(TITLE_IDS)는 꾸미기가 아니지만 같은 착용 목록에 하나만 실려 다른 사람 화면 머리 위에 보인다 (맨 뒤에 둔다)
  let title: string | null = null;
  for (const id of raw) {
    if (isTitleId(id)) {
      title ??= id;
      continue;
    }
    if (isHuntGearId(id)) {
      if (gear.length < HUNT_GEAR_MAX && !gear.includes(id)) gear.push(id);
      continue;
    }
    const it = typeof id === "string" ? byId.get(id) : undefined;
    if (!it || it.kind !== "cosmetic" || !it.slot || seen.has(it.slot)) continue;
    seen.add(it.slot);
    out.push(it.id);
  }
  const parts = [...out.slice(0, LOOK_MAX_PARTS), ...gear];
  return title ? [...parts, title] : parts;
}

// ── 30번 영구 소유 코디: 상점에서 파는 캐릭터 꾸미기는 모두 영구로도 산다 (24시간 이용권 가격의 4배, 10P 단위 반올림). 영구 착용품·벗어 둔 것은 만료 시각이 PERMANENT_UNTIL ──

/** 영구 소유의 "만료 시각" (2286년). 기간제와 같은 자리(착용·벗어 둠)에 저장되고, 이보다 크거나 같으면 영구로 표시한다 */
export const PERMANENT_UNTIL = 9_999_999_999_999;
export function isPermanentUntil(until: number): boolean {
  return until >= PERMANENT_UNTIL;
}
/** 24시간 이용권 가격 → 영구 소장 가격 배율 (7배에서 4배로 내렸다. 이미 영구로 산 것은 그대로 — 환불하지 않는다) */
export const PERMANENT_MULTIPLIER = 4;
/**
 * 영구로 살 수 있는 꾸미기 → 영구 가격: 상점 목록에 나오는(isShopListed) 부위 있는 캐릭터 꾸미기 전부.
 * 펫(동물원 사육사에게서 영구로만 — ZOO_PETS)·운영자 전용(아래에서 값 0)은 빠지고, 묘비 꾸미기(decor)는 꾸미기 종류가 달라 해당 없음
 */
const permanentPrices = new Map<string, number>(
  ITEMS.filter((it) => it.kind === "cosmetic" && it.slot && isShopListed(it)).map((it) => [it.id, Math.round((it.price * PERMANENT_MULTIPLIER) / 10) * 10] as const),
);
// 운영자 전용 꾸미기는 값 0으로 영구로만 받는다 (운영자인지는 web 서버가 확인한다)
for (const id of STAFF_ITEM_IDS) permanentPrices.set(id, 0);
/** 영구로 살 수 있으면 그 가격, 아니면 null (운영자 전용은 0) */
export function permanentPrice(id: string): number | null {
  return permanentPrices.get(id) ?? null;
}

// ── 동물원 펫: 버드나무 묘역 자리의 동물원 사육사에게서 영구로만 산다 (상점의 기간제 펫 판매는 멈췄다 — isShopListed) ──
// 펫은 착용 부위 "pet" 하나라 한 번에 한 마리만 데리고 다닌다. 산 펫은 영구(PERMANENT_UNTIL)로 착용·벗어 둔 꾸미기에 들어가고,
// 바꾸기·집에 두기는 다른 꾸미기와 같은 입기(/api/me/wear)·벗기(/api/me/unequip)로 한다.
// 가격(I0d 경제 재조정): 보통 유저(하루 20~30분, 약 200P)가 입문 펫(450P)은 2~3번 플레이, 타는 펫(2,000~3,000P)은 열흘~보름쯤 모으는 값.

/** 타는 펫 (ride = 타고 걷는 속도 배율 — 달리기 × 배율이 서버 속도 검증(MAX_VALID_SPEED) 안에 들도록 1.35 이하) */
export type PetDef = { id: string; price: number; ride?: { speed: number } };
/** 사육사 창 순서 (싼 것부터). 하우징이 최종 목표라 펫은 작은 집터(2,000P)보다 싸게 (11/12 사용자 요청) */
export const ZOO_PETS: readonly PetDef[] = [
  { id: "pet_slime", price: 450 },
  { id: "pet_duck", price: 450 },
  { id: "pet_ham", price: 500 }, // 11/15 말랑 꾸미기 묶음
  { id: "pet_bird", price: 550 },
  { id: "pet_mochi", price: 600 }, // 11/15 말랑 꾸미기 묶음
  { id: "pet_ghost", price: 650 },
  { id: "pet_wisp", price: 700 },
  { id: "pet_cat", price: 900 },
  { id: "pet_dog", price: 900 },
  { id: "pet_fox", price: 1200 },
  { id: "pet_hound", price: 2000, ride: { speed: 1.25 } },
  { id: "pet_goose", price: 2400, ride: { speed: 1.2 } },
  { id: "pet_deer", price: 3000, ride: { speed: 1.35 } },
];
const petMap = new Map(ZOO_PETS.map((p) => [p.id, p]));
/** 11/15 수집 의뢰 보상 타는 펫 (사육사에게서 팔지 않는다 — petDef·petPrice엔 없고, 타기 규칙만 같다). 속도는 같은 1.35 이하 규칙 */
export const QUEST_RIDES: readonly PetDef[] = [{ id: "q_ride_carp", price: 0, ride: { speed: 1.3 } }];
const rideMap = new Map([...ZOO_PETS, ...QUEST_RIDES].filter((p) => p.ride).map((p) => [p.id, p.ride!]));
/** 동물원 펫이면 그 정의 */
export function petDef(id: string): PetDef | undefined {
  return petMap.get(id);
}
/** 사육사에게서 사는 영구 가격 (동물원 펫이 아니면 null) */
export function petPrice(id: string): number | null {
  return petMap.get(id)?.price ?? null;
}
/** 타고 다닐 수 있는 펫인지 */
export function isRideablePet(id: string | null | undefined): boolean {
  return !!id && rideMap.has(id);
}
/** 착용 목록에서 데리고 다니는 펫 (없으면 null) */
export function petOfLook(look: readonly string[] | null | undefined): string | null {
  for (const id of look ?? []) if (byId.get(id)?.slot === "pet") return id;
  return null;
}
/** 착용 목록의 펫이 타는 펫이면 그 id (아니면 null) */
export function ridePetOfLook(look: readonly string[] | null | undefined): string | null {
  const pet = petOfLook(look);
  return isRideablePet(pet) ? pet : null;
}
/** 타고 걷는 속도 배율 (타는 펫이 아니면 1) */
export function rideSpeed(id: string | null | undefined): number {
  return (id && rideMap.get(id)?.speed) || 1;
}

// ── 닉네임 꾸미기: 착용 목록에서 이름 글자·이름표 바탕판 (그리기는 web lib/nameStyle.ts) ──

/** 닉네임 꾸미기 부위 (몸 그림이 아니라 이름표에 보인다) */
export const NAME_SLOTS: readonly CosmeticSlot[] = ["nameColor", "namePlate"];
export function isNameSlot(slot: CosmeticSlot | undefined): boolean {
  return slot === "nameColor" || slot === "namePlate";
}
/** 착용 목록의 닉네임 꾸미기 (없는 부위는 null, 이 빌드가 모르는 id는 무시) */
export function nameStyleOfLook(look: readonly string[] | null | undefined): { color: string | null; plate: string | null } {
  let color: string | null = null;
  let plate: string | null = null;
  for (const id of look ?? []) {
    const slot = byId.get(id)?.slot;
    if (slot === "nameColor") color ??= id;
    else if (slot === "namePlate") plate ??= id;
  }
  return { color, plate };
}

// ── 칭호: 도감 절반·전부, 주간 1위, 집 꾸밈 점수로 얻는다 (이름·얻는 방법·얻었는지는 web lib/titles.ts). ──
// 착용한 칭호 하나는 착용 목록(look)에 꾸미기와 같이 실려(입장 토큰·착용 증서 → 실시간 서버 → 다른 사람) 머리 위 이름표 위에 보인다.
// 옛 실시간 서버·옛 화면은 이 id를 몰라 버리거나 무시한다 (깨지지 않는다). id는 증서 길이 때문에 짧게.

export const TITLE_IDS = [
  // 도감 칸 절반(50)·전부(100): 물고기·곤충·약초버섯·광석·발굴품·별자리
  "t_fish50",
  "t_fish100",
  "t_bug50",
  "t_bug100",
  "t_herb50",
  "t_herb100",
  "t_ore50",
  "t_ore100",
  "t_dig50",
  "t_dig100",
  "t_star50",
  "t_star100",
  // 주간 랭킹 1위 (한 번이라도)
  "t_champ_points",
  "t_champ_hunt",
  "t_champ_fish",
  // 집 꾸밈 점수 (HOUSE_TITLES 구간)
  "t_house50",
  "t_house150",
  "t_house400",
  "t_house900",
  // ── 11/14 단계별 칭호 ──
  // 주간 1위 누적 횟수
  "t_champ3",
  "t_champ10",
  // 사냥 레벨
  "t_lv10",
  "t_lv20",
  "t_lv30",
  "t_lv40",
  "t_lv50",
  // 사냥 누적 처치 수
  "t_kill100",
  "t_kill1k",
  "t_kill5k",
  "t_kill20k",
  // 사냥터 끝까지 깨기 (어려움·지옥)
  "t_hard",
  "t_hell",
  // 11/15 사냥 끝판: 초월 레벨 ★60·★75·★90·★100 · 야근 빌딩 층 10·20·30·50·100 · 개척자 (끝판이 열린 뒤 14일 안, 번호는 web이 따로 저장)
  "t_tlv60",
  "t_tlv75",
  "t_tlv90",
  "t_tlv100",
  "t_floor10",
  "t_floor20",
  "t_floor30",
  "t_floor50",
  "t_floor100",
  "t_pioneer",
  // 11/15 세트 장비: 세트마다 4세트 처음 완성 (야근·결재·회의·출장) · 장비 하나 +15
  "t_sgOvertime",
  "t_sgApproval",
  "t_sgMeeting",
  "t_sgTrip",
  "t_enh15",
  // 11/15 신화 (서버에 한 사람): 서버 최초 30·50·100층 · 첫 ★100 · 꼭대기 층 주인(기록을 뺏기면 넘어감) · 이번 주 최고층(지난주 1위, 한 주 동안)
  "t_first30",
  "t_first50",
  "t_first100",
  "t_firstStar100",
  "t_topFloor",
  "t_weekFloor",
  // 11/15 서버 최초 +15 (신화)
  "t_firstEnh15",
  // 낚시 누적 마리 수
  "t_fishn50",
  "t_fishn300",
  "t_fishn1k",
  "t_fishn3k",
  // 가장 큰 물고기
  "t_big50",
  "t_big100",
  "t_big150",
  // 채집 누적 (곤충·약초버섯·광석·발굴품)
  "t_gath100",
  "t_gath500",
  "t_gath2k",
  "t_gath5k",
  // 연속 출석
  "t_att7",
  "t_att30",
  "t_att100",
  "t_att365",
  // 누적 접속 시간
  "t_stay1",
  "t_stay10",
  "t_stay50",
  "t_stay100",
  "t_stay300",
  // 꾸미기 점수
  "t_look200",
  "t_look600",
  "t_look1500",
  "t_look3000",
  // 11/15 수집 의뢰: 끝낸 수 50·300·1000·2500 · 수집왕 (도장 교환소 수집가 유령 외형)
  "t_quest50",
  "t_quest300",
  "t_quest1k",
  "t_quest2500",
  "t_qking",
  // 11/15 긴급 의뢰 (받은 뒤 하루만): 가장 많이 낸 사람 · 마지막 1분에 100%를 채운 사람
  "t_urgKing",
  "t_urgLast",
] as const;
export type TitleId = (typeof TITLE_IDS)[number];
const titleSet = new Set<string>(TITLE_IDS);
/** 칭호 id인지 */
export function isTitleId(id: unknown): id is TitleId {
  return typeof id === "string" && titleSet.has(id);
}
/** 착용 목록의 칭호 (없으면 null) */
export function titleOfLook(look: readonly string[] | null | undefined): TitleId | null {
  for (const id of look ?? []) if (isTitleId(id)) return id;
  return null;
}
