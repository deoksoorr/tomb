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
  GRAVE_STYLES,
  GRAVEYARD_CAPACITY,
  isShopListed,
  ITEMS,
  MAX_DECOR_PER_GRAVE,
  MEGAPHONE_TTL_MS,
  NAME_MAX,
  NAME_MIN,
  PERMANENT_MULTIPLIER,
  permanentPrice,
  ZOO_PETS,
} from "@tomb/protocol";
import { ATTEND_STAY_TEXT } from "@/lib/attendStay";
import { ATTEND_TIER_GUIDE } from "@/lib/attendTiers";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, EARN_RULES, earnRule } from "@/lib/economy";
import { DYE_TIME_MS } from "@/lib/dye/palette";
import { AUTO_FISH_DAILY_MAX, AUTO_FISH_EVERY_MS, AUTO_FISH_MAX_MS, AUTO_RANK_NOTE } from "@/lib/forage/auto";
import { DAILY_CATCH_MAX, DEX_NEW_REWARD } from "@/lib/forage/catalog";
import { PHASE_LABELS, TIME_PHASES, WEATHER_BLOCK_MS, WEATHER_LABELS, WEATHERS } from "@/lib/ambience";
import { PLOT_TIERS, plotCost } from "@/lib/housing/catalog";
import { DYE_SPECIAL_BONUS, LOOK_SCORE_DIVISOR } from "@/lib/lookScore";
import { BRANCH_INFO, BRANCHES, POTIONS, TIER_GATES } from "@/lib/rpg/catalog";
import { SKILL_SLOTS } from "@/lib/rpg/hotbar";
import { PIONEER_DAYS, PIONEER_FLOOR } from "@/lib/rpg/endgame";
import { MAX_LEVEL } from "@/lib/rpg/formulas";
import { RESPEC_MAX_COST, respecCost } from "@/lib/rpg/skillRules";
import { STAY_BONUS_DAILY_MAX } from "@/lib/stayBonus";
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
import { QUEST_DAILY, QUEST_STAMPS } from "@/lib/forage/quests/catalog";
import styles from "./GuideDialog.module.css";

const won = (n: number) => n.toLocaleString("ko-KR");
const petPrices = ZOO_PETS.map((p) => p.price);

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
  ["메뉴", "왼쪽 아래 [메뉴]", "왼쪽 위 [메뉴]"],
  ["가방·사냥·도감·집·소식", "왼쪽 아래 바로 가기 줄", "[메뉴] 안에"],
  ["표현 창 (말풍선·이모티콘)", "T", "점프 왼쪽 [표현]"],
  ["바다 보기 (바닷가에서 앉아 있을 때)", "V", "[바다 보기] 버튼"],
  ["채팅", "Enter로 열고, 쓴 뒤 Enter (Esc는 닫기)", "[채팅] 버튼"],
  ["즐겨찾기 표현", "Y를 누르고 고르기 (1~8도 돼요)", "[표현] 길게 누르기"],
  ["손 흔들기·환호", "1, 2", "메뉴의 감정 표현"],
  ["이모티콘 바로 보내기", "3~9", "[표현] 창에서"],
  ["벤치 상태", "앉아서 T", "앉아서 [표현]"],
  ["가방", "I", "메뉴의 가방"],
  ["내 정보", "P", "메뉴의 내 정보"],
  ["랭킹", "L", "메뉴의 랭킹"],
  ["이번 주 레이스", "U", "메뉴의 이번 주 레이스"],
  ["선물함", "M", "메뉴의 선물함"],
  ["출석 달력", "B", "메뉴의 출석 달력"],
  ["친구", "O", "메뉴의 친구"],
  ["공지", "N", "메뉴의 공지"],
  ["폭죽 쏘기", "G", "메뉴의 폭죽 쏘기"],
  ["펫 타기·내리기", "R", "타기 버튼"],
  ["확대·축소", "마우스 휠 또는 ＋/－", "두 손가락 또는 ＋/－"],
  ["둘러보기", "오른쪽 버튼으로 끌기", "두 손가락으로 끌기"],
  ["시점 되돌리기", "[내 캐릭터로]", "[내 캐릭터로]"],
  ["확성기 기록", "왼쪽 위 (음악 아래)", "조이스틱 위"],
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
  ["친구한테 가기", "친구 옆으로 바로 가요. 다른 채널이나 집 안에 있어도 따라가요."],
  ["알림", "친구가 들어오거나 나가면 작은 알림이 떠요. 친구 창에서 끌 수 있어요."],
];

