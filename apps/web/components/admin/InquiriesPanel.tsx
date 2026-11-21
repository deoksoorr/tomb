"use client";

import { useEffect, useId, useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import type { InquiryRow, InquiryStatus } from "@/lib/store/inquiries";
import { INQUIRY_CATEGORIES } from "@/lib/types";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import { inquiryAdminApi } from "./inquiryAdminApi";
import { fullTime } from "./memberFormat";
import m from "./Moderation.module.css";
import { Empty, LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

// 문의 탭: 유저가 [문의하기]로 보낸 문의를 최신 순으로 읽고, 처리 여부와 관리자 메모를 남긴다 (최근 500건 보관)

type Props = {
  toast: (message: string) => void;
  onAuthLost: () => void;
  /** 처리 안 한 문의 수가 바뀌면 (메뉴 배지) */
  onNewCount: (n: number) => void;
  /** 이름을 누르면 회원 목록 탭에서 그 계정을 찾는다 */
  onFindMember: (accountId: string) => void;
};

type Filter = InquiryStatus | "all";
const FILTER_LABEL: Record<Filter, string> = { new: "새 문의", done: "처리함", all: "전체" };
const CATEGORY_LABEL = Object.fromEntries(INQUIRY_CATEGORIES.map((c) => [c.id, c.label])) as Record<string, string>;
const PAGE = 100;
const MAX = 500;

export default function InquiriesPanel({ toast, onAuthLost, onNewCount, onFindMember }: Props) {
  const [filter, setFilter] = useState<Filter>("new");
  const [limit, setLimit] = useState(PAGE);
  const [version, setVersion] = useState(0);
  const load = usePanelLoad(() => inquiryAdminApi.list(filter, limit), [filter, limit, version], toast, onAuthLost);
  /** 처리 여부·메모를 바꾼 줄 (다시 받아도 덮어 보여 준다. 처리해도 목록에서 바로 사라지지 않아 되돌릴 수 있다) */
  const [changed, setChanged] = useState<Record<string, InquiryRow>>({});

  const base = load.data?.inquiries ?? [];
  // 배지 = 받은 숫자 + 받은 뒤 이 화면에서 바꾼 만큼
  const newCount = load.data
    ? load.data.newCount +
      base.reduce((n, r) => {
        const c = changed[r.id];
        return c && c.status !== r.status ? n + (c.status === "new" ? 1 : -1) : n;
      }, 0)
    : null;
  useEffect(() => {
    if (newCount !== null) onNewCount(Math.max(0, newCount));
  }, [newCount, onNewCount]);

  const update = async (row: InquiryRow, patch: { status?: InquiryStatus; memo?: string }) => {
    try {
      const { inquiry } = await inquiryAdminApi.update(row.id, patch);
      setChanged((c) => ({ ...c, [inquiry.id]: inquiry }));
      toast(patch.status ? (patch.status === "done" ? "처리했어요." : "새 문의로 되돌렸어요.") : "메모를 저장했어요.");
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
      else toast(errorMessage(e));
    }
  };

  const choose = (f: Filter) => {
    setFilter(f);
    setLimit(PAGE);
  };

  const rows = base.map((r) => changed[r.id] ?? r);

  return (
    <section className={styles.notices} aria-label="문의">
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label="처리 상태">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
            <button key={f} type="button" className={ui.button} aria-pressed={filter === f} onClick={() => choose(f)}>
              {FILTER_LABEL[f]}
              {f === "new" && newCount !== null ? ` ${Math.max(0, newCount)}` : ""}
            </button>
          ))}
        </div>
        <button type="button" className={cx(ui.button, ui.quiet, styles.toolbarEnd)} onClick={() => setVersion((v) => v + 1)}>
          새로고침
        </button>
      </div>

      <LoadState {...load} />
      {load.data && rows.length === 0 && <Empty>{filter === "new" ? "새 문의가 없어요." : "문의가 없어요."}</Empty>}
      {rows.length > 0 && (
        <ul className={styles.list}>
          {rows.map((r) => (
            <InquiryCard key={r.id} row={r} onUpdate={update} onFindMember={onFindMember} />
          ))}
        </ul>
      )}
      {load.data && load.data.inquiries.length >= limit && limit < MAX && (
        <button type="button" className={ui.button} onClick={() => setLimit((n) => Math.min(MAX, n + PAGE))}>
          더 보기
        </button>
      )}
    </section>
  );
}

function InquiryCard({
  row,
  onUpdate,
  onFindMember,
}: {
  row: InquiryRow;
  onUpdate: (row: InquiryRow, patch: { status?: InquiryStatus; memo?: string }) => Promise<void>;
  onFindMember: (accountId: string) => void;
}) {
  const uid = useId();
  const [memo, setMemo] = useState(row.memo ?? "");
  const [busy, setBusy] = useState(false);
  const done = row.status === "done";
  const memoChanged = memo.trim() !== (row.memo ?? "");

  const run = async (patch: { status?: InquiryStatus; memo?: string }) => {
    setBusy(true);
    await onUpdate(row, patch);
    setBusy(false);
  };

  return (
    <li className={cx(m.case, !done && m.caseNew)}>
      <div className={m.caseHead}>
        <span className={m.type}>{CATEGORY_LABEL[row.category] ?? row.category}</span>
        {/* 11/20 보낸 곳 (예전 문의는 게임) */}
        {row.source === "devnote" ? <span className={m.type}>개발자 노트에서</span> : <span className={styles.meta}>게임에서</span>}
        {!done && <span className={m.newTag}>새 문의</span>}
        {/* 11/20 계정 없이 개발자 노트에서 보낸 손님은 찾을 계정이 없다 */}
        {row.accountId === null ? (
          <span className={m.type}>손님</span>
        ) : (
          <button
            type="button"
            className={cx(ui.button, ui.quiet, ui.small)}
            onClick={() => onFindMember(row.accountId!)}
            title={`회원 목록 탭에서 이 계정을 찾아요 (${row.accountId})`}
          >
            {row.name ?? "이름 없는 계정"}
          </button>
        )}
        <time className={styles.meta} dateTime={new Date(row.at).toISOString()}>
          {fullTime(row.at)}
        </time>
        {row.channel !== undefined && <span className={styles.meta}>{row.channel}채널</span>}
      </div>

      <p className={m.preview}>{row.message}</p>

      <p className={styles.meta}>{row.contact ? `답장 받을 곳 ${row.contact}` : "연락처를 남기지 않았어요."}</p>
      {row.userAgent && (
        <p className={styles.meta} title={row.userAgent}>
          {row.userAgent.length > 120 ? `${row.userAgent.slice(0, 120)}…` : row.userAgent}
        </p>
      )}

      <div className={m.editBox}>
        <label className={m.radio}>
          <input type="checkbox" className={styles.check} checked={done} disabled={busy} onChange={() => void run({ status: done ? "new" : "done" })} />
          처리했어요
          {done && row.doneAt ? <span className={styles.meta}>{fullTime(row.doneAt)}</span> : null}
        </label>
        <label htmlFor={`${uid}-memo`} className={ui.label}>
          관리자 메모
        </label>
        <textarea
          id={`${uid}-memo`}
          className={cx(ui.input, m.memo)}
          rows={2}
          maxLength={500}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="답장했는지, 무엇을 고쳤는지 남겨 두세요."
        />
        <div className={styles.actions}>
          <button type="button" className={cx(ui.button, ui.small)} disabled={busy || !memoChanged} onClick={() => void run({ memo: memo.trim() })}>
            메모 저장
          </button>
        </div>
      </div>
    </li>
  );
}
