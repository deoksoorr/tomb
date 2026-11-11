"use client";

import { useId, useState, type FormEvent } from "react";
import { plotLabel } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { api, errorMessage } from "@/lib/api";
import { useBusy } from "@/lib/busy";
import { suggestEpitaph } from "@/lib/epitaph";
import type { GraveCache } from "@/lib/hooks/useGraves";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { saveOwnerToken } from "@/lib/storage";
import { CAUSE_LABELS, CAUSE_TAGS, LIFESPAN_PRESETS, type CauseTag, type LifespanId, type PublicGrave } from "@/lib/types";
import { pointsText } from "../account/items";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { DEFAULT_STYLE, spendsTicket, styleName } from "./graveStyles";
import StyleArt from "./StyleArt";
import StylePicker from "./StylePicker";
import {
  charCount,
  LIMITS,
  livedDays,
  toEditInput,
  toQuickInput,
  validateQuick,
  valuesOf,
  type QuickValues,
} from "./quickRules";
import styles from "./BuryForm.module.css";

/** ownerToken: 계정 개편 전에 이 브라우저에서 세운 묘비의 관리 토큰 (계정 묘비는 null이어도 고칠 수 있다) */
export type BuryMode = { kind: "create" } | { kind: "edit"; grave: PublicGrave; ownerToken: string | null };

type Props = {
  mode: BuryMode;
  /** 새 묘비의 상주 = 지금 유저이름 (고칠 때는 원래 상주를 그대로 둔다) */
  mourner: string;
  cache: GraveCache;
  /** 지금 채널 (새 묘비는 이 채널 묘지에 묻힌다) */
  channel: number;
  /** 지금 채널 묘비 수 = 새 묘비가 들어갈 자리 번호. 목록을 아직 못 받았으면 null */
  graveCount: number | null;
  onClose: () => void;
};

