"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
import { referralApi } from "@/lib/referralClient";
import { REF_DAY_MIN, REF_GRAND_MONTH_CAP, REF_MONTH_CAP, REF_NEED_DAYS, refGrandText, refLink, refRewardText, type ReferralView } from "@/lib/referralRules";
import { stayText } from "@/lib/stayTime";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./MyPanel.module.css";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 내 정보 추천 코드 칸: 내 공개 추천 코드·공유 링크(복사), 데려온 이웃 수·받은 선물·다음 칭호, 짧은 규칙.
 * 나를 데려온 이웃이 있으면 조건까지 남은 진행. 11/19 추천인은 가입할 때만 넣는다 (여기서 뒤늦게 넣기는 없앴다).
 * 비밀 개인 코드(위 「개인 코드」 칸)와는 다른 값이다
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
  if (!view.code) {
    return (
      <section className={styles.section}>
        <h3 className={styles.heading}>추천 코드</h3>
        <p className={ui.hint}>운영자 계정은 추천에 참여하지 않아요.</p>
      </section>
    );
  }

  const link = refLink(window.location.origin, view.code);
  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>추천 코드</h3>
      <div className={styles.codeBox}>
        <output className={styles.code} aria-label="내 추천 코드">
          {view.code}
        </output>
        <div className={styles.codeButtons}>
          <button type="button" className={ui.button} onClick={() => copy(view.code!, "추천 코드를 복사했어요.")}>
            코드 복사
          </button>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => copy(link, "초대 링크를 복사했어요.")}>
            링크 복사
          </button>
        </div>
      </div>
      <p className={ui.hint}>친구에게 마음껏 알려 줘도 되는 코드예요. 로그인용 개인 코드와는 달라요.</p>
      <p className={styles.sub}>
        데려온 이웃 {fmt(view.joined)}명 중 {fmt(view.qualified)}명이 마을에 자리 잡았어요.
        {view.giftsGot > 0 && ` 추천 선물을 ${fmt(view.giftsGot)}번 받았어요.`}
      </p>
      {view.second.joined > 0 && (
        <p className={styles.sub}>
          친구가 데려온 이웃 {fmt(view.second.joined)}명
          {view.second.rewarded > 0 ? `, 그 덕분에 선물을 ${fmt(view.second.rewarded)}번 받았어요.` : "이 있어요."}
        </p>
      )}
      <p className={styles.sub}>
        {view.next
          ? `${fmt(view.next.need - view.next.count)}명 더 자리 잡으면 「${view.next.title}」 칭호를 받아요.`
          : "추천 칭호를 모두 받았어요."}
        {view.monthRewarded > 0 && ` 이번 달 보상은 ${REF_MONTH_CAP}명 중 ${view.monthRewarded}명째예요.`}
      </p>
      <ul className={ui.hint}>
        <li>
          친구가 가입할 때 내 코드를 넣고 하루 {stayText(REF_DAY_MIN)} 넘게 머문 날이 {REF_NEED_DAYS}일이 되면 둘 다 {refRewardText()}을 받아요. 이어진 날이 아니어도 돼요.
        </li>
        <li>추천 선물은 한 달에 {REF_MONTH_CAP}명까지예요. 그 뒤로는 칭호에만 세요.</li>
        <li>
          내 친구가 데려온 이웃이 자리 잡으면 나도 {refGrandText()}을 받아요. 한 달에 {REF_GRAND_MONTH_CAP}번까지예요.
        </li>
        <li>추천 코드는 가입할 때만 넣을 수 있어요.</li>
        <li>한 사람이 여러 계정으로 받는 걸 막으려고 운영자가 확인한 뒤 보내 드려요.</li>
      </ul>

      {view.mine && <MyProgress mine={view.mine} />}

      {message && (
        <p className={styles.sub} role="status">
          {message}
        </p>
      )}
    </section>
  );
}

/** 나를 데려온 이웃과 조건까지 진행 */
function MyProgress({ mine }: { mine: NonNullable<ReferralView["mine"]> }) {
  const who = mine.referrerName ?? "이웃";
  if (mine.qualified)
    return (
      <p className={styles.sub}>
        {who}님의 추천으로 왔어요.{" "}
        {mine.rewarded ? "조건을 채워서 환영 선물을 받았어요." : mine.held ? "조건을 모두 채웠어요. 환영 선물은 확인을 마치면 보내 드려요." : "조건을 모두 채웠어요."}
      </p>
    );
  return (
    <p className={styles.sub}>
      {who}님의 추천으로 왔어요. 하루 {stayText(REF_DAY_MIN)} 넘게 머문 날 {Math.min(mine.days, REF_NEED_DAYS)}일 / {REF_NEED_DAYS}일, 오늘{" "}
      {stayText(Math.min(mine.todayMin, REF_DAY_MIN))} / {stayText(REF_DAY_MIN)}이에요. 다 채우면 환영 선물로 {refRewardText()}을 받아요.
    </p>
  );
}
