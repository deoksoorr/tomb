"use client";

import { useEffect, useState } from "react";
import { MAP_NAME, type QueueStatus } from "@tomb/protocol";
import { onTideShift, tideText } from "@/game/sea/tideClock";
import { bridge, type NetMode } from "@/game/bridge";
import { PHASE_LABELS, WEATHER_LABELS } from "@/lib/ambience";
import { useAmbience } from "@/lib/hooks/useAmbience";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import type { Toast } from "@/lib/hooks/useToasts";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./Hud.module.css";
import PointEventBadge from "./PointEventBadge";

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
    return `지금 마을이 꽉 찼어요. 내 차례는 ${status.position}번째예요. 자리가 나면 저절로 들어가요.`;
  }
  if (status?.state === "admitted") return "자리가 났어요. 곧 들어가요…";
  return "지금 마을이 꽉 찼어요. 자리가 나면 저절로 들어가요.";
}

/** 상단 가운데: 채널·인원, 시간대·날씨 (+ 포인트 2배 이벤트 중이면 그 아래 안내 띠). compact(터치 화면 위 가장자리 바)는 작은 한 줄 */
export default function Hud({ onOpenChannels, compact = false }: { onOpenChannels: () => void; compact?: boolean }) {
  const status = useBridgeValue("net:status");
  const ambience = useAmbience();
  const mode = status?.mode ?? "connecting";
  const channel = status?.channel ?? null;
  // 11/15 캠핑장: 같은 채널을 마을과 나눠 쓴다 → "3채널 캠핑장 · 12/40명" (인원은 맵 상관없이 채널 전체). 11/16 바닷가도 "3채널 바닷가"
  const place = status?.map ? MAP_NAME[status.map] : null;
  // 11/16 바닷가에 있는 동안만 물때 시계
  const tide = useTideText(status?.map === "sea");

  if (compact) {
    const where =
      mode === "online" && channel !== null
        ? place
          ? `${channel}채널 ${place} ${status?.count}/${status?.cap}`
          : `${channel}채널 ${status?.count}/${status?.cap}`
        : MODE_TEXT[mode === "online" ? "connecting" : mode];
    const sky = ambience ? ` · ${PHASE_LABELS[ambience.phase]}·${WEATHER_LABELS[ambience.weather]}` : "";
    const tideLine = tide ? <span className={cx(ui.top, styles.tide, styles.tideCompact)} role="status">{tide}</span> : null;
    // 이벤트 띠는 바 아래에 띄운다 (바의 배치에 끼지 않는다)
    const line = mode === "online" && channel !== null ? (
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
    // 11/16 바닷가 물때 줄과 포인트 이벤트 띠는 바 아래 같은 자리라 한 묶음으로 위아래로 쌓는다 (겹치지 않게)
    return (
      <>
        {line}
        {tideLine ? (
          <div className={styles.compactStack}>
            {tideLine}
            <PointEventBadge compact />
          </div>
        ) : (
          <PointEventBadge compact />
        )}
      </>
    );
  }

  return (
    <div className={styles.hud}>
      <div className={styles.row}>
        {mode === "online" && channel !== null ? (
          <button type="button" className={cx(ui.button, ui.top, styles.pill)} onClick={onOpenChannels} aria-haspopup="dialog">
            <span className={styles.live} aria-hidden="true" />
            {place ? `${channel}채널 ${place} · ${status?.count}/${status?.cap}명` : `${channel}채널 · ${status?.count}/${status?.cap}명`}
            <span className="visually-hidden">, 채널 이동</span>
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
      {/* 11/16 바닷가 물때 시계: 채널 줄 아래 한 줄 (위 줄 단추들과 겹치지 않게) */}
      {tide && (
        <span className={cx(ui.top, styles.tide)} title="물때는 3시간마다 돌아요" role="status">
          {tide}
        </span>
      )}
      <PointEventBadge />
    </div>
  );
}

/** 11/16 바닷가 물때 시계 글 (on일 때만, 20초마다·시험용 물때를 옮기면 바로 다시) */
function useTideText(on: boolean): string | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => tick((n) => n + 1), 20_000);
    const off = onTideShift(() => tick((n) => n + 1));
    return () => {
      clearInterval(id);
      off();
    };
  }, [on]);
  return on ? tideText().text : null;
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
        지금 마을이 붐벼요. 자리가 나면 저절로 들어가요.
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
