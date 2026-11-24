"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
import { referralApi } from "@/lib/referralClient";
import { REF_DAY_MIN, REF_MONTH_CAP, REF_NEED_DAYS, refLink, type ReferralView } from "@/lib/referralRules";
import { stayText } from "@/lib/stayTime";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./MyPanel.module.css";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 내 정보 추천 코드 칸: 내 공개 추천 코드·초대 링크(복사)와 숫자 몇 줄 (데려온 이웃·다음 칭호·이번 달 선물·나를 데려온 이웃).
 * 11/24 규칙 설명은 뺐다 (안내 창 「추천」 항목에 있다). 11/19 추천인은 가입할 때만 넣는다.
 * 비밀 개인 코드(아래 「개인 코드」 칸)와는 다른 값이다. 운영자 계정은 칸을 그리지 않는다
 */
export default function ReferralSection() {
  const [view, setView] = useState<ReferralView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    referralApi.view().then(
      (v) => alive && setView(v),
      (e: unknown) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, []);

  async function copy(value: string, done: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(done);
    } catch {
      setMessage("복사가 안 되면 길게 눌러 직접 복사해 주세요.");
    }
  }

  if (view && !view.code) return null;
  if (!view) {
    return (
      <section className={styles.section}>
        <h3 className={styles.heading}>추천 코드</h3>
        <p className={styles.sub} role="status">
          {error ?? "불러오는 중…"}
        </p>
      </section>
    );
  }

  const code = view.code!;
  const link = refLink(window.location.origin, code);
  const mine = view.mine;
  const rows: [string, string][] = [
    ["데려온 이웃", `${fmt(view.joined)}명 · 자리 잡은 이웃 ${fmt(view.qualified)}명`],
    ...(view.second.joined > 0 ? [["친구가 데려온 이웃", `${fmt(view.second.joined)}명`] as [string, string]] : []),
    ["다음 칭호", view.next ? `「${view.next.title}」까지 ${fmt(view.next.need - view.next.count)}명` : "모두 받음"],
    ...(view.monthRewarded > 0 ? [["이번 달 선물", `${view.monthRewarded} / ${REF_MONTH_CAP}명`] as [string, string]] : []),
    ...(mine
      ? [
          [
            "나를 추천한 이웃",
            `${mine.referrerName ?? "이웃"}님 · ${
              mine.qualified
                ? mine.rewarded
                  ? "환영 선물 받음"
                  : mine.held
                    ? "선물 확인 중"
                    : "조건 완료"
                : `${Math.min(mine.days, REF_NEED_DAYS)} / ${REF_NEED_DAYS}일 (오늘 ${stayText(Math.min(mine.todayMin, REF_DAY_MIN))} / ${stayText(REF_DAY_MIN)})`
            }`,
          ] as [string, string],
        ]
      : []),
  ];

  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>추천 코드</h3>
      <div className={styles.codeBox}>
        <output className={styles.code} aria-label="내 추천 코드">
          {code}
        </output>
        <div className={styles.codeButtons}>
          <button type="button" className={ui.button} onClick={() => copy(code, "추천 코드를 복사했어요.")}>
            코드 복사
          </button>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => copy(link, "초대 링크를 복사했어요.")}>
            링크 복사
          </button>
        </div>
      </div>
      <dl className={styles.rows}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {message && (
        <p className={styles.sub} role="status">
          {message}
        </p>
      )}
    </section>
  );
}
