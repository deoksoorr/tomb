"use client";

import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import {
  AVATAR_BODIES,
  STARTER_BODIES,
  AVATAR_COLORS,
  checkName,
  isAvatarBody,
  isAvatarColor,
  NAME_TAKEN_MESSAGE,
  pickChannel,
  type AvatarDye,
} from "@tomb/protocol";
import { api, ApiRequestError, errorMessage } from "@/lib/api";
import { useAmbience } from "@/lib/hooks/useAmbience";
import { prefetchGraves } from "@/lib/hooks/useGraves";
import { isChannelSelectable, useLobby } from "@/lib/hooks/useLobby";
import { useMyHouseChannel } from "@/lib/hooks/useMyHouseChannel";
import { useHydrated } from "@/lib/hooks/useMedia";
import { meStore } from "@/lib/hooks/useMe";
import { useNameTaken } from "@/lib/hooks/useNameTaken";
import { useNotices } from "@/lib/hooks/useNotices";
import type { GoogleResult } from "@/lib/googleResult";
import { readItem, saveMyCode, writeItem } from "@/lib/storage";
import { DORMANT_RENAME_MESSAGE, LS, type Me } from "@/lib/types";
import { bgm } from "../bgm/engine";
import { latestNotice } from "../notice/notices";
import NoticesDialog from "../notice/NoticesDialog";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { avatarColorSpec } from "@/game/sprites/avatar";
import AvatarSprite from "./AvatarSprite";
import ChannelPicker, { type ChannelChoice } from "./ChannelPicker";
import CodeStart from "./CodeStart";
import EntryMusic, { entryMusic } from "./EntryMusic";
import { GoogleDoneStep, GoogleNewStep, GoogleStartButton, type GoogleDone } from "./GoogleEntry";
import LiveBackground from "./LiveBackground";
import NightSky from "./NightSky";
import styles from "./EntryScreen.module.css";

/** body: 몸 모양 (계정에 저장된 것 또는 새로 시작에서 고른 것) */
export type EntryChoice = { name: string; color: string; body: string | undefined; channel: ChannelChoice };
/** 입장 화면 시작점: 처음 고르기 / (접속 종료 뒤) 이 기기 계정으로 이어서 */
export type EntryStart = "choose" | "continue";

/** AVATAR_COLORS 순서와 같은 이름 (스크린리더용) */
const COLOR_NAMES = ["뼛빛", "이끼", "새벽안개", "황토", "라벤더", "촛불"];

type Props = {
  start: EntryStart;
  /** 구글로 시작하기 단추를 그릴지, 구글에서 막 돌아온 결과 (login → 계정 확인, new → 새로 만들기 확인) */
  google: { enabled: boolean; result: GoogleResult | null };
  /** 공유 링크로 온 묘비: 그 묘비가 있는 채널로 들어간다 */
  focusGraveId: string | null;
  /** 입장 버튼을 눌러 게임이 뜨는 중 */
  entering: boolean;
  /** 게임이 제때 뜨지 않음 → 새로고침 안내 */
  stalled: boolean;
  onEnter: (choice: EntryChoice) => void;
};

/** 지금 마을에 있는 사람 수 (실시간 서버 로비, 채널 목록과 같은 주기로 갱신). 못 불러오면 그리지 않는다 */
function OnlineCount() {
  const { lobby } = useLobby();
  if (!lobby) return null;
  return (
    <p className={styles.online} aria-live="polite">
      <span className={styles.onlineDot} aria-hidden="true" />
      지금 <b>{lobby.total.toLocaleString("ko-KR")}명</b>이 마을에 있어요
    </p>
  );
}

