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
  description: "게임을 처음 만들어 보는 한 사람이 At one time...을 어떻게 만들었는지 적었어요. 구조, 만든 방식, 겪은 문제와 고친 방법.",
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
      <div className={styles.wrap}>
        <header className={styles.head}>
          <h1 className={styles.display}>만든 이야기</h1>
          <p>{S.sub}</p>
          <div className={styles.rule} />
        </header>
      </div>
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
