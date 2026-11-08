"use client";

import { useEffect, useId, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { graveTier, plotLabel } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { api, errorMessage } from "@/lib/api";
import { ageDays, lifespanLabel, suggestEpitaph, todayKst } from "@/lib/epitaph";
import type { GraveCache } from "@/lib/hooks/useGraves";
import { showToast } from "@/lib/hooks/useToasts";
import { ImageConvertError, toWebp } from "@/lib/image";
import { saveOwnerToken } from "@/lib/storage";
import { CAUSE_LABELS, CAUSE_TAGS, type CauseTag, type PublicGrave } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { charCount, LIMITS, normalizeTag, toGraveInput, validateBury, type BuryValues } from "./buryRules";
import GraveArt, { TIER_LABELS } from "./GraveArt";
import styles from "./BuryForm.module.css";

export type BuryMode = { kind: "create" } | { kind: "edit"; grave: PublicGrave; ownerToken: string };

/** none: 사진 없음 · uploaded: 이미 올라간 주소 · picked: 줄여 둔 새 사진(아직 안 올림) */
type Photo = { kind: "none" } | { kind: "uploaded"; url: string } | { kind: "picked"; blob: Blob; previewUrl: string };

type Props = {
  mode: BuryMode;
  /** 새 묘비의 상주 = 지금 유저이름 (고칠 때는 원래 상주를 그대로 둔다) */
  mourner: string;
  cache: GraveCache;
  /** 지금 묘비 수 = 새 묘비가 들어갈 자리 번호. 목록을 아직 못 받았으면 null */
  graveCount: number | null;
  onClose: () => void;
};

const FIELD_ORDER: (keyof BuryValues)[] = [
  "name",
  "bornAt",
  "diedAt",
  "lastTask",
  "causes",
  "causeDetail",
  "epitaph",
  "links",
  "stack",
];

export default function BuryForm({ mode, mourner, cache, graveCount, onClose }: Props) {
  const editing = mode.kind === "edit" ? mode.grave : null;
  // PATCH는 전체 덮어쓰기라 상주를 지금 이름으로 바꾸지 않게 원래 값을 보낸다
  const mournerName = editing?.mourner ?? mourner;
  const uid = useId();
  const idOf = (field: string) => `${uid}-${field}`;

  const [today] = useState(() => todayKst());
  const [name, setName] = useState(editing?.name ?? "");
  const [bornAt, setBornAt] = useState(editing?.bornAt ?? "");
  const [diedAt, setDiedAt] = useState(editing?.diedAt ?? today);
  const [lastTask, setLastTask] = useState(editing?.lastTask ?? "");
  const [causes, setCauses] = useState<CauseTag[]>(editing?.causes ?? []);
  const [causeDetail, setCauseDetail] = useState(editing?.causeDetail ?? "");
  // null이면 아직 손대지 않은 것 → 향년과 마지막 할 일로 자동 제안
  const [epitaphDraft, setEpitaphDraft] = useState<string | null>(editing?.epitaph ?? null);
  const [links, setLinks] = useState<string[]>(editing?.links?.length ? editing.links : [""]);
  const [stack, setStack] = useState<string[]>(editing?.stack ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [photo, setPhoto] = useState<Photo>(
    editing?.imageUrl ? { kind: "uploaded", url: editing.imageUrl } : { kind: "none" },
  );
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const age = ageDays(bornAt, diedAt) || null;
  const suggested = age ? suggestEpitaph(age, lastTask) : "";
  const epitaph = epitaphDraft ?? suggested;
  const values: BuryValues = { name, bornAt, diedAt, lastTask, causes, causeDetail, epitaph, links, stack };
  const errors = validateBury(values, today);
  // 날짜 순서는 바로 알려 주고, 나머지는 한 번 제출해 본 뒤부터 보여 준다
  const errorFor = (field: keyof BuryValues) => (submitted || field === "diedAt" ? errors[field] : undefined);
  const describe = (field: keyof BuryValues, hasMessage: boolean) => ({
    id: idOf(field),
    "aria-invalid": errorFor(field) !== undefined,
    "aria-describedby": hasMessage ? `${idOf(field)}-msg` : undefined,
  });
  const photoPreview = photo.kind === "picked" ? photo.previewUrl : photo.kind === "uploaded" ? photo.url : null;
  const busy = phase !== "idle";
  // 처음 열었을 때와 달라졌으면 닫기 전에 한 번 묻는다
  const snapshot = JSON.stringify([values, photo.kind === "picked" ? "picked" : photoPreview, tagDraft.trim()]);
  const [initialSnapshot] = useState(snapshot);
  const dirty = snapshot !== initialSnapshot;

  function requestClose() {
    if (busy) return;
    if (dirty && !confirmingClose) setConfirmingClose(true);
    else onClose();
  }

  useEffect(() => {
    if (photo.kind !== "picked") return;
    const url = photo.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const blob = await toWebp(file);
      setPhoto({ kind: "picked", blob, previewUrl: URL.createObjectURL(blob) });
    } catch (err) {
      setPhotoError(err instanceof ImageConvertError ? err.message : "사진을 처리하지 못했어요.");
    } finally {
      setPhotoBusy(false);
    }
  }

  function toggleCause(tag: CauseTag) {
    setCauses((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function commitTag() {
    const tag = normalizeTag(tagDraft, stack);
    if (tag) setStack([...stack, tag]);
    setTagDraft("");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || photoBusy) return;
    setSubmitted(true);
    const firstInvalid = FIELD_ORDER.find((f) => errors[f]);
    if (firstInvalid) {
      document.getElementById(idOf(firstInvalid))?.focus();
      return;
    }
    setError(null);
    try {
      let imageUrl = photo.kind === "uploaded" ? photo.url : undefined;
      if (photo.kind === "picked") {
        setPhase("uploading");
        imageUrl = await api.uploadScreenshot(photo.blob);
        // 저장이 실패해서 다시 눌러도 사진을 또 올리지 않게
        setPhoto({ kind: "uploaded", url: imageUrl });
      }
      setPhase("saving");
      const input = toGraveInput(values, mournerName, imageUrl);
      if (mode.kind === "create") {
        const { grave, ownerToken } = await api.createGrave(input);
        saveOwnerToken(grave.id, ownerToken);
        cache.upsert(grave);
        bridge.emit("grave:buried", { graveId: grave.id });
        const index = cache.getSnapshot().graves.findIndex((g) => g.id === grave.id);
        showToast(index === -1 ? "새 묘비를 세웠어요." : `새 묘비가 ${plotLabel(index)}에 세워졌어요.`, 6_000);
        showToast("이 브라우저에서만 수정/삭제할 수 있어요.", 6_000);
      } else {
        const { grave } = await api.updateGrave(mode.grave.id, mode.ownerToken, input);
        cache.upsert(grave);
        bridge.emit("grave:changed", { graveId: grave.id, kind: "updated" });
        showToast("묘비를 고쳤어요.");
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setPhase("idle");
    }
  }

  const epitaphHint =
    epitaphDraft === null ? (
      "날짜와 마지막으로 하던 일로 지어 두었어요. 고쳐 써도 돼요."
    ) : suggested && epitaphDraft !== suggested ? (
      <button type="button" className={styles.linkButton} onClick={() => setEpitaphDraft(null)}>
        자동 제안으로 되돌리기
      </button>
    ) : undefined;
  const tier = graveTier(age ?? 1);
  const submitLabel =
    phase === "uploading"
      ? "사진 올리는 중…"
      : phase === "saving"
        ? mode.kind === "create"
          ? "묘비를 세우는 중…"
          : "고치는 중…"
        : mode.kind === "create"
          ? "묘비 세우기"
          : "고친 내용 저장";

  return (
    <Dialog
      title={mode.kind === "create" ? "묘비 세우기" : "묘비 고치기"}
      onClose={requestClose}
      closable={!busy}
      size="lg"
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
        <div className={styles.layout}>
          <div className={styles.fields}>
            <Field
              id={idOf("name")}
              label="프로젝트 이름"
              required
              count={charCount(name)}
              max={LIMITS.name}
              error={errorFor("name")}
            >
              <input
                {...describe("name", !!errorFor("name"))}
                className={ui.input}
                value={name}
                maxLength={LIMITS.name * 2}
                onChange={(e) => setName(e.target.value)}
                placeholder="예) 할 일 앱"
              />
            </Field>

            <div className={ui.field}>
              <span className={ui.label}>
                스크린샷 <span className={ui.counter}>선택</span>
              </span>
              {photoPreview && (
                <div className={styles.photo}>
                  <Image
                    src={photoPreview}
                    alt="고른 스크린샷"
                    fill
                    unoptimized
                    sizes="(max-width: 720px) 100vw, 480px"
                    className={styles.photoImage}
                  />
                </div>
              )}
              <div className={styles.photoButtons}>
                <label className={cx(ui.button, styles.fileButton)} aria-disabled={photoBusy || busy}>
                  {photoBusy ? "사진을 줄이는 중…" : photoPreview ? "사진 바꾸기" : "사진 고르기"}
                  <input
                    type="file"
                    accept="image/*"
                    className="visually-hidden"
                    onChange={pickPhoto}
                    disabled={photoBusy || busy}
                    aria-describedby={`${idOf("photo")}-msg`}
                  />
                </label>
                {photoPreview && (
                  <button
                    type="button"
                    className={cx(ui.button, ui.quiet)}
                    onClick={() => setPhoto({ kind: "none" })}
                    disabled={busy}
                  >
                    사진 빼기
                  </button>
                )}
              </div>
              <p id={`${idOf("photo")}-msg`} className={photoError ? ui.error : ui.hint}>
                {photoError ?? "올릴 때 WebP로 줄여요 (긴 변 960px, 200KB 이하)."}
              </p>
            </div>

            <div className={styles.dates}>
              <Field id={idOf("bornAt")} label="탄생일" required error={errorFor("bornAt")}>
                <input
                  {...describe("bornAt", !!errorFor("bornAt"))}
                  type="date"
                  className={ui.input}
                  value={bornAt}
                  max={today}
                  onChange={(e) => setBornAt(e.target.value)}
                />
              </Field>
              <Field id={idOf("diedAt")} label="사망일" required error={errorFor("diedAt")}>
                <input
                  {...describe("diedAt", !!errorFor("diedAt"))}
                  type="date"
                  className={ui.input}
                  value={diedAt}
                  min={bornAt || undefined}
                  max={today}
                  onChange={(e) => setDiedAt(e.target.value)}
                />
              </Field>
            </div>
            <p className={styles.age} aria-live="polite">
              {age ? `향년 ${age}일` : "두 날짜를 고르면 향년을 셈해 드려요."}
            </p>

            <Field
              id={idOf("lastTask")}
              label="마지막으로 하던 일"
              count={charCount(lastTask)}
              max={LIMITS.lastTask}
              error={errorFor("lastTask")}
            >
              <input
                {...describe("lastTask", !!errorFor("lastTask"))}
                className={ui.input}
                value={lastTask}
                maxLength={LIMITS.lastTask * 2}
                onChange={(e) => setLastTask(e.target.value)}
                placeholder="예) 로그인 구현"
              />
            </Field>

            <fieldset
              className={styles.causes}
              aria-describedby={errorFor("causes") ? `${idOf("causes")}-msg` : undefined}
            >
              <legend className={cx(ui.label, styles.legend)}>
                <span className={ui.required}>사인</span>
                <span className={ui.counter}>여러 개 고를 수 있어요</span>
              </legend>
              <div className={styles.chips}>
                {CAUSE_TAGS.map((tag, i) => (
                  <label key={tag} className={styles.chip}>
                    <input
                      id={i === 0 ? idOf("causes") : undefined}
                      type="checkbox"
                      className="visually-hidden"
                      checked={causes.includes(tag)}
                      onChange={() => toggleCause(tag)}
                    />
                    {CAUSE_LABELS[tag]}
                  </label>
                ))}
              </div>
              {errorFor("causes") && (
                <p id={`${idOf("causes")}-msg`} className={ui.error}>
                  {errorFor("causes")}
                </p>
              )}
            </fieldset>

            <Field
              id={idOf("causeDetail")}
              label="사인 상세"
              count={charCount(causeDetail)}
              max={LIMITS.causeDetail}
              error={errorFor("causeDetail")}
            >
              <textarea
                {...describe("causeDetail", !!errorFor("causeDetail"))}
                className={ui.input}
                value={causeDetail}
                maxLength={LIMITS.causeDetail * 2}
                rows={3}
                onChange={(e) => setCauseDetail(e.target.value)}
                placeholder="어떻게 잠들게 되었나요? (선택)"
              />
            </Field>

            <Field
              id={idOf("epitaph")}
              label="묘비명"
              required
              count={charCount(epitaph)}
              max={LIMITS.epitaph}
              error={errorFor("epitaph")}
              hint={epitaphHint}
            >
              <input
                {...describe("epitaph", !!(errorFor("epitaph") || epitaphHint))}
                className={ui.input}
                value={epitaph}
                maxLength={LIMITS.epitaph * 2}
                onChange={(e) => setEpitaphDraft(e.target.value)}
                placeholder="향년 N일, ○○ 중 별세"
              />
            </Field>

            <Field
              id={idOf("links")}
              label="링크"
              count={links.length}
              max={LIMITS.links}
              error={errorFor("links")}
              hint="http:// 또는 https:// 주소 (선택)"
            >
              <div className={styles.linkList}>
                {links.map((value, i) => (
                  <div key={i} className={styles.linkRow}>
                    <input
                      {...(i === 0
                        ? describe("links", true)
                        : { "aria-label": `링크 ${i + 1}`, "aria-invalid": errorFor("links") !== undefined })}
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      className={ui.input}
                      value={value}
                      onChange={(e) => setLinks(links.map((l, j) => (j === i ? e.target.value : l)))}
                      placeholder="https://"
                    />
                    {links.length > 1 && (
                      <button
                        type="button"
                        className={cx(ui.button, ui.quiet, ui.icon)}
                        onClick={() => setLinks(links.filter((_, j) => j !== i))}
                        aria-label={`링크 ${i + 1} 빼기`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {links.length < LIMITS.links && (
                  <button
                    type="button"
                    className={cx(ui.button, ui.quiet, styles.addLink)}
                    onClick={() => setLinks([...links, ""])}
                  >
                    + 링크 추가
                  </button>
                )}
              </div>
            </Field>

            <Field
              id={idOf("stack")}
              label="기술 스택"
              count={stack.length}
              max={LIMITS.stack}
              error={errorFor("stack")}
              hint="Enter나 쉼표로 추가 (선택)"
            >
              <div className={styles.tagBox}>
                {stack.map((tag) => (
                  <span key={tag} className={ui.tag}>
                    {tag}
                    <button
                      type="button"
                      className={styles.tagRemove}
                      onClick={() => setStack(stack.filter((t) => t !== tag))}
                      aria-label={`${tag} 빼기`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {stack.length < LIMITS.stack && (
                  <input
                    {...describe("stack", true)}
                    className={cx(ui.input, styles.tagInput)}
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onBlur={commitTag}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        commitTag();
                      } else if (e.key === "Backspace" && !tagDraft && stack.length > 0) {
                        setStack(stack.slice(0, -1));
                      }
                    }}
                    placeholder="예) Next.js"
                  />
                )}
              </div>
            </Field>
          </div>

          <aside className={styles.preview} aria-label="미리보기">
            <p className={styles.previewHeading}>미리보기</p>
            <div className={styles.stage}>
              <span className={styles.stageName}>{name.trim() || "프로젝트 이름"}</span>
              <GraveArt tier={tier} scale={5} label={`${TIER_LABELS[tier]} 모양의 묘비`} />
            </div>
            <p className={styles.previewEpitaph}>{epitaph.trim() || "묘비명"}</p>
            <p className={styles.previewMeta}>
              {age ? lifespanLabel(bornAt, diedAt, age) : "날짜를 고르면 묘비 모양이 정해져요."}
            </p>
            <p className={styles.previewMeta}>
              {TIER_LABELS[tier]} · 상주 {mournerName}
            </p>
            {mode.kind === "create" && graveCount !== null && (
              <p className={styles.previewPlot}>세우면 {plotLabel(graveCount)}에 묻혀요.</p>
            )}
          </aside>
        </div>

        <footer className={styles.footer}>
          {mode.kind === "create" && <p className={ui.hint}>이 브라우저에서만 수정/삭제할 수 있어요.</p>}
          {error && (
            <p className={ui.error} role="alert">
              {error}
            </p>
          )}
          <button type="submit" className={cx(ui.button, ui.primary, styles.submit)} disabled={busy || photoBusy}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  count?: number;
  max?: number;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
};

function Field({ id, label, required, count, max, error, hint, children }: FieldProps) {
  const message = error ?? hint;
  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.label}>
        <span className={required ? ui.required : undefined}>{label}</span>
        {max !== undefined && (
          <span className={ui.counter} aria-hidden="true">
            {count}/{max}
          </span>
        )}
      </label>
      {children}
      {message && (
        <p id={`${id}-msg`} className={error ? ui.error : ui.hint}>
          {message}
        </p>
      )}
    </div>
  );
}
