"use client";

import { useEffect, useState } from "react";
import { titleOfLook } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { perkShort, perkText, progressText, TITLE_GRADE_NAMES, TITLE_GROUP_NAMES, TITLE_GROUPS, TITLES, titleDef, type TitleDef } from "@/lib/titles";
import type { Me } from "@/lib/types";
import { titleNews } from "@/lib/hooks/useTitleNews";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { wearTitle } from "./actions";
import styles from "./TitlesPane.module.css";

// 가방 [칭호] 칸: 모든 칭호를 갈래별로 늘어놓는다. 얻은 칭호는 흰 글자(누르면 끼우기·다시 누르면 빼기),
// 못 얻은 칭호는 회색 + 얻는 방법. 한 번에 하나만 낀다. 낀 칭호는 머리 위 이름표 위에 「…」로 보인다.

type Act = (task: () => Promise<void>, done: string) => Promise<void>;

export default function TitlesPane({ me, pending, act }: { me: Me; pending: boolean; act: Act }) {
  const [earned, setEarned] = useState<Set<string> | null>(null);
  /** 이번에 열었을 때 처음 본 새 칭호 ("NEW" — 닫았다 다시 열면 사라진다) */
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  /** 진행 수치 (처치 1,234/5,000 등)와 운영자 계정 표시 */
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [staff, setStaff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 지금 낀 칭호는 내 정보(착용 목록)에서 — 끼우고 빼면 바로 바뀐다
  const equipped = titleOfLook(me.equipped.map((e) => e.itemId));
  const cur = titleDef(equipped);

  useEffect(() => {
    let alive = true;
    api
      .titles()
      .then((r) => {
        if (!alive) return;
        setEarned(new Set(r.earned));
        setFresh(new Set(r.unseen));
        setProgress(r.progress ?? {});
        setStaff(r.staff === true);
        // 칸을 열었으니 본 것으로 (가방 단추 점이 꺼진다)
        if (r.unseen.length) void api.titleMarks({ seen: r.unseen }).catch(() => undefined);
        titleNews.set([]);
      })
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  function toggle(t: TitleDef) {
    if (equipped === t.id) void act(() => wearTitle(null), `칭호 「${t.name}」을(를) 뺐어요.`);
    else void act(() => wearTitle(t.id), `칭호 「${t.name}」을(를) 달았어요. 머리 위 이름표 위에 보여요.`);
  }

  const total = earned ? TITLES.filter((t) => earned.has(t.id)).length : 0;
  return (
    <div className={styles.pane}>
      <div className={styles.now}>
        <p>
          지금 칭호{" "}
          <b className={styles.nowName} data-grade={cur?.grade}>
            {cur ? `「${cur.name}」` : "없음"}
          </b>
          <span className={styles.count}>
            {" "}
            · 얻은 칭호 {earned ? total : "–"}/{TITLES.length}
            {staff && " · 운영자: 모든 칭호를 쓸 수 있어요"}
          </span>
          {cur && perkText(cur.grade) && <span className={styles.perkNow}>칭호 능력: {perkText(cur.grade)}</span>}
        </p>
        {cur && (
          <button type="button" className={cx(ui.button, styles.off)} disabled={pending} onClick={() => toggle(cur)}>
            칭호 빼기
          </button>
        )}
      </div>
      {error && <p className={ui.error}>{error}</p>}
      {TITLE_GROUPS.map((g) => {
        const list = TITLES.filter((t) => t.group === g);
        return (
          <section key={g} className={styles.group} aria-label={`${TITLE_GROUP_NAMES[g]} 칭호`}>
            <h3 className={styles.heading}>
              {TITLE_GROUP_NAMES[g]}
              <span className={styles.count}> {earned ? `${list.filter((t) => earned.has(t.id)).length}/${list.length}` : ""}</span>
            </h3>
            <ul className={styles.list}>
              {list.map((t) => {
                const got = !!earned?.has(t.id);
                const on = equipped === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={styles.title}
                      data-grade={t.grade}
                      data-earned={got || undefined}
                      aria-pressed={on}
                      disabled={!got || pending}
                      aria-label={`${t.name}, ${got ? (on ? "착용 중, 누르면 빼기" : "얻은 칭호, 누르면 달기") : `아직 못 얻음. ${t.how}`}`}
                      onClick={() => toggle(t)}
                    >
                      <span className={styles.top}>
                        <span className={styles.grade}>{TITLE_GRADE_NAMES[t.grade]}</span>
                        <span className={styles.name}>「{t.name}」</span>
                        {fresh.has(t.id) && <span className={styles.new}>NEW</span>}
                      </span>
                      <span className={styles.how}>{got ? (on ? "착용 중 · 누르면 빼기" : "누르면 달기") : t.how}</span>
                      {!got && !staff && t.metric && progress[t.metric] !== undefined && (
                        <span className={styles.progress}>
                          <span className={styles.bar} aria-hidden="true">
                            <span style={{ width: `${Math.round(Math.min(1, (progress[t.metric] ?? 0) / (t.need ?? 1)) * 100)}%` }} />
                          </span>
                          {progressText(t, progress[t.metric] ?? 0)}
                        </span>
                      )}
                      {staff && <span className={styles.progress}>운영자</span>}
                      {perkShort(t.grade) && <span className={styles.perk}>{perkShort(t.grade)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
