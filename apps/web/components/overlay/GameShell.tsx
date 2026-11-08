"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { bridge, type GameStartOptions } from "@/game/bridge";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { useGraves } from "@/lib/hooks/useGraves";
import { useGameKeyboardGuard } from "@/lib/hooks/useKeyBlock";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { showToast, useToasts } from "@/lib/hooks/useToasts";
import { readItem, UI_KEYS, writeItem } from "@/lib/storage";
import BgmPlayer from "../bgm/BgmPlayer";
import BuryForm, { type BuryMode } from "../grave/BuryForm";
import GraveModal from "../grave/GraveModal";
import RankingPanel from "../grave/RankingPanel";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import CameraControls from "./CameraControls";
import ChannelMenu from "./ChannelMenu";
import Hud from "./Hud";
import MobileControls from "./MobileControls";
import NetHud from "./NetHud";
import styles from "./GameShell.module.css";

const GameCanvas = dynamic(() => import("@/game/GameCanvas"), { ssr: false });

const CAMERA_HINT = "휠: 확대·축소 · 우클릭 드래그: 둘러보기";

/** 데스크톱에서 처음 입장했을 때 한 번만 시점 조작 힌트를 띄운다 */
function useCameraHint(active: boolean) {
  useEffect(() => {
    if (!active || readItem(UI_KEYS.cameraHintSeen)) return;
    const timer = setTimeout(() => {
      writeItem(UI_KEYS.cameraHintSeen, "1");
      showToast(CAMERA_HINT, 6_000);
    }, 1_500);
    return () => clearTimeout(timer);
  }, [active]);
}

type Props = { options: GameStartOptions; ready: boolean };

export default function GameShell({ options, ready }: Props) {
  const graves = useGraves();
  const [openGraveId, setOpenGraveId] = useState<string | null>(null);
  const [bury, setBury] = useState<BuryMode | null>(null);
  const [channelMenuOpen, setChannelMenuOpen] = useState(false);
  const coarse = useMediaQuery("(pointer: coarse)");
  // 게임이 준비되기 전(접속 중)에 온 토스트도 놓치지 않게 오버레이보다 먼저 구독한다
  const toasts = useToasts();

  useGameKeyboardGuard();
  useCameraHint(ready && !coarse);
  useBridgeEvent("grave:open", ({ graveId }) => setOpenGraveId(graveId));

  function pickFromRanking(graveId: string) {
    bridge.emit("grave:focus", { graveId, teleport: true });
    setOpenGraveId(graveId);
  }

  return (
    <div className={styles.shell}>
      <GameCanvas {...options} />

      {ready && (
        <div className={styles.overlay}>
          <div className={styles.topLeft}>
            <BgmPlayer />
            {options.debug && <NetHud />}
          </div>
          <div className={styles.topCenter}>
            <Hud toasts={toasts} onOpenChannels={() => setChannelMenuOpen(true)} />
          </div>
          <div className={styles.topRight}>
            <RankingPanel graves={graves.graves} reviveTop={graves.reviveTop} onPick={pickFromRanking} />
          </div>
          <CameraControls />
          <button
            type="button"
            className={cx(ui.button, ui.primary, styles.bury)}
            onClick={() => setBury({ kind: "create" })}
          >
            묘비 세우기
          </button>
          {coarse && <MobileControls />}
        </div>
      )}

      {openGraveId && (
        <GraveModal
          key={openGraveId}
          graveId={openGraveId}
          graves={graves}
          onClose={() => setOpenGraveId(null)}
          onEdit={(grave, ownerToken) => setBury({ kind: "edit", grave, ownerToken })}
        />
      )}
      {bury && (
        <BuryForm
          mode={bury}
          mourner={options.name}
          cache={graves.cache}
          graveCount={graves.loaded ? graves.graves.length : null}
          onClose={() => setBury(null)}
        />
      )}
      {channelMenuOpen && <ChannelMenu onClose={() => setChannelMenuOpen(false)} />}
    </div>
  );
}
