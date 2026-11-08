"use client";

import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./CameraControls.module.css";

/**
 * 줌 버튼과, 시점을 옮겨 둔 동안만 보이는 "내 캐릭터로" 버튼 (휠·우클릭 드래그 자체는 게임이 처리).
 * 터치 화면은 줌을 메뉴 시트에 두므로 showZoom=false.
 */
export default function CameraControls({ showZoom = true }: { showZoom?: boolean }) {
  const camera = useBridgeValue("camera:state");
  return (
    <>
      {camera?.detached && (
        <button
          type="button"
          className={cx(ui.button, styles.recenter)}
          onClick={() => bridge.emit("camera:recenter")}
        >
          <PixelIcon name="target" />
          내 캐릭터로
        </button>
      )}
      {showZoom && (
      <div className={styles.zoom} role="group" aria-label="화면 확대·축소">
        <button
          type="button"
          className={cx(ui.button, ui.icon, styles.zoomButton)}
          onClick={() => bridge.emit("camera:zoom", { delta: 1 })}
          aria-label="확대"
        >
          <PixelIcon name="plus" />
        </button>
        <button
          type="button"
          className={cx(ui.button, ui.icon, styles.zoomButton)}
          onClick={() => bridge.emit("camera:zoom", { delta: -1 })}
          aria-label="축소"
        >
          <PixelIcon name="minus" />
        </button>
      </div>
      )}
    </>
  );
}
