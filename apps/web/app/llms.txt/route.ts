import { CHAT_MAX, DEFAULT_CHANNEL_CAPACITY, DEFAULT_MAX_CHANNELS, FRIEND_MAX } from "@tomb/protocol";
import { BRANCHES } from "@/lib/rpg/skillTree";
import { absoluteUrl, GUIDE_PAGES, SITE_DESCRIPTION, SITE_TITLE } from "../seo";

// llms.txt (https://llmstxt.org): 생성형 AI가 사이트를 요약할 때 읽는 안내 목록. 빌드 때 한 번 만든다.
export const dynamic = "force-static";

export function GET() {
  const guides = GUIDE_PAGES.filter((p) => p.path !== "/faq");
  const body = [
    `# ${SITE_TITLE}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `개인 포트폴리오로 만든 무료 웹 서비스이며 후원·광고·유료 재화가 없습니다. 설치·회원가입이 필요 없습니다. 채널마다 최대 ${DEFAULT_CHANNEL_CAPACITY}명(최대 ${DEFAULT_MAX_CHANNELS}채널)이 한 마을에 모이고, 9가지 장르 175곡의 배경음악을 틀어 둘 수 있습니다.`,
    "",
    "## 할 수 있는 것",
    "",
    `- 대화: 정해진 문장 말풍선·이모티콘, ${CHAT_MAX}자 자유 채팅(말풍선과 채팅창, 같은 채널 최근 대화만 서버에 하루까지 남음)`,
    `- 친구: 신청·수락(최대 ${FRIEND_MAX}명), 친구 위치 보기와 친구한테 가기, 친구 집 놀러 가기, 접속 알림`,
    `- 놀거리: 모닥불 불멍, 사냥터(스킬 트리 ${BRANCHES.length}갈래)·미니게임, 낚시(자동 낚시 포함)·채집·도감(물고기·곤충·약초·광석·발굴품·별자리·몬스터), 동물원 펫, 관람차·열기구·조각배·오리배(오리 연못), 범퍼카, 귀신의집, 폭죽·확성기`,
    "- 언젠가 캠핑장: 마을 버스 정류장에서 버스를 타고 가는 두 번째 맵. 모닥불 광장, 계곡 낚시, 바베큐(먹으면 몸이 커지거나 빨라짐), 음료 자판기",
    "- 야근 빌딩: 사냥 레벨 50부터 오르는 끝없는 층 오르기 사냥 (다섯 층마다 테마가 바뀌고, 우두머리 상자에서 세트 장비·꾸미기가 나옴)",
    "- 이벤트: 하루 한두 번 서버 사람들이 같이 모으는 긴급 의뢰, 매주 토요일 저녁 8시 행운권 추첨(한 사람 한 장 200P), 주간 레이스 1위 보상",
    "- 귓속말: 같은 채널 한 사람에게만 보내는 채팅 (/w 닉네임 할 말)",
    "- 추천 코드: 친구를 데려오면 조건(3시간·3일)을 채운 뒤 확인을 거쳐 둘 다 포인트를 받음",
    "- 꾸미기: 캐릭터 코디(기간제·영구 소장)와 염색, 내 집 분양·꾸미기, 꾸미기·사냥 레벨 등 랭킹",
    "- 마을: 담당 구역을 돌아다니며 말을 걸어 주는 마을 주민(실제 사람 아님), 강아지·고양이, 한국 시간에 맞춘 하늘과 바뀌는 날씨",
    "- 묘역: 한때 시작했다 그만둔 것을 묘비로 세우고 헌화",
    "- 앱처럼 쓰기: 크롬·엣지 앱 설치 또는 휴대폰 홈 화면에 추가",
    "",
    "## 안내",
    "",
    ...guides.map((p) => `- [${p.h1}](${absoluteUrl(p.path)}): ${p.summary}`),
    "",
    "## 자주 묻는 질문",
    "",
    `- [자주 묻는 질문](${absoluteUrl("/faq")}): 무료인지, 설치·가입, 모바일, 함께 있는 인원, 음악, 포인트, 채팅, 친구, 자동 낚시, 랭킹, 닉네임`,
    "",
    "## 정책",
    "",
    `- [이용약관](${absoluteUrl("/terms")})`,
    `- [개인정보처리방침](${absoluteUrl("/privacy")})`,
    "",
    "## Optional",
    "",
    `- [마을 들어가기](${absoluteUrl("/")}): 브라우저에서 바로 입장`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
