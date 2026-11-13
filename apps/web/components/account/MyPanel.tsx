"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { checkName, dexBadgeCats } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { DAILY_EARN_CAP } from "@/lib/economy";
import { CAT_LABEL, dexBadgeBits } from "@/lib/forage/catalog";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { useNameTaken } from "@/lib/hooks/useNameTaken";
import { lookScore } from "@/lib/lookScore";
import { useForage } from "../forage/forageStore";
import { forgetMyCode, readMyCode, saveMyCode, writeItem } from "@/lib/storage";
import { LS, type Me } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import type { MyGraveEntry } from "./items";
import { InquiryButton } from "../notice/InquiryDialog";
import MyGraves from "./MyGraves";
import styles from "./MyPanel.module.css";
import MyHouseLine from "../housing/MyHouseLine";
import { isOnline, useFriends } from "@/lib/hooks/useFriends";
import PixelIcon from "../ui/PixelIcon";
import type { PublicHouse } from "@/lib/housing/types";

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
  /** 친구 창 (목록·받은 신청·보낸 신청) */
  onOpenFriends?: () => void;
  /** 내 집 (채널마다 주거 구역이 따로다): 지금 채널, 내 집 가기(필요하면 채널을 옮긴 뒤), 분양 사무소 열기 */
  houseChannel: number;
  onGoToMyHouse: (house: PublicHouse) => void;
  onOpenHousing: () => void;
  onClose: () => void;
};

type Ending = "leave" | "logout" | null;

/** 내 정보: 포인트·출석, 내 묘비, 개인 코드, 접속 종료·로그아웃 (가방은 HUD의 [가방]) */
export default function MyPanel({
  myGraves,
  onGoToMyGrave,
  onBury,
  onLeave,
  onLoggedOut,
  onOpenShrine,
  onOpenFriends,
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
  // 꾸미기 점수의 만료 판정 기준 시각 (렌더 중에 시계를 읽지 않는다)
  const [openedAt] = useState(() => Date.now());

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
          <p className={styles.sub}>내 꾸미기 점수 {lookScore(me, openedAt)}점 (지금 입은 코디 기준)</p>
        </section>

        <NameSection me={me} />

        <DexBadgeLine />

        <section className={styles.section}>
          <h3 className={styles.heading}>내 묘비</h3>
          <MyGraves entries={myGraves.entries} pending={myGraves.pending} onGo={onGoToMyGrave} onBury={onBury} />
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>내 집</h3>
          <MyHouseLine channel={houseChannel} onGo={onGoToMyHouse} onOffice={onOpenHousing} />
        </section>

        {onOpenFriends && <FriendsLine onOpen={onOpenFriends} />}

        <CodeSection me={me} buttonId={codeButtonId} />

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
                  ? "로그아웃할까요? 다시 들어오려면 개인 코드가 필요해요. 이 기기에 저장된 코드도 지워지니 먼저 적어 두세요."
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

const MASKED_CODE = "••••-••••-••••";

/**
 * 개인 코드. 서버는 해시만 들고 있어 원문을 다시 못 보여 준다 → 이 기기에서 발급받았거나 코드로 들어왔으면
 * 기기 저장본을 보여 주고(가리기·보기·복사), 없으면 새로 발급하게 한다 (예전 코드는 바로 못 쓰게 된다)
 */
/** 친구: 접속 중인 친구 수 · 받은 신청 + [친구 창] */
function FriendsLine({ onOpen }: { onOpen: () => void }) {
  const { friends, incoming } = useFriends();
  const online = friends?.filter((f) => isOnline(f.where)).length ?? 0;
  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>친구</h3>
      <p className={styles.sub}>
        {friends === null ? "불러오는 중…" : friends.length ? `친구 ${friends.length}명 · 지금 접속 ${online}명` : "아직 친구가 없어요"}
        {incoming > 0 && ` · 받은 신청 ${incoming}개`}
      </p>
      <button type="button" className={cx(ui.button, styles.leave)} onClick={onOpen}>
        <PixelIcon name="friends" />
        친구 창 열기
      </button>
    </section>
  );
}

function CodeSection({ me, buttonId }: { me: Me; buttonId: string }) {
  const [code, setCode] = useState<string | null>(() => readMyCode(me.accountId));
  const [shown, setShown] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasCode = me.hasCode || code !== null;

  async function issue() {
    setPending(true);
    setMessage(null);
    try {
      const res = await api.issueCode();
      saveMyCode(me.accountId, res.code);
      setCode(res.code);
      setShown(true);
      setConfirming(false);
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
      <p className={ui.hint}>
        다른 기기에서 이 계정(포인트·가방·내 묘비)으로 들어올 때 쓰는 코드예요. 입장 화면의 &quot;코드로 시작&quot;에
        넣으면 돼요.
      </p>
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
          <p className={styles.warning} role="note">
            비밀번호처럼 다뤄 주세요. 이 코드를 알면 누구나 내 계정에 들어올 수 있어요.
          </p>
        </div>
      )}
      {!code && hasCode && (
        <p className={ui.hint}>
          이 기기에는 코드가 저장돼 있지 않아요. 코드는 비밀번호처럼 원문을 보관하지 않아 다시 보여 드릴 수 없어요. 잊었다면
          새로 발급받으세요.
        </p>
      )}
      {confirming ? (
        <div className={styles.confirm}>
          <p>새로 발급하면 예전 코드는 바로 쓸 수 없게 돼요. 다른 기기에서도 새 코드로 들어와야 해요.</p>
          <div className={styles.confirmButtons}>
            <button type="button" className={cx(ui.button, ui.danger)} onClick={issue} disabled={pending} autoFocus>
              {pending ? "만드는 중…" : "새 코드 발급"}
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
          className={cx(ui.button, code && ui.quiet)}
          onClick={hasCode ? () => setConfirming(true) : issue}
          disabled={pending}
        >
          {pending ? "만드는 중…" : hasCode ? "새 코드 발급" : "개인 코드 만들기"}
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
  // 닉네임 중복: 입력 중 가볍게 미리 확인 (지금 내 이름은 묻지 않는다). 저장 때 서버가 다시 판정한다
  const taken = useNameTaken(open ? name : "", me.name);
  const price = cost === 0 ? "이번 변경은 무료예요." : `바꾸면 ${cost.toLocaleString("ko-KR")} 포인트가 들어요.`;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!check.ok || taken || pending) return;
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

/** 도감 100% 배지: 다 채운 종류 (이름표 옆 별과 같다. 다른 사람에게는 다음 입장부터 보인다) */
function DexBadgeLine() {
  const { state } = useForage();
  const cats = dexBadgeCats(state ? dexBadgeBits(state.dex) : 0);
  if (!cats.length) return null;
  return (
    <section className={styles.section} aria-label="도감 배지">
      <h3 className={styles.heading}>도감 배지 {"★".repeat(cats.length)}</h3>
      <p className={styles.sub}>{cats.map((c) => `${CAT_LABEL[c]} 100%`).join(" · ")}</p>
    </section>
  );
}