/** 곳·탈것·채집 표: 터치 기기(화면 버튼)는 E 대신 [상호작용] 버튼으로 적는다 */
const places = (touch: boolean): ReactNode[][] => [
  ["모닥불", "모닥불 광장", "곁에 앉아 같이 불멍해요"],
  ["소원 분수", "광장 입구", "하루 한 번 동전 던지기"],
  ["귀신의집", "광장 입구, 소원 분수 옆", "혼자 들어가는 공포 미로예요"],
  ["유령 잡화점", touch ? "상점 주인장에게 [말 걸기]" : "상점 주인장에게 E", "꾸미기, 폭죽, 확성기, 염색권을 팔아요"],
  ["범퍼카장", "가운데 다리 건너 바로", `입구에서 ${keyJosa("E", "로", touch)} 타요. 무료예요`],
  ["동물원", "서쪽 다리 건너 바로", `사육사에게 펫 분양 (${won(Math.min(...petPrices))}~${won(Math.max(...petPrices))}P)`],
  ["버스 정류장 마당", "주거 구역 오른쪽 아래, 마지막 골목 위", "의뢰 게시판, 긴급 의뢰 현판, 버스 정류장이 있어요"],
  ["낚시 잔교", "호수 서쪽, 호박밭 옆", "어부 영감 노점과 낚시 의자가 있어요"],
  ["낚시", "호수 잔교, 호수 둑, 강둑, 연못, 조각배 위", `낚시 의자 앞에서 ${keyName("E", touch)}`],
  ["수집가", "오리 연못 북서쪽 둑", "약초, 광석, 발굴품, 곤충을 사 가요"],
  ["별 보기 언덕", "마을 북서쪽 언덕 꼭대기", "망원경 두 대로 별자리 잇기를 해요. 한 대에 한 사람씩 볼 수 있어요."],
  ["사냥터", "메뉴의 사냥터", "혼자나 같이 사냥하고 미니게임도 해요"],
  ["분양 사무소", "메뉴의 집·분양 마을", "내 집을 받아 꾸며요"],
  ["성황당", "옛 묘역 동문 옆", "묘역을 떠난 묘비 모시기"],
  ["황금 고블린", "가끔 마을 어딘가", "가장 먼저 잡으면 보너스"],
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
  ["열기구", `언덕 출발장에서 ${keyName("E", touch)} (${BALLOON_SEATS_EACH}명)`, `마을 위를 돌아 약 ${min(BALLOON_FLIGHT_MS)}분`],
  touch ? ["도중에 내리기", "[앉기] 두 번", "[상호작용]·[점프]를 두 번 눌러도 돼요"] : ["도중에 내리기", "X 두 번 (E·Space도)", "휴대폰은 [앉기] 두 번"],
  ["시점 바꾸기", "V 또는 [시점 변경하기]", "[시점 변경하기]"],
  ["조각배", `나루터에서 ${keyName("E", touch)} (2인승)`, `물가 가까이에서 ${keyJosa("E", "로", touch)} 내려요`],
  touch
    ? ["오리배", "오리 연못 선착장에서 [상호작용] (2인승). [꽥!]을 누르면 꽥!", "물가에서 [상호작용] 버튼으로 내려요."]
    : ["오리배", "오리 연못 선착장에서 E (2인승). Space는 꽥!", "물가에서 E로 내려요. 휴대폰은 [꽥!] 버튼이 있어요."],
  touch
    ? ["범퍼카", "범퍼카장 입구에서 [상호작용] (한 대에 1명, 8대)", "조이스틱으로 달리고 [빵빵!]으로 경적을 울려요. 입구 안쪽에서 [상호작용] 버튼으로 내려요."]
    : ["범퍼카", "범퍼카장 입구에서 E (한 대에 1명, 8대)", "방향키로 달리고 Space로 빵빵 울려요. 입구 안쪽에서 E로 내려요."],
  ["타는 펫", touch ? "[타기] (데리고 있을 때)" : "R (데리고 있을 때)", "앉거나 낚시하거나 물에 들어가면 내려요"],
];

const HUNT_KEYS: ReactNode[][] = [
  ["공격", "Space · J", "공격 버튼"],
  ["낙법", "Z · K (6초마다, 구르는 동안 안 맞아요)", "구르기 버튼"],
  ["스킬", `1~${SKILL_SLOTS}, 궁극기는 F`, "스킬 버튼"],
  ["스킬 자동", "칸 오른쪽 클릭 (X는 전부)", "[자동]을 누른 뒤 칸 누르기"],
  ["키 안내", "H", "—"],
  ["물약", "Q, E, R", "물약 버튼"],
  ["멈춤", "Esc", "멈춤 버튼"],
];

