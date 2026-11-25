"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { checkNewName, dexBadgeCats } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { api, errorMessage } from "@/lib/api";
import { CAT_LABEL, dexBadgeBits } from "@/lib/forage/catalog";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { useNameTaken } from "@/lib/hooks/useNameTaken";
import { useForage } from "../forage/forageStore";
import { forgetMyCode, readMyCode, saveMyCode, writeItem } from "@/lib/storage";
import { LS, type Me } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { InquiryButton } from "../notice/InquiryDialog";
import GoogleSection, { GoogleBadge, useGoogleStatus } from "./GoogleSection";
import MyHuntSection from "./MyHuntSection";
import PerksSection from "./PerksSection";
import styles from "./MyPanel.module.css";
import MyHouseLine from "../housing/MyHouseLine";
import ReferralSection from "./ReferralSection";
import type { PublicHouse } from "@/lib/housing/types";

type Props = {
  /** 접속 종료: 게임을 내리고 입장 화면으로 */
  onLeave: () => void;
  /** 로그아웃이 끝났다: 게임을 내리고 입장 첫 화면으로 */
  onLoggedOut: () => void;
  /** 내 집 (채널마다 주거 구역이 따로다): 지금 채널, 내 집 가기(필요하면 채널을 옮긴 뒤), 분양 사무소 열기 */
  houseChannel: number;
  onGoToMyHouse: (house: PublicHouse) => void;
  onOpenHousing: () => void;
  onClose: () => void;
};

type Ending = "leave" | "logout" | null;

/**
 * 내 정보 (11/24 한 화면으로 합침 — 탭·설명 문단을 뺐다): 포인트·출석, 혜택, 닉네임·도감 배지 줄, 사냥 능력치·낀 장비, 내 집 (11/24 내 묘비 칸은 뺐다),
 * 추천 코드, 개인 코드, 구글 계정, 문의하기·접속 종료·로그아웃. 친구·꾸미기 점수·사냥 능력치는 각자 창(친구·가방·사냥)에서 본다
 */
export default function MyPanel({
  onLeave,
  onLoggedOut,
  houseChannel,
  onGoToMyHouse,
  onOpenHousing,
  onClose,
}: Props) {
  const { me, error } = useMe();
  const [ending, setEnding] = useState<Ending>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const codeButtonId = useId();
  // 구글 연결 상태 (닉네임 옆 표시·개인 코드 안내·로그아웃 확인·아래 구글 계정 칸이 같이 쓴다. 구글 설정이 없으면 null)
  const [googleStatus, setGoogleStatus] = useGoogleStatus();
  const googleLinked = !!googleStatus?.linked;

  useEffect(() => {
    void meStore.refresh();
  }, []);

  async function logout() {
    setPending(true);
    setNotice(null);
    try {
      await api.logout();
      // 이 기기에 남겨 둔 코드도 함께 지운다 (다음 사람이 내 정보에서 보지 못하게)
      forgetMyCode();
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
      <Dialog title="내 정보" onClose={onClose} fitHeight>
        <p className={styles.state} role="status">
          {error ?? "불러오는 중…"}
        </p>
        <button type="button" className={cx(ui.button, styles.leave)} onClick={onLeave}>
          접속 종료
        </button>
      </Dialog>
    );
  }

  // 코드도 구글도 없으면 로그아웃 뒤 다시 들어올 길이 없다
  const noWayBack = !me.hasCode && !googleLinked;

  return (
    <Dialog title="내 정보" onClose={onClose} fitHeight>
      <div className={styles.panel}>
        {/* 11/25 운영자: 한 카드 — 닉네임 줄에 포인트·출석 칩 (포인트는 큰 띠로 따로 빼지 않는다), 그 아래 혜택 배지 줄 */}
        <div className={styles.profile}>
          <ProfileRows
            me={me}
            googleLinked={googleLinked}
            chips={
              <>
                <span className={cx(styles.chip, styles.pointChip)} aria-label={`포인트 ${me.points.toLocaleString("ko-KR")}`}>
                  <i aria-hidden>◆</i>
                  <b>
                    {me.points.toLocaleString("ko-KR")}
                    <small>P</small>
                  </b>
                </span>
                {/* 운영자 계정은 출석 도장을 받지 않는다 → 출석 칩을 뺀다 */}
                {!me.staff && (
                  <span className={styles.chip} data-today={me.attendance.today || undefined}>
                    <span>연속 출석</span>
                    <b>{me.attendance.streak}일</b>
                    {me.attendance.today && <em>· 오늘 완료</em>}
                  </span>
                )}
              </>
            }
          />
          <PerksSection me={me} />
        </div>

        {/* 사냥 능력치·낀 장비 (11/24 운영자: 안내가 필요하다) */}
        <MyHuntSection accountId={me.accountId} />

        <section className={styles.section}>
          <h3 className={styles.heading}>내 집</h3>
          <MyHouseLine channel={houseChannel} onGo={onGoToMyHouse} onOffice={onOpenHousing} />
        </section>

        <ReferralSection />

        <CodeSection me={me} buttonId={codeButtonId} googleLinked={googleLinked} />

        <GoogleSection me={me} status={googleStatus} onStatus={setGoogleStatus} />

        <section className={styles.section}>
          {ending === "leave" ? (
            <div className={styles.confirm}>
              <p>마을을 떠날까요?</p>
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
                  ? "로그아웃할까요? 이 기기에 저장된 코드도 지워지니 먼저 적어 두세요."
                  : noWayBack
                    ? "개인 코드가 없으면 이 계정으로 다시 들어올 수 없어요."
                    : "로그아웃할까요?"}
              </p>
              <div className={styles.confirmButtons}>
                {noWayBack && (
                  <button type="button" className={cx(ui.button, ui.primary)} onClick={goToCode} autoFocus>
                    코드 발급하기
                  </button>
                )}
                <button type="button" className={cx(ui.button, ui.danger)} onClick={logout} disabled={pending}>
                  {noWayBack ? "그래도 로그아웃" : "로그아웃"}
                </button>
                <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setEnding(null)}>
                  그만두기
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.endButtons}>
              <InquiryButton className={styles.leave} />
              <button type="button" className={cx(ui.button, styles.leave)} onClick={() => setEnding("leave")}>
                접속 종료
              </button>
              <button type="button" className={cx(ui.button, styles.leave)} onClick={() => setEnding("logout")}>
                로그아웃
              </button>
            </div>
          )}
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
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

