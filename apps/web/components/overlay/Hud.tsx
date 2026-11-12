"use client";

import type { QueueStatus } from "@tomb/protocol";
import { bridge, type NetMode } from "@/game/bridge";
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
  queue: "대기 중",
  replaced: "연결 끊김",
  offline: "연결 끊김",
};

export function queueText(status: QueueStatus | undefined): string {
  if (status?.state === "waiting") {
    return `지금 묘지가 꽉 찼어요 · 대기 ${status.position}번째 (앞에 ${status.position - 1}명) — 자리가 나면 자동으로 들어가요`;
  }
  if (status?.state === "admitted") return "자리가 났어요. 곧 들어가요…";
  return "지금 묘지가 꽉 찼어요 — 자리가 나면 자동으로 들어가요";
}

/** 상단 가운데: 채널·인원, 시간대·날씨. compact(터치 화면 위 가장자리 바)는 작은 한 줄 */
export default function Hud({ onOpenChannels, compact = false }: { onOpenChannels: () => void; compact?: boolean }) {
  const status = useBridgeValue("net:status");
  const ambience = useAmbience();
  const mode = status?.mode ?? "connecting";
  const channel = status?.channel ?? null;

  if (compact) {
    const where =
      mode === "online" && channel !== null
        ? `${channel}채널 ${status?.count}/${status?.cap}`
        : MODE_TEXT[mode === "online" ? "connecting" : mode];
    const sky = ambience ? ` · ${PHASE_LABELS[ambience.phase]}·${WEATHER_LABELS[ambience.weather]}` : "";
    return mode === "online" && channel !== null ? (
      <button type="button" className={cx(ui.top, styles.line)} onClick={onOpenChannels} aria-haspopup="dialog">
        <span className={styles.live} aria-hidden="true" />
        <span className={styles.lineText}>
          {where}
          {sky}
        </span>
        <span className="visually-hidden">, 채널 이동</span>
      </button>
    ) : (
      <span className={cx(ui.top, styles.line)} data-mode={mode} role="status">
        <span className={styles.lineText}>
          {where}
          {sky}
        </span>
      </span>
    );
  }

  return (
    <div className={styles.hud}>
      <div className={styles.row}>
        {mode === "online" && channel !== null ? (
          <button type="button" className={cx(ui.button, ui.top, styles.pill)} onClick={onOpenChannels} aria-haspopup="dialog">
            <span className={styles.live} aria-hidden="true" />
            {channel}채널 · {status?.count}/{status?.cap}명<span className="visually-hidden">, 채널 이동</span>
          </button>
        ) : (
          <span className={cx(ui.top, styles.pill)} data-mode={mode} role="status">
            {mode === "reconnecting" && channel !== null && `${channel}채널 · `}
            {MODE_TEXT[mode === "online" ? "connecting" : mode]}
          </span>
        )}
        {ambience && (
          <span className={cx(ui.top, styles.ambience)} title="한국 시간 기준">
            {PHASE_LABELS[ambience.phase]} · {WEATHER_LABELS[ambience.weather]}
          </span>
        )}
      </div>
    </div>
  );
}

/** 알림. 위쪽에 두면 스폰 자리(맵 위 끝)에 선 내 캐릭터 이름표를 가리므로 아래 안내 줄에 쌓는다 */
export function ToastList({ toasts }: { toasts: Toast[] }) {
  return (
    <ol className={styles.toasts} aria-live="polite">
      {toasts.map((t) => (
        <li key={t.id} className={styles.toast}>
          {t.message}
        </li>
      ))}
    </ol>
  );
}

/**
 * 대기열·관람·연결 끊김 안내. 위쪽에 두면 맵 위 끝(스폰)에 선 내 캐릭터의 이름표를 가리므로
 * 아래쪽 버튼 줄 바로 위에 띄운다 (GameShell이 자리를 잡는다).
 */
export function StatusBanners() {
  const status = useBridgeValue("net:status");
  const queue = useBridgeValue("queue:status");
  const mode = status?.mode;

  if (mode === "queue") {
    return (
      <p className={styles.banner} role="status">
        {queueText(queue)}
      </p>
    );
  }
  if (mode === "spectator") {
    return (
      <p className={styles.banner} role="status">
        지금 묘지가 붐벼요. 자리가 나면 자동으로 합류합니다.
      </p>
    );
  }
  if (mode === "replaced" || mode === "offline") {
    return (
      <div className={cx(styles.banner, styles.disconnected)} role="alert">
        <p>{mode === "replaced" ? "다른 곳에서 입장해서 이 탭은 연결이 끊겼어요" : "이 탭은 연결이 끊겼어요"}</p>
        <button type="button" className={cx(ui.button, ui.primary)} onClick={() => bridge.emit("net:reconnect")}>
          여기서 다시 접속
        </button>
      </div>
    );
  }
  return null;
}
