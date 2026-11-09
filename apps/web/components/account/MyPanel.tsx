"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { checkName } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { DAILY_EARN_CAP } from "@/lib/economy";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { writeItem } from "@/lib/storage";
import { LS, type Me } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import type { MyGraveEntry } from "./items";
import { InquiryButton } from "../notice/InquiryDialog";
import MyGraves from "./MyGraves";
import styles from "./MyPanel.module.css";

type Props = {
  myGraves: { entries: MyGraveEntry[]; pending: number };
  onGoToMyGrave: (entry: MyGraveEntry) => void;
  onBury: () => void;
  /** 접속 종료: 게임을 내리고 입장 화면으로 */
  onLeave: () => void;
  /** 로그아웃이 끝났다: 게임을 내리고 입장 첫 화면으로 */
  onLoggedOut: () => void;
  /** 이장한 묘비를 다시 모시는 곳 */
  onOpenShrine: () => void;
  onClose: () => void;
};

type Ending = "leave" | "logout" | null;

/** 내 정보: 포인트·출석, 내 묘비, 개인 코드, 접속 종료·로그아웃 (가방은 HUD의 [가방]) */
export default function MyPanel({ myGraves, onGoToMyGrave, onBury, onLeave, onLoggedOut, onOpenShrine, onClose }: Props) {
  const { me, error } = useMe();
  const [ending, setEnding] = useState<Ending>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const codeButtonId = useId();

  useEffect(() => {
    void meStore.refresh();
  }, []);

  async function logout() {
    setPending(true);
    setNotice(null);
    try {
      await api.logout();
      onLoggedOut();
    } catch (e) {
      setNotice(errorMessage(e));
      setPending(false);
    }
  }

  /** 로그아웃하려다 코드를 먼저 만들기로 했다 */
  function goToCode() {
    setEnding(null);
    const button = document.getElementById(codeButtonId);
    button?.scrollIntoView({ block: "center" });
    button?.focus({ preventScroll: true });
  }

  if (!me) {
    return (
      <Dialog title="내 정보" onClose={onClose}>
        <p className={styles.state} role="status">
          {error ?? "불러오는 중…"}
        </p>
        <button type="button" className={cx(ui.button, styles.leave)} onClick={onLeave}>
          접속 종료
        </button>
      </Dialog>
    );
  }

  return (
    <Dialog title="내 정보" onClose={onClose}>
      <div className={styles.panel}>
        <section className={styles.points} aria-label="포인트">
          <p className={styles.balance}>
            <strong>{me.points.toLocaleString("ko-KR")}</strong> 포인트
          </p>
          <p className={styles.sub}>
            오늘 {me.todayEarned}/{DAILY_EARN_CAP} · 연속 출석 {me.attendance.streak}일
            {me.attendance.today && " · 오늘 출석 완료"}
          </p>
        </section>

        <NameSection me={me} />

        <section className={styles.section}>
          <h3 className={styles.heading}>내 묘비</h3>
          <MyGraves entries={myGraves.entries} pending={myGraves.pending} onGo={onGoToMyGrave} onBury={onBury} />
        </section>

        <CodeSection hasCode={me.hasCode} buttonId={codeButtonId} />

        <div className={styles.endButtons}>
          <button type="button" className={cx(ui.button, styles.leave)} onClick={onOpenShrine}>
            성황당 (이장한 묘비)
          </button>
          <InquiryButton className={styles.leave} />
        </div>

        <section className={styles.section}>
          {ending === "leave" ? (
            <div className={styles.confirm}>
              <p>묘지를 떠날까요?</p>
              <div className={styles.confirmButtons}>
                <button type="button" className={cx(ui.button, ui.danger)} onClick={onLeave} autoFocus>
                  떠나기
                </button>
                <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setEnding(null)}>
                  머무르기
                </button>
              </div>
            </div>
          ) : ending === "logout" ? (
            <div className={styles.confirm}>
              <p>
                {me.hasCode
                  ? "로그아웃할까요? 다시 들어오려면 개인 코드가 필요해요."
                  : "코드를 발급받지 않으면 이 계정으로 다시 들어올 수 없어요."}
              </p>
              <div className={styles.confirmButtons}>
                {!me.hasCode && (
                  <button type="button" className={cx(ui.button, ui.primary)} onClick={goToCode} autoFocus>
                    코드 발급하기
                  </button>
                )}
                <button type="button" className={cx(ui.button, ui.danger)} onClick={logout} disabled={pending}>
                  {me.hasCode ? "로그아웃" : "그래도 로그아웃"}
                </button>
                <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setEnding(null)}>
                  그만두기
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.endButtons}>
              <button type="button" className={cx(ui.button, styles.leave)} onClick={() => setEnding("leave")}>
                접속 종료
              </button>
              <button type="button" className={cx(ui.button, styles.leave)} onClick={() => setEnding("logout")}>
                로그아웃
              </button>
            </div>
          )}
          <p className={styles.notice} role="status">
            {notice}
          </p>
        </section>

        <p className={styles.legal}>
          <Link href="/privacy" target="_blank">
            개인정보처리방침
          </Link>
          {" · "}
          <Link href="/terms" target="_blank">
            이용약관
          </Link>
        </p>
      </div>
    </Dialog>
  );
}