export default function EntryScreen({ start, google, focusGraveId, entering, stalled, onEnter }: Props) {
  const hydrated = useHydrated();
  const ambience = useAmbience();
  const [liveShown, setLiveShown] = useState(false);
  return (
    <main className={styles.screen}>
      {/* 그림 하늘 위로, 준비되면 진짜 마을이 천천히 움직이는 배경이 덮는다 */}
      <NightSky ambience={ambience} hidden={liveShown} />
      <LiveBackground paused={entering} onShown={() => setLiveShown(true)} />
      <EntryMusic />
      <div className={styles.content}>
        <h1 className={styles.title}>한때는...</h1>
        <p className={styles.subtitle}>
          끝내지 못한 것들이 잠든 도트 마을.
          <br />
          모닥불 앞에 앉고, 헤엄치고, 사냥하고, 내 집 한 칸을 꾸며 보세요.
        </p>
        <OnlineCount />
        {/* 이름·색은 localStorage에 있으므로 하이드레이션 뒤에 그린다 */}
        {hydrated && !entering ? (
          <>
            <EntryFlow start={start} google={google} focusGraveId={focusGraveId} onEnter={onEnter} />
            <p className={styles.nonprofit}>개인 포트폴리오 · 후원·광고·유료 재화 없음</p>
            <p className={styles.legal}>
              <Link href="/privacy">개인정보처리방침</Link> · <Link href="/terms">이용약관</Link> · <Link href="/faq">자주 묻는 질문</Link>
            </p>
          </>
        ) : entering && stalled ? (
          <div className={styles.stalled} role="alert">
            <p>묘지 문이 열리지 않아요.</p>
            <button type="button" className={cx(ui.button, ui.primary)} onClick={() => window.location.reload()}>
              새로고침
            </button>
          </div>
        ) : (
          <p className={styles.loading} role="status">
            묘지 문을 여는 중…
          </p>
        )}
      </div>
    </main>
  );
}

/** 어떤 길로 들어왔나: 새로 시작(google = 구글로 새로 만들기, 끝에 구글 연결) / 이어서 들어가기 / 코드로 시작(확인된 계정) */
type Path = { kind: "new"; google?: boolean } | { kind: "continue" } | { kind: "code"; me: Me };
/** 들어갈 때의 모습 */
/** dye = 46번 계정에 남은 염색 (미리보기 그림에만 쓴다 — color는 입장 요청에 그대로 가는 프리셋 색) */
type Look = { name: string; color: string; body: string | undefined; dye?: AvatarDye };
type AccountPath = Exclude<Path, { kind: "new" }>;
type Step =
  | { kind: "choose" }
  | { kind: "code" }
  /** 구글은 확인됐는데 연결된 계정이 없다 → 새로 만들기 전 경고 */
  | { kind: "googleNew" }
  /** 새로 시작 ① 이름 → ② 캐릭터(몸 모양·색) → ③ 채널. 계정에 이름이 없는 이어서·코드도 이 길로.
   *  takenName = 입장하려다 다른 계정이 먼저 쓴 이름이라 돌아왔다 (그 이름이면 "이미 있는 이름이에요.") */
  | { kind: "name"; path: Path; draft: Look; takenName?: string }
  | { kind: "look"; path: Path; draft: Look }
  /** 이어서·코드: ① 계정 확인 → ② 채널 */
  | { kind: "account"; path: AccountPath }
  /** custom: 이름·모습을 직접 정했다 (3단계, [이전]은 캐릭터로) */
  | { kind: "channel"; path: Path; look: Look; custom: boolean };

const SUBMIT_LABELS: Record<Path["kind"], string> = {
  new: "입장하기",
  continue: "다시 들어가기",
  code: "채널을 선택해서 접속하기",
};

/** 계정에 저장된 모습 (코드로 시작·이어서 들어가기에서는 바꾸지 않는다) */
function lookOf(me: Pick<Me, "name" | "color" | "body" | "dye"> | null, fallbackName: string): Look | null {
  const name = me?.name ?? fallbackName;
  if (!checkName(name).ok) return null;
  const saved = readItem(LS.color);
  const color = isAvatarColor(me?.color) ? me.color : isAvatarColor(saved) ? saved : AVATAR_COLORS[0];
  return { name, color, body: me?.body && isAvatarBody(me.body) ? me.body : undefined, ...(me?.dye ? { dye: me.dye } : {}) };
}

/** 새로 시작의 처음 모습: 이 기기에 남은 색, 기본 몸 모양 */
function freshDraft(): Look {
  const saved = readItem(LS.color);
  return { name: "", color: isAvatarColor(saved) ? saved : AVATAR_COLORS[0], body: AVATAR_BODIES[0].id };
}

