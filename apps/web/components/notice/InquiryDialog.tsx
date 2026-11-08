"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { showToast } from "@/lib/hooks/useToasts";
import { INQUIRY_CATEGORIES, type InquiryCategory, type InquiryInfoResponse } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { INQUIRY_LIMITS, validateInquiry } from "./notices";
import styles from "./notice.module.css";

// 문의 접수 가능 여부·공개 저장소 여부 (탭에서 한 번만 묻는다)
let infoRequest: Promise<InquiryInfoResponse | null> | null = null;
function loadInquiryInfo() {
  infoRequest ??= api.inquiryInfo().catch(() => null);
  return infoRequest;
}

function useInquiryInfo(): InquiryInfoResponse | null {
  const [info, setInfo] = useState<InquiryInfoResponse | null>(null);
  useEffect(() => {
    let alive = true;
    void loadInquiryInfo().then((v) => {
      if (alive) setInfo(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

/** 가이드·내 정보에 두는 [문의하기]. 운영자가 아직 연결하지 않았으면 "준비 중" */
export function InquiryButton({ className }: { className?: string }) {
  const info = useInquiryInfo();
  const [open, setOpen] = useState(false);
  const disabled = info?.enabled === false;
  return (
    <>
      <button type="button" className={cx(ui.button, className)} onClick={() => setOpen(true)} disabled={disabled}>
        {disabled ? "문의하기 (준비 중)" : "문의하기"}
      </button>
      {open && info && <InquiryDialog info={info} onClose={() => setOpen(false)} />}
    </>
  );
}

function InquiryDialog({ info, onClose }: { info: InquiryInfoResponse; onClose: () => void }) {
  const [category, setCategory] = useState<InquiryCategory | null>(null);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const errors = validateInquiry({ category, message, contact });
  const errorFor = (field: keyof typeof errors) => (submitted ? errors[field] : undefined);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || !category || pending) return;
    setPending(true);
    setError(null);
    try {
      const reply = contact.trim();
      await api.inquire({ category, message: message.trim(), ...(reply && { contact: reply }) });
      showToast("문의가 접수됐어요. 고마워요.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog title="문의하기" onClose={onClose} closable={!pending}>
      <form className={styles.form} onSubmit={submit} noValidate>
        {info.public && (
          <p className={styles.warning} role="note">
            문의 내용은 공개 저장소에 올라가 누구나 볼 수 있어요. 개인정보는 쓰지 마세요.
          </p>
        )}

        <fieldset className={styles.group} aria-describedby={errorFor("category") ? `${uid}-cat` : undefined}>
          <legend className={ui.label}>어떤 문의인가요</legend>
          <div className={styles.chips}>
            {INQUIRY_CATEGORIES.map((c) => (
              <label key={c.id} className={styles.chip}>
                <input
                  type="radio"
                  name={`${uid}-category`}
                  className="visually-hidden"
                  checked={category === c.id}
                  onChange={() => setCategory(c.id)}
                />
                {c.label}
              </label>
            ))}
          </div>
          {errorFor("category") && (
            <p id={`${uid}-cat`} className={ui.error}>
              {errorFor("category")}
            </p>
          )}
        </fieldset>

        <div className={ui.field}>
          <label htmlFor={`${uid}-message`} className={ui.label}>
            <span>내용</span>
            <span className={ui.counter} aria-hidden="true">
              {[...message.trim()].length}/{INQUIRY_LIMITS.max}
            </span>
          </label>
          <textarea
            id={`${uid}-message`}
            className={ui.input}
            rows={6}
            value={message}
            maxLength={INQUIRY_LIMITS.max * 2}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`${INQUIRY_LIMITS.min}자 이상 적어 주세요.`}
            aria-invalid={errorFor("message") !== undefined}
            aria-describedby={errorFor("message") ? `${uid}-message-msg` : undefined}
          />
          {errorFor("message") && (
            <p id={`${uid}-message-msg`} className={ui.error}>
              {errorFor("message")}
            </p>
          )}
        </div>

        <div className={ui.field}>
          <label htmlFor={`${uid}-contact`} className={ui.label}>
            <span>답장 받을 연락처</span>
            <span className={ui.counter}>선택</span>
          </label>
          <input
            id={`${uid}-contact`}
            className={ui.input}
            value={contact}
            maxLength={INQUIRY_LIMITS.contact * 2}
            onChange={(e) => setContact(e.target.value)}
            placeholder="이메일 등"
            autoComplete="email"
            aria-invalid={errorFor("contact") !== undefined}
          />
          {errorFor("contact") && <p className={ui.error}>{errorFor("contact")}</p>}
        </div>

        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending}>
          {pending ? "보내는 중…" : "보내기"}
        </button>
      </form>
    </Dialog>
  );
}
