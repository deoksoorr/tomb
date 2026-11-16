"use client";

import { useEffect, useState } from "react";
import { errorMessage, request } from "@/lib/api";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { LOTTERY_BASE_PRIZE, LOTTERY_CAP, LOTTERY_DRAW_TEXT, LOTTERY_PRICE, LOTTERY_SALES_PCT, LOTTERY_SPLIT, type LotteryStatus } from "@/lib/lottery";
import type { Me } from "@/lib/types";
import Dialog from "../ui/Dialog";
import { InfoCard, InfoGrid, TipList } from "../ui/InfoBlocks";
import PixelArt, { type PixelRect } from "../ui/PixelArt";
import ui from "../ui/ui.module.css";
import styles from "./LotteryDialog.module.css";

/** 행운권 쪽지 그림 (24×14 격자: 네잎클로버 + 빨간 띠) */
const TICKET: readonly PixelRect[] = [
  [1, 1, 22, 12, "#f4ecd8"],
  [0, 2, 1, 10, "#f4ecd8"],
  [23, 2, 1, 10, "#f4ecd8"],
  [1, 12, 22, 1, "#d8ccb4"],
  [16, 1, 1, 12, "#d8434f"],
  [17, 3, 1, 1, "#d8ccb4"],
  [17, 6, 1, 1, "#d8ccb4"],
  [17, 9, 1, 1, "#d8ccb4"],
  [5, 3, 3, 3, "#4fb04a"],
  [9, 3, 3, 3, "#4fb04a"],
  [5, 7, 3, 3, "#4fb04a"],
  [9, 7, 3, 3, "#4fb04a"],
  [8, 6, 1, 1, "#2f7a34"],
  [9, 10, 1, 2, "#2f7a34"],
  [5, 3, 1, 1, "#8ee07a"],
  [19, 4, 2, 1, "#f2c24a"],
  [19, 7, 2, 1, "#f2c24a"],
];

const fmt = (n: number) => n.toLocaleString("ko-KR");
const RANK_NAME = ["1등", "2등", "3등"] as const;

