"use client";

import { useMemo, useState } from "react";
import { DEFAULT_MAX_CHANNELS } from "@tomb/protocol";
import type { AdminGrave } from "@/lib/admin";
import type { AdminAction } from "@/lib/validate";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import AdminRow, { isReported } from "./AdminRow";
import { adminApi } from "./adminApi";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import { Empty } from "./PanelState";

type Filter = "all" | "reported" | "hidden";
type Sort = "reports" | "recent" | "flowers";

type Props = {
  graves: AdminGrave[];
  toast: (message: string) => void;
  /** API 실패 (401이면 로그인으로) */
  onError: (e: unknown) => void;
  /** 처리 뒤 목록을 다시 받는다 */
  onChanged: () => void;
};

const FILTERS: [Filter, string][] = [
  ["all", "전체"],
  ["reported", "신고됨"],
  ["hidden", "숨김"],
];
const SORTS: [Sort, string][] = [
  ["reports", "신고 많은 순"],
  ["recent", "최신 등록 순"],
  ["flowers", "헌화 많은 순"],
];
const SORTERS: Record<Sort, (a: AdminGrave, b: AdminGrave) => number> = {
  reports: (a, b) => b.reports - a.reports || b.reportLog.length - a.reportLog.length || b.createdAt - a.createdAt,
  recent: (a, b) => b.createdAt - a.createdAt,
  flowers: (a, b) => b.flowers - a.flowers || b.createdAt - a.createdAt,
};
const DONE: Record<AdminAction, string> = {
  hide: "숨겼어요",
  unhide: "다시 공개했어요",
  resetReports: "신고를 초기화했어요",
  delete: "삭제했어요",
};

const toggle = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
};

/** 묘역 묘비: 보기(전체·신고됨·숨김)·채널·정렬·검색, 여러 개 골라 일괄 처리. 삭제만 확인 창을 거친다 */
export default function GravesPanel({ graves, toast, onError, onChanged }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  /** 0 = 모든 채널 */
  const [channel, setChannel] = useState(0);
  const [sort, setSort] = useState<Sort>("reports");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);

  // 목록이 새로 오면 사라진 묘비는 선택에서 뺀다
  const selected = useMemo(() => new Set([...picked].filter((id) => graves.some((g) => g.id === id))), [picked, graves]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return graves
      .filter((g) => filter === "all" || (filter === "hidden" ? g.hidden : isReported(g)))
      .filter((g) => !channel || g.channel === channel)
      .filter((g) => !q || g.name.toLowerCase().includes(q) || g.mourner.toLowerCase().includes(q))
      .sort(SORTERS[sort]);
  }, [graves, filter, channel, sort, query]);

  const run = async (ids: string[], action: AdminAction) => {
    setBusy(true);
    try {
      const { done, notFound } = await adminApi.apply(ids, action);
      const what = done.length === 1 && ids.length === 1 ? "" : `${done.length}개를 `;
      toast(`${what}${DONE[action]}.${notFound.length ? ` (이미 없는 묘비 ${notFound.length}개)` : ""}`);
      onChanged();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  /** 삭제만 확인 대화상자를 거친다 */
  const act = (ids: string[], action: AdminAction) => {
    if (action === "delete") setConfirmDelete(ids);
    else void run(ids, action);
  };

  const allVisibleSelected = visible.length > 0 && visible.every((g) => selected.has(g.id));
  const deleteNames = confirmDelete?.map((id) => graves.find((g) => g.id === id)?.name ?? id) ?? [];
  const reported = graves.filter(isReported).length;
  const hidden = graves.filter((g) => g.hidden).length;
  const counts: Record<Filter, number> = { all: graves.length, reported, hidden };

  return (
    <section className={styles.notices} aria-label="묘역 묘비">
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label="보기">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" className={ui.button} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label} {counts[value]}
            </button>
          ))}
        </div>
        <select className={cx(ui.input, styles.select)} value={channel} onChange={(e) => setChannel(Number(e.target.value))} aria-label="채널">
          <option value={0}>모든 채널</option>
          {Array.from({ length: DEFAULT_MAX_CHANNELS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}채널 ({graves.filter((g) => g.channel === n).length})
            </option>
          ))}
        </select>
        <select className={cx(ui.input, styles.select)} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
          {SORTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="search"
          className={cx(ui.input, styles.search)}
          placeholder="이름·상주 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="이름·상주 검색"
        />
      </div>

      {selected.size > 0 && (
        <div className={styles.bulkBar} role="group" aria-label="선택한 묘비 일괄 처리">
          <span className={styles.bulkCount}>{selected.size}개 선택</span>
          <button type="button" className={ui.button} disabled={busy} onClick={() => act([...selected], "hide")}>
            숨기기
          </button>
          <button type="button" className={ui.button} disabled={busy} onClick={() => act([...selected], "unhide")}>
            다시 공개
          </button>
          <button type="button" className={ui.button} disabled={busy} onClick={() => act([...selected], "resetReports")}>
            신고 초기화
          </button>
          <button type="button" className={cx(ui.button, ui.danger)} disabled={busy} onClick={() => act([...selected], "delete")}>
            삭제
          </button>
          <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setPicked(new Set())}>
            선택 해제
          </button>
        </div>
      )}

      <div className={styles.listHead}>
        <label className={styles.selectAll}>
          <input
            type="checkbox"
            className={styles.check}
            checked={allVisibleSelected}
            disabled={!visible.length}
            onChange={() =>
              setPicked(() => {
                const next = new Set(selected);
                for (const g of visible) {
                  if (allVisibleSelected) next.delete(g.id);
                  else next.add(g.id);
                }
                return next;
              })
            }
          />
          보이는 {visible.length}개 모두 선택
        </label>
      </div>

      {visible.length ? (
        <ul className={styles.list}>
          {visible.map((g) => (
            <AdminRow
              key={g.id}
              grave={g}
              expanded={expanded.has(g.id)}
              selected={selected.has(g.id)}
              busy={busy}
              onToggleExpand={() => setExpanded((prev) => toggle(prev, g.id))}
              onToggleSelect={() => setPicked(() => toggle(selected, g.id))}
              onAction={(action) => act([g.id], action)}
            />
          ))}
        </ul>
      ) : (
        <Empty>{graves.length ? "조건에 맞는 묘비가 없어요." : "묘역에 묘비가 없어요."}</Empty>
      )}

      {confirmDelete && (
        <Dialog kind="confirm" title="묘비 삭제" onClose={() => setConfirmDelete(null)} closable={!busy}>
          <div className={styles.confirm}>
            <p>
              {deleteNames.length === 1 ? `「${deleteNames[0]}」` : `묘비 ${deleteNames.length}개`}를 삭제할까요? 사진도 함께 지워지고 되돌릴 수
              없어요.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={cx(ui.button, ui.danger)}
                autoFocus
                onClick={() => {
                  const ids = confirmDelete;
                  setConfirmDelete(null);
                  setPicked(new Set([...selected].filter((id) => !ids.includes(id))));
                  void run(ids, "delete");
                }}
              >
                삭제하기
              </button>
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirmDelete(null)}>
                그만두기
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