/**
 * 처음 고르기 →
 *  새로 시작: ① 이름 → ② 캐릭터 → ③ 채널 (휴대폰 한 화면에 한 단계씩)
 *  이어서·코드: ① 계정 확인 → ② 채널 (세 길 모두 같은 채널 화면)
 */
function EntryFlow({ start, google, focusGraveId, onEnter }: Omit<Props, "entering" | "stalled">) {
  const [savedName] = useState(() => readItem(LS.name) ?? "");
  const previous = checkName(savedName).ok ? savedName : null;
  const [step, setStep] = useState<Step>(() =>
    // 구글로 들어옴: 세션 쿠키가 그 계정으로 바뀌었으니 이어서 들어가기처럼 계정을 확인한다 (휴면이면 닉네임 재설정)
    google.result === "login"
      ? { kind: "account", path: { kind: "continue" } }
      : google.result === "new"
        ? { kind: "googleNew" }
        : start === "continue" && previous
          ? { kind: "account", path: { kind: "continue" } }
          : { kind: "choose" },
  );
  // 공유 링크의 묘비가 있는 채널 (그 채널로 들어간다)
  const [sharedChannel, setSharedChannel] = useState<number | null>(null);
  useEffect(() => {
    if (!focusGraveId) return;
    api
      .graveDetail(focusGraveId)
      .then((d) => setSharedChannel(d.grave.channel))
      .catch(() => {
        // 없어진 묘비면 평소처럼 채널을 고른다
      });
  }, [focusGraveId]);

  const { notices } = useNotices();
  const latest = notices ? latestNotice(notices) : null;
  const [noticesOpen, setNoticesOpen] = useState(false);

  const back = () => setStep({ kind: "choose" });

  switch (step.kind) {
    case "choose":
      return (
        <div className={styles.choose}>
          {latest && (
            <button type="button" className={styles.notice} onClick={() => setNoticesOpen(true)}>
              <span className={styles.noticeTag}>공지</span>
              <span className={styles.noticeTitle}>{latest.title}</span>
            </button>
          )}
          {noticesOpen && <NoticesDialog onClose={() => setNoticesOpen(false)} />}
          <button
            type="button"
            className={cx(ui.button, ui.primary, styles.big)}
            onClick={() => setStep({ kind: "name", path: { kind: "new" }, draft: freshDraft() })}
          >
            새로 시작
            <span className={styles.bigSub}>이름과 모습을 정하고 처음 들어가요</span>
          </button>
          <button type="button" className={cx(ui.button, styles.big)} onClick={() => setStep({ kind: "code" })}>
            코드로 시작
            <span className={styles.bigSub}>다른 기기에서 쓰던 계정으로</span>
          </button>
          {google.enabled && <GoogleStartButton />}
          {previous && (
            <button
              type="button"
              className={styles.continue}
              onClick={() => setStep({ kind: "account", path: { kind: "continue" } })}
            >
              {previous}(으)로 이어서 들어가기
            </button>
          )}
        </div>
      );
    case "code":
      return <CodeStart onLogin={(me) => setStep({ kind: "account", path: { kind: "code", me } })} onBack={back} />;
    case "googleNew":
      return (
        <GoogleNewStep
          onCode={() => setStep({ kind: "code" })}
          onCreate={() => setStep({ kind: "name", path: { kind: "new", google: true }, draft: freshDraft() })}
          onBack={back}
        />
      );
    case "name":
      return (
        <NameStep
          draft={step.draft}
          takenName={step.takenName}
          onBack={back}
          onNext={(draft) => setStep({ kind: "look", path: step.path, draft })}
        />
      );
    case "look":
      return (
        <LookStep
          draft={step.draft}
          onBack={(draft) => setStep({ kind: "name", path: step.path, draft })}
          onNext={(look) => setStep({ kind: "channel", path: step.path, look, custom: true })}
        />
      );
    case "account":
      return (
        <AccountStep
          key={step.path.kind}
          path={step.path}
          fallbackName={previous ?? ""}
          onBack={back}
          onNext={(look) => setStep({ kind: "channel", path: step.path, look, custom: false })}
          onCustomize={() => setStep({ kind: "name", path: step.path, draft: freshDraft() })}
          onRenamed={(me) => {
            // 코드로 시작: 확인된 계정 정보를 새 이름으로 바꿔 둔다 (채널에서 [이전]으로 돌아와도 휴면 안내가 다시 뜨지 않게)
            if (step.path.kind === "code") setStep({ kind: "account", path: { kind: "code", me } });
          }}
        />
      );
    case "channel":
      return (
        <ChannelStep
          path={step.path}
          look={step.look}
          custom={step.custom}
          sharedChannel={sharedChannel}
          onBack={() =>
            setStep(
              step.custom || step.path.kind === "new"
                ? { kind: "look", path: step.path, draft: step.look }
                : { kind: "account", path: step.path },
            )
          }
          onEnter={onEnter}
          onNameTaken={() => setStep({ kind: "name", path: step.path, draft: step.look, takenName: step.look.name })}
        />
      );
  }
}

