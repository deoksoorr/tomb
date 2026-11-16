"use client";

import { useEffect, useState } from "react";
import { MANAGER_TITLE_ID, TITLE_IDS, titleOfLook } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { perkShort, perkText, pioneerText, progressText, STAFF_TITLE, TITLE_GRADE_NAMES, TITLE_GROUP_NAMES, TITLE_GROUPS, TITLES, titleDef, type TitleDef } from "@/lib/titles";
import type { Me } from "@/lib/types";
import { titleNews } from "@/lib/hooks/useTitleNews";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { wearTitle } from "./actions";
import styles from "./TitlesPane.module.css";

// 가방 [칭호] 칸: 모든 칭호를 갈래별로 늘어놓는다. 얻은 칭호는 흰 글자, 못 얻은 칭호는 회색 + 얻는 방법.
// 한 번에 하나만 낀다. 낀 칭호는 머리 위 이름표 위에 「…」로 보인다.
// 11/16 카드를 누르면 바로 끼지 않고 "고르기"만 한다 → 맨 위 자세히 칸(스크롤해도 위에 붙어 있다)에 얻는 법·진행·능력 전체 문장과 [달기]/[빼기].
//       카드는 높이가 모두 같고 글은 줄임표로 자른다 (자세한 글은 위 칸에서).
// 11/15 운영자 계정만: 맨 위에 운영자 전용 「운영자」(신화) 카드 — 끼우는 칭호가 아니라 운영자 표시로 머리 위에 저절로 뜬다 (낀 칭호 자리를 대신).
// 11/16 매니저만: 매니저 전용 칭호 카드 (끼우고 빼는 칭호). 매니저가 아니면 칭호 목록·개수에서 아예 뺀다.

/** 매니저 전용 칭호 정의와 그 밖의 모든 칭호 */
const MGR_DEF = titleDef(MANAGER_TITLE_ID);
const LISTED = TITLES.filter((t) => !t.manager);
/** 11/16 화면에 늘어놓는 차례 (갈래 차례대로) — 처음 고를 칭호(얻은 것 중 맨 앞)를 찾을 때 */
const ORDERED = TITLE_GROUPS.flatMap((g) => LISTED.filter((t) => t.group === g));

type Act = (task: () => Promise<void>, done: string) => Promise<void>;

/** 마지막으로 받은 칭호 상태 (계정마다, 이 화면 메모리) — 다시 열 때 먼저 보여 줘 회색 → 흰색 깜빡임이 없게 */
const lastSeen = new Map<string, { earned: string[]; progress: Record<string, number> }>();

