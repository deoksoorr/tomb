"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DEFAULT_MAX_CHANNELS, type LobbyInfo } from "@tomb/protocol";
import type { AdminGrave } from "@/lib/admin";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { CODE_RE, normalizeCode } from "@/lib/economy";
import type { AdminAction } from "@/lib/validate";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import AdminRow, { isReported } from "./AdminRow";
import NoticesPanel from "./NoticesPanel";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";

type Filter = "all" | "reported" | "hidden";
type Sort = "reports" | "recent" | "flowers" | "revives";

const FILTERS: [Filter, string][] = [
  ["all", "전체"],
  ["reported", "신고됨"],
  ["hidden", "숨김"],
];
const SORTS: [Sort, string][] = [
  ["reports", "신고 많은 순"],
  ["recent", "최신 등록 순"],
  ["flowers", "헌화 많은 순"],
  ["revives", "살려주세요 많은 순"],
];
const SORTERS: Record<Sort, (a: AdminGrave, b: AdminGrave) => number> = {
  reports: (a, b) => b.reports - a.reports || b.reportLog.length - a.reportLog.length || b.createdAt - a.createdAt,
  recent: (a, b) => b.createdAt - a.createdAt,
  flowers: (a, b) => b.flowers - a.flowers || b.createdAt - a.createdAt,
  revives: (a, b) => b.revives - a.revives || b.createdAt - a.createdAt,
};
const DONE: Record<AdminAction, string> = {
  hide: "숨겼어요",
  unhide: "다시 공개했어요",
  resetReports: "신고를 초기화했어요",
  delete: "삭제했어요",
};

type Toast = { id: number; message: string };

function useToastList(): [Toast[], (message: string) => void] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }].slice(-3));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3_500);
  }, []);
  return [toasts, push];
}

const toggle = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
};

