"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { chatChime } from "@/lib/chatChime";
import { deviceSettings } from "@/lib/deviceSettings";
import { useMe } from "@/lib/hooks/useMe";
import { soundMix, type SoundBus } from "@/lib/soundMix";
import { forgetMyCode, readMyCode } from "@/lib/storage";
import { useGoogleStatus } from "../account/GoogleSection";
import { bgm, INITIAL_BGM_STATE } from "../bgm/engine";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./SettingsDialog.module.css";

type Props = {
  /** 접속 종료: 게임을 내리고 입장 화면으로 (로그인은 그대로 — 실시간 연결이 닫혀 채널 인원에서 바로 빠진다) */
  onLeave: () => void;
  /** 로그아웃이 끝났다: 게임을 내리고 입장 첫 화면으로 */
  onLoggedOut: () => void;
  /** 개인 코드 만들기 (내 정보 창) */
  onOpenMe: () => void;
  onClose: () => void;
};

type Ending = "leave" | "logout" | null;

const MASKED_CODE = "••••-••••-••••";

/**
 * 11/26 설정 (PC: 창이 없을 때 Esc·메뉴 ⚙ 설정 · 터치: 위쪽 줄 ⚙ 단추). 이 기기에만 저장한다 (lib/deviceSettings · 소리는 예전 소리 설정 그대로).
 * 화면(날씨 효과·절전 모드) → 소리(배경음악·환경음·효과음·채팅 알림음) → 접속 종료·로그아웃 (내 정보와 같은 흐름 — 로그아웃 전에 개인 코드를 먼저 보여 준다)
 */
export default function SettingsDialog({ onLeave, onLoggedOut, onOpenMe, onClose }: Props) {
  const settings = useSyncExternalStore(deviceSettings.subscribe, deviceSettings.getSnapshot, deviceSettings.getServerSnapshot);
  const [ending, setEnding] = useState<Ending>(null);

  return (
    <Dialog title="설정" onClose={onClose} fitHeight phoneCard className={styles.dialog}>
      <div className={styles.panel}>
        <section className={styles.section} aria-label="화면">
          <Toggle
            label="날씨 효과"
            desc="끄면 비·눈·안개·낙엽을 그리지 않아요."
            on={settings.weather}
            onChange={(v) => deviceSettings.set({ weather: v })}
            name="weather"
          />
          <Toggle
            label="절전 모드"
            desc="가만히 있을 때 화면을 덜 자주 그리고 눈·비·반짝임·밤 불빛을 줄여요. 기기가 뜨거워지면 켜 보세요."
            on={settings.powerSave}
            onChange={(v) => deviceSettings.set({ powerSave: v })}
            name="powerSave"
          />
        </section>

        <SoundSection />

        <section className={styles.section} aria-label="접속">
          {ending === "leave" ? (
            <div className={styles.confirm}>
              <p>마을을 떠날까요? 로그인은 그대로예요.</p>
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
            <LogoutConfirm onLoggedOut={onLoggedOut} onOpenMe={onOpenMe} onCancel={() => setEnding(null)} />
          ) : (
            <div className={styles.endButtons}>
              <button type="button" className={cx(ui.button, styles.end)} onClick={() => setEnding("leave")}>
                접속 종료
              </button>
              <button type="button" className={cx(ui.button, styles.end)} onClick={() => setEnding("logout")}>
                로그아웃
              </button>
            </div>
          )}
        </section>
      </div>
    </Dialog>
  );
}

/** 켜기·끄기 한 줄 (이름 · 설명 · 오른쪽 스위치) */
function Toggle({ label, desc, on, onChange, name }: { label: string; desc: ReactNode; on: boolean; onChange: (v: boolean) => void; name: string }) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleText}>
        <span className={styles.label}>{label}</span>
        <span className={styles.desc}>{desc}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={cx(ui.button, styles.switch, on && ui.primary)}
        onClick={() => onChange(!on)}
        data-setting={name}
      >
        {on ? "켜짐" : "꺼짐"}
      </button>
    </div>
  );
}

/** 소리 갈래: [버스, 이름] (BgmPlayer와 같은 저장값) */
const BUSES: readonly [SoundBus, string][] = [
  ["amb", "환경음"],
  ["sfx", "효과음"],
];

