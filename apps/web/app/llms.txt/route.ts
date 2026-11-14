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
    `- 대화: 정해진 문장 말풍선·이모티콘, ${CHAT_MAX}자 자유 채팅(말풍선과 채팅창, 서버에 잠깐만 머물고 저장하지 않음)`,
    `- 친구: 신청·수락(최대 ${FRIEND_MAX}명), 친구 위치 보기와 친구한테 가기, 친구 집 놀러 가기, 접속 알림`,
    `- 놀거리: 모닥불 불멍, 사냥터(스킬 트리 ${BRANCHES.length}갈래)·미니게임, 낚시(자동 낚시 포함)·채집·도감, 동물원 펫, 관람차·열기구·조각배, 귀신의집, 폭죽·확성기`,
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