export default function AdminApp() {
  const [phase, setPhase] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [tab, setTab] = useState<"graves" | "notices">("graves");
  const authLost = useCallback(() => setPhase("login"), []);
  const [graves, setGraves] = useState<AdminGrave[]>([]);
  const [lobby, setLobby] = useState<LobbyInfo | "error" | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  /** 0 = 모든 채널 */
  const [channel, setChannel] = useState(0);
  const [sort, setSort] = useState<Sort>("reports");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [toasts, toast] = useToastList();

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiRequestError && e.status === 401) setPhase("login");
      else toast(errorMessage(e));
    },
    [toast],
  );

  // 목록은 version이 바뀔 때마다 다시 받는다 (로그인·작업 뒤·새로고침)
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  useEffect(() => {
    let alive = true;
    adminApi.graves().then(
      ({ graves }) => {
        if (!alive) return;
        setGraves(graves);
        setSelected((prev) => new Set([...prev].filter((id) => graves.some((g) => g.id === id))));
        setPhase("ready");
        adminApi.channels().then(
          (l) => alive && setLobby(l),
          () => alive && setLobby("error"),
        );
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiRequestError && e.status === 401) return setPhase("login");
        toast(errorMessage(e));
        setPhase((p) => (p === "loading" ? "error" : p));
      },
    );
    return () => {
      alive = false;
    };
  }, [version, toast]);

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
      reload();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  /** 삭제만 확인 대화상자를 거친다 */
  const act = (ids: string[], action: AdminAction) => {
    if (action === "delete") setConfirmDelete(ids);
    else void run(ids, action);
  };

  const logout = async () => {
    await adminApi.logout().catch(() => {});
    setGraves([]);
    setPhase("login");
  };

  const allVisibleSelected = visible.length > 0 && visible.every((g) => selected.has(g.id));
  const hiddenCount = graves.filter((g) => g.hidden).length;
  const reportedCount = graves.filter(isReported).length;
  const deleteNames = confirmDelete?.map((id) => graves.find((g) => g.id === id)?.name ?? id) ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>한때는... 관리</h1>
          {phase === "ready" && (
            <div className={styles.headerActions}>
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={reload} disabled={busy}>
                새로고침
              </button>
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => void logout()}>
                로그아웃
              </button>
            </div>
          )}
        </header>

        {phase === "loading" && <p className={styles.empty}>불러오는 중…</p>}
        {phase === "error" && (
          <div className={styles.empty}>
            <p>목록을 불러오지 못했어요.</p>
            <button type="button" className={ui.button} onClick={reload}>
              다시 시도
            </button>
          </div>
        )}
        {phase === "login" && <LoginForm onDone={reload} />}

        {phase === "ready" && (
          <div className={styles.segmented} role="tablist" aria-label="관리 화면">
            {(
              [
                ["graves", "묘비"],
                ["notices", "공지사항"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                className={ui.button}
                aria-selected={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {phase === "ready" && tab === "notices" && <NoticesPanel toast={toast} onAuthLost={authLost} />}

        {phase === "ready" && tab === "graves" && (
          <>
            <section className={styles.summary} aria-label="요약">
              <Stat label="전체 묘비" value={graves.length} />
              <Stat label="숨김" value={hiddenCount} />
              <Stat label="신고된 묘비" value={reportedCount} />
              <Channels lobby={lobby} />
            </section>

            <PointsForm toast={toast} onAuthLost={authLost} />

            <div className={styles.toolbar}>
              <div className={styles.segmented} role="group" aria-label="보기">
                {FILTERS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={ui.button}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                className={cx(ui.input, styles.select)}
                value={channel}
                onChange={(e) => setChannel(Number(e.target.value))}
                aria-label="채널"
              >
                <option value={0}>모든 채널</option>
                {Array.from({ length: DEFAULT_MAX_CHANNELS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}채널 ({graves.filter((g) => g.channel === n).length})
                  </option>
                ))}
              </select>
              <select
                className={cx(ui.input, styles.select)}
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                aria-label="정렬"
              >
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
                <button
                  type="button"
                  className={ui.button}
                  disabled={busy}
                  onClick={() => act([...selected], "resetReports")}
                >
                  신고 초기화
                </button>
                <button
                  type="button"
                  className={cx(ui.button, ui.danger)}
                  disabled={busy}
                  onClick={() => act([...selected], "delete")}
                >
                  삭제
                </button>
                <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setSelected(new Set())}>
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
                    setSelected((prev) => {
                      const next = new Set(prev);
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
                    onToggleSelect={() => setSelected((prev) => toggle(prev, g.id))}
                    onAction={(action) => act([g.id], action)}
                  />
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>조건에 맞는 묘비가 없어요.</p>
            )}
          </>
        )}
      </div>

      {confirmDelete && (
        <Dialog title="묘비 삭제" size="sm" onClose={() => setConfirmDelete(null)} closable={!busy}>
          <div className={styles.confirm}>
            <p>
              {deleteNames.length === 1 ? `「${deleteNames[0]}」` : `묘비 ${deleteNames.length}개`}를 삭제할까요? 사진도
              함께 지워지고 되돌릴 수 없어요.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={cx(ui.button, ui.danger)}
                autoFocus
                onClick={() => {
                  const ids = confirmDelete;
                  setConfirmDelete(null);
                  setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
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

      <div className={styles.toasts} role="status" aria-live="polite">
        {toasts.map((t) => (
          <p key={t.id} className={styles.toast}>
            {t.message}
          </p>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function Channels({ lobby }: { lobby: LobbyInfo | "error" | null }) {
  return (
    <div className={styles.channels}>
      <span className={styles.statLabel}>채널 현황</span>
      {lobby === null && <span className={ui.hint}>불러오는 중…</span>}
      {lobby === "error" && <span className={ui.hint}>실시간 서버 로비에 연결할 수 없어요.</span>}
      {lobby && lobby !== "error" && (
        <>
          <span className={styles.chip}>
            접속 {lobby.total}/{lobby.totalCap}
          </span>
          {lobby.channels
            .filter((c) => c.open || c.count > 0)
            .map((c) => (
              <span key={c.id} className={styles.chip}>
                {c.id}채널 {c.count}/{c.cap}
              </span>
            ))}
        </>
      )}
    </div>
  );
}

/** 포인트 지급·회수: 개인 코드(XXXX-XXXX-XXXX) 또는 계정 id + 증감 */
function PointsForm({ toast, onAuthLost }: { toast: (message: string) => void; onAuthLost: () => void }) {
  const [target, setTarget] = useState("");
  const [delta, setDelta] = useState("");
  const [pending, setPending] = useState(false);
  const amount = Number(delta);
  const valid = target.trim() !== "" && Number.isInteger(amount) && amount !== 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(target);
    setPending(true);
    try {
      const r = await adminApi.points(CODE_RE.test(code) ? { code } : { accountId: target.trim() }, amount);
      toast(`${r.accountId.slice(0, 6)}… 계정 잔액 ${r.points}점`);
      setTarget("");
      setDelta("");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) onAuthLost();
      else toast(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={styles.pointsForm} onSubmit={(e) => void submit(e)} aria-label="포인트 지급">
      <span className={styles.statLabel}>포인트 지급</span>
      <input
        className={cx(ui.input, styles.pointsTarget)}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="개인 코드 또는 계정 id"
        aria-label="개인 코드 또는 계정 id"
        autoComplete="off"
        spellCheck={false}
      />
      <input
        className={cx(ui.input, styles.pointsDelta)}
        type="number"
        inputMode="numeric"
        min={-9999}
        max={9999}
        step={1}
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        placeholder="+100 / -50"
        aria-label="지급량 (빼려면 음수)"
      />
      <button type="submit" className={ui.button} disabled={pending || !valid}>
        지급
      </button>
    </form>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await adminApi.login(key);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={cx(ui.panel, styles.login)} onSubmit={(e) => void submit(e)}>
      <label className={ui.field}>
        <span className={ui.label}>관리자 키</span>
        <input
          className={ui.input}
          type="password"
          autoComplete="current-password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-invalid={!!error}
          autoFocus
          required
        />
      </label>
      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || !key}>
        들어가기
      </button>
      <p className={ui.hint}>이 브라우저에서 12시간 동안 로그인이 유지돼요.</p>
    </form>
  );
}
