"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { bridge, type GameStartOptions } from "@/game/bridge";
import { api } from "@/lib/api";
import { useBridgeEvent, useBridgeValue } from "@/lib/hooks/useBridge";
import { useGraves } from "@/lib/hooks/useGraves";
import { useGameKeyboardGuard } from "@/lib/hooks/useKeyBlock";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { useNewVersion } from "@/lib/hooks/useNewVersion";
import { showToast, useToasts } from "@/lib/hooks/useToasts";
import { readItem, UI_KEYS, writeItem } from "@/lib/storage";
import { restoreLook } from "../account/actions";
import { myGraveEntries, pointsText } from "../account/items";
import MyGraves from "../account/MyGraves";
import MyPanel from "../account/MyPanel";
import BgmPlayer from "../bgm/BgmPlayer";
import BuryForm, { type BuryMode } from "../grave/BuryForm";
import GraveModal from "../grave/GraveModal";
import RankingPanel from "../grave/RankingPanel";
import ShopDialog from "../shop/ShopDialog";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import CameraControls from "./CameraControls";
import ChannelMenu from "./ChannelMenu";
import FireworkButton from "./FireworkButton";
import GuideDialog from "./GuideDialog";
import Hud, { StatusBanners, ToastList } from "./Hud";
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

/** 입장: 내 계정·착용 상태를 불러오고, 월드가 보이면 출석 처리 (하루 1번만 포인트) */
function useAccountOnEnter(ready: boolean) {
  useEffect(() => {
    void meStore.refresh();
    restoreLook().catch(() => {
      // 착용 정보가 없으면 기본 모습
    });
  }, []);
  useEffect(() => {
    if (!ready) return;
    api
      .attend()
      .then(({ me, earned }) => {
        meStore.set(me);
        const points = pointsText(earned);
        if (!points) return;
        const streak = me.attendance.streak > 1 ? ` · ${me.attendance.streak}일 연속` : "";
        showToast(`출석했어요 ${points}${streak}`, 5_000);
      })
      .catch(() => {
        // 출석 실패는 조용히 (다음 입장 때 다시)
      });
  }, [ready]);
}

type Panel = "guide" | "me" | "shop" | "channels" | "graves";
type Props = {
  options: GameStartOptions;
  ready: boolean;
  /** 접속 종료: App이 게임을 내린다 (실시간 연결은 GameCanvas 정리에서 1000으로 닫힌다) */
  onLeave: () => void;
};

