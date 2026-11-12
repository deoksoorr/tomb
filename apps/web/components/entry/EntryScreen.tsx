"use client";

import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import {
  AVATAR_BODIES,
  AVATAR_COLORS,
  checkName,
  isAvatarBody,
  isAvatarColor,
  pickChannel,
  type AvatarDye,
} from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { useAmbience } from "@/lib/hooks/useAmbience";
import { prefetchGraves } from "@/lib/hooks/useGraves";
import { isChannelSelectable, useLobby } from "@/lib/hooks/useLobby";
import { useHydrated } from "@/lib/hooks/useMedia";
import { meStore } from "@/lib/hooks/useMe";
import { useNotices } from "@/lib/hooks/useNotices";
import { readItem, writeItem } from "@/lib/storage";
import { LS, type Me } from "@/lib/types";
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
  /** 공유 링크로 온 묘비: 그 묘비가 있는 채널로 들어간다 */
  focusGraveId: string | null;
  /** 입장 버튼을 눌러 게임이 뜨는 중 */
  entering: boolean;
  /** 게임이 제때 뜨지 않음 → 새로고침 안내 */
  stalled: boolean;
  onEnter: (choice: EntryChoice) => void;
};

export default function EntryScreen({ start, focusGraveId, entering, stalled, onEnter }: Props) {
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
        {/* 이름·색은 localStorage에 있으므로 하이드레이션 뒤에 그린다 */}
        {hydrated && !entering ? (
          <>
            <EntryFlow start={start} focusGraveId={focusGraveId} onEnter={onEnter} />
            <p className={styles.legal}>
              <Link href="/privacy">개인정보처리방침</Link> · <Link href="/terms">이용약관</Link>
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

/** 어떤 길로 들어왔나: 새로 시작 / 이어서 들어가기 / 코드로 시작(확인된 계정) */
type Path = { kind: "new" } | { kind: "continue" } | { kind: "code"; me: Me };
/** 들어갈 때의 모습 */
/** dye = 46번 계정에 남은 염색 (미리보기 그림에만 쓴다 — color는 입장 요청에 그대로 가는 프리셋 색) */
type Look = { name: string; color: string; body: string | undefined; dye?: AvatarDye };
type AccountPath = Exclude<Path, { kind: "new" }>;
type Step =
  | { kind: "choose" }
  | { kind: "code" }
  /** 새로 시작 ① 이름 → ② 캐릭터(몸 모양·색) → ③ 채널. 계정에 이름이 없는 이어서·코드도 이 길로 */
  | { kind: "name"; path: Path; draft: Look }
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
function EntryFlow({ start, focusGraveId, onEnter }: Omit<Props, "entering" | "stalled">) {
  const [savedName] = useState(() => readItem(LS.name) ?? "");
  const previous = checkName(savedName).ok ? savedName : null;
  const [step, setStep] = useState<Step>(() =>
    start === "continue" && previous ? { kind: "account", path: { kind: "continue" } } : { kind: "choose" },
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
    case "name":
      return (
        <NameStep
          draft={step.draft}
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
function NameStep({ draft, onBack, onNext }: DraftProps & { onBack: () => void }) {
  const [name, setName] = useState(draft.name);
  const [touched, setTouched] = useState(false);
  const nameId = useId();
  const check = checkName(name);
  // 첫 글자를 치는 중에는 길이 경고를 띄우지 않는다
  const nameError = !check.ok && (touched || [...name].length >= 2) ? check.reason : null;

  function next(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (check.ok) onNext({ ...draft, name: check.name });
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
          {AVATAR_BODIES.map((b) => (
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
};

/** 이어서·코드 ① 계정에 저장된 이름·모습을 확인만 한다 */
function AccountStep({ path, fallbackName, onBack, onNext, onCustomize }: AccountProps) {
  // 이어서 들어가기: 이 기기 계정의 저장된 모습 (없으면 이 기기에 남은 이름·색)
  const [account, setAccount] = useState<Me | null>(null);
  const [accountChecked, setAccountChecked] = useState(path.kind !== "continue");

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

  const saved = lookOf(path.kind === "code" ? path.me : account, fallbackName);

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

type ChannelProps = {
  path: Path;
  look: Look;
  /** 이름·모습을 직접 정하고 왔다 (3단계 중 3단계) */
  custom: boolean;
  sharedChannel: number | null;
  onBack: () => void;
  onEnter: (choice: EntryChoice) => void;
};

/** ② 채널 목록 → 입장. 세 길이 같은 화면을 쓰고, 버튼 문구만 다르다 */
function ChannelStep({ path, look, custom, sharedChannel, onBack, onEnter }: ChannelProps) {
  const [channel, setChannel] = useState<ChannelChoice>("auto");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 새로 시작인데 이 기기에 이미 계정이 있으면 새 계정으로 바꾼다. 코드가 없던 계정이면 한 번 묻는다
  const [existing, setExisting] = useState<Me | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const lobby = useLobby();

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
  if (typeof channel === "number" && lobby.lobby && !isChannelSelectable(lobby.lobby, channel)) setChannel("auto");

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
      const target = sharedChannel ?? channel;
      // 들어갈 채널 묘지를 미리 받아 둔다 (자동 배정은 서버와 같은 규칙으로 짐작)
      prefetchGraves(typeof target === "number" ? target : (lobby.lobby && pickChannel(lobby.lobby)) || 1);
      onEnter({ ...look, channel: target });
    } catch (err) {
      if (!wasPlaying) bgm.pause();
      setError(errorMessage(err));
      setPending(false);
    }
  }

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
        <ChannelPicker lobby={lobby} value={channel} onChange={setChannel} allowAuto />
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