/** 개인 코드 발급·재발급. 원문은 발급 응답에만 있으니 그때 복사하게 한다 */
function CodeSection({ hasCode, buttonId }: { hasCode: boolean; buttonId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function issue() {
    setPending(true);
    setMessage(null);
    try {
      const res = await api.issueCode();
      setCode(res.code);
      setConfirming(false);
      void meStore.refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("복사했어요. 안전한 곳에 적어 두세요.");
    } catch {
      setMessage("복사가 안 되면 길게 눌러 직접 적어 두세요.");
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>개인 코드</h3>
      <p className={ui.hint}>
        코드를 만들어 두면 다른 기기에서도 이 계정(포인트·가방·내 묘비)으로 들어올 수 있어요. 입장 화면의 &quot;개인
        코드로 들어가기&quot;에 넣으면 돼요.
      </p>
      {code ? (
        <div className={styles.codeBox}>
          <output className={styles.code} aria-label="개인 코드">
            {code}
          </output>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => copy(code)}>
            복사
          </button>
          <p className={styles.warning} role="note">
            이 코드를 알면 누구나 내 계정에 들어올 수 있어요. 지금 한 번만 보여 드려요.
          </p>
        </div>
      ) : confirming ? (
        <div className={styles.confirm}>
          <p>새로 만들면 예전 코드는 바로 쓸 수 없게 돼요.</p>
          <div className={styles.confirmButtons}>
            <button type="button" className={cx(ui.button, ui.danger)} onClick={issue} disabled={pending} autoFocus>
              새 코드 만들기
            </button>
            <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirming(false)}>
              그만두기
            </button>
          </div>
        </div>
      ) : (
        <button
          id={buttonId}
          type="button"
          className={ui.button}
          onClick={hasCode ? () => setConfirming(true) : issue}
          disabled={pending}
        >
          {pending ? "만드는 중…" : hasCode ? "코드 다시 만들기" : "개인 코드 만들기"}
        </button>
      )}
      {message && (
        <p className={styles.sub} role="status">
          {message}
        </p>
      )}
    </section>
  );
}

/** 닉네임 바꾸기: 첫 변경은 무료, 이후 포인트와 대기 기간 (서버가 정한 값을 그대로 보여 준다) */
function NameSection({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(me.name ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 다음 변경 가능 시각 비교 기준 (렌더 중에 시계를 읽지 않는다)
  const [openedAt] = useState(() => Date.now());
  const id = useId();
  const { nextAllowedAt, cost } = me.nameChange;
  const waiting = nextAllowedAt > openedAt;
  const check = checkName(name);
  const price = cost === 0 ? "이번 변경은 무료예요." : `바꾸면 ${cost.toLocaleString("ko-KR")} 포인트가 들어요.`;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!check.ok || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const res = await api.changeName(check.name);
      meStore.set(res.me);
      writeItem(LS.name, check.name);
      setOpen(false);
      setMessage("닉네임을 바꿨어요. 다음에 들어올 때부터 머리 위 이름도 바뀌어요.");
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>닉네임</h3>
      {open ? (
        <form className={styles.nameForm} onSubmit={submit} noValidate>
          <input
            id={id}
            className={ui.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="새 닉네임"
            aria-invalid={!check.ok}
            aria-describedby={`${id}-hint`}
            autoFocus
          />
          <p id={`${id}-hint`} className={check.ok ? ui.hint : ui.error}>
            {check.ok ? price : check.reason}
          </p>
          <div className={styles.confirmButtons}>
            <button type="submit" className={cx(ui.button, ui.primary)} disabled={!check.ok || pending}>
              {pending ? "바꾸는 중…" : "바꾸기"}
            </button>
            <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setOpen(false)}>
              그만두기
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.nameRow}>
          <span className={styles.nameNow}>{me.name ?? "이름 없음"}</span>
          <button type="button" className={ui.button} onClick={() => setOpen(true)} disabled={waiting}>
            닉네임 바꾸기
          </button>
        </div>
      )}
      <p className={ui.hint}>
        {waiting
          ? `${new Date(nextAllowedAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}부터 바꿀 수 있어요.`
          : price}
      </p>
      {message && (
        <p className={styles.sub} role="status">
          {message}
        </p>
      )}
    </section>
  );
}