/** 소리: 배경음악(BgmPlayer 엔진)·환경음·효과음(lib/soundMix)·채팅 알림음 — 왼쪽 위 음악 단추 안 설정과 같은 값 */
function SoundSection() {
  const music = useSyncExternalStore(bgm.subscribe, bgm.getSnapshot, () => INITIAL_BGM_STATE);
  const mix = useSyncExternalStore(soundMix.subscribe, soundMix.getSnapshot, soundMix.getServerSnapshot);
  const chime = useSyncExternalStore(chatChime.subscribe, chatChime.getSnapshot, chatChime.getServerSnapshot);
  const row = (key: string, label: string, muted: boolean, volume: number, onMute: () => void, onVolume: (v: number) => void) => (
    <div key={key} className={styles.soundRow}>
      <span className={styles.soundLabel}>{label}</span>
      <button type="button" className={cx(ui.button, ui.quiet, ui.icon, styles.mute)} onClick={onMute} aria-pressed={muted} aria-label={`${label} 끄기`}>
        <PixelIcon name={muted ? "mute" : "sound"} />
      </button>
      <input
        type="range"
        className={styles.volume}
        min={0}
        max={100}
        value={muted ? 0 : Math.round(volume * 100)}
        onChange={(e) => onVolume(Number(e.target.value) / 100)}
        aria-label={`${label} 볼륨`}
      />
    </div>
  );
  return (
    <section className={styles.section} aria-label="소리">
      <div className={styles.sound}>
        {row("bgm", "배경음악", music.muted, music.volume, () => bgm.toggleMute(), (v) => bgm.setVolume(v))}
        {BUSES.map(([bus, label]) =>
          row(
            bus,
            label,
            mix[bus].muted,
            mix[bus].volume,
            () => soundMix.set(bus, { muted: !mix[bus].muted }),
            (v) => soundMix.set(bus, { volume: v, muted: false }),
          ),
        )}
        <div className={styles.soundRow}>
          <span className={cx(styles.soundLabel, styles.grow)}>채팅 알림음</span>
          <button type="button" className={cx(ui.button, ui.quiet, ui.icon, styles.mute)} onClick={() => chatChime.set(!chime)} aria-pressed={chime} aria-label="채팅 알림음 켜기">
            <PixelIcon name={chime ? "sound" : "mute"} />
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * 로그아웃 확인: 이 기기에 저장된 개인 코드를 먼저 보여 준다 (가림·보기·복사). 코드도 구글도 없으면 다시 들어올 길이 없다는 경고와 [개인 코드 만들기](내 정보).
 * 로그아웃 자체는 내 정보와 같다 (서버 로그아웃 → 이 기기 코드 지우기 → 입장 첫 화면)
 */
function LogoutConfirm({ onLoggedOut, onOpenMe, onCancel }: { onLoggedOut: () => void; onOpenMe: () => void; onCancel: () => void }) {
  const { me } = useMe();
  const [google] = useGoogleStatus();
  const [code] = useState<string | null>(() => (me ? readMyCode(me.accountId) : null));
  const [shown, setShown] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const googleLinked = !!google?.linked;
  const hasCode = !!me?.hasCode || code !== null;
  // 코드도 구글도 없으면 로그아웃 뒤 다시 들어올 길이 없다 (구글 상태를 아직 모르면 경고하지 않고 기다린다)
  const noWayBack = !!me && google !== undefined && !hasCode && !googleLinked;

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

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("복사했어요. 안전한 곳에 적어 두세요.");
    } catch {
      setNotice("복사가 안 되면 [보기]를 누르고 직접 적어 두세요.");
    }
  }

  return (
    <div className={styles.confirm}>
      {code ? (
        <>
          <p>로그아웃하면 이 기기에 저장된 코드도 지워져요. 먼저 적어 두세요.</p>
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
        </>
      ) : noWayBack ? (
        <p className={styles.warn}>개인 코드도 구글 연결도 없어요. 로그아웃하면 이 계정으로 다시 들어올 수 없어요.</p>
      ) : googleLinked ? (
        <p>로그아웃할까요? 다음에는 구글 계정으로 들어오면 돼요.</p>
      ) : hasCode ? (
        <p>이 기기에는 저장된 코드가 없어요. 코드를 적어 두었는지 확인하고 로그아웃하세요.</p>
      ) : (
        <p>로그아웃할까요?</p>
      )}
      <div className={styles.confirmButtons}>
        {noWayBack && (
          <button type="button" className={cx(ui.button, ui.primary)} onClick={onOpenMe} autoFocus>
            개인 코드 만들기
          </button>
        )}
        <button type="button" className={cx(ui.button, ui.danger)} onClick={logout} disabled={pending || !me}>
          {pending ? "로그아웃하는 중…" : noWayBack ? "그래도 로그아웃" : "로그아웃"}
        </button>
        <button type="button" className={cx(ui.button, ui.quiet)} onClick={onCancel}>
          그만두기
        </button>
      </div>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