export default function GameShell({ options, ready, onLeave }: Props) {
  const graves = useGraves();
  const { me } = useMe();
  const [openGraveId, setOpenGraveId] = useState<string | null>(null);
  const [bury, setBury] = useState<BuryMode | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const coarse = useMediaQuery("(pointer: coarse)");
  // 폰 폭에서는 윗줄에 채널 표시 자리가 없다. 둘째 줄로 내리면 스폰 자리 이름표를 가리므로 아래 안내 줄로 보낸다
  const narrow = useMediaQuery("(max-width: 700px)");
  const status = useBridgeValue("net:status");
  const inShop = useBridgeValue("scene:changed")?.scene === "shop";
  const outdated = useNewVersion();
  // 게임이 준비되기 전(접속 중)에 온 토스트도 놓치지 않게 오버레이보다 먼저 구독한다
  const toasts = useToasts();

  useGameKeyboardGuard();
  useCameraHint(ready && !coarse);
  useAccountOnEnter(ready);
  useBridgeEvent("grave:open", ({ graveId }) => setOpenGraveId(graveId));
  useBridgeEvent("shop:open", () => setPanel("shop"));

  // 게임이 맵에 내 묘비를 표시한다 (sticky)
  const myGraveIds = me?.graves;
  useEffect(() => {
    if (myGraveIds) bridge.emit("graves:mine", { ids: myGraveIds });
  }, [myGraveIds]);

  // ?debug=1 QA용: 콘솔·자동화 스크립트에서 브리지 이벤트를 흉내 낼 수 있게
  useEffect(() => {
    if (!options.debug) return;
    const w = window as unknown as { __tombBridge?: typeof bridge };
    w.__tombBridge = bridge;
    return () => {
      delete w.__tombBridge;
    };
  }, [options.debug]);

  function goToGrave(graveId: string, openModal: boolean) {
    bridge.emit("grave:focus", { graveId, teleport: true });
    setPanel(null);
    if (openModal) setOpenGraveId(graveId);
  }

  /** 내 묘비가 하나뿐이면 바로 그 앞으로, 아니면 목록 */
  function openMyGraves() {
    const mine = me ? myGraveEntries(me.graves, graves.graves) : [];
    if (mine.length === 1) goToGrave(mine[0].grave.id, false);
    else setPanel("graves");
  }

  function startBury() {
    setPanel(null);
    setBury({ kind: "create" });
  }

  function closePanel() {
    if (panel === "shop") bridge.emit("shop:closed");
    setPanel(null);
  }

  const disconnected = status?.mode === "replaced" || status?.mode === "offline";

  return (
    <div className={styles.shell}>
      <GameCanvas {...options} />
      {ready && disconnected && <div className={styles.dim} aria-hidden="true" />}

      {ready && (
        <div className={styles.overlay}>
          <div className={styles.topLeft}>
            <BgmPlayer />
            {options.debug && <NetHud />}
          </div>
          {!narrow && (
            <div className={styles.topCenter}>
              <Hud onOpenChannels={() => setPanel("channels")} />
            </div>
          )}
          <div className={styles.topRight}>
            <button
              type="button"
              className={cx(ui.button, ui.icon, styles.topButton)}
              onClick={() => setPanel("guide")}
              aria-label="안내"
            >
              <PixelIcon name="info" />
            </button>
            <button type="button" className={cx(ui.button, styles.topButton)} onClick={() => setPanel("me")}>
              <PixelIcon name="user" />
              <span className={styles.meLabel}>
                {me ? `${me.points.toLocaleString("ko-KR")}P` : "내 정보"}
                <span className="visually-hidden"> 내 정보</span>
              </span>
            </button>
            <RankingPanel graves={graves.graves} reviveTop={graves.reviveTop} onPick={(id) => goToGrave(id, true)} />
          </div>
          <div className={styles.bottomCenter}>
            <ToastList toasts={toasts} />
            <StatusBanners />
            {outdated && (
              <div className={styles.versionBanner} role="status">
                <span>새 버전이 나왔어요</span>
                <button type="button" className={cx(ui.button, ui.primary)} onClick={() => window.location.reload()}>
                  새로고침
                </button>
              </div>
            )}
            {narrow && <Hud onOpenChannels={() => setPanel("channels")} />}
          </div>
          <CameraControls />
          <button type="button" className={cx(ui.button, styles.myGraves)} onClick={openMyGraves}>
            <PixelIcon name="grave" />
            내 묘비{me ? ` (${me.graves.length})` : ""}
          </button>
          <FireworkButton />
          {!inShop && (
            <button
              type="button"
              className={cx(ui.button, ui.primary, styles.bury)}
              onClick={() => setBury({ kind: "create" })}
            >
              묘비 세우기
            </button>
          )}
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
      {panel === "channels" && <ChannelMenu onClose={closePanel} />}
      {panel === "guide" && <GuideDialog onClose={closePanel} />}
      {panel === "me" && (
        <MyPanel
          graves={graves}
          onGoToGrave={(id) => goToGrave(id, false)}
          onBury={startBury}
          onLeave={onLeave}
          onClose={closePanel}
        />
      )}
      {panel === "graves" && (
        <Dialog title="내 묘비" onClose={closePanel} size="sm">
          <MyGraves
            ids={me?.graves ?? []}
            graves={graves.graves}
            onGo={(id) => goToGrave(id, false)}
            onBury={startBury}
          />
        </Dialog>
      )}
      {panel === "shop" && <ShopDialog onClose={closePanel} />}
    </div>
  );
}
