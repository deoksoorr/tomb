"use client";

import { useEffect, useState } from "react";
import type { AdminDevNotesResponse } from "@/lib/devNotes/admin";
import { ApiRequestError, errorMessage } from "@/lib/api";
import type { Notice, NoticeDoc } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "./AdminUi.module.css";
import adminStyles from "./Admin.module.css";
import styles from "./DevNotes.module.css";
import DevNoteEditor, { blockKey, EMPTY_DRAFT, readDraft, type Draft } from "./DevNoteEditor";
import { devNoteApi } from "./devNoteAdminApi";
import { Empty, Loading } from "./PanelState";

/** version: 위 「새로고침」이 올리면 목록만 다시 받는다 (쓰던 글은 그대로) */
type Props = { toast: (message: string) => void; onAuthLost: () => void; version: number };

const pad = (n: number) => String(n).padStart(2, "0");
function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 저장소 글 → 편집기 모양. 예전 공지(글만)는 첫 문단을 머리글로, 나머지를 글 블록 하나로 (사이트에 보이던 모양 그대로) */
function toDraft(n: Notice, doc: NoticeDoc | null): Draft {
  if (n.rich || n.summary || n.hero)
    return {
      title: n.title,
      summary: n.summary ?? "",
      hero: n.hero ?? null,
      intro: n.body,
      callout: doc?.callout ?? "",
      blocks: (doc?.blocks ?? []).map((b) => ({ ...b, key: blockKey() })),
      outro: doc?.outro ?? "",
      pinned: n.pinned,
    };
  const [intro = "", ...rest] = n.body.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  const text = rest.join("\n\n").trim();
  return { ...EMPTY_DRAFT, title: n.title, intro: intro.trim(), blocks: text ? [{ key: blockKey(), t: "p", text }] : [], pinned: n.pinned };
}

type Editing = {
  id: string | null;
  kind: "static" | "edited" | "note" | null;
  createdAt: number | null;
  base: Draft;
  initial: Draft;
  restoredAt: number | null;
};
/**
 * 목록 한 줄. static = 정적 글(posts.ts, edited면 관리자가 고친 내용이 사이트에 보인다), note = 편집기로 쓴 글, plain = 글만 있는 예전 공지.
 * 정적 글과 같은 id의 예전 공지(글만)는 정적 글 줄에 묶는다 (사이트에는 정적 글이 보인다)
 */
type Row = { id: string; title: string; createdAt: number; pinned: boolean; updatedAt?: number } & (
  | { kind: "static"; edited: boolean; notice: Notice | null }
  | { kind: "note" | "plain"; notice: Notice }
);

function toRows(data: AdminDevNotesResponse): Row[] {
  const byId = new Map(data.notices.map((n) => [n.id, n]));
  const statics: Row[] = data.statics.map((s) => {
    const n = byId.get(s.id) ?? null;
    return n?.rich
      ? { kind: "static", edited: true, notice: n, id: s.id, title: n.title, createdAt: n.createdAt, pinned: n.pinned, updatedAt: n.updatedAt }
      : { kind: "static", edited: false, notice: n, id: s.id, title: s.title, createdAt: s.createdAt, pinned: s.pinned };
  });
  const staticIds = new Set(data.statics.map((s) => s.id));
  const others: Row[] = data.notices
    .filter((n) => !staticIds.has(n.id))
    .map((n) => ({ kind: n.rich || n.hero || n.summary ? "note" : "plain", notice: n, id: n.id, title: n.title, createdAt: n.createdAt, pinned: n.pinned, updatedAt: n.updatedAt }));
  return [...statics, ...others].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
}