/** 스킬 트리: 갈래·단 조건·초기화 비용은 lib/rpg에서 */
const SKILL_TREE: ReactNode[][] = [
  ["갈래", BRANCHES.map((b) => `${BRANCH_INFO[b].name}(${BRANCH_INFO[b].role.replaceAll(" · ", "·")})`).join(" · ")],
  ["단", `갈래마다 ${TIER_GATES.length}단이 있어요. 아래 단에 포인트를 ${TIER_GATES.slice(1).join(", ")}만큼 쓰면 위 단이 하나씩 열려요.`],
  ["선행", "선으로 이어진 스킬은 앞 스킬을 정해진 랭크까지 찍어야 배워요"],
  ["단축 칸", `배운 스킬을 스킬 탭 아래 칸에 끌어다 놓아요. 칸은 ${SKILL_SLOTS}개고, 궁극기는 F 칸에만 들어가요. 패시브는 칸 없이 늘 켜져요.`],
  ["초기화", `레벨에 따라 ${respecCost(1)}~${RESPEC_MAX_COST}P가 들어요`],
];

const forage = (touch: boolean): ReactNode[][] => [
  ["낚시", `의자 앞에서 ${keyName("E", touch)}, 입질이 오면 꾹 눌러 감기`, "물고기가 세게 당기면 잠깐 놓아요. 아주 가끔 물에 빠진 꾸미기도 걸려요."],
  [
    "자동 낚시",
    "낚시 중 [자동 낚시 켜기]",
    `다른 탭을 봐도 ${sec(AUTO_FISH_EVERY_MS)}초에 1마리씩 낚아요. 하루 ${AUTO_FISH_DAILY_MAX}마리까지고, 직접 낚은 것까지 합치면 ${DAILY_CATCH_MAX.fish}마리까지예요. 한 번에 ${AUTO_FISH_MAX_MS / 3_600_000}시간까지 돌고, 움직이면 꺼져요. ${AUTO_RANK_NOTE}`,
  ],
  ["팔기", "물고기는 어부 영감, 채집물은 수집가에게", "희귀할수록 비싸요"],
  ["도감", "왼쪽 아래 [도감]", `새 종을 처음 올리면 ${DEX_NEW_REWARD[1]}~${DEX_NEW_REWARD[5]}P를 받아요. 희귀할수록 많이 받아요. 오늘 한도를 넘으면 도감 창에서 나중에 받아요. 절반이나 전부 모으면 칭호도 받아요.`],
  // 11/15 수집 의뢰 (lib/forage/quests)
  [
    "수집 의뢰",
    `버스 정류장 마당 의뢰 게시판에서 ${keyName("E", touch)}`,
    `오늘의 의뢰 ${QUEST_DAILY}개(새벽 5시에 새로, 하루 1번 무료로 바꾸기) · 이번 주 큰 의뢰 1개(월요일) · 모은 것을 납품하면 의뢰 도장 ${QUEST_STAMPS.easy}~${QUEST_STAMPS.hard}개, 큰 의뢰는 ${QUEST_STAMPS.weekly}개 · 끝낸 수로 칭호`,
  ],
  ["도장 교환소", "의뢰 게시판 → [도장 교환소]", "이달의 물건은 매달 1일 새벽 5시에 바뀌어요 · 염색권은 늘 · 도장은 사라지지 않고, 포인트로 못 바꾸고 남에게 못 줘요"],
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
  const freeStyles = GRAVE_STYLES.filter((s) => s.free)
    .map((s) => s.name)
    .join(", ");
  return (
    <Dialog title="At one time... 안내" onClose={onClose}>
      <div className={styles.guide}>
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
                {`친구가 ${AWAY_PLACES.filter((p) => p !== "house")
                  .map((p) => AWAY_PLACE_LABEL[p])
                  .join("·")}에 있으면 따라갈 수 없어요. 못 가면 이유를 알려 줘요.`}
              </li>
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
            <li>지도에 장소마다 표시가 있어요. 자세한 건 각 장소에서 안내해요.</li>
            <li>
              {`하늘은 한국 시간에 맞춰 ${TIME_PHASES.map((p) => PHASE_LABELS[p]).join("·")}, 날씨(${WEATHERS.map((w) => WEATHER_LABELS[w]).join("·")})는 ${min(WEATHER_BLOCK_MS)}분마다 바뀌어요.`}
            </li>
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
            rows={EARN_RULES.map((r) => [
              <>
                {r.label}
                <span className={styles.note}>{r.note}</span>
              </>,
              r.points ? `+${r.points}` : "설명대로",
              r.dailyMax,
            ])}
          />
          <Table
            head={["규칙", "내용"]}
            rows={[
              ["하루 한도", `항목마다 위 표의 하루 최대까지 모여요. 모두 합쳐서는 ${won(DAILY_EARN_CAP)}P까지예요. 한국 시간 새벽 5시에 다시 차요.`],
              ["접속 시간 보너스", `하루 한도와 따로 세요. 하루 ${STAY_BONUS_DAILY_MAX}P까지예요.`],
              ["머무르기", `${PRESENCE_INTERVAL_MS / 60_000}분마다 받아요. 다른 창을 봐도 괜찮아요.`],
              ["지갑", `${won(BALANCE_CAP)}P까지 담겨요`],
              ["출석", `마을에 ${ATTEND_STAY_TEXT} 머물면 그날 도장을 찍어요. 같은 인터넷 연결에서는 하루 ${ATTEND_ACCOUNTS_PER_IP}계정까지만 포인트를 받아요.`],
              ["이번 달 출석 보상", ATTEND_TIER_GUIDE],
              ["한도에 걸리면", "알림 없이 더 쌓이지 않아요"],
              ["랭킹", "포인트, 사냥, 낚시, 꾸미기, 집 꾸미기, 헌화 순위가 있어요. 포인트 순위는 써도 줄지 않아요. 주간 순위는 월요일 새벽 5시에 새로 시작해요. 운영자는 순위에 안 들어가요."],
            ]}
          />
        </section>

        <section>
          <h3>사냥</h3>
          <Table head={["하는 일", "컴퓨터", "휴대폰"]} rows={HUNT_KEYS} />
          <ul className={styles.points}>
            <li>
              {`사냥 포인트는 하루 ${won(earnRule("hunt").dailyMax)}P까지예요. 주운 장비나 물약을 판 값도 여기에 들어가요. 한도를 넘으면 EXP와 아이템만 받아요. 상점에서 산 장비를 되파는 건 한도와 상관없어요. 마을 곤충 채집과 별자리 잇기는 따로 하루 ${won(earnRule("bugs").dailyMax)}P까지예요.`}
            </li>
            <li>
              {`레벨 ${MAX_LEVEL}부터는 지옥 사냥터와 야근 빌딩에서 초월 레벨(★51~★100)을 올려요. 초월 레벨이 5 오를 때마다 능력치 포인트를 1개 받아요. 하루에 할 수 있는 판 수는 정해져 있지 않아요.`}
            </li>
            <li>
              {`야근 빌딩은 마을 북쪽 분양 사무소 옆에 있어요. 사냥 레벨 ${MAX_LEVEL}부터 들어갈 수 있어요. 1층부터 쓰러질 때까지 계속 올라가요. 높이 오를수록 몬스터가 세지고, 10층부터는 저주가 하나씩 붙어요. 층을 깰 때마다 초월 EXP를 받고, 쓰러져도 깬 만큼은 받아요. 몇 번이든 도전할 수 있고, 최고 기록보다 낮은 1, 11, 21…층에서 시작할 수도 있어요. 끝판이 열리고 ${PIONEER_DAYS}일 안에 ★51이 되거나 ${PIONEER_FLOOR}층을 넘으면 「개척자 #번호」 칭호를 받아요. 서버에서 처음 30, 50, 100층을 깬 사람과 지금 최고 층 주인은 신화 칭호를 받아요.`}
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
              ["펫", "동물원 사육사", "평생 함께해요. 한 번에 한 마리씩 데리고 다녀요."],
              [KIND_LABELS.firework, "유령 잡화점", "쏘면 사라지고 같은 채널 모두가 봐요. 놀이기구를 타는 중에는 위쪽 폭죽 버튼으로 쏴요."],
              [KIND_LABELS.megaphone, "유령 잡화점", `외치면 사라져요. 외친 기록은 ${durationLabel(MEGAPHONE_TTL_MS)} 뒤 사라져요.`],
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
              ["분양", "분양 사무소에서 터 크기와 번지를 골라요"],
              ["넓히기", "작은 터에서 넓은 터, 대저택으로 넓혀요"],
              ["꾸미기", "가구와 외관을 사서 놓아요"],
              ["놀러 가기", "다른 집을 구경하고 좋아요나 방명록을 남겨요"],
              ["확대·축소", "집 안에서도 마우스 휠이나 두 손가락으로 해요"],
              ["나오기", "문으로 나오면 주거 구역의 그 집 문 앞에 서요"],
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
              ["성황당", `옮긴 묘비를 ${SHRINE_KEEP_DAYS}일 맡아 줘요. 그 안에 다시 세울 수 있어요.`],
            ]}
          />
          <ul className={styles.points}>
            <li>
              묘역은 언덕 아래 옛 묘역 한 곳이에요. 채널마다 {GRAVEYARD_CAPACITY}개까지 세울 수 있어요. 자리가 모자라면 오래된 묘비부터 조금
              일찍 성불해요.
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
