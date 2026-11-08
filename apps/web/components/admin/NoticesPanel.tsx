"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import type { Notice } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const pad = (n: number) => String(n).padStart(2, "0");
function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 공지사항 탭: 목록(고정 먼저, 최신 순)·작성·수정·삭제·고정 토글 */
export default function NoticesPanel({ toast, onAuthLost }: Props) {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<Notice | "new" | null>(null);
  const [removing, setRemoving] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = () => setVersion((v) => v + 1);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  useEffect(() => {
    let alive = true;
    adminApi.notices().then(
      ({ notices }) => alive && setNotices(notices),
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

  return (
    <section className={styles.notices} aria-label="공지사항">
      <div className={styles.noticesHead}>
        <span className={styles.statLabel}>공지는 고정 먼저, 최신 순으로 최대 20개가 보여요.</span>
        <button type="button" className={cx(ui.button, ui.primary)} onClick={() => setEditing("new")} disabled={!!editing}>
          새 공지
        </button>
      </div>

      {editing && (
        <NoticeEditor
          notice={editing === "new" ? null : editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(input) =>
            void act(async () => {
              if (editing === "new") await adminApi.createNotice(input);
              else await adminApi.updateNotice(editing.id, input);
              setEditing(null);
            }, editing === "new" ? "공지를 올렸어요." : "공지를 고쳤어요.")
          }
        />
      )}

      {notices === null && <p className={styles.empty}>불러오는 중…</p>}
      {notices?.length === 0 && <p className={styles.empty}>공지가 없어요.</p>}
      <ul className={styles.list}>
        {notices?.map((n) => (
          <li key={n.id} className={styles.notice}>
            <div className={styles.noticeTitle}>
              {n.pinned && <span className={cx(styles.badge, styles.badgeOpen)}>고정</span>}
              <strong>{n.title}</strong>
              <time className={styles.meta} dateTime={new Date(n.createdAt).toISOString()}>
                {formatDateTime(n.createdAt)}
              </time>
            </div>
            <p className={styles.noticeBody}>{n.body}</p>
            <div className={styles.actions}>
              <button type="button" className={ui.button} disabled={busy || !!editing} onClick={() => setEditing(n)}>
                수정
              </button>
              <button
                type="button"
                className={ui.button}
                disabled={busy}
                onClick={() =>
                  void act(() => adminApi.updateNotice(n.id, { pinned: !n.pinned }), n.pinned ? "고정을 풀었어요." : "맨 위에 고정했어요.")
                }
              >
                {n.pinned ? "고정 해제" : "고정"}
              </button>
              <button type="button" className={cx(ui.button, ui.danger)} disabled={busy} onClick={() => setRemoving(n)}>
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>

      {removing && (
        <Dialog title="공지 삭제" size="sm" onClose={() => setRemoving(null)} closable={!busy}>
          <div className={styles.confirm}>
            <p>「{removing.title}」 공지를 삭제할까요?</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={cx(ui.button, ui.danger)}
                autoFocus
                onClick={() => {
                  const id = removing.id;
                  setRemoving(null);
                  void act(() => adminApi.deleteNotice(id), "공지를 삭제했어요.");
                }}
              >
                삭제하기
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

function NoticeEditor({
  notice,
  busy,
  onSave,
  onCancel,
}: {
  notice: Notice | null;
  busy: boolean;
  onSave: (input: { title: string; body: string; pinned: boolean }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [pinned, setPinned] = useState(notice?.pinned ?? false);
  const valid = title.trim().length > 0 && [...title.trim()].length <= 60 && body.trim().length > 0 && [...body].length <= 2000;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onSave({ title, body, pinned });
  };

  return (
    <form className={cx(ui.panel, styles.noticeEditor)} onSubmit={submit}>
      <label className={ui.field}>
        <span className={ui.label}>
          제목 <span className={ui.counter}>{[...title].length}/60</span>
        </span>
        <input className={ui.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus />
      </label>
      <label className={ui.field}>
        <span className={ui.label}>
          본문 <span className={ui.counter}>{[...body].length}/2000</span>
        </span>
        <textarea className={ui.input} value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
      </label>
      <label className={styles.selectAll}>
        <input type="checkbox" className={styles.check} checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        맨 위에 고정
      </label>
      {(title || body) && (
        <div className={styles.noticePreview} aria-label="미리보기">
          <span className={styles.statLabel}>미리보기</span>
          <strong>{title}</strong>
          <p className={styles.noticeBody}>{body}</p>
        </div>
      )}
      <div className={styles.actions}>
        <button type="submit" className={cx(ui.button, ui.primary)} disabled={busy || !valid}>
          {notice ? "고치기" : "올리기"}
        </button>
        <button type="button" className={cx(ui.button, ui.quiet)} onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  );
}
