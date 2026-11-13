"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { chatChime } from "@/lib/chatChime";
import { soundMix, type SoundBus } from "@/lib/soundMix";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { bgm, currentTrack, INITIAL_BGM_STATE } from "./engine";
import { needsAttribution, type Playlist } from "./manifest";
import styles from "./BgmPlayer.module.css";

/**
 * 좌상단 미니 플레이어. 음원이 없으면 무음 자리표시로 동작한다.
 * compact(터치 화면): 음악 아이콘 하나만 두고, 재생·다음 곡은 펼친 패널 안에.
 */
export default function BgmPlayer({ compact = false }: { compact?: boolean }) {
  const state = useSyncExternalStore(bgm.subscribe, bgm.getSnapshot, () => INITIAL_BGM_STATE);
  // 13번: 환경음·효과음 따로 (기기에 저장, 게임에는 audio:mix로)
  const mix = useSyncExternalStore(soundMix.subscribe, soundMix.getSnapshot, soundMix.getServerSnapshot);
  // 다른 사람이 채팅하면 작은 "톡" (효과음 볼륨을 따른다)
  const chime = useSyncExternalStore(chatChime.subscribe, chatChime.getSnapshot, chatChime.getServerSnapshot);
  useEffect(() => {
    if (!bridge.last("audio:mix")) bridge.emit("audio:mix", soundMix.getSnapshot());
  }, []);
  const [expanded, setExpanded] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const track = currentTrack(state);
  const title = track?.title ?? (state.loaded ? "음원 준비 중" : "불러오는 중…");

  const transport = (
    <>
      <button
        type="button"
        className={cx(ui.button, ui.quiet, ui.icon)}
        onClick={() => bgm.toggle()}
        aria-label={state.playing ? "일시정지" : "재생"}
      >
        <PixelIcon name={state.playing ? "pause" : "play"} />
      </button>
      <button
        type="button"
        className={cx(ui.button, ui.quiet, ui.icon)}
        onClick={() => bgm.next()}
        disabled={!track}
        aria-label="다음 곡"
      >
        <PixelIcon name="next" />
      </button>
    </>
  );

  function collapse() {
    setExpanded(false);
    toggleRef.current?.focus();
  }

  return (
    <section className={cx(styles.player, compact && styles.compact)} aria-label="배경 음악">
      <div className={styles.bar}>
        {!compact && transport}
        <button
          ref={toggleRef}
          type="button"
          className={cx(ui.button, ui.quiet, styles.titleButton)}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`음악 설정, 지금: ${title}`}
        >
          <PixelIcon name="note" />
          {!compact && (
            <span className={styles.title} aria-hidden="true">
              {title}
            </span>
          )}
        </button>
      </div>

      {expanded && (
        <div
          id={panelId}
          className={cx(ui.panel, styles.panel)}
          onKeyDown={(e) => {
            if (e.key === "Escape") collapse();
          }}
        >
          {compact && <div className={styles.row}>{transport}</div>}
          <label className={styles.row}>
            <span className={styles.rowLabel}>목록</span>
            <select
              className={cx(ui.input, styles.select)}
              value={state.playlistId}
              onChange={(e) => bgm.setPlaylist(e.target.value)}
            >
              {state.playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.tracks.length === 0 ? " (준비 중)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.row}>
            <span className={styles.busLabel}>배경음악</span>
            <button
              type="button"
              className={cx(ui.button, ui.quiet, ui.icon)}
              onClick={() => bgm.toggleMute()}
              aria-pressed={state.muted}
              aria-label="배경음악 끄기"
            >
              <PixelIcon name={state.muted ? "mute" : "sound"} />
            </button>
            <input
              type="range"
              className={styles.volume}
              min={0}
              max={100}
              value={state.muted ? 0 : Math.round(state.volume * 100)}
              onChange={(e) => bgm.setVolume(Number(e.target.value) / 100)}
              aria-label="배경음악 볼륨"
              data-bus="bgm"
            />
          </div>
          {BUSES.map(([bus, label, hint]) => {
            const b = mix[bus];
            return (
              <div key={bus} className={styles.row} title={hint}>
                <span className={styles.busLabel}>{label}</span>
                <button
                  type="button"
                  className={cx(ui.button, ui.quiet, ui.icon)}
                  onClick={() => soundMix.set(bus, { muted: !b.muted })}
                  aria-pressed={b.muted}
                  aria-label={`${label} 끄기`}
                  data-bus-mute={bus}
                >
                  <PixelIcon name={b.muted ? "mute" : "sound"} />
                </button>
                <input
                  type="range"
                  className={styles.volume}
                  min={0}
                  max={100}
                  value={b.muted ? 0 : Math.round(b.volume * 100)}
                  onChange={(e) => soundMix.set(bus, { volume: Number(e.target.value) / 100, muted: false })}
                  aria-label={`${label} 볼륨`}
                  data-bus={bus}
                />
              </div>
            );
          })}
          <div className={styles.row} title="다른 사람이 채팅하면 작은 소리 (효과음 볼륨을 따라요)">
            <span className={styles.chimeLabel}>채팅 알림음</span>
            <button
              type="button"
              className={cx(ui.button, ui.quiet, ui.icon)}
              onClick={() => chatChime.set(!chime)}
              aria-pressed={chime}
              aria-label="채팅 알림음 켜기"
              data-chat-chime
            >
              <PixelIcon name={chime ? "sound" : "mute"} />
            </button>
          </div>
          <div className={styles.row}>
            <p className={cx(styles.now, styles.grow)}>{track ? `♪ ${track.title}` : "음원 준비 중 · 지금은 조용히 머물러요"}</p>
            <button
              type="button"
              className={cx(ui.button, ui.quiet, ui.icon)}
              onClick={() => setCreditsOpen(true)}
              aria-label="음원 정보"
            >
              <PixelIcon name="info" />
            </button>
          </div>
        </div>
      )}

      {creditsOpen && <BgmCredits playlists={state.playlists} now={track?.title ?? null} onClose={() => setCreditsOpen(false)} />}
    </section>
  );
}