const MASKED_CODE = "••••-••••-••••";

/**
 * 개인 코드. 서버는 해시만 들고 있어 원문을 다시 못 보여 준다 → 이 기기에서 발급받았거나 코드로 들어왔으면
 * 기기 저장본을 보여 주고(가리기·보기·복사), 없으면 새로 발급하게 한다 (예전 코드는 바로 못 쓰게 된다)
 */
function CodeSection({ me, buttonId, googleLinked }: { me: Me; buttonId: string; googleLinked: boolean }) {
  const [code, setCode] = useState<string | null>(() => readMyCode(me.accountId));
  const [shown, setShown] = useState(false);
  // 확인 칸: issue = 새 코드 발급, others = 11/18 다른 기기에서 모두 로그아웃 (이 계정으로 들어와 있는 다른 기기를 끊는다. 지금 기기는 그대로)
  const [confirming, setConfirming] = useState<"issue" | "others" | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasCode = me.hasCode || code !== null;

  async function logoutOthers() {
    setPending(true);
    setMessage(null);
    try {
      await api.logoutOthers();
      setConfirming(null);
      setMessage("다른 기기를 모두 로그아웃했어요. 1분 안에 끊겨요.");
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  async function issue() {
    setPending(true);
    setMessage(null);
    try {
      const res = await api.issueCode();
      saveMyCode(me.accountId, res.code);
      setCode(res.code);
      setShown(true);
      setConfirming(null);
      setMessage("새 코드를 만들었어요. 안전한 곳에 적어 두세요.");
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
      setMessage("복사가 안 되면 [보기]를 누르고 직접 적어 두세요.");
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>개인 코드</h3>
      {/* 구글이 연결돼 있으면 코드를 잃어도 구글로 들어온다 → 그때는 남에게 알리지 말라는 말만 */}
      <p className={styles.warn}>{googleLinked ? "코드는 남에게 알려 주지 마세요." : "코드를 잃어버리면 계정을 찾을 수 없어요."}</p>
      {code && (
        <div className={styles.codeBox}>
          <output className={styles.code} aria-label={shown ? "개인 코드" : "개인 코드 (가려짐)"}>
            {shown ? code : MASKED_CODE}
          </output>
          <div className={styles.codeButtons}>
            <button type="button" className={ui.button} onClick={() => setShown((v) => !v)} aria-pressed={shown}>
              {shown ? "숨기기" : "보기"}
            </button>
            <button type="button" className={cx(ui.button, ui.primary)} onClick={() => copy(code)}>
              복사
            </button>
          </div>
        </div>
      )}
      {!code && hasCode && <p className={styles.sub}>이 기기에는 저장된 코드가 없어요.</p>}
      {confirming ? (
        <div className={styles.confirm}>
          <p>
            {confirming === "issue"
              ? "새로 발급하면 예전 코드는 바로 쓸 수 없고, 그 코드로 들어온 다른 기기는 로그아웃돼요."
              : "이 기기만 남기고 다른 기기는 모두 로그아웃할까요?"}
          </p>
          <div className={styles.confirmButtons}>
            <button type="button" className={cx(ui.button, ui.danger)} onClick={confirming === "issue" ? issue : logoutOthers} disabled={pending} autoFocus>
              {confirming === "issue" ? (pending ? "만드는 중…" : "새 코드 발급") : pending ? "로그아웃하는 중…" : "다른 기기 로그아웃"}
            </button>
            <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirming(null)}>
              그만두기
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.pairButtons}>
          <button
            id={buttonId}
            type="button"
            className={cx(ui.button, code ? ui.quiet : !hasCode && ui.primary)}
            onClick={hasCode ? () => setConfirming("issue") : issue}
            disabled={pending}
          >
            {pending ? "만드는 중…" : hasCode ? "새 코드 발급" : "개인 코드 만들기"}
          </button>
          <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirming("others")}>
            다른 기기 로그아웃
          </button>
        </div>
      )}
      {message && (
        <p className={styles.sub} role="status">
          {message}
        </p>
      )}
    </section>
  );
}

