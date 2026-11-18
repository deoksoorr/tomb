import GuidePage from "../guide/GuidePage";
import guide from "../guide/guide.module.css";
import { pageMetadata } from "../seo";
import { ATTEND_RULE_TEXT } from "@/lib/attendStay";
import { ATTEND_TIER_GUIDE } from "@/lib/attendTiers";
import { DAILY_EARN_CAP, earnRule } from "@/lib/economy";
import { CHAT_HISTORY_MS, CHAT_MAX, CHAT_STORE_MAX, DEFAULT_CHANNEL_CAPACITY, DEFAULT_MAX_CHANNELS, FRIEND_MAX, NAME_MAX, NAME_MIN, PERMANENT_MULTIPLIER } from "@tomb/protocol";
import { AUTO_FISH_DAILY_MAX, AUTO_FISH_EVERY_MS, AUTO_FISH_MAX_MS } from "@/lib/forage/auto";
import { DAILY_CATCH_MAX } from "@/lib/forage/catalog";
import { DORMANT_DAYS } from "@/lib/store/types";
import { RESIDENTS } from "@/game/world/life/residentData";
import { DYE_SPECIAL_BONUS, LOOK_SCORE_DIVISOR } from "@/lib/lookScore";
import { STAY_BONUS_DAILY_MAX } from "@/lib/stayBonus";
import { DEFAULT_PASS_DAYS, PRESENCE_INTERVAL_MS } from "@/lib/types";
import { env } from "@/lib/env";
import { PIONEER_DAYS, PIONEER_FLOOR } from "@/lib/rpg/endgame";
import { MAX_LEVEL } from "@/lib/rpg/formulas";
import { RESPEC_MAX_COST, respecCost } from "@/lib/rpg/skillRules";
import { QUEST_DAILY, QUEST_STAMPS } from "@/lib/forage/quests/catalog";

const PATH = "/faq";
const TITLE = "At one time... 자주 묻는 질문 — 무료인지, 설치·가입, 모바일, 함께 있는 인원, 노동요 곡 수";
const DESCRIPTION =
  "At one time...에 대해 자주 묻는 질문을 모았어요. 무료인지, 설치나 회원가입이 필요한지, 휴대폰에서도 되는지, 몇 명이 같이 있는지, 노동요는 몇 곡인지, 다른 탭에서도 소리가 나는지, 포인트·채팅·친구·자동 낚시·랭킹·닉네임은 어떻게 되는지 답해요.";

export const metadata = pageMetadata(PATH, TITLE, DESCRIPTION);

// 화면의 질문·답과 FAQPage 구조화 데이터가 같은 배열을 쓴다 (둘이 어긋나지 않게).
// 숫자 출처: packages/protocol constants, public/bgm/tracks.json, lib/economy.ts, lib/types.ts, lib/audioLife.ts
/** 구글 연결은 그 서버에 구글 설정(GOOGLE_CLIENT_ID·SECRET)이 있을 때만 안내한다 (없으면 아직 없는 기능을 말하게 된다) */
const GOOGLE_ON = !!env.google();

