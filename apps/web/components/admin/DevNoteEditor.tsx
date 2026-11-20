"use client";

import { useDeferredValue, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { todayKst } from "@/lib/epitaph";
import { charCount, DEV_NOTE_LIMITS as L, oneLineText, tidyText } from "@/lib/devNotes/limits";
import { blocksToSections } from "@/lib/devNotes/merge";
import type { DevNote } from "@/lib/devNotes/types";
import type { NoticeBlock } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "./AdminUi.module.css";
import styles from "./DevNotes.module.css";
import adminStyles from "./Admin.module.css";
import DevNotePreview, { type PreviewDevice } from "./DevNotePreview";
import { devNoteApi, firstImageFile, IMAGE_ACCEPT, uploadDevNoteImage, type DevNotePayload } from "./devNoteAdminApi";

// 개발자 노트 쓰기 화면 (블록 방식): 제목·한 줄 요약·대표 이미지·첫 문단 → 「소제목」「글」「이미지」 블록 → 맺음말·고정.
// 오른쪽(폰은 탭)에 실제 사이트와 같은 모양 미리보기. 쓰는 동안 브라우저에 임시 저장해 새로고침해도 남는다.

export type EditorBlock = NoticeBlock & { key: string };
export type Draft = {
  title: string;
  summary: string;
  hero: string | null;
  intro: string;
  /** 「먼저 알려 드릴 것」 상자 (비우면 없음) */
  callout: string;
  blocks: EditorBlock[];
  outro: string;
  pinned: boolean;
};

export const EMPTY_DRAFT: Draft = { title: "", summary: "", hero: null, intro: "", callout: "", blocks: [], outro: "", pinned: false };

let seq = 0;
export const blockKey = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

// ── 임시 저장 (이 브라우저에만. 막혀 있으면 조용히 건너뛴다) ──

const draftKey = (id: string | null) => `admin.devnote.draft.${id ?? "new"}`;
export type SavedDraft = { draft: Draft; at: number };

export function readDraft(id: string | null): SavedDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    const v = raw ? (JSON.parse(raw) as SavedDraft) : null;
    // 예전 모양 임시 저장본도 빈 칸을 채워 연다
    return v && typeof v.at === "number" && v.draft && Array.isArray(v.draft.blocks) ? { ...v, draft: { ...EMPTY_DRAFT, ...v.draft } } : null;
  } catch {
    return null;
  }
}
function writeDraft(id: string | null, draft: Draft): boolean {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ draft, at: Date.now() } satisfies SavedDraft));
    return true;
  } catch {
    return false;
  }
}
export function clearDraft(id: string | null): void {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    // 막혀 있으면 지울 것도 없다
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 올릴 모양: 빈 블록·아직 안 올라간 이미지 칸은 뺀다 */
function toPayload(d: Draft): DevNotePayload {
  const blocks: NoticeBlock[] = [];
  for (const b of d.blocks) {
    if (b.t === "img") {
      if (b.src) blocks.push({ t: "img", src: b.src });
    } else if (b.text.trim()) blocks.push({ t: b.t, text: b.text });
  }
  return {
    title: d.title,
    ...(d.summary.trim() ? { summary: d.summary } : {}),
    hero: d.hero,
    intro: d.intro,
    ...(d.callout.trim() ? { callout: d.callout } : {}),
    blocks,
    outro: d.outro,
    pinned: d.pinned,
  };
}

/** 서버와 같은 기준으로 미리 걸러 보는 문제 목록 */
function problems(d: Draft, busyUploads: number): string[] {
  const out: string[] = [];
  const p = toPayload(d);
  const title = oneLineText(p.title);
  if (!title) out.push("제목을 적어 주세요.");
  else if (charCount(title) > L.title) out.push(`제목은 ${L.title}자까지예요.`);
  if (charCount(oneLineText(p.summary ?? "")) > L.summary) out.push(`한 줄 요약은 ${L.summary}자까지예요.`);
  const intro = tidyText(p.intro);
  if (!intro) out.push("첫 문단을 적어 주세요.");
  else if (charCount(intro) > L.intro) out.push(`첫 문단은 ${L.intro}자까지예요.`);
  if (p.blocks.length > L.blocks) out.push(`블록은 ${L.blocks}개까지예요.`);
  if (p.blocks.filter((b) => b.t === "img").length > L.images) out.push(`이미지는 ${L.images}장까지예요.`);
  if (p.blocks.some((b) => b.t === "h" && charCount(oneLineText(b.text)) > L.heading)) out.push(`소제목은 ${L.heading}자까지예요.`);
  if (p.blocks.some((b) => b.t === "p" && charCount(tidyText(b.text)) > L.text)) out.push(`글 블록 하나는 ${L.text}자까지예요.`);
  if (charCount(tidyText(p.outro)) > L.outro) out.push(`맺음말은 ${L.outro}자까지예요.`);
  if (charCount(tidyText(d.callout)) > L.callout) out.push(`「먼저 알려 드릴 것」은 ${L.callout}자까지예요.`);
  if (totalChars(d) > L.total) out.push(`모두 합쳐 ${L.total}자까지예요.`);
  if (busyUploads) out.push("이미지를 올리는 중이에요.");
  return out;
}

function totalChars(d: Draft): number {
  let n = charCount(d.intro) + charCount(d.callout) + charCount(d.outro);
  for (const b of d.blocks) if (b.t !== "img") n += charCount(b.text);
  return n;
}

type Upload = { preview: string; error?: string };
type Props = {
  /** 고치는 글 id (새 글이면 null) */
  id: string | null;
  /** static: 정적 글을 처음 고친다, edited: 고친 정적 글, note: 저장소 글 */
  kind: "static" | "edited" | "note" | null;
  createdAt: number | null;
  /** 저장소에 있는 모양 (임시 저장본을 버리면 이걸로) */
  base: Draft;
  /** 임시 저장본으로 열었으면 그 시각 */
  restoredAt: number | null;
  initial: Draft;
  toast: (m: string) => void;
  onAuthLost: () => void;
  onClose: (saved: boolean) => void;
};

export default function DevNoteEditor({ id, kind, createdAt, base, restoredAt, initial, toast, onAuthLost, onClose }: Props) {
  const [d, setD] = useState<Draft>(initial);
  const [restored, setRestored] = useState(restoredAt);
  const [savedAt, setSavedAt] = useState<number | null>(restoredAt);
  const [dirty, setDirty] = useState(false);
  const [uploads, setUploads] = useState<Record<string, Upload>>({});
  const [tab, setTab] = useState<"write" | "preview">("write");
  // 좁은 화면(폰·태블릿)에서는 미리보기도 폰 폭으로 시작한다 (이 화면은 브라우저에서만 그려진다)
  const [device, setDevice] = useState<PreviewDevice>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1100px)").matches ? "phone" : "desktop",
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const focused = useRef<string | null>(null);

  const set = (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => {
    setD((cur) => ({ ...cur, ...(typeof patch === "function" ? patch(cur) : patch) }));
    setDirty(true);
  };
  const setBlock = (key: string, patch: Partial<{ text: string; src: string }>) =>
    set((cur) => ({ blocks: cur.blocks.map((b) => (b.key === key ? ({ ...b, ...patch } as EditorBlock) : b)) }));

  // 임시 저장: 고친 뒤 0.6초 쉬면
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      if (writeDraft(id, d)) setSavedAt(Date.now());
    }, 600);
    return () => clearTimeout(t);
  }, [d, dirty, id]);

  // 화면을 떠날 때 미리보기용 임시 주소 정리
  const uploadsRef = useRef(uploads);
  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);
  useEffect(() => () => Object.values(uploadsRef.current).forEach((u) => URL.revokeObjectURL(u.preview)), []);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  /** target: "hero" 또는 이미지 블록 key */
  const upload = async (target: string, file: File) => {
    const preview = URL.createObjectURL(file);
    setUploads((u) => {
      if (u[target]) URL.revokeObjectURL(u[target].preview);
      return { ...u, [target]: { preview } };
    });
    try {
      const url = await uploadDevNoteImage(file);
      if (target === "hero") set({ hero: url });
      else setBlock(target, { src: url });
      setUploads(({ [target]: done, ...rest }) => {
        if (done) URL.revokeObjectURL(done.preview);
        return rest;
      });
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
      const msg = e instanceof Error ? (e instanceof ApiRequestError ? errorMessage(e) : e.message) : "이미지를 올리지 못했어요.";
      setUploads((u) => ({ ...u, [target]: { preview, error: msg } }));
    }
  };

  const addBlock = (t: EditorBlock["t"], after?: number, file?: File) => {
    const key = blockKey();
    const b: EditorBlock = t === "img" ? { key, t, src: "" } : { key, t, text: "" };
    set((cur) => {
      const at = after === undefined ? cur.blocks.length : after + 1;
      return { blocks: [...cur.blocks.slice(0, at), b, ...cur.blocks.slice(at)] };
    });
    if (file) void upload(key, file);
    // 새 칸으로 바로 옮겨 간다
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-block="${key}"] textarea, [data-block="${key}"] input, [data-block="${key}"] [data-drop]`)?.focus());
    return key;
  };
  const move = (i: number, dir: -1 | 1) =>
    set((cur) => {
      const j = i + dir;
      if (j < 0 || j >= cur.blocks.length) return {};
      const blocks = [...cur.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { blocks };
    });
  const removeBlock = (key: string) => {
    set((cur) => ({ blocks: cur.blocks.filter((b) => b.key !== key) }));
    setUploads(({ [key]: gone, ...rest }) => {
      if (gone) URL.revokeObjectURL(gone.preview);
      return rest;
    });
  };

  /** Ctrl+V로 이미지: 이미지 칸(대표·블록)에 있으면 그 칸에, 아니면 지금 칸 아래에 새 이미지 블록 */
  const onPaste = (e: ClipboardEvent) => {
    const file = firstImageFile(e.clipboardData?.files);
    if (!file) return;
    e.preventDefault();
    const drop = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-drop]")?.dataset.drop;
    if (drop) return void upload(drop, file);
    const i = d.blocks.findIndex((b) => b.key === focused.current);
    addBlock("img", i < 0 ? undefined : i, file);
  };

  const busyUploads = Object.values(uploads).filter((u) => !u.error).length;
  const issues = problems(d, busyUploads);
  const total = totalChars(d);

  const save = async () => {
    setBusy(true);
    try {
      const payload = toPayload(d);
      if (id) await devNoteApi.update(id, payload);
      else await devNoteApi.create(payload);
      clearDraft(id);
      toast(id ? "고친 글을 올렸어요. 사이트에는 곧 보여요." : "개발자 노트를 올렸어요. 게임 알림에도 떠요.");
      onClose(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  // 미리보기: 올리는 중인 이미지는 고른 파일 그대로 보여 준다
  const view = useDeferredValue(d);
  const viewUploads = useDeferredValue(uploads);
  const previewNote: DevNote = {
    id: id ?? "preview",
    title: oneLineText(view.title) || "제목",
    date: todayKst(createdAt ?? Date.now()),
    createdAt: createdAt ?? Date.now(),
    pinned: view.pinned,
    hero: view.hero ?? viewUploads.hero?.preview ?? null,
    ...(oneLineText(view.summary) ? { summary: oneLineText(view.summary) } : {}),
    intro: tidyText(view.intro),
    ...(tidyText(view.callout) ? { callout: tidyText(view.callout) } : {}),
    sections: blocksToSections(
      view.blocks.flatMap((b): NoticeBlock[] => {
        if (b.t === "img") {
          const src = b.src || viewUploads[b.key]?.preview;
          return src ? [{ t: "img", src }] : [];
        }
        const text = b.t === "h" ? oneLineText(b.text) : tidyText(b.text);
        return text ? [{ t: b.t, text }] : [];
      }),
    ),
    outro: tidyText(view.outro),
  };

  return (
    <div className={styles.editor} onPaste={onPaste}>
      <div className={styles.bar}>
        <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => onClose(false)}>
          ← 목록
        </button>
        <strong className={styles.barTitle}>{!id ? "새 개발자 노트" : kind === "note" ? "글 고치기" : "정적 글 고치기"}</strong>
        <span className={styles.saved} aria-live="polite">
          {savedAt ? `임시 저장 ${hm(savedAt)}` : "쓰는 동안 이 브라우저에 임시 저장돼요"}
        </span>
        <div className={styles.tabs} role="tablist" aria-label="쓰기와 미리보기">
          <button type="button" role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")}>
            쓰기
          </button>
          <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>
            미리보기
          </button>
        </div>
        <button
          type="button"
          className={cx(ui.button, ui.primary, styles.publish)}
          disabled={busy || issues.length > 0}
          title={issues[0]}
          onClick={() => setConfirming(true)}
        >
          {id ? "고친 내용 올리기" : "올리기"}
        </button>
      </div>

      {restored && (
        <div className={styles.banner}>
          <span>{hm(restored)}에 임시 저장한 글을 불러왔어요.</span>
          <button
            type="button"
            className={cx(ui.button, ui.small)}
            onClick={() => {
              clearDraft(id);
              setD(base);
              setRestored(null);
              setSavedAt(null);
              setDirty(false);
            }}
          >
            {id ? "올린 글로 되돌리기" : "임시 저장본 버리기"}
          </button>
        </div>
      )}

      <div className={styles.split} data-tab={tab}>
        <div className={styles.form}>
          <Field label="제목" count={charCount(d.title)} max={L.title}>
            <input className={cx(ui.input, styles.titleInput)} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 11월 21일 업데이트" />
          </Field>
          <Field label="한 줄 요약" count={charCount(d.summary)} max={L.summary} hint="목록·공유 카드에 제목 다음으로 보여요. 비워도 돼요.">
            <input className={ui.input} value={d.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="예: 포인트 한도 폐지와 사냥 개편" />
          </Field>
          <div className={ui.field}>
            <span className={ui.label}>대표 이미지</span>
            <ImageDrop
              target="hero"
              src={d.hero}
              upload={uploads.hero}
              wide
              onFile={(f) => void upload("hero", f)}
              onClear={() => set({ hero: null })}
              empty="대표 이미지를 고르거나 끌어다 놓거나 붙여 넣어요 (21:9로 잘려 보여요)"
            />
          </div>
          <Field label="첫 문단" count={charCount(d.intro)} max={L.intro} hint="글 맨 위와 목록 소개, 게임 공지 본문에 쓰여요.">
            <textarea className={cx(ui.input, styles.area)} rows={4} value={d.intro} onChange={(e) => set({ intro: e.target.value })} />
          </Field>
          <Field label="먼저 알려 드릴 것" count={charCount(d.callout)} max={L.callout} hint="첫 문단 아래 노란 줄 상자예요. 꼭 알아야 할 것만, 비워도 돼요.">
            <textarea className={cx(ui.input, styles.area)} rows={2} value={d.callout} onChange={(e) => set({ callout: e.target.value })} />
          </Field>

          <div className={styles.blocksHead}>
            <span className={ui.label}>본문 블록</span>
            <span className={styles.muted}>
              빈 줄로 문단을 나눠요. Ctrl+V로 이미지를 붙여 넣으면 지금 칸 아래에 들어가요.
            </span>
          </div>
          <ol className={styles.blocks}>
            {d.blocks.map((b, i) => (
              <li
                key={b.key}
                className={cx(styles.block, b.t === "h" && styles.blockH)}
                data-block={b.key}
                onFocus={() => (focused.current = b.key)}
              >
                <div className={styles.blockBar}>
                  <span className={styles.blockType}>{b.t === "h" ? "소제목" : b.t === "p" ? "글" : "이미지"}</span>
                  {b.t !== "img" && (
                    <span className={styles.muted}>
                      {charCount(b.text)}/{b.t === "h" ? L.heading : L.text}
                    </span>
                  )}
                  <span className={styles.blockTools}>
                    <button type="button" className={cx(ui.button, ui.small, ui.icon)} aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button type="button" className={cx(ui.button, ui.small, ui.icon)} aria-label="아래로" disabled={i === d.blocks.length - 1} onClick={() => move(i, 1)}>
                      ↓
                    </button>
                    <button type="button" className={cx(ui.button, ui.small, ui.danger)} onClick={() => removeBlock(b.key)}>
                      지우기
                    </button>
                  </span>
                </div>
                {b.t === "h" && (
                  <input
                    className={cx(ui.input, styles.headingInput)}
                    value={b.text}
                    aria-label="소제목"
                    placeholder="소제목 (목차에 번호와 함께 나와요)"
                    onChange={(e) => setBlock(b.key, { text: e.target.value })}
                  />
                )}
                {b.t === "p" && (
                  <textarea
                    className={cx(ui.input, styles.area)}
                    rows={5}
                    value={b.text}
                    aria-label="글"
                    placeholder="글을 적어요. 빈 줄로 문단을 나눠요."
                    onChange={(e) => setBlock(b.key, { text: e.target.value })}
                  />
                )}
                {b.t === "img" && (
                  <ImageDrop
                    target={b.key}
                    src={b.src || null}
                    upload={uploads[b.key]}
                    onFile={(f) => void upload(b.key, f)}
                    onClear={() => setBlock(b.key, { src: "" })}
                    empty="이미지를 고르거나 끌어다 놓거나 붙여 넣어요"
                  />
                )}
              </li>
            ))}
          </ol>
          <div className={styles.addRow}>
            <button type="button" className={ui.button} onClick={() => addBlock("h")} disabled={d.blocks.length >= L.blocks}>
              + 소제목
            </button>
            <button type="button" className={ui.button} onClick={() => addBlock("p")} disabled={d.blocks.length >= L.blocks}>
              + 글
            </button>
            <button type="button" className={ui.button} onClick={() => addBlock("img")} disabled={d.blocks.length >= L.blocks}>
              + 이미지
            </button>
            <span className={styles.muted}>
              블록 {d.blocks.length}/{L.blocks}
            </span>
          </div>

          <Field label="맺음말" count={charCount(d.outro)} max={L.outro} hint="본문 끝에 줄을 긋고 보여요. 비워도 돼요.">
            <textarea className={cx(ui.input, styles.area)} rows={3} value={d.outro} onChange={(e) => set({ outro: e.target.value })} />
          </Field>
          <label className={adminStyles.selectAll}>
            <input type="checkbox" className={adminStyles.check} checked={d.pinned} onChange={(e) => set({ pinned: e.target.checked })} />
            맨 위에 고정 (사이트에서는 편지 모양으로 보여요)
          </label>
          <p className={cx(styles.muted, total > L.total && styles.over)}>
            모두 {total.toLocaleString()} / {L.total.toLocaleString()}자
          </p>
          {issues.length > 0 && (
            <ul className={styles.issues} aria-label="올리기 전에 고칠 것">
              {issues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.previewCol} aria-label="미리보기">
          <div className={styles.previewBar}>
            <span className={ui.label}>미리보기 · 실제 사이트 모양</span>
            <div className={styles.seg} role="group" aria-label="미리보기 폭">
              <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>
                넓은 화면
              </button>
              <button type="button" aria-pressed={device === "phone"} onClick={() => setDevice("phone")}>
                폰
              </button>
            </div>
          </div>
          <DevNotePreview note={previewNote} device={device} />
        </div>
      </div>

      {confirming && (
        <Dialog kind="confirm" title={id ? "고친 내용 올리기" : "개발자 노트 올리기"} onClose={() => setConfirming(false)} closable={!busy}>
          <div className={adminStyles.confirm}>
            <p>
              「{oneLineText(d.title)}」{" "}
              {kind === "static" || kind === "edited"
                ? "정적 글을 고친 내용으로 덮어쓸까요? 사이트에는 바로 반영되고, 쓴 날짜와 게임 새 글 알림은 그대로예요. 원본은 코드에 남아 있어 목록의 「원본으로 되돌리기」로 언제든 돌아갈 수 있어요."
                : id
                ? "고친 내용을 올릴까요? 사이트에는 바로(늦어도 1분 안에) 반영돼요. 쓴 날짜와 게임 새 글 알림은 그대로예요."
                : "글을 올릴까요? 개발자 노트 사이트에 올라가고, 게임 안 「개발자 노트」 단추의 빨간 점과 새 글 알림 카드로도 알려요."}
            </p>
            <div className={adminStyles.actions}>
              <button type="button" className={cx(ui.button, ui.primary)} autoFocus disabled={busy} onClick={() => void save()}>
                {busy ? "올리는 중…" : "올리기"}
              </button>
              <button type="button" className={cx(ui.button, ui.quiet)} disabled={busy} onClick={() => setConfirming(false)}>
                그만두기
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Field({ label, count, max, hint, children }: { label: string; count: number; max: number; hint?: string; children: ReactNode }) {
  return (
    <label className={ui.field}>
      <span className={ui.label}>
        {label}{" "}
        <span className={cx(ui.counter, count > max && styles.over)}>
          {count}/{max}
        </span>
      </span>
      {children}
      {hint && <span className={ui.hint}>{hint}</span>}
    </label>
  );
}

/** 이미지 칸: 눌러서 고르기·끌어다 놓기·(칸에 초점이 있을 때) 붙여넣기. 올리는 중·실패 표시 */
function ImageDrop({
  target,
  src,
  upload,
  wide,
  empty,
  onFile,
  onClear,
}: {
  target: string;
  src: string | null;
  upload?: Upload;
  wide?: boolean;
  empty: string;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  // 올리는 중이면 고른 파일을, 실패했으면 원래 그림(없으면 빈 칸)을 보여 준다
  const busy = !!upload && !upload.error;
  const shown = busy ? upload.preview : src;
  const pick = () => input.current?.click();
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = firstImageFile(e.dataTransfer.files);
    if (f) onFile(f);
  };
  return (
    <div className={styles.dropWrap}>
      <div
        className={cx(styles.drop, wide && styles.dropWide, over && styles.dropOver, upload?.error && styles.dropError)}
        data-drop={target}
        role="button"
        tabIndex={0}
        aria-label={shown ? "이미지 바꾸기" : empty}
        onClick={pick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- 올린 그림 그대로
          <img src={shown} alt="" className={cx(styles.dropImg, busy && styles.dropBusy)} />
        ) : (
          <span className={styles.dropEmpty}>{empty}</span>
        )}
        {busy && <span className={styles.dropState}>올리는 중…</span>}
      </div>
      {upload?.error && (
        <p className={cx(ui.error, styles.dropMsg)} role="alert">
          {upload.error} 다시 고르거나 끌어다 놓아 주세요.
        </p>
      )}
      {(src || upload?.error) && (
        <div className={styles.dropActions}>
          <button type="button" className={cx(ui.button, ui.small)} onClick={pick}>
            바꾸기
          </button>
          {src && (
            <button type="button" className={cx(ui.button, ui.small, ui.quiet)} onClick={onClear}>
              빼기
            </button>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          const f = firstImageFile(e.target.files);
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </div>
  );
}
