"use client";

import { channelStatus, type ChannelStatus } from "@tomb/protocol";
import { visibleChannels, type LobbyState } from "@/lib/hooks/useLobby";
import styles from "./ChannelPicker.module.css";

export type ChannelChoice = number | "auto";

type Props = {
  lobby: LobbyState;
  value: ChannelChoice | null;
  onChange: (value: ChannelChoice) => void;
  /** 입장 화면에만 "자동 배정"이 있다 */
  allowAuto: boolean;
  /** 지금 들어와 있는 채널 (이동 메뉴에서 고를 수 없게) */
  currentChannel?: number | null;
  /** 내 집이 있는 채널: 평소 닫혀 있는 채널이어도 목록에 보이고 "내 집"으로 표시한다 */
  houseChannel?: number | null;
};

const STATUS_TEXT: Record<ChannelStatus, string> = { ok: "여유", busy: "혼잡", full: "만석" };

export default function ChannelPicker({ lobby, value, onChange, allowAuto, currentChannel = null, houseChannel = null }: Props) {
  // 평소에는 채널 몇 개만 열려 있다 (붐비면 자동으로 더 열린다). 내 집·지금 채널은 닫혀 있어도 보여 준다
  const channels = visibleChannels(lobby.lobby, [currentChannel, houseChannel]);
  const threshold = lobby.lobby?.threshold;

  return (
    <fieldset className={styles.picker}>
      <legend className={styles.legend}>
        <span>채널</span>
        {lobby.lobby && <span className={styles.total}>현재 접속 {lobby.lobby.total}명</span>}
      </legend>

      {lobby.status === "loading" && !lobby.lobby && <p className={styles.note}>채널 목록을 불러오는 중…</p>}
      {lobby.status === "unreachable" && (
        <p className={styles.note}>
          지금은 채널 정보를 불러오지 못했어요.
          {allowAuto ? " 그래도 들어갈 수 있어요. 자리가 나는 대로 이어 드릴게요." : " 잠시 후 다시 열어 주세요."}
        </p>
      )}

      <div className={styles.options}>
        {allowAuto && (
          <label className={styles.option}>
            <input
              type="radio"
              name="channel"
              className="visually-hidden"
              checked={value === "auto"}
              onChange={() => onChange("auto")}
            />
            <span className={styles.dot} data-status="auto" aria-hidden="true" />
            <span className={styles.name}>자동 배정</span>
            <span className={styles.meta}>알맞은 채널로</span>
          </label>
        )}
        {channels.map((ch) => {
          const status = channelStatus(ch, threshold);
          const here = ch.id === currentChannel;
          return (
            <label key={ch.id} className={styles.option} data-disabled={status === "full" || here}>
              <input
                type="radio"
                name="channel"
                className="visually-hidden"
                checked={value === ch.id}
                disabled={status === "full" || here}
                onChange={() => onChange(ch.id)}
              />
              <span className={styles.dot} data-status={status} aria-hidden="true" />
              <span className={styles.name}>
                {ch.id}채널 ({ch.count}/{ch.cap})
              </span>
              <span className={styles.meta}>
                {here ? "지금 여기" : STATUS_TEXT[status]}
                {ch.id === houseChannel && " · 내 집"}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
