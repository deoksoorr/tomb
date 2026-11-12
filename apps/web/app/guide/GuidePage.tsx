import Link from "next/link";
import type { ReactNode } from "react";
import legal from "../legal.module.css";
import { absoluteUrl, FACTS_DATE, GUIDE_PAGES, jsonLd, SITE_TITLE } from "../seo";
import styles from "./guide.module.css";

type Props = {
  path: string;
  h1: string;
  /** 첫 문단: 질문에 대한 직답 (40~80자) */
  lead: string;
  description: string;
  /** 근거 표 [항목, 값] — 코드에서 확인한 숫자만 */
  facts?: readonly (readonly [string, string])[];
  /** 이용 방법 3단계 */
  steps?: readonly ReactNode[];
  /** 본문 대신 넣을 내용 (FAQ) */
  children?: ReactNode;
  /** 페이지 고유 구조화 데이터 (FAQPage 등) */
  extraJsonLd?: readonly object[];
};

/** 검색 의도 하나 = 안내 페이지 하나. 서버에서 그리는 정적 페이지라 자바스크립트 없이도 내용이 다 보인다 */
export default function GuidePage({ path, h1, lead, description, facts, steps, children, extraJsonLd = [] }: Props) {
  const url = absoluteUrl(path);
  const home = absoluteUrl("/");
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: h1,
        description,
        inLanguage: "ko",
        dateModified: FACTS_DATE,
        isPartOf: {
          "@type": "WebSite",
          "@id": `${home}#website`,
          name: SITE_TITLE,
          url: home,
        },
        about: { "@id": `${home}#game` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_TITLE, item: home },
          { "@type": "ListItem", position: 2, name: h1, item: url },
        ],
      },
      ...extraJsonLd,
    ],
  };
  const others = GUIDE_PAGES.filter((p) => p.path !== path);
  return (
    <main className={legal.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
      <div className={legal.inner}>
        <Link href="/" className={legal.home}>
          ← 한때는... 마을로
        </Link>
        <h1 className={legal.title}>{h1}</h1>
        <p className={styles.lead}>{lead}</p>

        {facts && (
          <>
            <h2>한눈에 보기</h2>
            <p className={styles.caption}>기준일 {FACTS_DATE}</p>
            <table className={legal.table}>
              <thead>
                <tr>
                  <th scope="col">항목</th>
                  <th scope="col">값</th>
                </tr>
              </thead>
              <tbody>
                {facts.map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {steps && (
          <>
            <h2>이렇게 써요</h2>
            <ol className={styles.steps}>
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </>
        )}

        {children}

        <Link href="/" className={styles.cta}>
          마을 들어가기 →
        </Link>

        <h2>다른 안내</h2>
        <ul>
          {others.map((p) => (
            <li key={p.path}>
              <Link href={p.path} className={styles.related}>
                {p.h1}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/terms" className={styles.related}>
              이용약관
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
