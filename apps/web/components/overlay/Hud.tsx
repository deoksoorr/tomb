"use client";

import type { NetMode } from "@/game/bridge";
import { PHASE_LABELS, WEATHER_LABELS } from "@/lib/ambience";
import { useAmbience } from "@/lib/hooks/useAmbience";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import type { Toast } from "@/lib/hooks/useToasts";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./Hud.module.css";

const MODE_TEXT: Record<Exclude<NetMode, "online">, string> = {
  connecting: "채널에 들어가는 중…",
  reconnecting: "다시 연결하는 중…",
  spectator: "관람 모드",
  replaced: "연결 종료됨",
  offline: "혼자 걷는 중",
};

/** 상단 가운데: 채널·인원, 시간대·날씨, 연결 상태 안내, 토스트 */
export default function Hud({ toasts, onOpenChannels }: { toasts: Toast[]; onOpenChannels: () => void }) {
  const status = useBridgeValue("net:status");
  const ambience = useAmbience();
  const mode = status?.mode ?? "connecting";
  const channel = status?.channel ?? null;

  return (
    <div className={styles.hud}>
      <div className={styles.row}>
        {mode === "online" && channel !== null ? (
          <button type="button" className={cx(ui.button, styles.pill)} onClick={onOpenChannels} aria-haspopup="dialog">
            <span className={styles.live} aria-hidden="true" />
            {channel}채널 · {status?.count}/{status?.cap}명<span className="visually-hidden">, 채널 이동</span>
          </button>
        ) : (
          <span className={styles.pill} data-mode={mode} role="status">
            {mode === "reconnecting" && channel !== null && `${channel}채널 · `}
            {MODE_TEXT[mode === "online" ? "connecting" : mode]}
          </span>
        )}
        {ambience && (
          <span className={styles.ambience} title="한국 시간 기준">
            {PHASE_LABELS[ambience.phase]} · {WEATHER_LABELS[ambience.weather]}
          </span>
        )}
      </div>

      {mode === "spectator" && (
        <p className={styles.banner} role="status">
          지금 묘지가 붐벼요. 자리가 나면 자동으로 합류합니다.
        </p>
      )}
      {mode === "replaced" && (
        <div className={styles.banner} role="alert">
          <p>다른 탭에서 입장해서 이 탭의 연결이 종료됐어요</p>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => window.location.reload()}>
            이 탭에서 다시 들어가기
          </button>
        </div>
      )}
      {mode === "offline" && <p className={styles.note}>실시간 서버에 닿지 않아 혼자 걷고 있어요.</p>}

      <ol className={styles.toasts} aria-live="polite">
        {toasts.map((t) => (
          <li key={t.id} className={styles.toast}>
            {t.message}
          </li>
        ))}
      </ol>
    </div>
  );
}