/** 13번 소리 갈래: [버스, 이름, 설명] */
const BUSES: readonly [SoundBus, string, string][] = [
  ["amb", "환경음", "비·천둥·모닥불·물소리"],
  ["sfx", "효과음", "폭죽·종·놀거리·낚시·채집·사냥 등"],
];

/** CC BY 계열만 저작자·출처를 밝힌다. 그 밖의 곡은 제목과 라이선스만 */
function BgmCredits({ playlists, now, onClose }: { playlists: Playlist[]; now: string | null; onClose: () => void }) {
  const withTracks = playlists.filter((p) => p.tracks.length > 0);
  const total = withTracks.reduce((n, p) => n + p.tracks.length, 0);
  return (
    <Dialog title="음원 정보" onClose={onClose}>
      {withTracks.length === 0 ? (
        <p className={styles.creditsEmpty}>아직 음원을 준비하고 있어요. 지금은 조용히 머물러 주세요.</p>
      ) : (
        <div className={styles.credits}>
          <div className={styles.creditsSummary}>
            <p className={styles.creditsNow}>
              <PixelIcon name="note" /> {now ? `지금 재생 중 · ${now}` : "지금은 음악이 멈춰 있어요"}
            </p>
            <p className={styles.creditsMeta}>
              {withTracks.length}개 갈래 · 모두 {total}곡. 왼쪽 위 음악 창에서 갈래를 골라 들을 수 있어요. 저작자 표시가 필요한 곡은 저작자와 출처를 함께
              적었어요.
            </p>
          </div>
          {withTracks.map((p) => (
            <section key={p.id}>
              <h3 className={styles.creditsHeading}>
                {p.title} <span className={styles.creditsMeta}>{p.tracks.length}곡</span>
              </h3>
              <ul className={styles.creditsList}>
                {p.tracks.map((t) => (
                  <li key={t.file}>
                    <span className={styles.creditsTitle}>{t.title}</span>
                    {needsAttribution(t.license) ? (
                      <span className={styles.creditsMeta}>
                        {t.artist} · {t.license}
                        {t.sourceUrl && (
                          <>
                            {" · "}
                            <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer">
                              출처
                            </a>
                          </>
                        )}
                      </span>
                    ) : (
                      <span className={styles.creditsMeta}>{t.license}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}