/** 「개발자 노트」 메뉴: 목록(정적 글·저장소 글 모두 고치기) ↔ 쓰기 화면 */
export default function DevNotesPanel({ toast, onAuthLost, version: outer }: Props) {
  const [data, setData] = useState<AdminDevNotesResponse | null>(null);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<Notice | null>(null);
  const [reverting, setReverting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = () => setVersion((v) => v + 1);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  useEffect(() => {
    let alive = true;
    devNoteApi.list().then(
      (r) => alive && setData(r),
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
        else toast(errorMessage(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [version, outer, toast, onAuthLost]);

  const openNew = () => {
    const saved = readDraft(null);
    setEditing({ id: null, kind: null, createdAt: null, base: EMPTY_DRAFT, initial: saved?.draft ?? EMPTY_DRAFT, restoredAt: saved?.at ?? null });
  };
  const openEdit = async (id: string) => {
    setBusy(true);
    try {
      const { notice, doc, kind } = await devNoteApi.get(id);
      const base = toDraft(notice, doc);
      const saved = readDraft(notice.id);
      setEditing({ id: notice.id, kind, createdAt: notice.createdAt, base, initial: saved?.draft ?? base, restoredAt: saved?.at ?? null });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast(done);
      reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  if (editing)
    return (
      <DevNoteEditor
        key={editing.id ?? "new"}
        {...editing}
        toast={toast}
        onAuthLost={onAuthLost}
        onClose={(saved) => {
          setEditing(null);
          if (saved) reload();
        }}
      />
    );

  // 쓰다 만 새 글이 있으면 「이어 쓰기」로 (이 화면은 로그인 뒤 브라우저에서만 그려진다)
  const newDraftAt = readDraft(null)?.at ?? null;
  const rows = data ? toRows(data) : [];

  return (
    <section className={styles.panel} aria-label="개발자 노트">
      <div className={adminStyles.noticesHead}>
        <span className={adminStyles.statLabel}>
          모든 글을 고칠 수 있어요. 정적 글(지난 공지를 다시 쓴 글)은 고치면 사이트에 고친 내용이 보이고, 원본은 코드에 남아 언제든 되돌릴 수 있어요.
        </span>
        <button type="button" className={cx(ui.button, ui.primary)} onClick={openNew} disabled={busy}>
          {newDraftAt ? "쓰던 글 이어 쓰기" : "새로 쓰기"}
        </button>
      </div>

      {data === null && <Loading />}
      {data && rows.length === 0 && <Empty>글이 없어요.</Empty>}
      <ul className={styles.rows}>
        {rows.map((r) => {
          const n = r.kind === "static" ? (r.edited ? r.notice : null) : r.notice;
          return (
            <li key={r.id} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTags}>
                  {r.pinned && <span className={cx(adminStyles.badge, adminStyles.badgeOpen)}>고정</span>}
                  {r.kind === "static" && <span className={cx(styles.tag, r.edited && styles.tagRich)}>{r.edited ? "정적 글 · 고침" : "정적 글"}</span>}
                  {r.kind === "note" && <span className={cx(styles.tag, styles.tagRich)}>개발자 노트</span>}
                  {r.kind === "plain" && <span className={styles.tag}>글만 있는 공지</span>}
                </div>
                <strong className={styles.rowTitle}>{r.title}</strong>
                <span className={styles.muted}>
                  {formatDateTime(r.createdAt)}
                  {r.updatedAt ? ` · 고침 ${formatDateTime(r.updatedAt)}` : ""}
                </span>
              </div>
              <div className={styles.rowActions}>
                <a className={cx(ui.button, ui.small, ui.quiet)} href={`/news/${encodeURIComponent(r.id)}`} target="_blank" rel="noopener noreferrer">
                  보기
                </a>
                <button type="button" className={cx(ui.button, ui.small)} disabled={busy} onClick={() => void openEdit(r.id)}>
                  고치기
                </button>
                {n && (
                  <button
                    type="button"
                    className={cx(ui.button, ui.small)}
                    disabled={busy}
                    onClick={() => void act(() => devNoteApi.setPinned(n.id, !n.pinned), n.pinned ? "고정을 풀었어요." : "맨 위에 고정했어요.")}
                  >
                    {n.pinned ? "고정 해제" : "고정"}
                  </button>
                )}
                {r.kind === "static" && r.edited && (
                  <button type="button" className={cx(ui.button, ui.small, ui.danger)} disabled={busy} onClick={() => setReverting(r)}>
                    원본으로 되돌리기
                  </button>
                )}
                {r.kind !== "static" && (
                  <button type="button" className={cx(ui.button, ui.small, ui.danger)} disabled={busy} onClick={() => setRemoving(r.notice)}>
                    지우기
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {reverting && (
        <Dialog kind="confirm" title="원본으로 되돌리기" onClose={() => setReverting(null)} closable={!busy}>
          <div className={adminStyles.confirm}>
            <p>
              「{reverting.title}」 글의 고친 내용을 버리고 정적 글 원본으로 되돌릴까요? 고칠 때 올린 이미지도 지워져요. 같은 글의 예전 게임 공지가
              있었다면 그 원문도 그대로 되살아나요.
            </p>
            <div className={adminStyles.actions}>
              <button
                type="button"
                className={cx(ui.button, ui.danger)}
                autoFocus
                onClick={() => {
                  const id = reverting.id;
                  setReverting(null);
                  void act(() => devNoteApi.revert(id), "원본으로 되돌렸어요.");
                }}
              >
                되돌리기
              </button>
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setReverting(null)}>
                그만두기
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {removing && (
        <Dialog kind="confirm" title="글 지우기" onClose={() => setRemoving(null)} closable={!busy}>
          <div className={adminStyles.confirm}>
            <p>「{removing.title}」 글을 지울까요? 사이트와 게임 공지에서 사라지고, 올린 이미지도 같이 지워져요.</p>
            <div className={adminStyles.actions}>
              <button
                type="button"
                className={cx(ui.button, ui.danger)}
                autoFocus
                onClick={() => {
                  const id = removing.id;
                  setRemoving(null);
                  void act(() => devNoteApi.remove(id), "글을 지웠어요.");
                }}
              >
                지우기
              </button>
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setRemoving(null)}>
                그만두기
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
