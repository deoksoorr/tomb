"use client";

import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react";
import {
  AVATAR_BODIES,
  AVATAR_COLORS,
  checkName,
  isAvatarBody,
  isAvatarColor,
  pickChannel,
  type AvatarBody,
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
import AvatarSprite from "./AvatarSprite";
import ChannelPicker, { type ChannelChoice } from "./ChannelPicker";
import CodeStart from "./CodeStart";
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
  return (
    <main className={styles.screen}>
      <NightSky ambience={ambience} />
      <div className={styles.content}>
        <h1 className={styles.title}>한때는...</h1>
        <p className={styles.subtitle}>수많은 시작이 여기 잠들어 있습니다.</p>
        {/* 이름·색은 localStorage에 있으므로 하이드레이션 뒤에 그린다 */}
        {hydrated && !entering ? (
          <EntryFlow start={start} focusGraveId={focusGraveId} onEnter={onEnter} />
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

type Step = { kind: "choose" } | { kind: "new" } | { kind: "continue" } | { kind: "code"; me: Me | null };

/** 처음 고르기 → 새로 시작 / 코드로 시작 / 이 기기 계정으로 이어서 */
function EntryFlow({ start, focusGraveId, onEnter }: Omit<Props, "entering" | "stalled">) {
  const [savedName] = useState(() => readItem(LS.name) ?? "");
  const previous = checkName(savedName).ok ? savedName : null;
  const [step, setStep] = useState<Step>(() =>
    start === "continue" && previous ? { kind: "continue" } : { kind: "choose" },
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

  if (step.kind === "choose") {
    return (
      <div className={styles.choose}>
        {latest && (
          <button type="button" className={styles.notice} onClick={() => setNoticesOpen(true)}>
            <span className={styles.noticeTag}>공지</span>
            <span className={styles.noticeTitle}>{latest.title}</span>
          </button>
        )}
        {noticesOpen && <NoticesDialog onClose={() => setNoticesOpen(false)} />}
        <button type="button" className={cx(ui.button, ui.primary, styles.big)} onClick={() => setStep({ kind: "new" })}>
          새로 시작
          <span className={styles.bigSub}>이름을 정하고 처음 들어가요</span>
        </button>
        <button type="button" className={cx(ui.button, styles.big)} onClick={() => setStep({ kind: "code", me: null })}>
          코드로 시작
          <span className={styles.bigSub}>다른 기기에서 쓰던 계정으로</span>
        </button>
        {previous && (
          <button type="button" className={styles.continue} onClick={() => setStep({ kind: "continue" })}>
            {previous}(으)로 이어서 들어가기
          </button>
        )}
      </div>
    );
  }

  if (step.kind === "code" && !step.me) {
    return <CodeStart onLogin={(me) => setStep({ kind: "code", me })} onBack={back} />;
  }

  return (
    <EntryForm
      key={step.kind}
      mode={step.kind === "code" ? { kind: "code", me: step.me as Me } : step}
      initialName={step.kind === "continue" ? (previous ?? "") : ""}
      sharedChannel={sharedChannel}
      onBack={back}
      onEnter={onEnter}
    />
  );
}

type FormMode = { kind: "new" } | { kind: "continue" } | { kind: "code"; me: Me };

const SUBMIT_LABELS: Record<FormMode["kind"], string> = {
  new: "입장하기",
  continue: "다시 들어가기",
  code: "채널을 선택해서 접속하기",
};

/** 계정에 저장된 모습 (코드로 시작·이어서 들어가기에서는 바꾸지 않고 채널만 고른다) */
type Profile = { name: string; color: string; body: string | undefined };

function profileOf(me: Pick<Me, "name" | "color" | "body"> | null, fallbackName: string): Profile | null {
  const name = me?.name ?? fallbackName;
  if (!checkName(name).ok) return null;
  const saved = readItem(LS.color);
  const color = isAvatarColor(me?.color) ? me.color : isAvatarColor(saved) ? saved : AVATAR_COLORS[0];
  return { name, color, body: me?.body && isAvatarBody(me.body) ? me.body : undefined };
}

type FormProps = {
  mode: FormMode;
  initialName: string;
  sharedChannel: number | null;
  onBack: () => void;
  onEnter: (choice: EntryChoice) => void;
};

/** 새로 시작: 닉네임·색·몸 모양·채널. 코드로 시작·이어서: 저장된 모습 그대로 채널만 */
function EntryForm({ mode, initialName, sharedChannel, onBack, onEnter }: FormProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string>(() => {
    const saved = readItem(LS.color);
    return isAvatarColor(saved) ? saved : AVATAR_COLORS[0];
  });
  const [body, setBody] = useState<AvatarBody>(AVATAR_BODIES[0].id);
  const [channel, setChannel] = useState<ChannelChoice>("auto");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 이 기기에 이미 있는 계정 (새로 시작: 새 계정으로 바꿀지 판단 / 이어서: 저장된 모습)
  const [existing, setExisting] = useState<Me | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const lobby = useLobby();
  const nameId = useId();

  useEffect(() => {
    if (mode.kind === "code") return;
    api
      .me()
      .then(setExisting)
      .catch(() => {
        // 이 기기에 계정이 없다
      });
  }, [mode.kind]);

  // 골라 둔 채널이 그사이 가득 차면 자동 배정으로 되돌린다
  if (typeof channel === "number" && lobby.lobby && !isChannelSelectable(lobby.lobby, channel)) setChannel("auto");

  const profile =
    mode.kind === "code" ? profileOf(mode.me, initialName) : mode.kind === "continue" ? profileOf(existing, initialName) : null;
  const check = checkName(profile?.name ?? name);
  // 첫 글자를 치는 중에는 길이 경고를 띄우지 않는다
  const nameError = !profile && !check.ok && (touched || [...name].length >= 2) ? check.reason : null;
  const needsFreshConfirm = mode.kind === "new" && existing !== null && !existing.hasCode;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!check.ok || pending) return;
    if (needsFreshConfirm && !confirmFresh) {
      setConfirmFresh(true);
      return;
    }
    const look = profile ?? { name: check.name, color, body };
    // 입장 클릭이 오디오 재생을 허락받는 사용자 제스처다 (await 전에 불러야 한다)
    bgm.play();
    writeItem(LS.name, check.name);
    writeItem(LS.color, look.color);
    setPending(true);
    setError(null);
    try {
      const fresh = mode.kind === "new" && existing !== null;
      await api.startSession(fresh);
      if (fresh) meStore.reset();
      const target = sharedChannel ?? channel;
      // 들어갈 채널 묘지를 미리 받아 둔다 (자동 배정은 서버와 같은 규칙으로 짐작)
      prefetchGraves(typeof target === "number" ? target : (lobby.lobby && pickChannel(lobby.lobby)) || 1);
      onEnter({ name: check.name, color: look.color, body: look.body, channel: target });
    } catch (err) {
      bgm.pause();
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <button type="button" className={styles.back} onClick={onBack}>
        ← 처음으로
      </button>

      {profile ? (
        <div className={styles.profile}>
          <span className={styles.avatar}>
            <AvatarSprite color={profile.color} body={profile.body} scale={2} />
          </span>
          <span className={styles.profileText}>
            <span className={styles.lockedName}>{profile.name}</span>
            <span className={ui.hint}>계정에 저장된 이름과 모습으로 들어가요.</span>
          </span>
        </div>
      ) : (
        <>
          <div className={ui.field}>
            <label htmlFor={nameId} className={ui.label}>
              이름
            </label>
            <div className={styles.nameRow}>
              <span className={styles.avatar}>
                <AvatarSprite color={color} body={body} scale={2} />
              </span>
              <input
                id={nameId}
                className={ui.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="묘지에서 불릴 이름"
                autoComplete="nickname"
                enterKeyHint="go"
                spellCheck={false}
                aria-invalid={nameError !== null}
                aria-describedby={`${nameId}-hint`}
              />
            </div>
            <p id={`${nameId}-hint`} className={nameError ? ui.error : ui.hint}>
              {nameError ?? "2~12자 · 한글, 영문, 숫자, 공백, _"}
            </p>
          </div>

          {mode.kind === "new" && (
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
                    <AvatarSprite color={color} body={b.id} scale={3} />
                    <span className={styles.bodyLabel}>{b.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

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
        </>
      )}

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
          {pending ? "문을 여는 중…" : SUBMIT_LABELS[mode.kind]}
        </button>
      )}
    </form>
  );
}
