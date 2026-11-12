"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
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
    <section className={styles.player} aria-label="배경 음악">
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
            <button
              type="button"
              className={cx(ui.button, ui.quiet, ui.icon)}
              onClick={() => bgm.toggleMute()}
              aria-pressed={state.muted}
              aria-label="음소거"
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
              aria-label="볼륨"
            />
            <button
              type="button"
              className={cx(ui.button, ui.quiet, ui.icon)}
              onClick={() => setCreditsOpen(true)}
              aria-label="음원 정보"
            >
              <PixelIcon name="info" />
            </button>
          </div>
          <p className={styles.now}>{track ? `♪ ${track.title}` : "음원 준비 중 · 지금은 조용히 머물러요"}</p>
        </div>
      )}

      {creditsOpen && <BgmCredits playlists={state.playlists} onClose={() => setCreditsOpen(false)} />}
    </section>
  );
}

/** CC BY 계열만 저작자·출처를 밝힌다. 그 밖의 곡은 제목과 라이선스만 */
function BgmCredits({ playlists, onClose }: { playlists: Playlist[]; onClose: () => void }) {
  const withTracks = playlists.filter((p) => p.tracks.length > 0);
  return (
    <Dialog title="음원 정보" onClose={onClose}>
      {withTracks.length === 0 ? (
        <p className={styles.creditsEmpty}>아직 음원을 준비하고 있어요. 지금은 조용히 머물러 주세요.</p>
      ) : (
        <div className={styles.credits}>
          {withTracks.map((p) => (
            <section key={p.id}>
              <h3 className={styles.creditsHeading}>{p.title}</h3>
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
