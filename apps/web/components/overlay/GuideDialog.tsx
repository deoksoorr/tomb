"use client";

import type { ReactNode } from "react";
import {
  AWAY_PLACE_LABEL,
  AWAY_PLACES,
  BALLOON_FLIGHT_MS,
  BALLOON_SEATS_EACH,
  CHAT_HISTORY_MS,
  CHAT_MAX,
  CHAT_RECENT_MS,
  CHAT_STORE_MAX,
  CHAT_SHOW_MS,
  COSMETIC_DURATION_MS,
  DECOR_DURATION_MS,
  DEFAULT_CHANNEL_CAPACITY,
  DEFAULT_MAX_CHANNELS,
  FERRIS_CAR_SEATS,
  FERRIS_PERIOD_MS,
  FRIEND_LEAVE_GRACE_MS,
  FRIEND_MAX,
  FRIEND_REQUEST_KEEP_DAYS,
  GOBLIN_JACKPOT_POINTS,
  GRAVE_STYLES,
  GRAVEYARD_CAPACITY,
  isShopListed,
  itemById,
  ITEMS,
  LANE_LOTS,
  MAIN_LOTS,
  MAX_DECOR_PER_GRAVE,
  NAME_MAX,
  NAME_MIN,
  PERMANENT_MULTIPLIER,
  permanentPrice,
  SEA_TITLE,
  TIDE_PERIOD_MIN,
  ZOO_SHOP_PETS,
} from "@tomb/protocol";
import { ATTEND_STAY_TEXT } from "@/lib/attendStay";
import { calendarRewards } from "@/lib/calendar";
import { DAY_RESET_TEXT } from "@/lib/gameDay";
import { FIRST_REWARD, FIRST_STEPS, PATH, PATH_NAME, PATH_WEAR_DAYS, TODO_BONUS_GIFT, TODO_COUNT, TODO_GIFT, TODO_PROT_EVERY } from "@/lib/retain";
import { bundleText, rewardText } from "@/lib/rewardText";
import { REF_DAY_MIN, REF_LANTERN_ONCE, REF_NEED_DAYS, refRewardText } from "@/lib/referralRules";
import { stayText } from "@/lib/stayTime";
import { SEA_COTTAGE_RATE, SEA_LOT_COUNT, SEA_VILLA_RATE } from "@/lib/housing/catalog";
import { BUILDS } from "@/lib/rpg/builds";
import { CURSES, TOWER_CHECKPOINT_EVERY, TOWER_CHEST_FROM, TOWER_FIRSTS, TOWER_LOW_CHECKPOINTS, TOWER_STEEP_FROM } from "@/lib/rpg/tower";
import { goblinPointsText, goblinRangeText } from "./goblinText";
import { ATTEND_TIER_GUIDE } from "@/lib/attendTiers";
import { EARN_RULES } from "@/lib/economy";
import { DYE_TIME_MS } from "@/lib/dye/palette";
import { AUTO_PACE_NOTE, AUTO_RANK_NOTE } from "@/lib/forage/auto";
import { BAG_MAX, DEX_NEW_REWARD, GRADE_PRICE_NOTE } from "@/lib/forage/catalog";
import { SKY_LABEL_ORDER, WEATHER_BLOCK_MS, WEATHER_LABELS, WEATHERS } from "@/lib/ambience";
import { PLOT_TIERS, plotCost } from "@/lib/housing/catalog";
import { DYE_SPECIAL_BONUS, LOOK_SCORE_DIVISOR } from "@/lib/lookScore";
import { BRANCH_INFO, BRANCHES, POTIONS, TIER_GATES } from "@/lib/rpg/catalog";
import { SKILL_SLOTS } from "@/lib/rpg/hotbar";
import { PIONEER_DAYS, PIONEER_FLOOR } from "@/lib/rpg/endgame";
import { MAX_LEVEL } from "@/lib/rpg/formulas";
import { RESPEC_MAX_COST, respecCost } from "@/lib/rpg/skillRules";
import { STAY_BONUS_EVERY_MINUTES } from "@/lib/stayBonus";
import { DORMANT_DAYS } from "@/lib/store/types";
import { DEFAULT_PASS_DAYS, NAME_CHANGE_COOLDOWN_DAYS, NAME_CHANGE_PRICE, PRESENCE_INTERVAL_MS, SHRINE_KEEP_DAYS } from "@/lib/types";
import { RESIDENTS } from "@/game/world/life/residentData";
import { keyJosa, keyName } from "@/game/input/keyHint";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { durationLabel, effectLabel, KIND_LABELS } from "../account/items";
import Link from "next/link";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import ItemIcon from "../ui/ItemIcon";
import { InquiryButton } from "../notice/InquiryDialog";
import { OddsLink } from "../odds/OddsLayer";
import { QUEST_DAILY, QUEST_STAMPS } from "@/lib/forage/quests/catalog";
import styles from "./GuideDialog.module.css";