/** 단계 머리: [← 돌아가기] + "1 / 3 · 이름" + 진행 칸 */
function StepHeader({
  index,
  total,
  label,
  backLabel,
  onBack,
}: {
  index: number;
  total: number;
  label: string;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <div className={styles.stepHeader}>
      <button type="button" className={styles.back} onClick={onBack}>
        ← {backLabel}
      </button>
      <p className={styles.stepLabel}>
        <span aria-hidden="true">
          {index} / {total}
        </span>
        <span className="visually-hidden">
          {total}단계 중 {index}단계,
        </span>{" "}
        · {label}
      </p>
      <span className={styles.progress} aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={styles.progressCell} data-done={i < index} />
        ))}
      </span>
    </div>
  );
}

type DraftProps = { draft: Look; onNext: (look: Look) => void };

/** 새로 시작 ① 이름 */
function NameStep({ draft, takenName, onBack, onNext }: DraftProps & { takenName?: string; onBack: () => void }) {
  const [name, setName] = useState(draft.name);
  const [touched, setTouched] = useState(false);
  const nameId = useId();
  const check = checkName(name);
  // 닉네임 중복: 입력 중 서버에 가볍게 미리 묻는다 (입장하려다 거절된 이름이면 바로 표시)
  const takenNow = useNameTaken(name);
  const taken = takenNow ?? (check.ok && check.name === takenName ? NAME_TAKEN_MESSAGE : null);
  // 첫 글자를 치는 중에는 길이 경고를 띄우지 않는다
  const nameError = (!check.ok && (touched || [...name].length >= 2) ? check.reason : null) ?? taken;

  function next(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (check.ok && !taken) onNext({ ...draft, name: check.name });
  }

  return (
    <form className={styles.form} onSubmit={next} noValidate>
      <StepHeader index={1} total={3} label="이름 정하기" backLabel="처음으로" onBack={onBack} />
      <div className={ui.field}>
        <label htmlFor={nameId} className={ui.label}>
          이름
        </label>
        <div className={styles.nameRow}>
          <span className={styles.avatar}>
            <AvatarSprite color={draft.color} body={draft.body} scale={2} />
          </span>
          <input
            id={nameId}
            className={ui.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="묘지에서 불릴 이름"
            autoComplete="nickname"
            enterKeyHint="next"
            spellCheck={false}
            aria-invalid={nameError !== null}
            aria-describedby={`${nameId}-hint`}
            autoFocus
          />
        </div>
        <p id={`${nameId}-hint`} className={nameError ? ui.error : ui.hint}>
          {nameError ?? "2~12자 · 한글, 영문, 숫자, 공백, _"}
        </p>
      </div>
      <button type="submit" className={cx(ui.button, ui.primary, styles.enter)}>
        다음
      </button>
    </form>
  );
}

/** 새로 시작 ② 캐릭터: 몸 모양·색 */
function LookStep({ draft, onBack, onNext }: DraftProps & { onBack: (draft: Look) => void }) {
  const [color, setColor] = useState(draft.color);
  const [body, setBody] = useState<string>(draft.body ?? AVATAR_BODIES[0].id);
  const look: Look = { name: draft.name, color, body };

  function next(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onNext(look);
  }

  return (
    <form className={styles.form} onSubmit={next} noValidate>
      <StepHeader index={2} total={3} label="캐릭터 고르기" backLabel="이전" onBack={() => onBack(look)} />
      <div className={styles.preview}>
        <AvatarSprite color={color} body={body} scale={4} />
        <span className={styles.lockedName}>{draft.name}</span>
      </div>

      <fieldset className={styles.colors}>
        <legend className={ui.label}>몸 모양</legend>
        <div className={styles.bodies}>
          {/* 처음엔 무료 6종만 (프리미엄 외형은 상점 「염색·외형」에서 선택권으로) */}
          {STARTER_BODIES.map((b) => (
            <label key={b.id} className={styles.bodyOption}>
              <input
                type="radio"
                name="avatar-body"
                className="visually-hidden"
                checked={body === b.id}
                onChange={() => setBody(b.id)}
              />
              <AvatarSprite color={color} body={b.id} scale={2} />
              <span className={styles.bodyLabel}>{b.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.colors}>
        <legend className={ui.label}>아바타 색</legend>
        <div className={styles.swatches}>
          {AVATAR_COLORS.map((c, i) => (
            <label key={c} className={styles.swatch} style={{ "--swatch": c } as CSSProperties}>
              <input
                type="radio"
                name="avatar-color"
                className="visually-hidden"
                checked={color === c}
                onChange={() => setColor(c)}
              />
              <span className="visually-hidden">{COLOR_NAMES[i] ?? `색 ${i + 1}`}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button type="submit" className={cx(ui.button, ui.primary, styles.enter)}>
        다음
      </button>
    </form>
  );
}

type AccountProps = {
  path: AccountPath;
  fallbackName: string;
  onBack: () => void;
  onNext: (look: Look) => void;
  /** 계정에 이름이 없다 → 새로 시작처럼 이름·모습을 정한다 */
  onCustomize: () => void;
  /** 휴면에서 돌아와 닉네임을 다시 정했다 */
  onRenamed: (me: Me) => void;
};

/** 이어서·코드 ① 계정에 저장된 이름·모습을 확인만 한다 */
function AccountStep({ path, fallbackName, onBack, onNext, onCustomize, onRenamed }: AccountProps) {
  // 이어서 들어가기: 이 기기 계정의 저장된 모습 (없으면 이 기기에 남은 이름·색)
  const [account, setAccount] = useState<Me | null>(null);
  const [accountChecked, setAccountChecked] = useState(path.kind !== "continue");
  // 휴면 계정이 닉네임을 다시 정한 뒤의 계정
  const [renamed, setRenamed] = useState<Me | null>(null);

  useEffect(() => {
    if (path.kind !== "continue") return;
    api
      .me()
      .then(setAccount)
      .catch(() => {
        // 쿠키가 없으면 이 기기에 남은 값으로
      })
      .finally(() => setAccountChecked(true));
  }, [path.kind]);

  const current = renamed ?? (path.kind === "code" ? path.me : account);
  const saved = lookOf(current, fallbackName);

  function next(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saved) onNext(saved);
    else onCustomize();
  }

  if (!accountChecked) {
    return (
      <p className={styles.loading} role="status">
        계정을 확인하는 중…
      </p>
    );
  }

  // 휴면(90일 넘게 안 들어옴)에서 돌아왔다: 닉네임을 다시 정해야 들어간다 (포인트·아이템·집·친구는 그대로)
  if (current?.renameRequired) {
    return (
      <DormantRename
        me={current}
        onBack={onBack}
        onDone={(me) => {
          setRenamed(me);
          onRenamed(me);
        }}
      />
    );
  }

  return (
    <form className={styles.form} onSubmit={next} noValidate>
      <StepHeader index={1} total={2} label="계정 확인" backLabel="처음으로" onBack={onBack} />
      {saved ? (
        <div className={styles.profile}>
          <span className={styles.avatar}>
            <AvatarSprite color={avatarColorSpec(saved.color, saved.dye)} body={saved.body} scale={2} />
          </span>
          <span className={styles.profileText}>
            <span className={styles.lockedName}>{saved.name}</span>
            <span className={ui.hint}>계정에 저장된 이름과 모습으로 들어가요.</span>
          </span>
        </div>
      ) : (
        <p className={ui.hint}>이 계정에는 저장된 이름이 없어요. 이름과 모습을 정하고 들어가요.</p>
      )}
      <button type="submit" className={cx(ui.button, ui.primary, styles.enter)}>
        {saved ? "다음" : "이름 정하기"}
      </button>
    </form>
  );
}

/** 휴면 계정 닉네임 다시 정하기. 옛 이름을 기본값으로 채운다 (아직 아무도 안 가져갔으면 그대로 다시 쓸 수 있다) */
function DormantRename({ me, onBack, onDone }: { me: Me; onBack: () => void; onDone: (me: Me) => void }) {
  const [name, setName] = useState(me.name ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const check = checkName(name);
  const taken = useNameTaken(name);
  const nameError = (!check.ok && [...name].length > 0 ? check.reason : null) ?? taken ?? error;
  const color = isAvatarColor(me.color) ? me.color : AVATAR_COLORS[0];
  const body = me.body && isAvatarBody(me.body) ? me.body : undefined;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!check.ok || taken || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await api.claimName(check.name);
      meStore.set(res.me);
      writeItem(LS.name, check.name);
      onDone(res.me);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <StepHeader index={1} total={2} label="닉네임 다시 정하기" backLabel="처음으로" onBack={onBack} />
      <p className={ui.hint} role="status">
        {DORMANT_RENAME_MESSAGE}
      </p>
      <div className={ui.field}>
        <label htmlFor={nameId} className={ui.label}>
          이름
        </label>
        <div className={styles.nameRow}>
          <span className={styles.avatar}>
            <AvatarSprite color={avatarColorSpec(color, me.dye)} body={body} scale={2} />
          </span>
          <input
            id={nameId}
            className={ui.input}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="묘지에서 불릴 이름"
            autoComplete="nickname"
            spellCheck={false}
            aria-invalid={nameError !== null}
            aria-describedby={`${nameId}-hint`}
            autoFocus
          />
        </div>
        <p id={`${nameId}-hint`} className={nameError ? ui.error : ui.hint}>
          {nameError ?? "포인트·아이템·집·친구는 그대로예요. 2~12자 · 한글, 영문, 숫자, 공백, _"}
        </p>
      </div>
      <button type="submit" className={cx(ui.button, ui.primary, styles.enter)} disabled={pending}>
        {pending ? "확인하는 중…" : "이 이름으로 정하기"}
      </button>
    </form>
  );
}

type ChannelProps = {
  path: Path;
  look: Look;
  /** 이름·모습을 직접 정하고 왔다 (3단계 중 3단계) */
  custom: boolean;
  sharedChannel: number | null;
  onBack: () => void;
  onEnter: (choice: EntryChoice) => void;
  /** 들어가려던 이름을 다른 계정이 먼저 쓰고 있다 → 이름 단계로 돌아간다 */
  onNameTaken: () => void;
};

/** ② 채널 목록 → 입장. 세 길이 같은 화면을 쓰고, 버튼 문구만 다르다 */
function ChannelStep({ path, look, custom, sharedChannel, onBack, onEnter, onNameTaken }: ChannelProps) {
  const [channel, setChannel] = useState<ChannelChoice>("auto");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 새로 시작인데 이 기기에 이미 계정이 있으면 새 계정으로 바꾼다. 코드가 없던 계정이면 한 번 묻는다
  const [existing, setExisting] = useState<Me | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);
  // 구글로 새로 만들기: 연결 결과와 새 개인 코드를 보여 준 뒤 들어간다
  const [googleDone, setGoogleDone] = useState<GoogleDone | null>(null);
  const lobby = useLobby();
  // 내 집 채널: 평소 닫혀 있는 채널에 집이 있어도 목록에 보여 준다 (새로 시작이면 집이 없다)
  const houseCh = useMyHouseChannel(path.kind !== "new");

  useEffect(() => {
    if (path.kind !== "new") return;
    api
      .me()
      .then(setExisting)
      .catch(() => {
        // 이 기기에 계정이 없다
      });
  }, [path.kind]);

  // 골라 둔 채널이 그사이 가득 차면 자동 배정으로 되돌린다
  if (typeof channel === "number" && lobby.lobby && !isChannelSelectable(lobby.lobby, channel, [houseCh])) setChannel("auto");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (path.kind === "new" && existing && !existing.hasCode && !confirmFresh) {
      setConfirmFresh(true);
      return;
    }
    // 입장 클릭이 오디오 재생을 허락받는 사용자 제스처다 (await 전에 불러야 한다).
    // 입장 화면의 음악 버튼으로 껐으면 그대로 둔다
    const wasPlaying = bgm.getSnapshot().playing;
    if (!entryMusic.optedOut) bgm.play();
    writeItem(LS.name, look.name);
    writeItem(LS.color, look.color);
    setPending(true);
    setError(null);
    try {
      const fresh = path.kind === "new" && existing !== null;
      await api.startSession(fresh);
      if (fresh) meStore.reset();
      // 닉네임 중복 금지: 계정에 이름이 없으면 이 이름을 먼저 등록한다 (다른 계정이 쓰면 이름 단계로).
      // 이미 이름이 있는 계정이면 그대로 둔다 — 마을에서는 계정 이름으로 보인다
      await api.claimName(look.name).catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.code === "NAME_ALREADY_SET") return;
        throw err;
      });
      if (path.kind === "new" && path.google) {
        // 새 계정에 방금 확인한 구글을 연결한다 (개인 코드가 없으면 서버가 만들어 한 번만 준다). 실패해도 계정은 그대로 쓴다
        let done: GoogleDone;
        try {
          const r = await api.googleClaim();
          meStore.set(r.me);
          if (r.code) saveMyCode(r.me.accountId, r.code);
          done = { code: r.code, error: null };
        } catch (err) {
          done = { code: null, error: errorMessage(err) };
        }
        setGoogleDone(done);
        setPending(false);
        return;
      }
      go();
    } catch (err) {
      if (!wasPlaying) bgm.pause();
      setPending(false);
      if (err instanceof ApiRequestError && err.code === "NAME_TAKEN") {
        onNameTaken();
        return;
      }
      setError(errorMessage(err));
    }
  }

  function go() {
    const target = sharedChannel ?? channel;
    // 들어갈 채널 묘지를 미리 받아 둔다 (자동 배정은 서버와 같은 규칙으로 짐작)
    prefetchGraves(typeof target === "number" ? target : (lobby.lobby && pickChannel(lobby.lobby)) || 1);
    onEnter({ ...look, channel: target });
  }

  if (googleDone) return <GoogleDoneStep done={googleDone} onEnter={go} />;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <StepHeader
        index={custom ? 3 : 2}
        total={custom ? 3 : 2}
        label="채널 고르기"
        backLabel="이전"
        onBack={onBack}
      />
      <div className={styles.profile}>
        <span className={styles.avatar}>
          <AvatarSprite color={avatarColorSpec(look.color, look.dye)} body={look.body} scale={2} />
        </span>
        <span className={styles.lockedName}>{look.name}</span>
      </div>

      {sharedChannel ? (
        <p className={styles.shared}>공유받은 묘비가 있는 {sharedChannel}채널로 들어가요.</p>
      ) : (
        <ChannelPicker lobby={lobby} value={channel} onChange={setChannel} allowAuto houseChannel={houseCh ?? null} />
      )}

      {confirmFresh && (
        <div className={styles.confirm} role="alertdialog" aria-label="새로 시작 확인">
          <p>코드 없이 새로 시작하면 이전 계정({existing?.name ?? "이 기기의 계정"})으로 돌아올 수 없어요.</p>
          <div className={styles.confirmButtons}>
            <button type="submit" className={cx(ui.button, ui.danger)} autoFocus>
              그래도 새로 시작
            </button>
            <button type="button" className={cx(ui.button, ui.quiet)} onClick={onBack}>
              돌아가기
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}

      {!confirmFresh && (
        <button type="submit" className={cx(ui.button, ui.primary, styles.enter)} disabled={pending}>
          {pending ? "문을 여는 중…" : SUBMIT_LABELS[path.kind]}
        </button>
      )}
    </form>
  );
}
