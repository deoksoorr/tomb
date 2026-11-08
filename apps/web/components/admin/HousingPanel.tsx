"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { tierById } from "@/lib/housing/catalog";
import type { AdminHouse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { adminApi, type ModAction } from "./adminApi";
import styles from "./Admin.module.css";

type Props = { toast: (message: string) => void; onAuthLost: () => void };
type Filter = "all" | "reported" | "hidden";
type Confirm = { label: string; run: () => Promise<unknown> } | null;

const pad = (n: number) => String(n).padStart(2, "0");
function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const DONE: Record<ModAction, string> = { hide: "숨겼어요.", unhide: "다시 보이게 했어요.", delete: "삭제했어요." };

/** 하우징 탭: 집 목록(점수·좋아요·숨김)과 신고된 방명록 글 (숨김·해제·삭제) */
export default function HousingPanel({ toast, onAuthLost }: Props) {
  const [houses, setHouses] = useState<AdminHouse[] | null>(null);
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  useEffect(() => {
    let alive = true;
    adminApi.houses().then(
      ({ houses }) => alive && setHouses(houses),
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

  const act = async (run: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await run();
      toast(done);
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
      .filter((h) => filter === "all" || (filter === "hidden" ? h.hidden : h.reportedEntries.length > 0))
      .filter((h) => !q || h.name.toLowerCase().includes(q) || h.ownerName.toLowerCase().includes(q));
  }, [houses, filter, query]);

  const reported = (houses ?? []).filter((h) => h.reportedEntries.length > 0).length;

  return (
    <section className={styles.notices} aria-label="하우징">
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label="보기">
          {(
            [
              ["all", `전체 ${houses?.length ?? ""}`],
              ["reported", `신고 글 ${reported}`],
              ["hidden", "숨김"],
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
      </div>

      {houses === null && <p className={styles.empty}>불러오는 중…</p>}
      {houses && !visible.length && <p className={styles.empty}>조건에 맞는 집이 없어요.</p>}

      <ul className={styles.list}>
        {visible.map((h) => (
          <li key={h.id} className={cx(styles.notice, h.hidden && styles.rowHidden)}>
            <div className={styles.noticeTitle}>
              <span className={cx(styles.badge, h.hidden ? styles.badgeHidden : styles.badgeOpen)}>{h.hidden ? "숨김" : "공개"}</span>
              <strong>{h.name}</strong>
              <span className={styles.meta}>
                {h.ownerName} ({h.ownerTail}…) · {tierById(h.tier)?.name ?? h.tier} · {formatDate(h.createdAt)}
              </span>
            </div>
            <span className={styles.meta}>
              점수 {h.score} · 좋아요 {h.likes} · 물건 {h.items}개
            </span>
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
        <Dialog title="삭제 확인" size="sm" onClose={() => setConfirm(null)} closable={!busy}>
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
