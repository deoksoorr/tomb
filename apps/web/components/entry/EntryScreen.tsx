"use client";

import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { AVATAR_COLORS, checkName, isAvatarColor } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { useAmbience } from "@/lib/hooks/useAmbience";
import { isChannelSelectable, useLobby } from "@/lib/hooks/useLobby";
import { useHydrated } from "@/lib/hooks/useMedia";
import { readItem, writeItem } from "@/lib/storage";
import { LS, type Me } from "@/lib/types";
import { bgm } from "../bgm/engine";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import AvatarSprite from "./AvatarSprite";
import ChannelPicker, { type ChannelChoice } from "./ChannelPicker";
import CodeLogin from "./CodeLogin";
import NightSky from "./NightSky";
import styles from "./EntryScreen.module.css";

export type EntryChoice = { name: string; color: string; channel: ChannelChoice };

/** AVATAR_COLORS 순서와 같은 이름 (스크린리더용) */
const COLOR_NAMES = ["뼛빛", "이끼", "새벽안개", "황토", "라벤더", "촛불"];

type Props = {
  /** 입장 버튼을 눌러 게임이 뜨는 중 */
  entering: boolean;
  /** 게임이 제때 뜨지 않음 → 새로고침 안내 */
  stalled: boolean;
  onEnter: (choice: EntryChoice) => void;
};

export default function EntryScreen({ entering, stalled, onEnter }: Props) {
  const hydrated = useHydrated();
  const ambience = useAmbience();
  return (
    <main className={styles.screen}>
      <NightSky ambience={ambience} />
      <div className={styles.content}>
        <h1 className={styles.title}>한때는...</h1>
        <p className={styles.subtitle}>수많은 시작이 여기 잠들어 있습니다.</p>
        {/* 이름·색은 localStorage에 있으므로 하이드레이션 뒤에 폼을 그린다 */}
        {hydrated && !entering ? (
          <EntryForm onEnter={onEnter} />
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

function EntryForm({ onEnter }: { onEnter: (choice: EntryChoice) => void }) {
  const [savedName] = useState(() => readItem(LS.name) ?? "");
  const [name, setName] = useState(savedName);
  const [color, setColor] = useState<string>(() => {
    const saved = readItem(LS.color);
    return isAvatarColor(saved) ? saved : AVATAR_COLORS[0];
  });
  const [channel, setChannel] = useState<ChannelChoice>("auto");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<Me | null>(null);
  const lobby = useLobby();
  const nameId = useId();

  // 골라 둔 채널이 그사이 가득 차면 자동 배정으로 되돌린다
  if (typeof channel === "number" && lobby.lobby && !isChannelSelectable(lobby.lobby, channel)) setChannel("auto");

  const check = checkName(name);
  // 첫 글자를 치는 중에는 길이 경고를 띄우지 않는다
  const nameError = !check.ok && (touched || [...name].length >= 2) ? check.reason : null;
  const returning = checkName(savedName).ok || account !== null;

  /** 개인 코드로 계정을 옮겨 왔으면 그 계정의 마지막 이름을 채운다 */
  function onCodeLogin(me: Me) {
    setAccount(me);
    if (me.name) setName(me.name);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!check.ok || pending) return;
    // 입장 클릭이 오디오 재생을 허락받는 사용자 제스처다 (await 전에 불러야 한다)
    bgm.play();
    writeItem(LS.name, check.name);
    writeItem(LS.color, color);
    setPending(true);
    setError(null);
    try {
      await api.startSession();
      onEnter({ name: check.name, color, channel });
    } catch (err) {
      bgm.pause();
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={ui.field}>
        <label htmlFor={nameId} className={ui.label}>
          이름
        </label>
        <div className={styles.nameRow}>
          <span className={styles.avatar}>
            <AvatarSprite color={color} scale={3} />
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

      <ChannelPicker lobby={lobby} value={channel} onChange={setChannel} allowAuto />

      {account ? (
        <p className={styles.account} role="status">
          계정에 들어왔어요 · {account.points.toLocaleString("ko-KR")} 포인트
        </p>
      ) : (
        <CodeLogin onLogin={onCodeLogin} />
      )}

      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}

      <button type="submit" className={cx(ui.button, ui.primary, styles.enter)} disabled={pending}>
        {pending ? "문을 여는 중…" : returning ? "다시 들어가기" : "입장하기"}
      </button>
    </form>
  );
}