/** 닉네임(바꾸기) · 포인트·출석 칩 · 도감 배지 줄. 닉네임 첫 변경은 무료, 이후 포인트와 대기 기간 (서버가 정한 값을 그대로 보여 준다) */
function ProfileRows({ me, googleLinked, chips }: { me: Me; googleLinked: boolean; chips: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(me.name ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 다음 변경 가능 시각 비교 기준 (렌더 중에 시계를 읽지 않는다)
  const [openedAt] = useState(() => Date.now());
  const id = useId();
  const { nextAllowedAt, cost } = me.nameChange;
  const waiting = nextAllowedAt > openedAt;
  // 11/16 바꾸는 이름은 8자까지 (지금 이름 그대로는 예전 길이)
  const check = checkNewName(name, me.name);
  // 닉네임 중복: 입력 중 가볍게 미리 확인 (지금 내 이름은 묻지 않는다). 저장 때 서버가 다시 판정한다
  const taken = useNameTaken(open ? name : "", me.name);
  const price = cost === 0 ? "이번 변경은 무료예요." : `바꾸면 ${cost.toLocaleString("ko-KR")} 포인트가 들어요.`;
  const { state } = useForage();
  // 도감 100% 배지: 다 채운 종류 (이름표 옆 별과 같다)
  const cats = dexBadgeCats(state ? dexBadgeBits(state.dex) : 0);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!check.ok || taken || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const res = await api.changeName(check.name);
      meStore.set(res.me);
      writeItem(LS.name, check.name);
      // 11/20 머리 위 이름도 바로 (게임이 새 이름으로 다시 접속한다)
      bridge.emit("me:renamed", { name: res.me.name ?? check.name });
      setOpen(false);
      setMessage("닉네임을 바꿨어요.");
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.who} aria-label="내 캐릭터">
      <div className={styles.idRow}>
        <span className={styles.nameBig}>
          {me.name ?? "이름 없음"}
          {googleLinked && <GoogleBadge />}
        </span>
        <span className={styles.chips}>{chips}</span>
        {!open && (
          <button type="button" className={cx(ui.button, styles.smallButton, styles.rename)} onClick={() => setOpen(true)} disabled={waiting}>
            바꾸기
          </button>
        )}
      </div>
      {cats.length > 0 && (
        <p className={styles.dex}>
          <span aria-hidden>{"★".repeat(cats.length)}</span> 도감 배지 · {cats.map((c) => `${CAT_LABEL[c]} 100%`).join(" · ")}
        </p>
      )}
      {waiting && (
        <p className={styles.sub}>
          닉네임은{" "}
          {new Date(nextAllowedAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}부터 바꿀 수 있어요.
        </p>
      )}
      {open && (
        <form className={styles.nameForm} onSubmit={submit} noValidate>
          <input
            id={id}
            className={ui.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="새 닉네임"
            aria-invalid={!check.ok || taken !== null}
            aria-describedby={`${id}-hint`}
            autoFocus
          />
          <p id={`${id}-hint`} className={check.ok && !taken ? ui.hint : ui.error}>
            {!check.ok ? check.reason : (taken ?? price)}
          </p>
          <div className={styles.confirmButtons}>
            <button type="submit" className={cx(ui.button, ui.primary)} disabled={!check.ok || taken !== null || pending}>
              {pending ? "바꾸는 중…" : "바꾸기"}
            </button>
            <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setOpen(false)}>
              그만두기
            </button>
          </div>
        </form>
      )}
      {message && (
        <p className={styles.sub} role="status">
          {message}
        </p>
      )}
    </section>
  );
}
