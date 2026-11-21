"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { InquiryCategory } from "@/lib/types";
import { INQUIRY_LIMITS, validateInquiry } from "../notice/notices";
import { cx } from "../ui/cx";
import styles from "./site.module.css";

// 11/20 개발자 노트 문의하기: 게임 안 문의와 같은 문의함(관리자 문의 탭)으로 보낸다 (source=devnote).
// 게임 계정 없이도 보낼 수 있다. 계정이 없으면 답장할 길이 연락처뿐이라 연락처를 꼭 받는다

/** 개발자 노트에서 고르는 종류 (게임 안 「제안」은 여기서 「건의」로 보인다) */
const CATS: readonly { id: InquiryCategory; label: string }[] = [
  { id: "bug", label: "버그 신고" },
  { id: "idea", label: "건의" },
  { id: "account", label: "계정·포인트" },
  { id: "other", label: "기타" },
];

const TIPS: Record<InquiryCategory | "none", string> = {
  none: "한 번에 한 가지 이야기를 적어 주면 더 빨리 살펴볼 수 있어요.",
  bug: "어느 화면에서 무엇을 눌렀을 때 생겼는지, 폰인지 컴퓨터인지 함께 적어 주세요.",
  idea: "어떤 상황에서 무엇이 있으면 좋겠는지 적어 주세요.",
  account: "닉네임과 언제 무엇이 달라졌는지 적어 주세요. 개인 코드는 절대 적지 마세요.",
  grave: "묘비 이름과 채널, 자리를 적어 주세요.",
  other: "궁금한 점이나 하고 싶은 말을 편하게 적어 주세요.",
};

type Info = { isPublic: boolean; signedIn: boolean };

export default function ContactDesk() {
  const [info, setInfo] = useState<Info | null>(null);
  /** 보낸 뒤: 연락처를 남겼는지 (null이면 아직 안 보냄) */
  const [sent, setSent] = useState<{ withContact: boolean } | null>(null);

  useEffect(() => {
    api
      .inquiryInfo()
      .then((i) => setInfo({ isPublic: i.public, signedIn: i.signedIn ?? false }))
      // 못 읽으면 손님으로 본다 (연락처를 받아 두면 어느 쪽이든 답장할 수 있다)
      .catch(() => setInfo({ isPublic: false, signedIn: false }));
  }, []);

  return (
    <div className={styles.ct}>
      <div className={styles.ctMain}>
        {!info ? (
          <div className={styles.ctLoading} aria-busy="true" />
        ) : sent ? (
          <div className={styles.ctDone} role="status">
            <span className={styles.ghost} aria-hidden="true" />
            <b>보냈어요. 고마워요.</b>
            <p>{sent.withContact ? "적어 주신 연락처로 답장드릴게요." : "하나하나 직접 읽어요."}</p>
            <button type="button" className={styles.btn} onClick={() => setSent(null)}>
              하나 더 쓰기
            </button>
          </div>
        ) : (
          <Compose info={info} onSent={(withContact) => setSent({ withContact })} />
        )}
      </div>

      <aside className={styles.ctSide}>
        <div className={styles.ctNote}>
          <b>문의하기 전에</b>
          <ul>
            <li>게임 계정이 없어도 보낼 수 있어요. 답장은 적어 주신 연락처로 드려요.</li>
            <li>하루에 3번까지 보낼 수 있어요.</li>
            <li>개인 코드는 운영자도 묻지 않아요. 적지 마세요.</li>
            <li>불편한 사람이나 묘비는 게임 안 [신고]가 더 빨라요.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Compose({ info, onSent }: { info: Info; onSent: (withContact: boolean) => void }) {
  const uid = useId();
  const needContact = !info.signedIn;
  const [category, setCategory] = useState<InquiryCategory | null>(null);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  /** 봇 거르기 숨은 칸 (사람에게는 보이지 않는다) */
  const [homepage, setHomepage] = useState("");
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = validateInquiry({ category, message, contact, needContact });
  const show = (k: keyof typeof errors) => (tried ? errors[k] : undefined);
  const len = [...message.trim()].length;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length > 0 || !category || pending) return;
    setPending(true);
    setError(null);
    try {
      const reply = contact.trim();
      await api.inquire({ category, message: message.trim(), source: "devnote", ...(reply && { contact: reply }), ...(homepage && { homepage }) });
      onSent(reply.length > 0);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form className={styles.ctForm} onSubmit={submit} noValidate>
      {info.isPublic && (
        <p className={styles.callout} role="note">
          문의 내용은 공개 저장소에도 올라가요. 개인정보는 적지 마세요.
        </p>
      )}

      <fieldset className={styles.ctField}>
        <legend className={styles.ctLabel}>어떤 문의인가요</legend>
        <div className={styles.ctChips} role="radiogroup" aria-label="문의 종류">
          {CATS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={category === c.id} className={styles.ctChip} onClick={() => setCategory(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        {show("category") && <p className={styles.ctErr}>{show("category")}</p>}
      </fieldset>

      <div className={styles.ctField}>
        <label htmlFor={`${uid}-msg`} className={styles.ctLabel}>
          <span>내용</span>
          <span className={cx(styles.ctCounter, len > INQUIRY_LIMITS.max && styles.ctOver)} aria-hidden="true">
            {len}/{INQUIRY_LIMITS.max}
          </span>
        </label>
        <textarea
          id={`${uid}-msg`}
          className={styles.ctBox}
          rows={8}
          value={message}
          maxLength={INQUIRY_LIMITS.max * 2}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`${INQUIRY_LIMITS.min}자 이상 적어 주세요.`}
          aria-invalid={show("message") !== undefined}
        />
        <p className={styles.ctTip}>{TIPS[category ?? "none"]}</p>
        {show("message") && <p className={styles.ctErr}>{show("message")}</p>}
      </div>

      <div className={styles.ctField}>
        <label htmlFor={`${uid}-contact`} className={styles.ctLabel}>
          <span>답장 받을 연락처</span>
          <span className={styles.ctCounter}>{needContact ? "꼭 적어 주세요" : "선택"}</span>
        </label>
        <input
          id={`${uid}-contact`}
          className={styles.ctLine}
          value={contact}
          maxLength={INQUIRY_LIMITS.contact * 2}
          onChange={(e) => setContact(e.target.value)}
          placeholder="이메일 등"
          autoComplete="email"
          required={needContact}
          aria-invalid={show("contact") !== undefined}
        />
        {show("contact") && <p className={styles.ctErr}>{show("contact")}</p>}
      </div>

      <div className={styles.ctTrap} aria-hidden="true">
        <label>
          홈페이지
          <input tabIndex={-1} autoComplete="off" value={homepage} onChange={(e) => setHomepage(e.target.value)} name="homepage" />
        </label>
      </div>

      {error && (
        <p className={styles.ctErr} role="alert">
          {error}
        </p>
      )}
      <div className={styles.ctSend}>
        <button type="submit" className={cx(styles.btn, styles.btnPrimary)} disabled={pending}>
          {pending ? "보내는 중…" : "보내기"}
        </button>
      </div>
    </form>
  );
}
