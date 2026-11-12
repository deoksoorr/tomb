"use client";

import { useState, type FormEvent } from "react";
import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { isChannelSelectable, useLobby } from "@/lib/hooks/useLobby";
import ChannelPicker, { type ChannelChoice } from "../entry/ChannelPicker";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./ChannelMenu.module.css";

/** 게임 안 채널 이동. 캐릭터 위치는 게임이 유지한다 */
export default function ChannelMenu({ onClose }: { onClose: () => void }) {
  const lobby = useLobby();
  const status = useBridgeValue("net:status");
  const [choice, setChoice] = useState<ChannelChoice | null>(null);

  // 골라 둔 채널이 그사이 가득 차면 선택을 푼다
  if (typeof choice === "number" && lobby.lobby && !isChannelSelectable(lobby.lobby, choice)) setChoice(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (typeof choice !== "number") return;
    bridge.emit("channel:switch", { channel: choice });
    onClose();
  }

  return (
    <Dialog title="채널 이동" onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <ChannelPicker
          lobby={lobby}
          value={choice}
          onChange={setChoice}
          allowAuto={false}
          currentChannel={status?.channel ?? null}
        />
        <button type="submit" className={cx(ui.button, ui.primary)} disabled={typeof choice !== "number"}>
          {typeof choice === "number" ? `${choice}채널로 이동` : "채널을 골라 주세요"}
        </button>
      </form>
    </Dialog>
  );
}
