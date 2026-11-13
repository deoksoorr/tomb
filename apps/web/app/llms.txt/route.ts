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
    "게임을 한 번도 만들어 본 적 없는 개인이 만든 비영리 프로젝트로, 후원·광고·유료 재화가 없는 무료 웹 서비스입니다. 설치·회원가입이 필요 없습니다. 채널마다 최대 40명이 한 마을에 모이고, 9가지 장르 180곡의 배경음악을 틀어 둘 수 있습니다.",
    "",
    "## 안내",
    "",
    ...guides.map((p) => `- [${p.h1}](${absoluteUrl(p.path)}): ${p.summary}`),
    "",
    "## 자주 묻는 질문",
    "",
    `- [자주 묻는 질문](${absoluteUrl("/faq")}): 무료인지, 설치·가입, 모바일, 함께 있는 인원, 음악, 포인트`,
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