const won = (n: number) => n.toLocaleString("ko-KR");
/** 칭호 이름 뒤 「과/와」 (마지막 글자 받침 — 한글이 아니면 「와」) */
const titleAnd = (name: string) => {
  const c = name.charCodeAt(name.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0 ? "과" : "와";
};
const petPrices = ZOO_SHOP_PETS.map((p) => p.price);
/** 첫 걸음 미션 한 칸 포인트 범위 (lib/retain FIRST_STEPS) */
const firstPoints = FIRST_STEPS.map((st) => st.reward.points ?? 0);
const firstLo = Math.min(...firstPoints);
const firstHi = Math.max(...firstPoints);

/** 표 한 장: 첫 칸은 행 제목. 좁은 화면에서는 줄마다 카드처럼 쌓인다 (data-label이 칸 이름) */
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([first, ...rest], i) => (
          <tr key={i}>
            <th scope="row">{first}</th>
            {rest.map((cell, j) => (
              <td key={j} data-label={head[j + 1]}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CONTROLS: ReactNode[][] = [
  ["걷기", "WASD 또는 방향키", "화면 왼쪽을 누르고 끌기"],
  ["달리기", "Shift 누른 채 걷기", "달리기 버튼"],
  ["점프", "Space", "점프 버튼"],
  ["앉기·일어서기", "X 또는 C", "앉기 버튼"],
  ["말 걸기·타기·살펴보기", "E", "상호작용 버튼"],
  ["문으로 들어가기·나가기", "문 앞에서 E", "문 앞에서 [들어가기]나 [나가기]"],
  ["메뉴", "왼쪽 아래 [메뉴]", "왼쪽 위 [메뉴]"],
  ["가방·사냥·도감·집·알림", "왼쪽 아래 바로 가기 줄", "[메뉴] 안에"],
  ["표현 창 (말풍선·이모티콘)", "T", "점프 왼쪽 [표현]"],
  ["바다 보기 (바닷가에서 앉아 있을 때)", "V", "[바다 보기] 버튼"],
  ["갈매기 과자 던지기 (바닷가)", "F", "위 과자 칸의 [과자 던지기]"],
  ["채팅", "Enter로 열고, 쓴 뒤 Enter (Esc는 닫기)", "[채팅] 버튼"],
  ["즐겨찾기 표현", "Y를 누르고 고르기 (1~8도 돼요)", "[표현] 길게 누르기"],
  ["손 흔들기·환호", "1, 2", "메뉴의 감정 표현"],
  ["이모티콘 바로 보내기", "3~9", "[표현] 창에서"],
  ["벤치 상태", "앉아서 T", "앉아서 [표현]"],
  ["가방", "I", "메뉴의 가방"],
  ["내 정보", "P", "메뉴의 내 정보"],
  ["랭킹", "L", "메뉴의 랭킹"],
  ["이번 주 레이스", "U", "메뉴의 이번 주 레이스"],
  ["지도 펴고 접기", "M", "오른쪽 위 [지도]"],
  ["출석 달력", "B", "메뉴의 출석 달력"],
  ["친구", "O", "메뉴의 친구"],
  ["공지", "N", "메뉴의 공지"],
  ["폭죽 쏘기", "G", "메뉴의 폭죽 쏘기"],
  ["펫 타기·내리기", "R", "타기 버튼"],
  ["확대·축소", "마우스 휠 또는 ＋/－", "두 손가락 또는 ＋/－"],
  ["둘러보기", "오른쪽 버튼으로 끌기", "두 손가락으로 끌기"],
  ["시점 되돌리기", "[내 캐릭터로]", "[내 캐릭터로]"],
  ["촬영 모드 (사진 찍기)", "K 또는 오른쪽 위 카메라 단추 (Esc로 끝내기)", "메뉴의 촬영 모드"],
  ["마을 소식", "왼쪽 위 음악 옆 [마을 소식]", "위쪽 [📌 소식] (고정 소식이 있을 때)"],
  ["알림 (내 묘비·집에 생긴 일)", "왼쪽 아래 [알림]", "메뉴의 알림"],
  ["친구", "캐릭터를 누르고 [친구 신청]", "캐릭터를 누르고 [친구 신청]"],
];

const sec = (ms: number) => Math.round(ms / 1000);
const min = (ms: number) => Math.round(ms / 60_000);

/** 채팅: 숫자는 protocol chat.ts에서 */
const CHAT: ReactNode[][] = [
  ["쓰기", `${CHAT_MAX}자까지 써요. 머리 위 말풍선에 ${sec(CHAT_SHOW_MS)}초 뜨고, 왼쪽 아래 채팅창에도 떠요.`],
  ["누구에게", "같은 채널 마을에 있는 사람에게 보여요. 집 안이면 그 집에 있는 사람에게만 보여요."],
  ["기록", `채팅은 ${CHAT_HISTORY_MS / 3_600_000}시간 동안 남아요. 늦게 들어와도 같은 곳 최근 ${CHAT_STORE_MAX}줄은 보여요. ${min(CHAT_RECENT_MS)}분 지난 줄은 흐리게 보여요. 기기에는 저장하지 않아요.`],
  ["가림·막힘", "욕설은 ***로 가려져요. 너무 빨리 치면 잠깐 막혀요."],
  ["알림음", "다른 사람 글이 오면 작은 소리가 나요. 음악 창에서 끌 수 있어요."],
];

/** 친구: 숫자는 protocol friends.ts에서 */
const FRIENDS: ReactNode[][] = [
  ["맺기", `캐릭터를 누르고 [친구 신청]을 보내요. 상대가 받으면 친구가 돼요. 친구는 ${FRIEND_MAX}명까지예요.`],
  ["친구 창", "친구가 지금 어디 있는지, 언제 들어왔는지 보여요. 꾸미기 점수, 사냥 레벨, 도감도 볼 수 있어요."],
  ["친구한테 가기", "친구 옆으로 바로 가요. 다른 채널이나 집 안에 있어도 따라가요. 친구가 캠핑장이나 바닷가에 있으면 버스를 타고 가요."],
  ["알림", "친구가 들어오거나 나가면 작은 알림이 떠요. 친구 창에서 끌 수 있어요."],
];

/** 곳·탈것·채집 표: 터치 기기(화면 버튼)는 E 대신 [상호작용] 버튼으로 적는다 */
const places = (touch: boolean): ReactNode[][] => [
  ["모닥불", "모닥불 광장", "곁에 앉아 같이 불멍해요"],
  ["소원 분수", "큰 모닥불 북쪽", "하루 한 번 동전 던지기"],
  ["귀신의집", "큰 모닥불 북쪽, 소원 분수 옆", "혼자 들어가는 공포 미로예요"],
  ["유령 잡화점", touch ? "상점 주인장에게 [말 걸기]" : "상점 주인장에게 E", "꾸미기, 폭죽, 염색권을 팔아요"],
  ["범퍼카장", "가운데 다리 건너 바로", `입구에서 ${keyJosa("E", "로", touch)} 타요. 무료예요`],
  ["동물원", "서쪽 다리 건너 바로", `사육사에게 펫 분양 (${won(Math.min(...petPrices))}~${won(Math.max(...petPrices))}P)`],
  // 11/20 강아지·고양이 펫과 집 가구는 정문 옆 분양사 보리만 판다
  ["분양사 보리", "동물원 정문 왼쪽", "강아지와 고양이 펫, 집 가구를 팔아요"],
  ["의뢰 게시판", "캠핑장행 정류장 왼쪽 쉼터 광장", "의뢰 게시판과 긴급 의뢰 현판이 있어요"],
  ["언젠가 캠핑장", `캠핑장행 정류장에서 ${keyJosa("E", "로", touch)} 버스 타기`, "계곡 낚시를 하고 바베큐를 사 먹어요. 먹으면 몸이 커지거나 빨라져요."],
  [
    SEA_TITLE,
    `바닷가행 정류장에서 ${keyJosa("E", "로", touch)} 버스 타기`,
    `물때가 ${TIDE_PERIOD_MIN / 60}시간마다 돌아요. 물이 빠지면 갯벌을 파고, 갈매기에게 과자도 던져요. 포구 오두막 터 ${SEA_LOT_COUNT}곳에 집을 지을 수 있어요.`,
  ],
  ["낚시 잔교", "호수 서쪽, 호박밭 옆", "어부 영감 노점과 낚시 의자가 있어요"],
  ["낚시", "호수 잔교, 호수 둑, 강둑, 연못, 조각배 위", `낚시 의자 앞에서 ${keyName("E", touch)}`],
  ["수집가", "동물원과 오리배 사이 둑", "약초, 광석, 발굴품, 곤충을 사 가요"],
  ["망원경", "북서쪽 언덕 위, 옛 묘역 오른쪽", "별자리 잇기를 해요. 언덕 말고도 마을 곳곳에 있고, 한 대에 한 사람씩 봐요. 맑은 밤엔 아주 드물게 전설 「유성우 오라」가 떨어져요."],
  ["사냥터", "메뉴의 사냥터", "혼자나 같이 사냥하고 미니게임도 해요"],
  ["분양 사무소", "메뉴의 집", "내 집을 받아 꾸며요"],
  ["옛 묘역 입구 팻말", "북서쪽 언덕 오르는 길 앞, 유령 잡화점 서쪽", `${keyJosa("E", "로", touch)} 성황당을 열어요. 이장한 묘비를 다시 모시고 성불한 이야기들도 봐요.`],
  ["황금 고블린", "가끔 마을 어딘가", `가장 먼저 잡으면 ${goblinRangeText()}, 가끔 대박 ${goblinPointsText(GOBLIN_JACKPOT_POINTS)}P예요. 누가 잡았는지 채널 모두에게 알려요.`],
  [
    "마을 주민",
    `${RESIDENTS.slice(0, 2)
      .map((r) => r.name)
      .join("·")} 등, 저마다 맡은 구역`,
    `다가가서 ${keyJosa("E", "로", touch)} 말을 걸어요. 가끔 게임 팁도 알려 줘요.`,
  ],
  ["강아지·고양이", "모닥불 둘레 등 마을 곳곳", `다가가서 ${keyJosa("E", "로", touch)} 쓰다듬어요`],
];

const rides = (touch: boolean): ReactNode[][] => [
  ["관람차", `맨 아래 칸에서 ${keyName("E", touch)} (칸당 ${FERRIS_CAR_SEATS}명)`, `한 바퀴(약 ${sec(FERRIS_PERIOD_MS)}초) 뒤 저절로`],
  ["열기구", `열기구 타는 곳에서 ${keyName("E", touch)} (${BALLOON_SEATS_EACH}명)`, `마을 위를 돌아 약 ${min(BALLOON_FLIGHT_MS)}분`],
  touch ? ["도중에 내리기", "[앉기] 두 번", "[상호작용]·[점프]를 두 번 눌러도 돼요"] : ["도중에 내리기", "X 두 번 (E·Space도)", "휴대폰은 [앉기] 두 번"],
  ["시점 바꾸기", "V 또는 [시점 변경하기]", "[시점 변경하기]"],
  ["조각배", `나루터에서 ${keyName("E", touch)} (2인승)`, `물가 가까이에서 ${keyJosa("E", "로", touch)} 내려요`],
  touch
    ? ["오리배", "오리배 타는 곳에서 [상호작용] (2인승). [꽥!]을 누르면 꽥!", "물가에서 [상호작용] 버튼으로 내려요."]
    : ["오리배", "오리배 타는 곳에서 E (2인승). Space는 꽥!", "물가에서 E로 내려요. 휴대폰은 [꽥!] 버튼이 있어요."],
  touch
    ? ["범퍼카", "범퍼카장 입구에서 [상호작용] (한 대에 1명, 8대)", "조이스틱으로 달리고 [빵빵!]으로 경적을 울려요. 입구 안쪽에서 [상호작용] 버튼으로 내려요."]
    : ["범퍼카", "범퍼카장 입구에서 E (한 대에 1명, 8대)", "방향키로 달리고 Space로 빵빵 울려요. 입구 안쪽에서 E로 내려요."],
  ["타는 펫", touch ? "[타기] (데리고 있을 때)" : "R (데리고 있을 때)", "앉거나 낚시하거나 물에 들어가면 내려요"],
];

const HUNT_KEYS: ReactNode[][] = [
  ["공격", "Space · J", "공격 버튼"],
  ["낙법", "Z · K (6초마다, 구르는 동안 안 맞아요)", "구르기 버튼"],
  ["스킬", `1~${SKILL_SLOTS}, 궁극기는 F`, "스킬 버튼"],
  ["스킬 자동", "칸 오른쪽 클릭 (X는 전부)", "칸 길게 누르기 ([자동]은 전부)"],
  ["키 안내", "H", "—"],
  ["물약", "Q, E, R", "물약 버튼"],
  ["멈춤", "Esc", "멈춤 버튼"],
];

/** 스킬 트리: 갈래·단 조건·초기화 비용은 lib/rpg에서 */
const SKILL_TREE: ReactNode[][] = [
  ["갈래", `${BRANCHES.map((b) => `${BRANCH_INFO[b].name}(${BRANCH_INFO[b].role.replaceAll(" · ", "·")})`).join(", ")}`],
  ["단", `갈래마다 ${TIER_GATES.length}단이 있어요. 아래 단에 포인트를 ${TIER_GATES.slice(1).join(", ")}만큼 쓰면 위 단이 하나씩 열려요.`],
  ["포인트", "랭크 하나에 1포인트예요. 레벨이 오를 때와 초월 레벨이 오를 때 받아요."],
  ["선행", "선으로 이어진 스킬은 앞 스킬을 정해진 랭크까지 찍어야 배워요"],
  ["대표 빌드", `갈래마다 둘씩 ${BUILDS.length}가지예요. 핵심 스킬은 받쳐 주는 스킬 랭크만큼 세지고, 몰아 찍으면 야근 빌딩에서 받는 피해도 줄어요. 찍는 순서는 [사냥 안내서]에 있어요.`],
  ["초월 수련", "초월 레벨마다 1포인트씩 받아 물공, 마공, 공통 칸에 나눠 찍어요. 되돌리기는 무료예요."],
  ["단축 칸", `배운 스킬을 스킬 탭 아래 칸에 끌어다 놓아요. 칸은 ${SKILL_SLOTS}개고, 궁극기는 F 칸에만 들어가요. 패시브는 칸 없이 늘 켜져요.`],
  ["초기화", `레벨에 따라 ${respecCost(1)}~${RESPEC_MAX_COST}P가 들어요`],
];

const forage = (touch: boolean): ReactNode[][] => [
  ["낚시", `의자 앞에서 ${keyName("E", touch)}, 입질이 오면 꾹 눌러 감기`, `물고기가 세게 당기면 잠깐 놓아요. 아주 가끔 물에 빠진 꾸미기도 걸려요. 낚시 중에도 ${touch ? "[채팅]으로" : "Enter로"} 채팅할 수 있어요.`],
  [
    "자동 낚시",
    "낚시 중 [자동 낚시 켜기]",
    `다른 탭을 봐도 낚아요. ${AUTO_PACE_NOTE} 하루 한도도 시간 제한도 없어요. 움직이거나 탭을 닫으면 꺼져요. 가방은 물고기와 채집물을 합쳐 ${BAG_MAX}개까지라, 가득 차면 팔 때까지 쉬어요. ${AUTO_RANK_NOTE}`,
  ],
  // 11/22 직접 낚은 대물·월척은 더 비싸요 (catalog GRADE_PRICE_NOTE)
  ["팔기", "물고기는 어부 영감, 채집물은 수집가에게", `희귀할수록 비싸요. ${GRADE_PRICE_NOTE}`],
  ["도감", "왼쪽 아래 [도감]", `새 종을 처음 올리면 ${DEX_NEW_REWARD[1]}~${DEX_NEW_REWARD[5]}P를 받아요. 희귀할수록 많이 받아요. 절반이나 전부 모으면 칭호도 받아요.`],
  // 11/15 수집 의뢰 (lib/forage/quests)
  [
    "수집 의뢰",
    `캠핑장행 정류장 왼쪽 의뢰 게시판에서 ${keyName("E", touch)}`,
    `오늘의 의뢰는 ${QUEST_DAILY}개예요. ${DAY_RESET_TEXT}에 새로 나오고, 하루 1번 무료로 바꿀 수 있어요. 월요일마다 이번 주 큰 의뢰도 1개 나와요. 모은 것을 납품하면 의뢰 도장을 ${QUEST_STAMPS.easy}~${QUEST_STAMPS.hard}개, 큰 의뢰는 ${QUEST_STAMPS.weekly}개 받아요. 끝낸 수로 칭호도 받아요. 어디서든 ${touch ? "메뉴의 [의뢰 보기]" : "바로 가기 줄의 [의뢰]"}로 의뢰를 볼 수 있어요.`,
  ],
  ["긴급 의뢰", "의뢰 게시판 오른쪽 긴급 의뢰 현판", "가끔 갑자기 열려요. 서버 모두가 같이 막대를 채우고, 혼자서도 끝까지 낼 수 있어요. 1개만 내도 보상을 받아요."],
  ["도장 교환소", "의뢰 게시판의 [도장 교환소] 칸", "이달의 물건은 매달 1일 새벽 5시에 바뀌고, 염색권은 늘 있어요. 도장은 사라지지 않지만 포인트로 바꾸거나 남에게 줄 수는 없어요."],
];

const DYE: ReactNode[][] = [
  ["판 옮기기", "WASD나 방향키, 끌기 (Shift는 빠르게)", "끌기"],
  ["확대·축소", "휠 또는 ＋/－", "두 손가락"],
  ["색 고르기", "가운데 조준점 아래 색", "가운데 조준점 아래 색"],
  ["확정", "[이 색으로 염색] 또는 Enter", "[이 색으로 염색]"],
];

/** 숫자는 전부 정책·카탈로그에서 읽는다 (정책을 바꾸면 가이드도 바뀐다) */
type Props = { onClose: () => void; onReplayTutorial: () => void };

export default function GuideDialog({ onClose, onReplayTutorial }: Props) {
  const touch = useMediaQuery("(pointer: coarse)");
  const cal = calendarRewards();
  const freeStyles = GRAVE_STYLES.filter((s) => s.free)
    .map((s) => s.name)
    .join(", ");
  return (
    <Dialog title="At one time... 안내" onClose={onClose}>
      <div className={styles.guide}>
        {/* 11/18 무작위 보상 확률은 따로 한 창에 (사냥 드롭·상자·강화·낚시·소원 분수 등) */}
        <p className={styles.lead}>
          드롭, 상자, 강화처럼 무작위로 정해지는 것들의 확률은 <OddsLink section="top" label="확률 안내" before={onClose} />에서 볼 수 있어요.
        </p>
        <section>
          <h3>조작</h3>
          <Table head={["하는 일", "컴퓨터", "휴대폰"]} rows={CONTROLS} />
        </section>

        <section>
          <h3>채팅·친구</h3>
          <Table head={["채팅", "내용"]} rows={CHAT} />
          <Table head={["친구", "내용"]} rows={FRIENDS} />
          <details className={styles.more}>
            <summary>친구 더 알아보기</summary>
            <ul className={styles.points}>
              <li>같은 채널 마을에 있는 친구는 지도에 분홍 하트로 보여요. 친구 집이 있으면 [집 놀러 가기]로 구경해요.</li>
              <li>
                {/* 11/19 2단지(분양 마을)는 닫혀서 목록에서 뺀다 */}
                {`친구가 ${AWAY_PLACES.filter((p) => p !== "house" && p !== "village")
                  .map((p) => AWAY_PLACE_LABEL[p])
                  .join(", ")}에 있으면 따라갈 수 없어요. 못 가면 이유를 알려 줘요.`}
              </li>
              <li>바베큐를 먹고 몸이 커진 동안은 버스를 탈 수 없어서, 다른 곳에 있는 친구한테도 못 가요.</li>
              <li>새로고침이나 채널 이동으로 잠깐 끊겨도 {sec(FRIEND_LEAVE_GRACE_MS)}초 안에 돌아오면 나감 알림이 뜨지 않아요.</li>
              <li>답하지 않은 신청은 {FRIEND_REQUEST_KEEP_DAYS}일 뒤 사라져요. 운영자와는 친구를 맺을 수 없어요.</li>
              <li>친구를 맺어도 포인트나 아이템은 주지 않아요.</li>
            </ul>
          </details>
        </section>

        <section>
          <h3>마을 둘러보기</h3>
          <Table head={["곳", "어디", "하는 일"]} rows={places(touch)} />
          <ul className={styles.points}>
            <li>귀신의집에는 깜짝 놀라는 장면과 큰 소리가 있어요. 포인트는 주지 않아요.</li>
            <li>{touch ? "오른쪽 위 [지도]" : "M이나 오른쪽 위 [지도]"}로 지도를 펴면 장소마다 표시가 있어요. 자세한 건 각 장소에서 안내해요.</li>
            <li>
              {`하늘은 한국 시간에 맞춰 ${SKY_LABEL_ORDER.join(", ")}으로 바뀌어요. 날씨는 ${min(WEATHER_BLOCK_MS)}분마다 ${WEATHERS.map((w) => WEATHER_LABELS[w]).join(", ")} 가운데 하나로 바뀌어요.`}
            </li>
            <li>
              {`주거 구역은 광장 동쪽 1~${MAIN_LOTS}번지와 바닷가행 정류장 위 등불 골목 ${MAIN_LOTS + 1}~${MAIN_LOTS + LANE_LOTS.length}번지예요.`}
            </li>
            <li>{touch ? "메뉴의 [촬영 모드]" : "K나 오른쪽 위 카메라 단추"}로 단추를 숨기고 사진을 찍을 수 있어요. 필터는 내 화면에만 보여요.</li>
            <li>연한 초록 이름표를 단 마을 주민은 실제 사람이 아니에요. 그날그날 나오는 수가 달라요.</li>
          </ul>
        </section>

        <section>
          <h3>탈것</h3>
          <Table head={["탈것", "타기", "비고"]} rows={rides(touch)} />
          <ul className={styles.points}>
            <li>시점을 바꾸면 옆에서 보는 장면과 마을 위에서 내려다보는 장면을 오가요. 마지막에 고른 시점을 기억해요.</li>
            <li>펫은 한 번에 한 마리만 데리고 다녀요. 타는 펫은 동물원에서 분양받아요.</li>
          </ul>
        </section>

        <section>
          <h3>포인트</h3>
          <Table
            head={["이렇게 하면", "포인트", "하루 최대"]}
            // 11/19 출석 보상은 사냥 아이템이라 포인트 표에서 뺀다 (출석 달력에 따로 보인다)
            rows={EARN_RULES.filter((r) => r.dailyMax !== 0).map((r) => [
              <>
                {r.label}
                <span className={styles.note}>{r.note}</span>
              </>,
              r.points ? `+${r.points}` : "설명대로",
              r.dailyMax === null ? "없음" : r.dailyMax,
            ])}
          />
          <Table
            head={["규칙", "내용"]}
            rows={[
              ["하루 한도", "놀아서 버는 포인트는 한도가 없어요. 헌화, 묘비, 받은 헌화와 좋아요만 위 표의 하루 최대가 있어요. 한국 시간 새벽 5시에 다시 세요."],
              ["접속 시간 보너스", `${STAY_BONUS_EVERY_MINUTES}분 머물 때마다 생겨요. 오래 있을수록 계속 받아요.`],
              ["머무르기", `${PRESENCE_INTERVAL_MS / 60_000}분마다 받아요. 다른 창을 봐도 괜찮아요.`],
              [
                "출석",
                `마을에 ${ATTEND_STAY_TEXT} 머물면 그날 도장을 찍어요. 포인트 대신 사냥 가방에 아이템이 들어와요. 도장마다 ${cal.daily}, ${cal.streakEvery}일 연속마다 ${cal.streak}, 한 달 개근이면 ${cal.monthly}이에요.`,
              ],
              ["이번 달 출석 보상", ATTEND_TIER_GUIDE],
              [
                "친구 초대",
                `가입할 때만 친구의 추천 코드를 넣을 수 있어요. 하루 ${stayText(REF_DAY_MIN)} 넘게 머문 날이 ${REF_NEED_DAYS}일이 되면 둘 다 ${refRewardText()}을 받아요. ${REF_LANTERN_ONCE} 내 추천 코드는 내 정보에서 봐요.`,
              ],
              ["랭킹", "포인트, 사냥, 사냥 레벨, 야근 빌딩, 낚시, 꾸미기, 집 꾸미기, 접속 시간, 헌화 순위가 있어요. 포인트 순위는 써도 줄지 않아요. 주간 순위는 월요일 새벽 5시에 새로 시작해요. 운영자는 순위에 안 들어가요."],
            ]}
          />
        </section>

        <section>
          <h3>새로 온 이웃에게</h3>
          <p>
            「{PATH_NAME}」 {PATH.length}개가 가입한 날부터 하루 하나씩 열려요. 못 받은 날 것은 쌓여 있다가 한꺼번에 받고, {PATH.length}개를 다 받으면 끝나요.
            꾸러미는 {DAY_RESET_TEXT}에 열리고, 꾸미기는 {PATH_WEAR_DAYS}일 동안 입어요.
          </p>
          <Table head={["날", "꾸러미"]} rows={PATH.map((g) => [`${g.n}일째`, g.title ? `칭호 「${g.name}」${titleAnd(g.name)} 꽃 머리핀(${PATH_WEAR_DAYS}일), 강화 증폭권 1장` : g.wear ? `${g.name}(${PATH_WEAR_DAYS}일)` : g.name])} />
          <Table
            head={["이것도 있어요", "내용"]}
            rows={[
              [
                "첫 걸음 미션",
                `마을에서 할 수 있는 것 ${FIRST_STEPS.length}가지를 하나씩 알려 줘요. 처음 할 때마다 ${won(firstLo)}~${won(firstHi)}P를 주고, 다 하면 ${won(FIRST_REWARD.points)}P와 ${itemById(FIRST_REWARD.itemId)?.name ?? "꾸미기"} 하루권, ${bundleText(FIRST_REWARD.bundle)}을 더 줘요. 다 받으면 사라져요.`,
              ],
              [
                "오늘 미션",
                `날마다 ${DAY_RESET_TEXT}에 미션 ${TODO_COUNT}개가 무작위로 나와요. 마을 일, 놀이, 나들이에서 하나씩 골라 줘요. [안내]를 누르면 그곳까지 화살표가 이어져요. 하나에 ${rewardText(TODO_GIFT)}, ${TODO_COUNT}개를 다 하면 ${rewardText(TODO_BONUS_GIFT)}과 도장 하나를 더 받아요. 도장 ${TODO_PROT_EVERY}개마다 강화 증폭권도 받아요.`,
              ],
            ]}
          />
        </section>

        <section>
          <h3>사냥</h3>
          <Table head={["하는 일", "컴퓨터", "휴대폰"]} rows={HUNT_KEYS} />
          <ul className={styles.points}>
            <li>
              사냥, 곤충 채집, 별자리 잇기 포인트는 하루 한도 없이 받아요. 주운 장비나 물약을 판 값도 사냥 포인트에 들어가요.
            </li>
            <li>
              {`레벨 ${MAX_LEVEL}부터는 지옥 사냥터와 야근 빌딩에서 초월 레벨(★51~★100)을 올려요. 초월 레벨이 오를 때마다 능력치 포인트, 스킬 포인트, 초월 수련 포인트를 1개씩 받아요. 하루에 할 수 있는 판 수는 정해져 있지 않아요.`}
            </li>
            <li>
              {`야근 빌딩은 마을 북쪽 판교의 등대 왼쪽에 있어요. 사냥 레벨 ${MAX_LEVEL}부터 들어갈 수 있어요. 1층부터 쓰러질 때까지 쭉쭉 올라가요. ${TOWER_STEEP_FROM}층까지는 몬스터가 약한 편이라 금방 오르고, 그 위로는 빠르게 세져요. ${CURSES[0].from}층부터는 저주가 하나씩 붙어요. 이번 주 최고 층으로 순위를 겨뤄요.`}
            </li>
            <li>
              {`층을 깰 때마다 초월 EXP를 받고, 쓰러져도 깬 만큼은 받아요. ${TOWER_CHEST_FROM}층부터는 우두머리 층을 깨면 상자가 열려요. 몇 번이든 도전할 수 있어요. 깨 둔 층까지는 엘리베이터로 ${TOWER_LOW_CHECKPOINTS.join("층, ")}층, 그 위로는 ${TOWER_CHECKPOINT_EVERY}층마다 골라서 시작해요.`}
            </li>
            <li>
              {`끝판이 열리고 ${PIONEER_DAYS}일 안에 ★51이 되거나 ${PIONEER_FLOOR}층을 넘으면 「개척자 #번호」 칭호를 받아요. 서버에서 처음 ${TOWER_FIRSTS.map((f) => f.floor).join(", ")}층을 깬 사람과 지금 최고 층 주인은 신화 칭호를 받아요.`}
            </li>
            <li>공격, 스킬, 몬스터 패턴은 사냥터의 [사냥 안내서]에 자세히 있어요.</li>
          </ul>
          <Table head={["스킬 트리", "내용"]} rows={SKILL_TREE} />
          <ul className={styles.points}>
            <li>스킬 트리가 크게 바뀌면 모두의 스킬이 초기화돼요. 그때는 스킬 포인트를 전부 돌려받아요.</li>
          </ul>
          <details className={styles.more}>
            <summary>상태 이상과 물약</summary>
            <p className={styles.lead}>몬스터에게 맞으면 독이나 화상 같은 상태 이상에 걸릴 수 있어요. 물약으로 풀어요.</p>
            <Table head={["물약", "효과"]} rows={POTIONS.map((p) => [p.key ? `${p.name} (${p.key})` : p.name, p.desc])} />
          </details>
        </section>

        <section>
          <h3>낚시·채집·도감</h3>
          <Table head={["하는 일", "방법", "비고"]} rows={forage(touch)} />
        </section>

        <section>
          <h3>꾸미기와 물건</h3>
          <Table
            head={["종류", "얻는 곳", "쓰면"]}
            rows={[
              [KIND_LABELS.cosmetic, "유령 잡화점", `입으면 ${durationLabel(COSMETIC_DURATION_MS)} 동안 써요. 이용권 값의 ${PERMANENT_MULTIPLIER}배로 영구 소장도 할 수 있어요.`],
              ["펫", "동물원 사육사, 분양사 보리", "평생 함께해요. 한 번에 한 마리씩 데리고 다녀요."],
              [KIND_LABELS.firework, "유령 잡화점", "쏘면 사라지고 같은 채널 모두가 봐요. 놀이기구를 타는 중에는 위쪽 폭죽 버튼으로 쏴요."],
              [KIND_LABELS.dye, "잡화점 염색·외형 탭", "한 번 염색하면 사라져요"],
              [KIND_LABELS.graveStyle, "유령 잡화점", "묘비를 세우거나 바꿀 때 1개 써요"],
              [KIND_LABELS.decor, "가방에서 내 묘비에", `${durationLabel(DECOR_DURATION_MS)} 동안 놓여 있어요. 묘비 하나에 ${MAX_DECOR_PER_GRAVE}개까지예요.`],
            ]}
          />
          <ul className={styles.points}>
            <li>같은 부위는 마지막에 입은 것으로 바뀌어요. 잡화점 코디는 모두 영구 소장으로도 살 수 있어요.</li>
            <li>
              {`꾸미기 점수는 지금 입은 코디로 매겨요. 영구 소장 값 ${LOOK_SCORE_DIVISOR}P마다 1점이에요. 특수 염색은 부위마다 ${DYE_SPECIAL_BONUS}점을 더 줘요. 기간제가 끝나면 그 점수도 빠져요. 순위는 랭킹 [꾸미기] 탭에서 봐요.`}
            </li>
          </ul>
          <details className={styles.more}>
            <summary>잡화점 물건 전체 보기</summary>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">물건</th>
                  <th scope="col">가격</th>
                  <th scope="col">효과</th>
                </tr>
              </thead>
              <tbody>
                {ITEMS.filter(isShopListed).map((item) => (
                  <tr key={item.id}>
                    <th scope="row">
                      <span className={styles.itemName}>
                        <ItemIcon itemId={item.id} size={32} />
                        <span>
                          {item.name}
                          <span className={styles.note}>{KIND_LABELS[item.kind]}</span>
                        </span>
                      </span>
                    </th>
                    <td data-label="가격">
                      {won(item.price)}
                      {/* 꾸미기는 영구 소장 값도 (카탈로그에서 계산 — 배율이 바뀌면 같이 바뀐다) */}
                      {permanentPrice(item.id) !== null && <span className={styles.note}>영구 {won(permanentPrice(item.id)!)}</span>}
                    </td>
                    <td data-label="효과">{effectLabel(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <section>
          <h3>염색</h3>
          <Table head={["하는 일", "컴퓨터", "휴대폰"]} rows={DYE} />
          <Table
            head={["알아 둘 것", "내용"]}
            rows={[
              ["시작", `부위를 고르고 ${DYE_TIME_MS / 1000}초 안에 색을 찾아요`],
              ["판", "판은 끝없이 이어져요. 특수 색이 드물게 숨어 있어요."],
              ["창 닫기", "바깥을 눌러도 안 닫혀요. 직접 닫으면 포기한 걸로 쳐요."],
              ["이어서 하기", "도중에 나가도 시간이 남았으면 가방이나 잡화점에서 이어 해요"],
              ["시간이 끝나면", "지금 색과 새 색 중에서 골라요"],
            ]}
          />
        </section>

        <section>
          <h3>집</h3>
          <Table
            head={["터", "처음 분양가", "가구"]}
            rows={PLOT_TIERS.map((t) => [t.name, `${won(plotCost(t.id))}P`, `${t.maxItems}개까지`])}
          />
          <Table
            head={["하는 일", "방법"]}
            rows={[
              ["분양", `분양 사무소에서 터 크기와 번지를 골라요. 채널마다 광장 동쪽 1~${MAIN_LOTS}번지와 바닷가행 정류장 위 등불 골목 ${MAIN_LOTS + 1}~${MAIN_LOTS + LANE_LOTS.length}번지가 있어요.`],
              [
                "포구 오두막",
                `바닷가 포구 부동산에서 오두막 터 ${SEA_LOT_COUNT}곳 중에 골라요. 값은 같은 크기 마을 집의 ${SEA_COTTAGE_RATE}배예요. 마을에 집이 있으면 별장이 되어 ${SEA_VILLA_RATE}배예요.`,
              ],
              ["넓히기", "작은 터에서 넓은 터, 대저택으로 넓혀요"],
              ["꾸미기", "가구와 외관을 사서 놓아요"],
              ["놀러 가기", "다른 집을 구경하고 좋아요나 방명록을 남겨요"],
              ["확대·축소", "집 안에서도 마우스 휠이나 두 손가락으로 해요"],
              ["드나들기", touch ? "문 앞에서 [들어가기]나 [나가기]를 눌러요. 나오면 그 집 문 앞에 서요." : "문 앞에서 E를 눌러요. 나오면 그 집 문 앞에 서요."],
            ]}
          />
        </section>

        <section>
          <h3>묘역과 묘비</h3>
          <Table
            head={["하는 일", "방법"]}
            rows={[
              ["묘비 쓰기", "메뉴의 묘비 쓰기 (한 사람에 하나)"],
              ["헌화", "묘비마다 하루 한 번 꽃을 놓아요. 놓는 사람과 받는 사람 모두 포인트를 받아요."],
              ["내 묘비 가기", "메뉴의 내 묘비 가기 (움직이면 멈춰요)"],
              ["성불", `세운 지 ${DEFAULT_PASS_DAYS}일 뒤예요. 바뀔 수도 있어요.`],
              ["성불한 이야기들", "메뉴에서 보고 검색도 해요"],
              ["디자인", `${freeStyles} 중에서는 무료로 골라요. 나머지는 디자인권이 있어야 해요.`],
              ["성황당", `옮긴 묘비를 ${SHRINE_KEEP_DAYS}일 맡아 줘요. 그 안에 다시 세울 수 있어요. 옛 묘역 입구 팻말이나 내 정보에서 열어요.`],
            ]}
          />
          <ul className={styles.points}>
            <li>
              묘역은 북서쪽 언덕 위 옛 묘역 한 곳이에요. 옛 묘역 입구 팻말 옆 길로 올라가요. 채널마다 {GRAVEYARD_CAPACITY}개까지 세울 수
              있어요. 자리가 모자라면 오래된 묘비부터 조금 일찍 성불해요.
            </li>
            <li>다시 모신 묘비는 성불 기간을 그때부터 다시 세요. 디자인은 내 묘비 상세에서도 바꿀 수 있어요.</li>
          </ul>
        </section>

        <section>
          <h3>계정과 채널</h3>
          <Table
            head={["항목", "내용"]}
            rows={[
              ["개인 코드", "내 정보의 개인 코드에서 봐요. 이 기기에서 만들었거나 코드로 들어왔을 때만 보여요. 꼭 적어 두세요."],
              ["다른 기기", "입장 화면에서 [코드로 시작]"],
              ["코드가 새면", "내 정보에서 [새 코드 발급]을 눌러요. 예전 코드는 바로 막혀요."],
              ["닉네임", `${NAME_MIN}~${NAME_MAX}자로 지어요. 다른 사람과 같은 이름은 못 써요. 처음 바꿀 때는 무료, 그 뒤로는 ${won(NAME_CHANGE_PRICE)}P예요. ${NAME_CHANGE_COOLDOWN_DAYS}일에 한 번 바꿀 수 있어요.`],
              ["오래 쉬면", `${DORMANT_DAYS}일 넘게 안 들어오면 휴면이 돼요. 그동안 다른 사람이 내 이름을 가져갈 수 있어요. 돌아오면 닉네임을 다시 정해요.`],
              ["운영자", "저승사자 차림에 무지갯빛 「서버비 내는 사람」 칭호를 달고 있어요. 채팅 이름은 금색이고 '운영자' 딱지가 붙어요."],
              ["채널", `채널마다 ${DEFAULT_CHANNEL_CAPACITY}명까지, 채널은 ${DEFAULT_MAX_CHANNELS}개까지 열려요. 위쪽 채널 표시를 눌러 옮겨요.`],
              ["대기열", "꽉 차면 줄을 서요. 차례가 오면 저절로 들어가요."],
              ["다 놀았으면", "내 정보의 접속 종료로 자리를 비워 주세요"],
            ]}
          />
          <details className={styles.more}>
            <summary>앱처럼 쓰기 (바탕화면·홈 화면 아이콘)</summary>
            <Table
              head={["기기", "방법"]}
              rows={[
                ["컴퓨터 크롬·엣지", "주소창 오른쪽 설치 아이콘을 눌러요"],
                ["안드로이드", "크롬 메뉴에서 홈 화면에 추가"],
                ["아이폰·아이패드", "사파리 공유 버튼에서 홈 화면에 추가"],
              ]}
            />
          </details>
        </section>

        <section className={styles.inquiry}>
          <h3>처음 왔을 때 안내</h3>
          <p>처음 들어왔을 때 본 1분짜리 마을 안내를 다시 볼 수 있어요.</p>
          <button type="button" className={ui.button} onClick={onReplayTutorial}>
            첫 방문 안내 다시 보기
          </button>
        </section>

        <section className={styles.inquiry}>
          <h3>문의</h3>
          <p>버그나 제안, 계정 문제는 여기로 알려 주세요.</p>
          <InquiryButton />
          <p>
            <Link href="/privacy" target="_blank">
              개인정보처리방침
            </Link>
            {" · "}
            <Link href="/terms" target="_blank">
              이용약관
            </Link>
            {" · "}
            <Link href="/faq" target="_blank">
              자주 묻는 질문
            </Link>
          </p>
        </section>
      </div>
    </Dialog>
  );
}