export default function TitlesPane({ me, pending, act }: { me: Me; pending: boolean; act: Act }) {
  // 처음 그림: 운영자는 내 정보의 staff로 처음부터 모두 얻은 것으로, 아니면 마지막으로 받은 값, 그것도 없으면 "불러오는 중"(null)
  const [earned, setEarned] = useState<Set<string> | null>(() =>
    me.staff ? new Set(TITLE_IDS.filter((id) => id !== MANAGER_TITLE_ID || me.manager)) : lastSeen.has(me.accountId) ? new Set(lastSeen.get(me.accountId)!.earned) : null,
  );
  /** 이번에 열었을 때 처음 본 새 칭호 ("NEW" — 닫았다 다시 열면 사라진다) */
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  /** 진행 수치 (처치 1,234/5,000 등)와 운영자 계정 표시 */
  const [progress, setProgress] = useState<Record<string, number>>(() => lastSeen.get(me.accountId)?.progress ?? {});
  const [staff, setStaff] = useState(me.staff === true);
  const [error, setError] = useState<string | null>(null);
  // 지금 낀 칭호는 내 정보(착용 목록)에서 — 끼우고 빼면 바로 바뀐다
  const equipped = titleOfLook(me.equipped.map((e) => e.itemId));
  /** 11/16 고른 칭호 (null = 아직 안 고름 → 낀 칭호, 없으면 얻은 것 중 맨 앞) */
  const [sel, setSel] = useState<string | null>(null);

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
        lastSeen.set(me.accountId, { earned: r.earned, progress: r.progress ?? {} });
        // 칸을 열었으니 본 것으로 (가방 단추 점이 꺼진다)
        if (r.unseen.length) void api.titleMarks({ seen: r.unseen }).catch(() => undefined);
        titleNews.set([]);
      })
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
    // 계정은 열려 있는 동안 바뀌지 않는다 (처음 한 번만)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(t: TitleDef) {
    // 11/16 빼고 나도 고른 카드가 다른 칭호로 넘어가지 않게 지금 것으로 붙잡아 둔다
    setSel(t.id);
    if (equipped === t.id) void act(() => wearTitle(null), `칭호 「${t.name}」을(를) 뺐어요.`);
    else void act(() => wearTitle(t.id), `칭호 「${t.name}」을(를) 달았어요. 머리 위 이름표 위에 보여요.`);
  }

  const total = earned ? LISTED.filter((t) => earned.has(t.id)).length : 0;
  // 매니저 전용 칭호는 매니저에게만 (내 정보의 manager, 또는 서버가 얻은 칭호로 알려 준 것)
  const mgr = !!MGR_DEF && (me.manager === true || !!earned?.has(MGR_DEF.id));
  const firstOwned = (mgr && MGR_DEF && earned?.has(MGR_DEF.id) ? MGR_DEF : ORDERED.find((t) => earned?.has(t.id)))?.id ?? null;
  const pick = titleDef(sel ?? equipped ?? firstOwned);
  const pickGot = !!pick && !!earned?.has(pick.id);
  const pickOn = !!pick && equipped === pick.id;

  /** 진행도 한 줄 (못 얻은 칭호는 막대 + 숫자, 개척자는 번호·달성 날짜, 운영자는 "운영자") — 카드·자세히 칸 같이 쓴다 */
  function progressOf(t: TitleDef, got: boolean) {
    if (staff) return <span className={styles.progress}>운영자</span>;
    if (!got && t.metric && progress[t.metric] !== undefined)
      return (
        <span className={styles.progress}>
          <span className={styles.bar} aria-hidden="true">
            <span style={{ width: `${Math.round(Math.min(1, (progress[t.metric] ?? 0) / (t.need ?? 1)) * 100)}%` }} />
          </span>
          {progressText(t, progress[t.metric] ?? 0)}
        </span>
      );
    // 11/15 개척자: 번호·달성 날짜
    if (got && t.metric === "pioneer" && progress.pioneer) return <span className={styles.progress}>{pioneerText(progress.pioneer, progress.pioneerAt)}</span>;
    return null;
  }

  /** 칭호 카드 하나 (누르면 고르기만 — 끼고 빼기는 위 자세히 칸 단추) */
  function card(t: TitleDef, only?: string) {
    const loading = earned === null;
    const got = !!earned?.has(t.id);
    const on = equipped === t.id;
    const short = perkShort(t);
    return (
      <button
        type="button"
        className={styles.title}
        data-grade={t.grade}
        data-earned={got || undefined}
        data-worn={on || undefined}
        data-loading={loading || undefined}
        aria-busy={loading || undefined}
        aria-pressed={pick?.id === t.id}
        aria-label={`${t.name}${only ? `, ${only}` : ""}, ${loading ? "불러오는 중" : got ? (on ? "달고 있는 칭호" : "얻은 칭호") : "아직 못 얻은 칭호"}${short ? `, ${short}` : ""}`}
        onClick={() => setSel(t.id)}
      >
        <span className={styles.top}>
          <span className={styles.grade}>{TITLE_GRADE_NAMES[t.grade]}</span>
          <span className={styles.name}>「{t.name}」</span>
          {on && <span className={styles.worn}>착용</span>}
          {fresh.has(t.id) && <span className={styles.new}>NEW</span>}
        </span>
        <span className={styles.how}>{loading ? "불러오는 중…" : t.how}</span>
        {!loading && progressOf(t, got)}
        {short && <span className={styles.perk}>{short}</span>}
      </button>
    );
  }

  return (
    <div className={styles.pane}>
      <p className={styles.summary}>
        얻은 칭호 {earned ? total : "–"}/{LISTED.length}
        {staff && " · 운영자는 모든 칭호를 쓸 수 있어요"}
      </p>
      {/* 11/16 고른 칭호 자세히 (스크롤해도 맨 위에 붙어 있다 · 높이 고정이라 골라도 아래 카드가 움직이지 않는다) */}
      <section className={styles.detail} aria-label="고른 칭호" aria-live="polite">
        {pick ? (
          <>
            <div className={styles.detailTop}>
              <span className={styles.detailHead} data-grade={pick.grade} data-earned={pickGot || undefined}>
                <span className={styles.grade}>{TITLE_GRADE_NAMES[pick.grade]}</span>
                <b className={styles.detailName} data-grade={pick.grade} data-earned={pickGot || undefined}>
                  「{pick.name}」
                </b>
                {pickOn && <span className={styles.worn}>착용</span>}
              </span>
              <button
                type="button"
                className={cx(ui.button, pickGot && !pickOn && ui.primary, styles.wear)}
                disabled={!pickGot || pending}
                onClick={() => toggle(pick)}
              >
                {earned === null ? "불러오는 중…" : !pickGot ? "아직 못 얻었어요" : pickOn ? "빼기" : "달기"}
              </button>
            </div>
            <p className={styles.detailHow}>{pick.how}</p>
            {earned !== null && !staff && progressOf(pick, pickGot)}
            <p className={styles.detailPerk} data-none={!perkText(pick) || undefined}>
              {perkText(pick) || "칭호 능력은 없어요."}
            </p>
          </>
        ) : (
          <p className={styles.detailHow}>{earned === null ? "불러오는 중…" : "아직 얻은 칭호가 없어요. 카드를 누르면 얻는 법을 볼 수 있어요."}</p>
        )}
      </section>
      {error && <p className={ui.error}>{error}</p>}
      {staff && (
        <section className={styles.group} aria-label="운영자 전용 칭호">
          <h3 className={styles.heading}>
            운영자 전용<span className={styles.count}> 1/1</span>
          </h3>
          <ul className={styles.list}>
            <li>
              <div className={styles.title} data-grade="staff" data-earned aria-label={`${STAFF_TITLE.name}, 운영자 전용 칭호. ${STAFF_TITLE.how}`}>
                <span className={styles.top}>
                  <span className={styles.grade}>{STAFF_TITLE.gradeName}</span>
                  <span className={styles.name}>「{STAFF_TITLE.name}」</span>
                </span>
                <span className={styles.how}>{STAFF_TITLE.how}</span>
                <span className={styles.progress}>{equipped ? "낀 칭호 대신 머리 위에 떠요" : "늘 머리 위에 떠요"}</span>
              </div>
            </li>
          </ul>
        </section>
      )}
      {mgr && MGR_DEF && (
        <section className={styles.group} aria-label="매니저 전용 칭호">
          <h3 className={styles.heading}>
            매니저 전용<span className={styles.count}> 1/1</span>
          </h3>
          <ul className={styles.list}>
            <li>{card(MGR_DEF, "매니저 전용 칭호")}</li>
          </ul>
        </section>
      )}
      {TITLE_GROUPS.map((g) => {
        const list = LISTED.filter((t) => t.group === g);
        return (
          <section key={g} className={styles.group} aria-label={`${TITLE_GROUP_NAMES[g]} 칭호`}>
            <h3 className={styles.heading}>
              {TITLE_GROUP_NAMES[g]}
              <span className={styles.count}> {earned ? `${list.filter((t) => earned.has(t.id)).length}/${list.length}` : ""}</span>
            </h3>
            <ul className={styles.list}>
              {list.map((t) => (
                <li key={t.id}>{card(t)}</li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