const FAQ = [
  {
    q: "무료인가요?",
    a: "네, 완전히 무료예요. 후원·광고·유료 재화가 없고, 상점 물건도 마을에서 모은 포인트로 사요.",
  },
  {
    q: "포인트나 아이템을 현금으로 살 수 있나요?",
    a: "아니요. 포인트와 아이템은 마을 안에서 놀면서만 얻을 수 있고, 현금으로 사거나 다른 사람과 사고팔 수 없어요. 현금 가치도 없어요.",
  },
  {
    q: "누가 만들었나요?",
    a: "게임을 처음 만들어 보는 개인의 포트폴리오예요.",
  },
  {
    q: "설치나 회원가입이 필요한가요?",
    a: `아니요. 브라우저에서 이름과 모습만 정하면 바로 들어가요. 이름·이메일 같은 신원 정보는 받지 않아요.${GOOGLE_ON ? " 원하면 구글 계정을 연결해 구글로 들어올 수도 있어요(이때도 이메일은 받지 않아요)." : ""}`,
  },
  {
    q: "휴대폰에서도 되나요?",
    a: "네. 터치 화면에서는 왼쪽 아래 조이스틱으로 걷고, 달리기·점프·앉기·상호작용 버튼으로 움직여요.",
  },
  {
    q: "몇 명이 같이 있을 수 있나요?",
    a: `채널마다 최대 ${DEFAULT_CHANNEL_CAPACITY}명이 한 마을에 함께 있어요. 채널은 최대 ${DEFAULT_MAX_CHANNELS}개이고, 모든 채널이 꽉 차면 줄을 서서 기다려요. 차례가 오면 저절로 들어가요.`,
  },
  {
    q: "노동요(배경음악)는 몇 곡인가요?",
    a: "4가지 목록 165곡이에요. 레트로 50곡, 눈꽃 캐럴 50곡, 노을 시티팝 50곡, 로파이 15곡이고, 레트로와 캐럴과 시티팝은 직접 만든 곡이에요. 목록을 누를 때마다 다른 곡부터 나오고, 「전곡 섞어 듣기」로 모든 곡을 섞어 들을 수도 있어요.",
  },
  {
    q: "다른 탭으로 옮겨도 소리가 계속 나나요?",
    a: "네. 같은 창의 다른 탭으로 옮겨도 배경음악·환경음·효과음이 계속 나요. 페이지를 닫거나 떠나면 멈춰요.",
  },
  {
    q: "포인트는 어떻게 모으나요?",
    // 숫자는 lib/economy.ts·stayBonus.ts에서 읽는다 (값을 바꾸면 답도 같이 바뀐다)
    a: `접속해 있으면 ${PRESENCE_INTERVAL_MS / 60_000}분마다 ${earnRule("presence").points}포인트가 쌓여요. 다른 창을 보고 있어도 괜찮아요. 출석 도장, 헌화, 사냥터, 미니게임, 물고기와 채집물 팔기로도 모여요. 사냥터는 하루 ${earnRule("hunt").dailyMax}포인트까지예요. 주운 장비와 물약을 되판 포인트도 여기에 들어가요. 마을 곤충 채집은 따로 하루 ${earnRule("bugs").dailyMax}포인트, 별자리 잇기는 하루 ${earnRule("stars").dailyMax}포인트까지예요. 하루 한도는 활동마다 따로라서, 하나를 다 채워도 다른 활동 포인트는 계속 쌓여요. 전부 합치면 하루 ${DAILY_EARN_CAP.toLocaleString("ko-KR")}포인트까지예요. 오래 머물면 받는 접속 시간 보너스(하루 최대 ${STAY_BONUS_DAILY_MAX}포인트)는 이 한도와 상관없어요. 하루 한도와 출석 도장은 한국 시간 새벽 5시에 새로 시작해요.`,
  },
  {
    q: "출석 도장은 어떻게 찍나요?",
    // 숫자는 lib/attendStay.ts·attendTiers.ts·economy.ts에서 읽는다
    a: `${ATTEND_RULE_TEXT}(다른 창을 봐도 괜찮아요). 출석 달력의 오늘 칸을 누르면 ${earnRule("attend").points}포인트, 7일 연속마다 ${earnRule("streak").points}포인트, 한 달 개근이면 ${earnRule("monthly").points}포인트를 더 받아요. 이번 달 출석 보상: ${ATTEND_TIER_GUIDE}. 받은 코디는 가방의 꾸미기에서 입을 수 있어요.`,
  },
  {
    q: "무엇을 할 수 있나요?",
    a: "모닥불 곁에서 쉬기, 채팅과 친구 맺기, 사냥터(스킬 트리)·미니게임, 낚시(자동 낚시 포함), 채집과 도감, 동물원 펫 분양, 캐릭터 꾸미기, 내 집 꾸미기, 묘비 세우기와 헌화, 관람차·열기구·조각배·오리배 타기, 귀신의집 탈출, 폭죽·확성기, 마을 주민과 강아지·고양이와 놀기를 할 수 있어요.",
  },
  {
    q: "자리를 비워도 낚시가 되나요?",
    a: `네. 낚시 자리에 앉아 [자동 낚시 켜기]를 누르면 ${Math.round(AUTO_FISH_EVERY_MS / 1000)}초에 1마리씩 물고기가 쌓여요. 다른 탭을 보고 있어도 접속만 되어 있으면 돼요. 자동 낚시는 하루 ${AUTO_FISH_DAILY_MAX}마리까지고, 직접 낚은 것까지 합치면 하루 ${DAILY_CATCH_MAX.fish}마리까지예요. 한 번 켜면 최대 ${AUTO_FISH_MAX_MS / 3_600_000}시간 돌아요. 접속이 끊긴 동안은 쌓이지 않아요. 움직이거나 일어나면 꺼져요. 희귀한 물고기는 덜 나와요. 자동으로 낚은 물고기도 내 도감의 가장 큰 기록에는 들어가요. 최대어 순위에는 직접 낚은 물고기만 올라요. 아주 드물게 물에 빠진 꾸미기가 걸리기도 해요(영구 소장).`,
  },
  {
    // 11/15 수집 의뢰 (숫자는 lib/forage/quests/catalog.ts)
    q: "수집 의뢰와 의뢰 도장은 무엇인가요?",
    a: `의뢰는 버스 정류장 마당의 의뢰 게시판에서 받아요. 오늘의 의뢰는 하루 ${QUEST_DAILY}개로 한국 시간 새벽 5시에 새로 나오고, 하루 한 번 의뢰 하나를 무료로 바꿀 수 있어요. 월요일마다 이번 주 큰 의뢰도 1개 나와요. 모은 물고기·채집물을 납품하면(가방에서 사라져요) 의뢰 도장을 ${QUEST_STAMPS.easy}~${QUEST_STAMPS.hard}개, 큰 의뢰는 ${QUEST_STAMPS.weekly}개 받아요. 도장은 포인트로 바꾸거나 남에게 줄 수 없고, 같은 게시판의 도장 교환소에서만 써요. 교환소 물건은 매달 1일 새벽 5시에 바뀌고(염색권은 늘 있어요), 도장은 사라지지 않아요. 끝낸 의뢰 수로 칭호도 받아요.`,
  },
  {
    q: "묘비는 무엇인가요?",
    a: `한때 시작했다 그만둔 것을 묘비로 세워 두는 거예요. 한 사람에 하나만 세울 수 있고, 세운 뒤 ${DEFAULT_PASS_DAYS}일(운영 상황에 따라 바뀔 수 있어요)이 지나면 성불해 묘역을 떠나요.`,
  },
  {
    q: "채팅할 수 있나요?",
    a: `네. 컴퓨터는 Enter, 휴대폰은 [채팅] 버튼으로 ${CHAT_MAX}자까지 쓸 수 있어요. 글은 머리 위 말풍선과 왼쪽 아래 채팅창에 같이 뜨고, 같은 채널 마을(집 안이면 그 집)에 있는 사람에게 보여요. 서버에는 같은 채널 최근 ${CHAT_STORE_MAX}줄이 ${CHAT_HISTORY_MS / 3_600_000}시간까지 남아서, 늦게 들어와도 최근 대화를 볼 수 있어요. 욕설은 가려지고, 다른 사람 글이 오면 작은 알림음이 나요(음악 창에서 끌 수 있어요).`,
  },
  {
    q: "돌아다니는 주민은 누구예요?",
    a: `연한 초록 이름표를 단 마을 주민(${RESIDENTS.slice(0, 3)
      .map((r) => r.name)
      .join(", ")} 등)이에요. 동물원·호숫가·광장처럼 저마다 맡은 구역을 주로 걷고, 가끔 헤엄치거나 벤치·모닥불 곁에서 쉬어요. 가까이 가서 E(휴대폰은 상호작용 버튼)를 누르면 멈춰서 말을 걸어 주고, 가끔 게임 팁도 알려 줘요. 실제 사람이 아니라서 접속자 수에는 들어가지 않고, 운영 상황에 따라 나오는 수가 달라져요. 마을엔 강아지(비숑 우유 등)와 고양이도 있어 E로 쓰다듬을 수 있어요.`,
  },
  {
    q: "친구는 어떻게 맺나요?",
    a: `마을에서 다른 사람 캐릭터를 누르고 [친구 신청]을 보내요. 상대가 받아 주면 친구가 돼요(최대 ${FRIEND_MAX}명). 친구 창에서 친구가 어디 있는지 볼 수 있어요. [친구한테 가기]를 누르면 친구 옆으로 가요. 다른 채널이면 채널을 옮기고, 친구가 집 안이면 그 집으로 들어가요. 친구 집에 놀러 갈 수도 있어요. 친구가 들어오고 나가면 작은 알림이 떠요(친구 창에서 끌 수 있어요). 운영자와는 친구를 맺을 수 없어요. 친구를 맺어도 포인트나 아이템 보상은 없어요.`,
  },
  {
    q: "랭킹은 어떤 게 있나요?",
    a: "포인트, 사냥, 사냥 레벨, 낚시(최대어), 꾸미기, 집 꾸미기, 헌화 랭킹이 있어요. 운영자는 순위에 들지 않아요.",
  },
  {
    q: "사냥터 능력치나 스킬을 다시 찍을 수 있나요?",
    // 비용은 lib/rpg/skillRules.ts respecCost에서 읽는다
    a: `네. 사냥터 [캐릭터] 탭의 [능력치 초기화], [스킬] 탭의 [초기화]로 배분한 포인트를 모두 돌려받아요. 둘 다 레벨에 따라 ${respecCost(1)}~${RESPEC_MAX_COST}포인트가 들어요. 장비·레벨·경험치는 그대로예요.`,
  },
  {
    q: "사냥 레벨 50 다음엔 뭐가 있나요?",
    // 11/15 사냥 끝판 1단계 — 숫자는 lib/rpg/endgame.ts
    a: `레벨 ${MAX_LEVEL}부터는 지옥 사냥터와 야근 빌딩에서 얻은 EXP가 초월 EXP로 쌓여요. 그러면 초월 레벨(★51~★100)이 올라요. 초월 5레벨마다 능력치 포인트를 1개 받아요. 사냥 레벨 랭킹은 레벨, 초월 레벨, 초월 EXP 순서로 매겨요. 하루에 할 수 있는 판 수 제한은 없어요. 야근 빌딩은 마을 북쪽 분양 사무소 옆에 있어요. 1층부터 쓰러질 때까지 계속 올라가고, 도전 횟수 제한도 없어요. 높이 오를수록 몬스터가 세지고, 10층부터는 저주가 쌓여요. 깬 층마다 초월 EXP를 받아요. 5층마다 우두머리 상자가 열려요. 하루 개수 제한은 없어요. 상자에서는 세트 장비와 강화 재료가 나오고, 가끔 꾸미기 이용권도 나와요. 세트 장비는 15% 확률로 나오고, 7번 연속 못 받으면 다음엔 꼭 나와요. 세트 장비는 장비 탭에서 +15까지 강화할 수 있어요. 끝판이 열린 뒤 ${PIONEER_DAYS}일 안에 ★51에 닿거나 야근 빌딩 ${PIONEER_FLOOR}층을 처음 넘으면 칭호 「개척자 #번호」를 받아요. 번호는 닿은 차례예요.`,
  },
  {
    q: "닉네임이 다른 사람과 같아도 되나요?",
    a: `아니요. 닉네임은 ${NAME_MIN}~${NAME_MAX}자이고 다른 사람이 쓰는 이름은 쓸 수 없어요. ${DORMANT_DAYS}일 넘게 들어오지 않은 계정은 휴면이 되어 그 이름을 다른 사람이 쓸 수 있고, 돌아오면 닉네임을 다시 정해요. 운영자도 닉네임 그대로 보이고, 머리 위 「서버비 내는 사람」 칭호와 저승사자 차림으로 알아볼 수 있어요. 일반 계정은 이 칭호를 달 수 없고 '운영자' 같은 이름도 쓸 수 없어요.`,
  },
  {
    q: "닉네임을 꾸밀 수 있나요?",
    a: `네. 상점 [캐릭터 꾸미기]의 [이름 글자]와 [이름표] 칸에서 포인트로 사요. 이름 글자는 한 가지 색, 글자마다 색이 이어지는 그라데이션, 빛나고 움직이는 이름이 있어요. 움직이는 이름은 빛 테두리, 흐르는 무지개, 별가루, 불꽃이에요. 이름표 바탕판(나무 팻말, 리본, 구름, 꽃 화환, 묘비석, 별)은 이름 글자와 함께 달 수 있어요. 다른 코디처럼 24시간 이용권과 영구 소장(이용권 값 × ${PERMANENT_MULTIPLIER})이 있어요. 꾸미기 점수에도 들어가요. 머리 위 이름표, 채팅, 친구 창, 랭킹, 레이스 시상대에서 보여요. 움직임 줄이기를 켜면 멈춘 그림으로 보여요.`,
  },
  {
    q: "앱처럼 바탕화면이나 홈 화면에 둘 수 있나요?",
    a: "네. 컴퓨터 크롬과 엣지는 주소창의 설치 아이콘을 누르거나 메뉴에서 [앱 설치]를 골라요. 안드로이드는 크롬 메뉴에서 [홈 화면에 추가]를 골라요. 아이폰은 사파리 공유 버튼을 누르고 [홈 화면에 추가]를 골라요. 설치 파일을 받는 건 아니에요.",
  },
  {
    q: "다른 기기에서 이어서 할 수 있나요?",
    a: "네. [내 정보]의 [개인 코드]에서 코드를 만들어요. 다른 기기의 입장 화면에서 [코드로 시작]을 누르고 그 코드를 넣으면 포인트, 가방, 내 묘비가 그대로 따라와요.",
  },
  ...(GOOGLE_ON
    ? [
      {
        q: "구글 계정으로 들어올 수 있나요?",
        a: "네. 처음이면 입장 화면의 [구글로 시작하기]로 새로 만들 수 있어요. 쓰던 계정이 있으면 [코드로 시작]으로 들어간 뒤 [내 정보]의 [구글 계정]에서 [구글 계정 연결]을 눌러요. 그러면 다음부터 구글로 바로 들어와요. 구글로 새로 만든 계정은 쓰던 계정과 합쳐지지 않으니 주의하세요. 구글 계정 하나는 게임 계정 하나에만 연결돼요. 개인 코드도 그대로 쓸 수 있어요. 구글에서는 고유 번호만 받아서, 되돌릴 수 없는 해시로 바꿔 저장해요. 이메일, 이름, 사진은 받지 않아요. 연결을 끊으면 그 값도 바로 지워요.",
      },
      ]
    : []),
  {
    q: "꾸미기 점수는 어떻게 매겨지나요?",
    a: `지금 입은 코디 파츠마다 영구 소장 값 ${LOOK_SCORE_DIVISOR}P당 1점이에요. 코디는 이용권 값 × ${PERMANENT_MULTIPLIER}, 펫은 분양가, 프리미엄 외형은 선택권 값으로 쳐요. 특수 염색은 부위마다 +${DYE_SPECIAL_BONUS}점이에요. 코디마다 점수가 상점, 가방, 동물원에 나와요. 기간제 코디가 끝나면 그 점수도 바로 빠져요. 랭킹 창 [꾸미기] 탭에서 1~50위와 내 순위를 볼 수 있어요. 내 점수는 가방 꾸미기 칸과 내 정보에서 봐요.`,
  },
] as const;

const FAQ_LD = {
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function FaqPage() {
  return (
    <GuidePage
      path={PATH}
      h1="자주 묻는 질문"
      description={DESCRIPTION}
      lead="「At one time...」은 설치·가입 없이 브라우저에서 바로 하는 무료 실시간 멀티 도트 마을이에요. 자주 묻는 것들을 모았어요."
      extraJsonLd={[FAQ_LD]}
    >
      <dl className={guide.qa}>
        {FAQ.map(({ q, a }) => (
          <div key={q}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
    </GuidePage>
  );
}
