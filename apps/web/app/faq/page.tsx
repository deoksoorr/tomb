import GuidePage from "../guide/GuidePage";
import guide from "../guide/guide.module.css";
import { pageMetadata } from "../seo";
import { ATTEND_RULE_TEXT } from "@/lib/attendStay";
import { ATTEND_TIER_GUIDE } from "@/lib/attendTiers";
import { DAILY_EARN_CAP, earnRule } from "@/lib/economy";
import { CHAT_MAX, CHAT_RECENT_MS, DEFAULT_CHANNEL_CAPACITY, DEFAULT_MAX_CHANNELS, FRIEND_MAX, NAME_MAX, NAME_MIN, PERMANENT_MULTIPLIER, STAFF_PUBLIC_NAME } from "@tomb/protocol";
import { AUTO_FISH_DAILY_MAX, AUTO_FISH_EVERY_MS, AUTO_FISH_MAX_MS } from "@/lib/forage/auto";
import { DAILY_CATCH_MAX } from "@/lib/forage/catalog";
import { DORMANT_DAYS } from "@/lib/store/types";
import { RESIDENTS } from "@/game/world/life/residentData";
import { DYE_SPECIAL_BONUS, LOOK_SCORE_DIVISOR } from "@/lib/lookScore";
import { STAY_BONUS_DAILY_MAX } from "@/lib/stayBonus";
import { DEFAULT_PASS_DAYS, PRESENCE_INTERVAL_MS } from "@/lib/types";
import { env } from "@/lib/env";
import { RESPEC_MAX_COST, respecCost } from "@/lib/rpg/skillRules";

