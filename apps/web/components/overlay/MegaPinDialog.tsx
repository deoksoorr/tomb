"use client";

import { useState, type FormEvent } from "react";
import { MEGA_PIN_MAX, type MegaPin } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { megaphoneStore } from "@/lib/hooks/useMegaphone";
import { showToast } from "@/lib/hooks/useToasts";
import { socialApi } from "@/lib/socialApi";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./MegaphoneDialog.module.css";

type Scope = MegaPin["scope"];

/**
 * 11/17 운영자 고정 공지 쓰기 (확성기 창 [공지 쓰기]). 대상은 지금 채널만 또는 모든 채널.
 * 같은 대상에 이미 공지가 있으면 그 글을 채워 두고, 올리면 새 글로 바뀐다
 */
export function MegaPinDialog({ channel, pins, onClose }: { channel: number; pins: MegaPin[]; onClose: () => void }) {
  const current = (s: Scope) => pins.find((p) => p.scope === s)?.text ?? "";
  const [scope, setScope] = useState<Scope>("channel");
  const [text, setText] = useState(() => current("channel"));
  // 손대지 않았으면 대상을 바꿀 때 그 대상의 지금 공지로 채운다
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const length = [...text.trim()].length;

  const pick = (s: Scope) => {
    setScope(s);
    if (!touched) setText(current(s));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!length || length > MEGA_PIN_MAX) return;
    setPending(true);
    setError(null);
    try {
      const res = await socialApi.pin(text, scope, channel);
      megaphoneStore.setPins(res.pins, channel);
      showToast(scope === "all" ? "모든 채널에 공지를 올렸어요." : `${channel}채널에 공지를 올렸어요.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog title="공지 쓰기" onClose={onClose} closable={!pending} fitHeight>
      <form className={styles.form} onSubmit={(e) => void submit(e)}>
        <p className={ui.hint}>마을 소식 맨 위에 계속 떠 있어요. 지울 때까지 남아요.</p>
        <fieldset className={styles.kinds}>
          <legend className={ui.label}>어디에 올릴까요?</legend>
          {(["channel", "all"] as const).map((s) => (
            <label key={s} className={cx(styles.kind, scope === s && styles.picked)}>
              <input type="radio" name="megaPinScope" value={s} checked={scope === s} onChange={() => pick(s)} />
              <span className={styles.kindText}>
                <b>{s === "channel" ? "이 채널만" : "모든 채널"}</b>
                <span className={styles.meta}>
                  {s === "channel" ? `${channel}채널에만 보여요.` : "모든 채널에 보여요."}
                  {current(s) ? " 올리면 있던 공지는 바뀌어요." : ""}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className={ui.field}>
          <span className={ui.label}>
            공지 글{" "}
            <span className={ui.counter}>
              {length}/{MEGA_PIN_MAX}
            </span>
          </span>
          <textarea
            className={ui.input}
            value={text}
            rows={3}
            maxLength={MEGA_PIN_MAX + 40}
            onChange={(e) => {
              setTouched(true);
              setText(e.target.value);
            }}
            placeholder="예: 오늘 밤 11시에 잠깐 점검해요."
            aria-invalid={length > MEGA_PIN_MAX}
            autoFocus
          />
        </label>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || !length || length > MEGA_PIN_MAX}>
            {pending ? "올리는 중…" : "올리기"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** 11/17 고정 공지 지우기 확인 (운영자) */
export function MegaPinRemove({ channel, pin, onClose }: { channel: number; pin: MegaPin; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      const res = await socialApi.unpin(pin.scope, channel);
      megaphoneStore.setPins(res.pins, channel);
      showToast("공지를 지웠어요.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog title="공지 지우기" kind="confirm" onClose={onClose} closable={!pending}>
      <div className={styles.form}>
        <p>{pin.scope === "all" ? "모든 채널 공지를 지울까요?" : `${channel}채널 공지를 지울까요?`}</p>
        <p className={styles.recentText}>{pin.text}</p>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={ui.button} onClick={onClose} disabled={pending}>
            그만두기
          </button>
          <button type="button" className={cx(ui.button, ui.danger)} onClick={() => void remove()} disabled={pending}>
            {pending ? "지우는 중…" : "지우기"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