/** 추첨까지 남은 시간 문구 */
function untilText(ms: number): string {
  if (ms <= 0) return "곧 추첨해요";
  const m = Math.ceil(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `추첨까지 ${d}일 ${h}시간 남았어요`;
  if (h > 0) return `추첨까지 ${h}시간 ${mm}분 남았어요`;
  return `추첨까지 ${mm}분 남았어요`;
}

/**
 * 행운권 판매대 (유령 잡화점 동쪽). 회차마다 한 장(200P)을 사 두면 토요일 저녁 8시에 서버가 1·2·3등을 뽑아 선물함으로 보낸다.
 * 위에 지금 상금과 나눔, 팔린 장수, 추첨까지 남은 시간, 아래에 지난 추첨 결과와 규칙을 보여 준다 (규칙은 lib/lottery)
 */
export default function LotteryDialog({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const [status, setStatus] = useState<LotteryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void meStore.refresh();
    let alive = true;
    const load = () =>
      request<LotteryStatus>("/api/lottery", { cache: "no-store" })
        .then((s) => alive && setStatus(s))
        .catch((e: unknown) => alive && setError(errorMessage(e)));
    void load();
    // 남은 시간은 30초마다, 상금·팔린 장수는 1분마다 다시
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const poll = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, []);

  async function buy() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await request<LotteryStatus & { me: Me }>("/api/lottery", { method: "POST" });
      const { me: next, ...rest } = res;
      meStore.set(next);
      setStatus(rest);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const s = status;
  const points = me?.points ?? 0;
  const pool = s?.pool;

  return (
    <Dialog title="행운권" onClose={onClose}>
      <div className={styles.wrap}>
        <div className={styles.hero}>
          <PixelArt width={24} height={14} rects={TICKET} scale={4} className={styles.art} label="네잎클로버 행운권" />
          <div className={styles.heroText}>
            <p className={styles.lead}>
              한 주에 한 장씩 사 두면 {LOTTERY_DRAW_TEXT}에 1등부터 3등까지 뽑아요. 당첨금은 선물함으로 보내 드려요.
            </p>
            <p className={styles.count}>{s ? untilText(s.drawAt - now) : "불러오는 중이에요"}</p>
          </div>
        </div>

        <div className={styles.pool} aria-live="polite">
          <span className={styles.poolLabel}>이번 주 상금</span>
          <b className={styles.poolValue}>{pool ? `${fmt(pool.total)}P` : "…"}</b>
          {pool && (
            <span className={styles.parts}>
              <span>기본 상금 {fmt(pool.base)}P</span>
              <span>판매 몫 {fmt(pool.salesShare)}P</span>
              {pool.carry > 0 && <span>이월 상금 {fmt(pool.carry)}P</span>}
              {pool.subsidy > 0 && <span>지원금 {fmt(pool.subsidy)}P</span>}
            </span>
          )}
        </div>

        {s && (
          <ul className={styles.prizes}>
            {s.prizes.map((p, i) => (
              <li key={i}>
                <span className={styles.rank}>{RANK_NAME[i]}</span>
                <b>{fmt(p)}P</b>
                <span className={styles.muted}>{LOTTERY_SPLIT[i]}%</span>
              </li>
            ))}
          </ul>
        )}

        <p className={styles.sold}>{s ? `이번 주 ${fmt(s.tickets)}명이 샀어요` : ""}</p>

        {s?.staff ? (
          <p className={styles.note}>운영자 계정은 행운권을 살 수 없어요.</p>
        ) : s?.mine ? (
          <p className={styles.bought} role="status">
            이번 주 행운권을 샀어요. {LOTTERY_DRAW_TEXT}에 추첨해요.
          </p>
        ) : (
          <button type="button" className={`${ui.button} ${ui.primary} ${styles.buy}`} onClick={() => void buy()} disabled={!s || busy || points < LOTTERY_PRICE}>
            {busy ? "사는 중" : `행운권 사기 (${LOTTERY_PRICE}P)`}
          </button>
        )}
        {s && !s.mine && !s.staff && me && points < LOTTERY_PRICE && <p className={styles.note}>포인트가 {fmt(LOTTERY_PRICE - points)}P 모자라요.</p>}
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}

        <InfoGrid>
          <InfoCard title="지난 추첨" icon="trophy">
            {!s?.last ? (
              <p className={styles.muted}>아직 추첨한 적이 없어요.</p>
            ) : (
              <>
                {s.lastRank && <p className={styles.won}>지난 추첨에서 {s.lastRank}등에 당첨됐어요. 선물함을 열어 보세요.</p>}
                {s.last.winners.length === 0 ? (
                  <p className={styles.muted}>산 사람이 없어서 상금이 이번 주로 넘어왔어요.</p>
                ) : (
                  <ul className={styles.winners}>
                    {s.last.winners.map((w) => (
                      <li key={w.rank}>
                        <span className={styles.rank}>{RANK_NAME[w.rank - 1]}</span>
                        <span className={styles.name}>{w.name}님</span>
                        <b>{fmt(w.points)}P</b>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </InfoCard>
          <InfoCard title="알아 두기" icon="info">
            <TipList
              tips={[
                `행운권은 한 주에 한 장, ${LOTTERY_PRICE}P예요. 추첨 시각이 되면 판매가 끝나요.`,
                `판매액의 ${LOTTERY_SALES_PCT}%가 상금이 되고, 매주 기본 상금 ${fmt(LOTTERY_BASE_PRIZE)}P가 더해져요.`,
                `1등은 상금의 ${LOTTERY_SPLIT[0]}%, 2등은 ${LOTTERY_SPLIT[1]}%, 3등은 ${LOTTERY_SPLIT[2]}%를 받아요.`,
                `산 사람이 셋보다 적으면 남은 상금은 다음 주로 넘어가요. 넘어가는 상금과 판매 몫은 합쳐서 ${fmt(LOTTERY_CAP)}P까지예요.`,
                "당첨금은 선물함으로 와요. 하루 포인트 한도나 랭킹에는 들어가지 않아요.",
              ]}
            />
          </InfoCard>
        </InfoGrid>
      </div>
    </Dialog>
  );
}
