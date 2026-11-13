"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import type { AdminReport, ReportAction } from "@/lib/reportsAdmin";
import type { CaseType } from "@/lib/store/reportBox";
import { USER_REPORT_REASON_LABELS } from "@/lib/reports";
import { readItem, writeItem } from "@/lib/storage";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "./AdminUi.module.css";
import type { BanTarget } from "./BanPanel";
import styles from "./Admin.module.css";
import { Empty, Loading } from "./PanelState";
import m from "./Moderation.module.css";
import { expelledText, moderationApi } from "./moderationApi";

// 47번 신고 탭: 묘비·방명록·유저(닉네임)·확성기 신고를 한 목록에서 보고 바로 처리한다.

type Props = {
  toast: (message: string) => void;
  onAuthLost: () => void;
  /** 처리 대기 수가 바뀌면 (탭 배지) */
  onOpenCount: (n: number) => void;
  /** 정지로 이동 → 회원 제재 탭의 정지 창 */
  onBan: (target: BanTarget) => void;
};

const TYPE_LABEL: Record<CaseType, string> = { grave: "묘비", guestbook: "방명록", user: "유저", megaphone: "확성기" };
const ACTION_LABEL: Record<ReportAction, string> = { hide: "숨김", delete: "삭제", kick: "강퇴", dismiss: "기각", resolve: "처리 완료" };
const CONFIRM: Partial<Record<ReportAction, string>> = { delete: "되돌릴 수 없어요. 삭제할까요?" };
const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
/** 신고 탭을 마지막으로 본 시각 (그 뒤에 들어온 신고에 "새" 표시) */
const SEEN_KEY = "tomb.admin.reportsSeen";

export default function ReportsPanel({ toast, onAuthLost, onOpenCount, onBan }: Props) {
  const [status, setStatus] = useState<"open" | "done">("open");
  const [type, setType] = useState<CaseType | "all">("all");
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ r: AdminReport; action: ReportAction } | null>(null);
  const [seenAt] = useState(() => Number(readItem(SEEN_KEY)) || 0);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  useEffect(() => {
    let alive = true;
    moderationApi.reports(status).then(
      (r) => {
        if (!alive) return;
        setReports(r.reports);
        onOpenCount(r.openCount);
        if (status === "open") writeItem(SEEN_KEY, String(Date.now()));
      },
      (e: unknown) => alive && fail(e),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, version]);

  const act = async (r: AdminReport, action: ReportAction) => {
    setConfirm(null);
    setBusy(true);
    try {
      const res = await moderationApi.reportAction(r.key, action);
      toast(`${TYPE_LABEL[r.type]} 신고: ${ACTION_LABEL[action]} 처리했어요.${action === "kick" ? ` ${expelledText(res.expelled)}` : ""}`);
      setVersion((v) => v + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const shown = (reports ?? []).filter((r) => type === "all" || r.type === type);
  const countOf = (t: CaseType) => (reports ?? []).filter((r) => r.type === t).length;

  return (
    <section className={styles.notices} aria-label="신고">
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label="처리 상태">
          <button type="button" className={ui.button} aria-pressed={status === "open"} onClick={() => setStatus("open")}>
            처리 대기
          </button>
          <button type="button" className={ui.button} aria-pressed={status === "done"} onClick={() => setStatus("done")}>
            처리됨
          </button>
        </div>
        <div className={styles.segmented} role="group" aria-label="종류">
          <button type="button" className={ui.button} aria-pressed={type === "all"} onClick={() => setType("all")}>
            전체 {reports?.length ?? 0}
          </button>
          {(Object.keys(TYPE_LABEL) as CaseType[]).map((t) => (
            <button key={t} type="button" className={ui.button} aria-pressed={type === t} onClick={() => setType(t)}>
              {TYPE_LABEL[t]} {countOf(t)}
            </button>
          ))}
        </div>
        <button type="button" className={cx(ui.button, ui.quiet, styles.toolbarEnd)} onClick={() => setVersion((v) => v + 1)} disabled={busy}>
          새로고침
        </button>
      </div>

      {reports === null ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty>{status === "open" ? "처리할 신고가 없어요." : "처리한 신고가 없어요."}</Empty>
      ) : (
        <ul className={styles.list}>
          {shown.map((r) => {
            const fresh = status === "open" && r.lastAt > seenAt;
            return (
              <li key={r.key} className={cx(m.case, fresh && m.caseNew)}>
                <div className={m.caseHead}>
                  <span className={m.type}>{TYPE_LABEL[r.type]}</span>
                  {fresh && <span className={m.newTag}>새 신고</span>}
                  <strong>{r.name}</strong>
                  {r.hidden && <span className={cx(styles.badge, styles.badgeHidden)}>숨김 중</span>}
                  <span className={styles.meta}>
                    신고 {r.count}회 · 신고자 {r.reporters}명 · 마지막 {KST.format(r.lastAt)}
                  </span>
                </div>
                {r.type !== "user" && <p className={m.preview}>{r.preview}</p>}
                {r.type === "user" && r.preview !== r.name && <p className={m.preview}>게임 속 이름: {r.preview}</p>}
                {r.reasonSummary && <p className={styles.meta}>사유: {r.reasonSummary}</p>}
                {r.notes.length > 0 && (
                  <ol className={m.notes} aria-label="신고 메모">
                    {r.notes.slice(0, 5).map((n, i) => (
                      <li key={i}>
                        {KST.format(n.at)} · {USER_REPORT_REASON_LABELS[n.reason] ?? n.reason}
                        {n.memo ? ` — ${n.memo}` : ""}
                        {n.chat ? ` · 말풍선 「${n.chat}」` : ""}
                      </li>
                    ))}
                  </ol>
                )}
                {r.resolution && (
                  <p className={styles.meta}>
                    처리: {r.resolution.action} · {r.resolution.by} · {KST.format(r.resolution.at)}
                    {r.resolution.note ? ` · ${r.resolution.note}` : ""}
                  </p>
                )}
                {status === "open" && (
                  <div className={styles.actions}>
                    {r.actions.map((a) => (
                      <button
                        key={a}
                        type="button"
                        className={cx(ui.button, (a === "delete" || a === "kick") && ui.danger, a === "dismiss" && ui.quiet)}
                        disabled={busy}
                        onClick={() => (CONFIRM[a] ? setConfirm({ r, action: a }) : void act(r, a))}
                      >
                        {ACTION_LABEL[a]}
                      </button>
                    ))}
                    {r.accountId && (
                      <button
                        type="button"
                        className={cx(ui.button, ui.danger)}
                        disabled={busy}
                        onClick={() => onBan({ accountId: r.accountId!, name: r.type === "user" ? r.name : null, reportKey: r.key })}
                      >
                        정지로 이동
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {confirm && (
        <Dialog kind="confirm" title={`${TYPE_LABEL[confirm.r.type]} ${ACTION_LABEL[confirm.action]}`} onClose={() => setConfirm(null)}>
          <div className={styles.confirm}>
            <p>
              「{confirm.r.name}」 {CONFIRM[confirm.action]}
            </p>
            <div className={styles.actions}>
              <button type="button" className={cx(ui.button, ui.danger)} autoFocus onClick={() => void act(confirm.r, confirm.action)}>
                {ACTION_LABEL[confirm.action]}
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
