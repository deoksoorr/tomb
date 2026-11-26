"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { houseLabel, houseShape, RECLAIM_DAYS, RECLAIM_WARN_DAYS } from "@/lib/housing/catalog";
import type { AdminHouse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "./AdminUi.module.css";
import { adminApi, type ModAction } from "./adminApi";
import styles from "./Admin.module.css";
import { Empty, Loading } from "./PanelState";

type Props = { toast: (message: string) => void; onAuthLost: () => void };
type Filter = "all" | "reported" | "hidden" | "away";
type Confirm = { label: string; run: () => Promise<unknown> } | null;

const pad = (n: number) => String(n).padStart(2, "0");
function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const DONE: Record<ModAction, string> = { hide: "숨겼어요.", unhide: "다시 보이게 했어요.", delete: "삭제했어요." };

const DAY_MS = 86_400_000;
/** 주인이 들어오지 않은 날수 (기록이 없으면 null) */
const awayDays = (h: AdminHouse, now: number): number | null => (h.lastSeenAt > 0 && now > 0 ? Math.floor((now - h.lastSeenAt) / DAY_MS) : null);
/** 정리까지 남은 날 (올림, 0 이하 = 다음 정리 때. 비우지 않는 집은 null). 규칙을 켠 시각 전 접속은 서버가 그 시각으로 센 reclaimAt을 쓴다 */
const daysLeft = (h: AdminHouse, now: number): number | null => (h.reclaimAt > 0 && now > 0 ? Math.ceil((h.reclaimAt - now) / DAY_MS) : null);
/** 오래 비운 집 정리 대상이 가까운 집 (운영자 집은 빼고, 정리 기준으로 RECLAIM_WARN_DAYS일 이상 비움) */
const nearReclaim = (h: AdminHouse, now: number) => {
  const left = daysLeft(h, now);
  return left !== null && left <= RECLAIM_DAYS - RECLAIM_WARN_DAYS;
};

/** 하우징 탭: 집 목록(점수·좋아요·숨김)과 신고된 방명록 글 (숨김·해제·삭제) */
export default function HousingPanel({ toast, onAuthLost }: Props) {
  const [houses, setHouses] = useState<AdminHouse[] | null>(null);
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  /** 목록을 받은 시각 (마지막 접속 날수 계산용) */
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    adminApi.houses().then(
      ({ houses }) => {
        if (!alive) return;
        setHouses(houses);
        setNow(Date.now());
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
        else toast(errorMessage(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [version, toast, onAuthLost]);

  const act = async (run: () => Promise<unknown>, done: string | (() => string)) => {
    setBusy(true);
    try {
      await run();
      toast(typeof done === "string" ? done : done());
      setVersion((v) => v + 1);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
      else toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  /** 삭제만 확인을 거친다 */
  const request = (label: string, action: ModAction, run: () => Promise<unknown>) => {
    if (action === "delete") setConfirm({ label, run });
    else void act(run, DONE[action]);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (houses ?? [])
      .filter(
        (h) =>
          filter === "all" || (filter === "hidden" ? h.hidden : filter === "away" ? nearReclaim(h, now) : h.reportedEntries.length > 0),
      )
      .filter((h) => !q || h.name.toLowerCase().includes(q) || h.ownerName.toLowerCase().includes(q));
  }, [houses, filter, query, now]);

  const reported = (houses ?? []).filter((h) => h.reportedEntries.length > 0).length;
  const away = (houses ?? []).filter((h) => nearReclaim(h, now)).length;

  /** 오래 비운 집 지금 정리하기 */
  const reclaimNow = () => {
    if (!window.confirm(`주인이 ${RECLAIM_DAYS}일 넘게 들어오지 않은 집을 지금 비울까요? 낸 포인트는 주인이 돌아오면 선물함으로 가고 가구는 가방에 남아요.`)) return;
    let msg = "지금 비울 집이 없어요.";
    void act(
      async () => {
        const r = await adminApi.reclaimHouses();
        const sum = r.reclaimed.reduce((n, d) => n + d.points, 0);
        if (r.reclaimed.length) msg = `${r.reclaimed.length}채를 철거했어요. 돌려줄 포인트는 모두 ${sum.toLocaleString("ko-KR")}P예요.`;
      },
      () => msg,
    );
  };

  return (
    <section className={styles.notices} aria-label="하우징">
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label="보기">
          {(
            [
              ["all", `전체 ${houses?.length ?? ""}`],
              ["reported", `신고 글 ${reported}`],
              ["hidden", "숨김"],
              ["away", `곧 철거 ${away}`],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" className={ui.button} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className={cx(ui.input, styles.search)}
          placeholder="집 이름·주인 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="집 이름·주인 검색"
        />
        <button type="button" className={ui.button} disabled={busy} onClick={reclaimNow}>
          지금 정리하기
        </button>
      </div>
      <p className={styles.meta}>
        주인이 {RECLAIM_DAYS}일 넘게 들어오지 않은 집은 몇 시간 안에 저절로 비워져요. 낸 포인트는 주인이 돌아오면 선물함으로 가고 가구는 가방에 남아요. 운영자 집은 비우지 않아요.
      </p>

      {houses === null && <Loading />}
      {houses && !visible.length && <Empty>조건에 맞는 집이 없어요.</Empty>}

      <ul className={styles.list}>
        {visible.map((h) => (
          <li key={h.id} className={cx(styles.notice, h.hidden && styles.rowHidden)}>
            <div className={styles.noticeTitle}>
              <span className={cx(styles.badge, h.hidden ? styles.badgeHidden : styles.badgeOpen)}>{h.hidden ? "숨김" : "공개"}</span>
              <strong>{h.name}</strong>
              <span className={styles.meta}>
                {h.ownerName} ({h.ownerTail}…) · {h.lot ? houseLabel(h) : `${h.ch}채널 집터 대기`} · {houseShape(h).name} · {formatDate(h.createdAt)}
              </span>
            </div>
            <span className={styles.meta}>
              점수 {h.score} · 좋아요 {h.likes} · 물건 {h.items}개
            </span>
            <AwayLine h={h} now={now} />
            <div className={styles.actions}>
              <button
                type="button"
                className={ui.button}
                disabled={busy}
                onClick={() => request(h.name, h.hidden ? "unhide" : "hide", () => adminApi.houseAction(h.id, h.hidden ? "unhide" : "hide"))}
              >
                {h.hidden ? "다시 공개" : "숨기기"}
              </button>
              <button
                type="button"
                className={ui.button}
                disabled={busy}
                onClick={() => {
                  const v = window.prompt(`「${h.name}」을 몇 번지로 옮길까요? 지금은 ${h.ch}채널 ${h.lot}번지예요. 같은 채널의 빈 번지로만 옮길 수 있어요.`, "");
                  const lot = Number(v);
                  if (!v || !Number.isInteger(lot) || lot < 1) return;
                  void act(() => adminApi.moveHouse(h.id, lot), `${lot}번지로 옮겼어요.`);
                }}
              >
                번지 옮기기
              </button>
              <button
                type="button"
                className={cx(ui.button, ui.danger)}
                disabled={busy}
                onClick={() => request(`집 「${h.name}」(배치·가방·방명록 포함, 포인트는 돌려주지 않아요)`, "delete", () => adminApi.houseAction(h.id, "delete"))}
              >
                삭제
              </button>
            </div>

            {h.reportedEntries.length > 0 && (
              <div className={styles.logSection}>
                <h3 className={styles.subTitle}>신고된 방명록 글</h3>
                <ul className={styles.list}>
                  {h.reportedEntries.map((e) => (
                    <li key={e.id} className={cx(styles.noticePreview, e.hidden && styles.rowHidden)}>
                      <span className={styles.meta}>
                        {e.name} · {formatDate(e.at)} · <span className={styles.alert}>신고 {e.reports}</span>
                        {e.hidden && " · 가림"}
                      </span>
                      <p className={styles.noticeBody}>{e.text}</p>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={ui.button}
                          disabled={busy}
                          onClick={() =>
                            request(e.text, e.hidden ? "unhide" : "hide", () => adminApi.guestAction(h.id, e.id, e.hidden ? "unhide" : "hide"))
                          }
                        >
                          {e.hidden ? "다시 보이기 (신고 초기화)" : "가리기"}
                        </button>
                        <button
                          type="button"
                          className={cx(ui.button, ui.danger)}
                          disabled={busy}
                          onClick={() => request(`방명록 글 「${e.text.slice(0, 20)}」`, "delete", () => adminApi.guestAction(h.id, e.id, "delete"))}
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>

      {confirm && (
        <Dialog kind="confirm" title="삭제 확인" onClose={() => setConfirm(null)} closable={!busy}>
          <div className={styles.confirm}>
            <p>{confirm.label}을(를) 삭제할까요? 되돌릴 수 없어요.</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={cx(ui.button, ui.danger)}
                autoFocus
                onClick={() => {
                  const run = confirm.run;
                  setConfirm(null);
                  void act(run, DONE.delete);
                }}
              >
                삭제하기
              </button>
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirm(null)}>
                그만두기
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}

/** 주인의 마지막 접속과 오래 비운 집 정리까지 남은 날 */
function AwayLine({ h, now }: { h: AdminHouse; now: number }) {
  const days = awayDays(h, now);
  const left = daysLeft(h, now);
  const seen = days === null ? "마지막 접속 기록이 없어요." : days === 0 ? "오늘 접속했어요." : `${days}일 전에 접속했어요.`;
  if (h.staff) return <span className={styles.meta}>{seen} 운영자 집이라 철거하지 않아요.</span>;
  const refund = `철거하면 ${h.refund.toLocaleString("ko-KR")}P를 돌려줘요${h.refundEstimated ? ". 낸 포인트 기록이 없어 지금 가격표로 셌어요." : "."}`;
  return (
    <span className={styles.meta}>
      {seen}{" "}
      {left !== null && left <= 0 && <span className={styles.alert}>다음 정리 때 철거돼요. </span>}
      {left !== null && left > 0 && nearReclaim(h, now) && <span className={styles.alert}>{left}일 안에 철거돼요. </span>}
      {refund}
    </span>
  );
}
