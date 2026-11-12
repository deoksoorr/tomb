"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { showToast } from "@/lib/hooks/useToasts";
import { INQUIRY_CATEGORIES, type InquiryCategory, type InquiryInfoResponse } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import { InfoCard, InfoGrid, TipList } from "../ui/InfoBlocks";
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

/** 문의 종류마다 "이렇게 적어 주면 빨리 도와드릴 수 있어요" */
const WRITE_TIPS: Record<InquiryCategory | "none", readonly string[]> = {
  none: ["위에서 문의 종류를 고르면, 무엇을 적으면 좋은지 여기서 알려 드려요.", "한 번에 한 가지 이야기를 적어 주면 더 빨리 살펴볼 수 있어요."],
  bug: [
    "어느 화면에서 무엇을 눌렀을 때 생겼는지 순서대로 적어 주세요.",
    "기기(폰·컴퓨터)와 브라우저(크롬·사파리 등), 대략의 시각을 적어 주면 찾기 쉬워요.",
    "다시 해 봐도 또 생기는지도 알려 주세요.",
  ],
  idea: ["어떤 상황에서 무엇이 있으면 좋겠는지 적어 주세요.", "비슷한 게임에서 본 예가 있으면 함께 적어 주세요."],
  account: [
    "닉네임과, 포인트·아이템이 언제 어떻게 달라졌는지 적어 주세요.",
    "개인 코드는 절대 적지 마세요. 운영자도 코드를 묻지 않아요.",
    "하루 포인트 한도(자정에 다시 참)에 닿아 덜 받은 것일 수도 있어요.",
  ],
  grave: ["묘비 이름과 채널·위치(몇 번째 줄 · 몇 번 자리)를 적어 주세요.", "묘비 상세 창의 [신고]로도 바로 알릴 수 있어요."],
  other: ["궁금한 점이나 하고 싶은 말을 편하게 적어 주세요."],
};

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

        <InfoGrid>
          <InfoCard title="이렇게 적어 주세요" icon="info" aside={category ? INQUIRY_CATEGORIES.find((c) => c.id === category)?.label : undefined}>
            <TipList tips={WRITE_TIPS[category ?? "none"]} />
          </InfoCard>
          <InfoCard title="보내기 전에 확인해 보세요" icon="list">
            <TipList
              tips={[
                "포인트는 하루에 모을 수 있는 한도가 있어요. 자정(한국 시간)에 다시 차요.",
                "묘비는 세운 지 시간이 지나면 성불해 묘역을 떠나요. '성불한 이야기들'에서 다시 볼 수 있어요.",
                "다른 기기에서 이어 하려면 내 정보의 개인 코드를 쓰면 돼요.",
                "불편한 사람·확성기는 캐릭터·기록의 [신고]가 더 빨라요.",
              ]}
            />
          </InfoCard>
        </InfoGrid>
      </form>
    </Dialog>
  );
}
