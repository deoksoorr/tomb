import SiteBanner from "@/components/site/SiteBanner";
import SiteShell from "@/components/site/SiteShell";
import StoryDays from "@/components/site/StoryDays";
import { cx } from "@/components/ui/cx";
import styles from "@/components/site/site.module.css";
import { paragraphs } from "@/lib/devNotes/format";
import { siteMetadata, SITE_VIEWPORT } from "@/lib/devNotes/meta";
import { ARCH_SVG, STORY, STORY_SECURITY, STORY_START } from "@/lib/devNotes/story";

export const viewport = SITE_VIEWPORT;
export const metadata = siteMetadata({
  title: "만든 이야기",
  description: "게임을 처음 만들어 보는 개인 개발자가 At one time...을 어떻게 만들었는지 적은 글이에요. 서버 구조와 만든 방식, 보안을 챙기는 방법, 그동안 겪은 문제와 고친 과정을 담았어요.",
  path: "/story",
});

const Paras = ({ text }: { text: string }) => (
  <>
    {paragraphs(text).map((t, i) => (
      <p key={i}>{t}</p>
    ))}
  </>
);

export default function StoryPage() {
  const S = STORY;
  return (
    <SiteShell current="story">
      {/* 11/21 머리 배너: 까마귀 연못 (밤) */}
      <SiteBanner title="만든 이야기" sub={S.sub} video={{ webm: "/devnote/story-banner.webm", mp4: "/devnote/story-banner.mp4", poster: "/devnote/story-banner-poster.webp" }} />
      <article className={styles.story}>
        <p className={styles.lead}>{S.lead}</p>
        <div className={styles.stats}>
          {S.stats.map(([k, v, n]) => (
            <div key={k} className={styles.stat}>
              <span>{k}</span>
              <b>{v}</b>
              <small>{n === "{days}" ? <StoryDays {...STORY_START} /> : n}</small>
            </div>
          ))}
        </div>
        <section className={styles.st}>
          <h2>{S.arch.h}</h2>
          <Paras text={S.arch.before} />
          <figure className={styles.arch} role="img" aria-label={S.arch.alt} dangerouslySetInnerHTML={{ __html: ARCH_SVG }} />
          <ul>
            {S.arch.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
        <section className={styles.st}>
          <h2>{S.how.h}</h2>
          <Paras text={S.how.text} />
        </section>
        <section className={styles.st}>
          <h2>{STORY_SECURITY.h}</h2>
          <Paras text={STORY_SECURITY.text} />
        </section>
        <section className={styles.st}>
          <h2>{S.cases.h}</h2>
          <div className={styles.cases}>
            {S.cases.items.map((c) => (
              <div key={c.t} className={styles.case}>
                <h3>{c.t}</h3>
                <dl>
                  {c.rows.map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
        <div className={cx(styles.closing)}>
          <span className={styles.ghost} aria-hidden="true" />
          <p>{S.closing}</p>
        </div>
      </article>
    </SiteShell>
  );
}