/** 귀찮지 않게 꼭 필요한 것만: 이름 · 얼마나 살았나 · (사인) · (묘비명) */
export default function BuryForm({ mode, mourner, cache, channel, graveCount, onClose }: Props) {
  // 묘비를 쓰는 동안은 새 버전 자동 새로고침(큰 패치 포함)을 미룬다
  useBusy("bury", true);
  const editing = mode.kind === "edit" ? mode.grave : null;
  const uid = useId();
  const [initial] = useState<QuickValues>(() =>
    editing ? valuesOf(editing) : { name: "", lived: null, cause: null, epitaph: "", style: DEFAULT_STYLE, comment: "" },
  );
  const [name, setName] = useState(initial.name);
  const [lived, setLived] = useState<LifespanId | null>(initial.lived);
  const [cause, setCause] = useState<CauseTag | null>(initial.cause);
  const [epitaph, setEpitaph] = useState(initial.epitaph);
  const [style, setStyle] = useState(initial.style);
  const [comment, setComment] = useState(initial.comment);
  const { me } = useMe();
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const values: QuickValues = { name, lived, cause, epitaph, style, comment };
  const errors = validateQuick(values);
  const errorFor = (field: keyof typeof errors) => (submitted ? errors[field] : undefined);
  const days = lived ? livedDays(lived) : null;
  // 비워 두면 새겨질 문구: 새 묘비는 서버 기본값과 같고, 고칠 때는 실제 향년·마지막 할 일로
  const suggestion = editing
    ? toEditInput(editing, { ...values, epitaph: "" }).epitaph
    : days
      ? suggestEpitaph(days)
      : "향년 N일, 조용히 별세";
  const previewAge = days ?? editing?.ageDays ?? 1;
  const spends = spendsTicket(style, editing?.style);
  const snapshot = JSON.stringify(values);
  const [initialSnapshot] = useState(snapshot);
  const dirty = snapshot !== initialSnapshot;

  function requestClose() {
    if (saving) return;
    if (dirty && !confirmingClose) setConfirmingClose(true);
    else onClose();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSubmitted(true);
    const firstInvalid = (["name", "lived", "epitaph", "comment"] as const).find((f) => errors[f]);
    if (firstInvalid || !lived) {
      document.getElementById(`${uid}-${firstInvalid ?? "lived"}`)?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (mode.kind === "create") {
        const { grave, ownerToken, earned } = await api.createGrave(toQuickInput({ ...values, lived }, mourner, channel));
        saveOwnerToken(grave.id, ownerToken);
        cache.upsert(grave);
        meStore.addGrave(grave.id);
        meStore.addEarned(earned);
        if (spends) void meStore.refresh();
        bridge.emit("grave:buried", { graveId: grave.id });
        const index = cache.getSnapshot().graves.findIndex((g) => g.id === grave.id);
        showToast(index === -1 ? "새 묘비를 세웠어요." : `새 묘비가 ${plotLabel(index)}에 세워졌어요.`, 6_000);
        const points = pointsText(earned);
        if (points) showToast(points);
      } else {
        const { grave } = await api.updateGrave(mode.grave.id, mode.ownerToken, toEditInput(mode.grave, values));
        cache.upsert(grave);
        if (spends) void meStore.refresh();
        bridge.emit("grave:changed", { graveId: grave.id, kind: "updated" });
        showToast("묘비를 고쳤어요.");
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={mode.kind === "create" ? "묘비 세우기" : "묘비 고치기"}
      onClose={requestClose}
      closable={!saving}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {confirmingClose && (
          <div className={styles.confirmClose} role="alertdialog" aria-label="닫기 확인">
            <p>쓰던 내용이 사라져요. 닫을까요?</p>
            <div className={styles.confirmButtons}>
              <button type="button" className={cx(ui.button, ui.danger)} onClick={onClose}>
                닫기
              </button>
              <button
                type="button"
                className={cx(ui.button, ui.primary)}
                onClick={() => setConfirmingClose(false)}
                autoFocus
              >
                계속 쓰기
              </button>
            </div>
          </div>
        )}

        <div className={ui.field}>
          <label htmlFor={`${uid}-name`} className={ui.label}>
            <span className={ui.required}>그만둔 것</span>
            <span className={ui.counter} aria-hidden="true">
              {charCount(name)}/{LIMITS.name}
            </span>
          </label>
          <input
            id={`${uid}-name`}
            className={ui.input}
            value={name}
            maxLength={LIMITS.name * 2}
            onChange={(e) => setName(e.target.value)}
            placeholder="예) 새해 다짐 헬스장"
            aria-invalid={errorFor("name") !== undefined}
            aria-describedby={errorFor("name") ? `${uid}-name-msg` : undefined}
          />
          {errorFor("name") && (
            <p id={`${uid}-name-msg`} className={ui.error}>
              {errorFor("name")}
            </p>
          )}
        </div>

        <fieldset className={styles.group} aria-describedby={errorFor("lived") ? `${uid}-lived-msg` : undefined}>
          <legend className={cx(ui.label, styles.legend)}>
            <span className={ui.required}>얼마나 살았나요</span>
          </legend>
          <div className={styles.chips}>
            {LIFESPAN_PRESETS.map((p, i) => (
              <label key={p.id} className={styles.chip}>
                <input
                  id={i === 0 ? `${uid}-lived` : undefined}
                  type="radio"
                  name={`${uid}-lived`}
                  className="visually-hidden"
                  checked={lived === p.id}
                  onChange={() => setLived(p.id)}
                />
                {p.label}
              </label>
            ))}
          </div>
          {errorFor("lived") && (
            <p id={`${uid}-lived-msg`} className={ui.error}>
              {errorFor("lived")}
            </p>
          )}
        </fieldset>

        <StylePicker
          value={style}
          onChange={setStyle}
          inventory={me?.inventory ?? {}}
          current={editing?.style}
          ageDays={previewAge}
          verb={mode.kind === "create" ? "세우면" : "바꾸면"}
        />

        <fieldset className={styles.group}>
          <legend className={cx(ui.label, styles.legend)}>
            <span>사인</span>
            <span className={ui.counter}>하나만, 안 골라도 돼요</span>
          </legend>
          <div className={styles.chips}>
            {CAUSE_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={styles.chip}
                aria-pressed={cause === tag}
                onClick={() => setCause(cause === tag ? null : tag)}
              >
                {CAUSE_LABELS[tag]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className={ui.field}>
          <label htmlFor={`${uid}-epitaph`} className={ui.label}>
            <span>묘비명</span>
            <span className={ui.counter} aria-hidden="true">
              {charCount(epitaph)}/{LIMITS.epitaph}
            </span>
          </label>
          <input
            id={`${uid}-epitaph`}
            className={ui.input}
            value={epitaph}
            maxLength={LIMITS.epitaph * 2}
            onChange={(e) => setEpitaph(e.target.value)}
            placeholder={suggestion}
            aria-invalid={errorFor("epitaph") !== undefined}
            aria-describedby={`${uid}-epitaph-msg`}
          />
          <p id={`${uid}-epitaph-msg`} className={errorFor("epitaph") ? ui.error : ui.hint}>
            {errorFor("epitaph") ?? "비워 두면 회색 글씨처럼 새겨져요."}
          </p>
        </div>

        <div className={ui.field}>
          <label htmlFor={`${uid}-comment`} className={ui.label}>
            <span>상주의 한마디</span>
            <span className={ui.counter} aria-hidden="true">
              {charCount(comment)}/{LIMITS.comment}
            </span>
          </label>
          <input
            id={`${uid}-comment`}
            className={ui.input}
            value={comment}
            maxLength={LIMITS.comment * 2}
            onChange={(e) => setComment(e.target.value)}
            placeholder="찾아온 사람에게 남기는 말 (선택)"
            aria-invalid={errorFor("comment") !== undefined}
          />
          {errorFor("comment") && <p className={ui.error}>{errorFor("comment")}</p>}
        </div>

        <aside className={styles.preview} aria-label="미리보기">
          <div className={styles.stage}>
            <span className={styles.stageName}>{name.trim() || "그만둔 것"}</span>
            <StyleArt style={style} ageDays={previewAge} scale={4} label={`${styleName(style)} 묘비`} />
          </div>
          <div className={styles.previewText}>
            <p className={styles.previewEpitaph}>{epitaph.trim() || suggestion}</p>
            <p className={styles.previewMeta}>
              {styleName(style)} · 상주 {editing?.mourner ?? mourner}
            </p>
            {mode.kind === "create" && graveCount !== null && (
              <p className={styles.previewPlot}>
                세우면 {channel}채널 {plotLabel(graveCount)}에 묻혀요.
              </p>
            )}
          </div>
        </aside>

        <footer className={styles.footer}>
          {error && (
            <p className={ui.error} role="alert">
              {error}
            </p>
          )}
          <button type="submit" className={cx(ui.button, ui.primary, styles.submit)} disabled={saving}>
            {saving
              ? mode.kind === "create"
                ? "묘비를 세우는 중…"
                : "고치는 중…"
              : mode.kind === "create"
                ? "묘비 세우기"
                : "고친 내용 저장"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
