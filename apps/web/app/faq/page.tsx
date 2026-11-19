import FaqBrowser from "@/components/site/FaqBrowser";
import SiteShell from "@/components/site/SiteShell";
import styles from "@/components/site/site.module.css";
import { absoluteUrl, FACTS_DATE, jsonLd, SITE_TITLE } from "../seo";
import { FAQ } from "@/lib/devNotes/faq";
import { siteMetadata, SITE_VIEWPORT } from "@/lib/devNotes/meta";

const PATH = "/faq";
const DESCRIPTION =
  "At one time...에 대해 자주 묻는 질문을 모았어요. 무료인지, 설치나 가입이 필요한지, 휴대폰, 채널 인원, 배경음악, 포인트와 출석, 꾸미기와 상점, 낚시와 의뢰, 사냥, 집과 묘비에 대한 답이에요.";

export const viewport = SITE_VIEWPORT;
export const metadata = siteMetadata({ title: "자주 묻는 질문", description: DESCRIPTION, path: PATH });

// 화면의 질문·답과 FAQPage 구조화 데이터가 같은 배열(lib/devNotes/faq)을 쓴다 (둘이 어긋나지 않게)
const LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": absoluteUrl(PATH),
      url: absoluteUrl(PATH),
      name: "자주 묻는 질문",
      description: DESCRIPTION,
      inLanguage: "ko",
      dateModified: FACTS_DATE,
      isPartOf: { "@type": "WebSite", "@id": `${absoluteUrl("/")}#website`, name: SITE_TITLE, url: absoluteUrl("/") },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.items.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ],
};

export default function FaqPage() {
  return (
    <SiteShell current="faq">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(LD) }} />
      <div className={styles.wrap}>
        <header className={styles.head}>
          <h1 className={styles.display}>자주 묻는 질문</h1>
          <p>자주 물어보시는 것들이에요.</p>
          <div className={styles.rule} />
        </header>
      </div>
      <div className={styles.faq}>
        <FaqBrowser cats={FAQ.cats} items={FAQ.items} />
        <p className={styles.faqMore}>찾는 답이 없으면 게임 안 [내 정보]의 [문의하기]로 알려 주세요.</p>
      </div>
    </SiteShell>
  );
}
