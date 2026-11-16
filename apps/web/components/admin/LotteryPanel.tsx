"use client";

import { useState } from "react";
import { ApiRequestError, errorMessage, request } from "@/lib/api";
import { LOTTERY_SUBSIDY_MAX } from "@/lib/lottery";
import type { AdminLotteryResponse } from "@/lib/lotteryService";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import { usePanelData } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const api = {
  status: () => request<AdminLotteryResponse>("/api/admin/lottery", { cache: "no-store" }),
  subsidy: (amount: number) =>
    request<AdminLotteryResponse>("/api/admin/lottery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount }) }),
  drawNow: () => request<AdminLotteryResponse>("/api/admin/lottery/test", { method: "POST" }),
};

const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 주간 행운권 탭: 지금 회차(팔린 장수·상금 나눔)·지원금 더하기·최근 추첨 결과.
 * 테스트 서버에서는 [지금 추첨하기]로 지금 회차를 바로 뽑아 볼 수 있다 (운영 404). 규칙은 lib/lottery.ts
 */
export default function LotteryPanel({ toast, onAuthLost }: Props) {
  const loaded = usePanelData(() => api.status(), [], toast, onAuthLost);
  const [saved, setSaved] = useState<AdminLotteryResponse | null>(null);
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const view = saved ?? loaded;

  const run = async (job: () => Promise<AdminLotteryResponse>, done: (r: AdminLotteryResponse) => string) => {
    setPending(true);
    try {
      const r = await job();
      setSaved(r);
      toast(done(r));
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) onAuthLost();
      else toast(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const addSubsidy = () => {
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) return toast("더할 포인트를 정수로 적어 주세요.");
    void run(
      () => api.subsidy(n),
      (r) => {
        setAmount("");
        return `지원금 ${fmt(n)}P를 더했어요. 이번 주 상금은 ${fmt(r.pool.total)}P예요.`;
      },
    );
  };

  const drawNow = () => {
    if (!window.confirm("지금 회차를 바로 추첨할까요? 당첨 선물과 마을 공지가 실제처럼 나가요.")) return;
    void run(
      () => api.drawNow(),
      (r) => {
        const last = r.recent[0];
        return last?.winners.length ? `시험 추첨을 했어요. 1등은 ${last.winners[0].name}님이에요.` : "시험 추첨을 했어요. 산 사람이 없어서 상금이 넘어가요.";
      },
    );
  };

  return (
    <section className={styles.notices} aria-label="주간 행운권">
      <div className={styles.notice}>
        <p className={styles.noticeTitle}>
          <strong>이번 회차</strong>
        </p>
        {view === null ? (
          <p className={ui.hint}>불러오는 중…</p>
        ) : (
          <>
            <p role="status">
              {KST.format(view.drawAt)} 추첨이에요. 지금까지 {fmt(view.tickets)}장 팔렸어요.
            </p>
            <p>
              상금 <strong>{fmt(view.pool.total)}P</strong>
            </p>
            <ul className={ui.hint}>
              <li>지난 추첨에서 넘어온 이월 상금 {fmt(view.pool.carry)}P</li>
              <li>
                판매 몫 {fmt(view.pool.salesShare)}P (판매액 {fmt(view.pool.sales)}P)
              </li>
              <li>매주 기본 상금 {fmt(view.pool.base)}P</li>
              <li>관리자 지원금 {fmt(view.pool.subsidy)}P</li>
            </ul>
            <p className={ui.hint}>
              1등 {fmt(view.prizes[0])}P, 2등 {fmt(view.prizes[1])}P, 3등 {fmt(view.prizes[2])}P
            </p>
            <form
              className={styles.pointsForm}
              onSubmit={(e) => {
                e.preventDefault();
                addSubsidy();
              }}
              aria-label="지원금 더하기"
            >
              <input
                className={cx(ui.input)}
                type="number"
                min={1}
                max={LOTTERY_SUBSIDY_MAX}
                step={1}
                inputMode="numeric"
                placeholder="더할 포인트"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={pending}
                aria-label="지원금 (P)"
              />
              <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || !amount}>
                지원금 더하기
              </button>
              {view.testServer && (
                <button type="button" className={cx(ui.button, ui.danger)} onClick={drawNow} disabled={pending}>
                  지금 추첨하기
                </button>
              )}
            </form>
            <p className={ui.hint}>
              지원금은 이번 회차 상금에만 더해지고 상한이 없어요. 한 번에 {fmt(LOTTERY_SUBSIDY_MAX)}P까지 더할 수 있어요.
              {view.testServer && " [지금 추첨하기]는 테스트 서버에만 있어요. 시험 기록으로 남기고 이번 회차를 비워 다시 팔아요."}
            </p>
          </>
        )}
      </div>

      <div className={styles.notice}>
        <p className={styles.noticeTitle}>
          <strong>최근 추첨</strong>
        </p>
        {!view?.recent.length ? (
          <p className={ui.hint}>아직 추첨한 회차가 없어요.</p>
        ) : (
          <ul className={styles.notices}>
            {view.recent.map((r) => (
              <li key={r.id} className={styles.notice}>
                <p className={styles.noticeTitle}>
                  <strong>
                    {Number(r.round.slice(4, 6))}월 {Number(r.round.slice(6))}일 회차
                  </strong>
                  {r.test && <span className={ui.hint}> 시험</span>}
                </p>
                <p className={ui.hint}>
                  {KST.format(r.drawnAt)} 추첨, {fmt(r.tickets)}장, 상금 {fmt(r.pool)}P, 다음 회차로 {fmt(r.carryOut)}P
                </p>
                {r.winners.length === 0 ? (
                  <p className={ui.hint}>산 사람이 없었어요.</p>
                ) : (
                  <ul>
                    {r.winners.map((w) => (
                      <li key={w.rank}>
                        {w.rank}등 {w.name} ({w.accountId}) {fmt(w.points)}P
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