const PATH = "/faq";
const TITLE = "한때는... 자주 묻는 질문 — 무료인지, 설치·가입, 모바일, 함께 있는 인원, 노동요 곡 수";
const DESCRIPTION =
  "한때는...에 대해 자주 묻는 질문을 모았어요. 무료인지, 설치나 회원가입이 필요한지, 휴대폰에서도 되는지, 몇 명이 같이 있는지, 노동요는 몇 곡인지, 다른 탭에서도 소리가 나는지, 포인트·채팅·친구·자동 낚시·랭킹·닉네임은 어떻게 되는지 답해요.";

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
    a: `채널마다 최대 ${DEFAULT_CHANNEL_CAPACITY}명이 한 마을에 함께 있어요. 채널은 최대 ${DEFAULT_MAX_CHANNELS}개이고, 묘지 전체가 꽉 차면 대기열에서 기다렸다가 차례가 오면 자동으로 들어가요.`,
  },
  {
    q: "노동요(배경음악)는 몇 곡인가요?",
    a: "9가지 장르(로파이, 오르골, 빗소리, 피아노, 8비트, 재즈, 앰비언트, 어쿠스틱 기타, 레트로 RPG) 175곡이에요. 로파이 16곡, 재즈 19곡, 그 밖의 장르는 20곡씩이고, 목록을 누를 때마다 다른 곡부터 나와요.",
  },
  {
    q: "다른 탭으로 옮겨도 소리가 계속 나나요?",
    a: "네. 같은 창의 다른 탭으로 옮겨도 배경음악·환경음·효과음이 계속 나요. 페이지를 닫거나 떠나면 멈춰요.",
  },
  {
    q: "포인트는 어떻게 모으나요?",
    // 숫자는 lib/economy.ts·stayBonus.ts에서 읽는다 (값을 바꾸면 답도 같이 바뀐다)
    a: `접속해 있는 ${PRESENCE_INTERVAL_MS / 60_000}분마다 ${earnRule("presence").points}포인트가 쌓이고(다른 창을 봐도 괜찮아요), 출석 도장, 헌화, 사냥터·미니게임, 물고기·채집물 팔기 등으로도 모여요(사냥터·미니게임은 주운 장비·물약 되팔기까지 합쳐 하루 ${earnRule("hunt").dailyMax}포인트까지). 하루 한도는 항목마다 따로라 한 가지를 다 채워도 다른 활동 포인트는 그대로 쌓이고(모두 합치면 하루 ${DAILY_EARN_CAP.toLocaleString("ko-KR")}포인트까지), 오래 머물면 받는 접속 시간 보너스(하루 최대 ${STAY_BONUS_DAILY_MAX}포인트)는 이 한도와 따로예요. 하루 한도와 출석 도장의 하루는 한국 시간 새벽 5시에 새로 시작해요.`,
  },
  {
    q: "출석 도장은 어떻게 찍나요?",
    // 숫자는 lib/attendStay.ts·attendTiers.ts·economy.ts에서 읽는다
    a: `${ATTEND_RULE_TEXT}(다른 창을 봐도 괜찮아요). 출석 달력의 오늘 칸을 누르면 ${earnRule("attend").points}포인트, 7일 연속마다 ${earnRule("streak").points}포인트, 한 달 개근이면 ${earnRule("monthly").points}포인트를 더 받아요. 이번 달 출석 보상: ${ATTEND_TIER_GUIDE}. 받은 코디는 가방의 꾸미기에서 입을 수 있어요.`,
  },
  {
    q: "무엇을 할 수 있나요?",
    a: "모닥불 곁에서 쉬기, 채팅과 친구 맺기, 사냥터(스킬 트리)·미니게임, 낚시(자동 낚시 포함), 채집과 도감, 동물원 펫 분양, 캐릭터 꾸미기, 내 집 꾸미기, 묘비 세우기와 헌화, 관람차·열기구·조각배 타기, 귀신의집 탈출, 폭죽·확성기, 마을 주민과 강아지·고양이와 놀기를 할 수 있어요.",
  },
  {
    q: "자리를 비워도 낚시가 되나요?",
    a: `낚시 자리에 앉아 [자동 낚시 켜기]를 누르면, 다른 탭을 보고 있어도 접속해 있는 동안 ${Math.round(AUTO_FISH_EVERY_MS / 1000)}초에 1마리씩 물고기가 쌓여요(자동 낚시는 하루 ${AUTO_FISH_DAILY_MAX}마리, 직접 낚은 것까지 합쳐 하루 ${DAILY_CATCH_MAX.fish}마리, 한 번에 최대 ${AUTO_FISH_MAX_MS / 3_600_000}시간). 접속이 끊긴 동안은 세지 않고, 움직이거나 일어나면 꺼져요. 희귀한 물고기는 덜 나와요. 자동 낚시로 낚은 물고기도 크기가 정해져 내 도감의 가장 큰 기록에는 들어가지만, 최대어 순위에는 오르지 않아요(순위는 직접 낚은 물고기만). 직접 낚든 자동으로 낚든 아주 드물게 물에 빠진 꾸미기가 걸려요(영구 소장).`,
  },
  {
    q: "묘비는 무엇인가요?",
    a: `한때 시작했다 그만둔 것을 묘비로 세워 두는 거예요. 한 사람에 하나만 세울 수 있고, 세운 뒤 ${DEFAULT_PASS_DAYS}일(운영 상황에 따라 바뀔 수 있어요)이 지나면 성불해 묘역을 떠나요.`,
  },
  {
    q: "채팅할 수 있나요?",
    a: `네. 컴퓨터는 Enter, 휴대폰은 [채팅] 버튼으로 ${CHAT_MAX}자까지 쓸 수 있어요. 글은 머리 위 말풍선과 왼쪽 아래 채팅창에 같이 뜨고, 같은 채널 마을(집 안이면 그 집)에 있는 사람에게 보여요. 서버에는 ${Math.round(CHAT_RECENT_MS / 60_000)}분만 머물고 사라져서, 늦게 들어와도 최근 ${Math.round(CHAT_RECENT_MS / 60_000)}분 글만 보여요. 욕설은 가려지고, 다른 사람 글이 오면 작은 알림음이 나요(음악 창에서 끌 수 있어요).`,
  },
  {
    q: "돌아다니는 주민은 누구예요?",
    a: `연한 초록 이름표를 단 마을 주민(${RESIDENTS.slice(0, 3)
      .map((r) => r.name)
      .join(", ")} 등)이에요. 동물원·낚시터·광장처럼 저마다 맡은 구역을 주로 걷고, 가끔 헤엄치거나 벤치·모닥불 곁에서 쉬어요. 가까이 가서 E(휴대폰은 상호작용 버튼)를 누르면 멈춰서 말을 걸어 주고, 가끔 게임 팁도 알려 줘요. 실제 사람이 아니라서 접속자 수에는 들어가지 않고, 운영 상황에 따라 나오는 수가 달라져요. 마을엔 강아지(비숑 우유 등)와 고양이도 있어 E로 쓰다듬을 수 있어요.`,
  },
  {
    q: "친구는 어떻게 맺나요?",
    a: `마을에서 다른 사람 캐릭터를 누르고 [친구 신청]을 보내면, 상대가 받아 줄 때 친구가 돼요(최대 ${FRIEND_MAX}명). 친구 창에서 친구가 어디 있는지 보고 [친구한테 가기]를 누르면 같은 채널이면 옆으로, 다른 채널이면 채널을 옮겨 옆으로, 친구가 집 안이면 그 집으로 들어가요. 친구 집에 놀러 갈 수도 있고, 친구가 들어오고 나가면 작은 알림이 떠요(친구 창에서 끌 수 있어요). 운영자와는 친구를 맺을 수 없고, 친구에게 주는 포인트·아이템 보상은 없어요.`,
  },
  {
    q: "랭킹은 어떤 게 있나요?",
    a: "포인트, 사냥, 사냥 레벨, 낚시(최대어), 꾸미기, 집 꾸미기, 헌화 랭킹이 있어요. 운영자는 순위에 들지 않아요.",
  },
  {
    q: "사냥터 능력치나 스킬을 다시 찍을 수 있나요?",
    // 비용은 lib/rpg/skillRules.ts respecCost에서 읽는다
    a: `네. 사냥터 [캐릭터] 탭의 [능력치 초기화], [스킬] 탭의 [초기화]로 배분한 포인트를 모두 돌려받아요. 둘은 따로 세어 각각 첫 1회는 무료, 그 뒤로는 레벨에 따라 ${respecCost(1, 1)}~${RESPEC_MAX_COST}포인트가 들어요. 장비·레벨·경험치는 그대로예요.`,
  },
  {
    q: "닉네임이 다른 사람과 같아도 되나요?",
    a: `아니요. 닉네임은 ${NAME_MIN}~${NAME_MAX}자이고 다른 사람이 쓰는 이름은 쓸 수 없어요. ${DORMANT_DAYS}일 넘게 들어오지 않은 계정은 휴면이 되어 그 이름을 다른 사람이 쓸 수 있고, 돌아오면 닉네임을 다시 정해요. 금빛 '${STAFF_PUBLIC_NAME}' 이름표는 운영자예요.`,
  },
  {
    q: "닉네임을 꾸밀 수 있나요?",
    a: `네. 상점 [캐릭터 꾸미기]의 [이름 글자]·[이름표] 칸에서 포인트로 사요. 이름 글자는 단색, 글자마다 색이 이어지는 그라데이션, 빛나고 움직이는 이름(빛 테두리·흐르는 무지개·별가루·불꽃)이 있고, 이름표 바탕판(나무 팻말·리본·구름·꽃 화환·묘비석·별)은 이름 글자와 함께 달 수 있어요. 다른 코디처럼 24시간 이용권과 영구 소장(이용권 값 × ${PERMANENT_MULTIPLIER}) 둘 다 있고 꾸미기 점수에도 들어가요. 마을 머리 위 이름표와 채팅·친구·랭킹·레이스 시상대의 이름에 보이고, 움직임 줄이기 설정이면 멈춘 그림으로 보여요.`,
  },
  {
    q: "앱처럼 바탕화면이나 홈 화면에 둘 수 있나요?",
    a: "네. 컴퓨터 크롬·엣지에서는 주소창의 설치 아이콘(또는 메뉴 → 앱 설치)으로, 안드로이드는 크롬 메뉴 → 홈 화면에 추가로, 아이폰은 사파리 공유 버튼 → 홈 화면에 추가로 아이콘을 만들 수 있어요. 설치 파일을 받는 건 아니에요.",
  },
  {
    q: "다른 기기에서 이어서 할 수 있나요?",
    a: "네. 내 정보 → 개인 코드에서 코드를 만들고, 다른 기기의 입장 화면에서 [코드로 시작]에 넣으면 포인트·가방·내 묘비가 그대로 따라와요.",
  },
  ...(GOOGLE_ON
    ? [
      {
        q: "구글 계정으로 들어올 수 있나요?",
        a: "네. 처음이면 입장 화면의 [구글로 시작하기]로 새로 만들 수 있고, 이미 쓰던 계정은 [코드로 시작]으로 들어간 뒤 내 정보 → 구글 계정에서 [구글 계정 연결]을 누르면 다음부터 구글로 바로 들어와요(구글로 새로 만들면 기존 계정과 합쳐지지 않으니 주의하세요). 구글 하나는 계정 하나에만 연결되고, 개인 코드도 그대로 쓸 수 있어요. 구글에서는 고유 번호만 받아 되돌릴 수 없는 해시로만 저장하고, 이메일·이름·사진은 받지 않아요. 연결을 끊으면 그 값도 바로 지워요.",
      },
      ]
    : []),
  {
    q: "꾸미기 점수는 어떻게 매겨지나요?",
    a: `지금 입고 있는 코디 파츠마다 영구 소장 기준 가치 ${LOOK_SCORE_DIVISOR}P마다 1점씩 더해요(코디는 이용권 값 × ${PERMANENT_MULTIPLIER}, 펫은 분양가, 프리미엄 외형은 선택권 값). 특수 염색은 부위마다 +${DYE_SPECIAL_BONUS}점이에요. 각 코디의 점수는 상점·가방·동물원에 보여요. 기간제 코디가 끝나면 그 점수도 바로 빠져요. 랭킹 창 [꾸미기] 탭에서 1~50위와 내 순위를, 가방 꾸미기 칸과 내 정보에서 내 점수를 볼 수 있어요.`,
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
      lead="「한때는...」은 설치·가입 없이 브라우저에서 바로 하는 무료 실시간 멀티 도트 마을이에요. 자주 묻는 것들을 모았어요."
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
