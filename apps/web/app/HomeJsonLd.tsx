import { absoluteUrl, jsonLd, SITE_DESCRIPTION, SITE_TITLE } from "./seo";

// 홈 구조화 데이터: 사이트(WebSite) + 브라우저 게임(VideoGame). 화면·메타 설명과 같은 사실만 쓴다.
export default function HomeJsonLd() {
  const url = absoluteUrl("/");
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${url}#website`,
        name: SITE_TITLE,
        url,
        description: SITE_DESCRIPTION,
        inLanguage: "ko",
      },
      {
        "@type": "VideoGame",
        "@id": `${url}#game`,
        name: SITE_TITLE,
        url,
        description: SITE_DESCRIPTION,
        inLanguage: "ko",
        isAccessibleForFree: true,
        genre: ["실시간 멀티플레이", "도트 마을", "소셜"],
        playMode: "MultiPlayer",
        gamePlatform: "Web browser",
        applicationCategory: "Game",
        operatingSystem: "Web browser",
        offers: { "@type": "Offer", price: 0, priceCurrency: "KRW" },
        isPartOf: { "@id": `${url}#website` },
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
