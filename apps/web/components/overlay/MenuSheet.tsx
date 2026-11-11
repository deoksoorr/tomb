"use client";

import { bridge } from "@/game/bridge";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import PixelIcon, { type IconName } from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./MenuSheet.module.css";

export type MenuTarget =
  | "bury"
  | "graves"
  | "passed"
  | "bag"
  | "hunt"
  | "dex"
  | "housing"
  | "fireworks"
  | "ranking"
  | "notices"
  | "activity"
  | "say"
  | "me"
  | "guide";

type Props = {
  canBury: boolean;
  myGraveCount: number | null;
  bagCount: number;
  fireworkCount: number;
  unreadNotice: boolean;
  activityUnread: number;
  points: number | null;
  onPick: (target: MenuTarget) => void;
  onClose: () => void;
};

type Entry = { target: MenuTarget; icon: IconName; label: string; badge?: string; dot?: boolean; primary?: boolean };

/**
 * 메뉴: 터치 화면은 아래쪽에 조이스틱·행동 버튼만 두고 나머지는 모두 여기에. 데스크톱도 [메뉴]로 연다.
 * 48번: 즐길 거리(가방·사냥·집)를 앞에, 묘비(내 묘비 가기·묘비 쓰기·성불한 이야기들)는 뒤쪽 묶음으로
 */
export default function MenuSheet({
  canBury,
  myGraveCount,
  bagCount,
  fireworkCount,
  unreadNotice,
  activityUnread,
  points,
  onPick,
  onClose,
}: Props) {
  /** 감정 표현은 시트를 닫고 바로 보여 준다 */
  const act = (kind: "wave" | "cheer") => {
    onClose();
    bridge.emit("input:act", { kind });
  };
  const entries: Entry[] = [
    { target: "bag", icon: "bag", label: "가방", badge: bagCount ? String(bagCount) : undefined },
    { target: "hunt", icon: "sword", label: "사냥터" },
    { target: "dex", icon: "book", label: "도감" },
    { target: "housing", icon: "house", label: "집·분양 마을" },
    ...(fireworkCount > 0
      ? [{ target: "fireworks" as const, icon: "spark" as const, label: "폭죽 쏘기", badge: String(fireworkCount) }]
      : []),
    { target: "activity", icon: "heart", label: "내 소식", badge: activityUnread ? String(activityUnread) : undefined },
    { target: "say", icon: "chat", label: "말풍선" },
    { target: "ranking", icon: "list", label: "랭킹" },
    { target: "notices", icon: "bell", label: "공지", dot: unreadNotice },
    { target: "me", icon: "user", label: "내 정보", badge: points !== null ? `${points.toLocaleString("ko-KR")}P` : undefined },
    { target: "guide", icon: "info", label: "안내" },
  ];
  const graveEntries: Entry[] = [
    { target: "graves", icon: "grave", label: "내 묘비 가기", badge: myGraveCount ? String(myGraveCount) : undefined },
    ...(canBury ? [{ target: "bury" as const, icon: "grave" as const, label: "묘비 쓰기" }] : []),
    { target: "passed", icon: "candle", label: "성불한 이야기들" },
  ];
  const button = (e: Entry) => (
    <button
      key={e.target}
      type="button"
      className={cx(ui.button, styles.entry, e.primary && ui.primary)}
      onClick={() => onPick(e.target)}
    >
      <PixelIcon name={e.icon} size={18} />
      <span className={styles.label}>{e.label}</span>
      {e.badge && <span className={styles.badge}>{e.badge}</span>}
      {e.dot && <span className={styles.dot} aria-label="새 공지" />}
    </button>
  );

  return (
    <Dialog title="메뉴" onClose={onClose} size="sm">
      <div className={styles.grid}>{entries.map(button)}</div>
      <h3 className={styles.section}>묘역</h3>
      <div className={styles.grid} role="group" aria-label="묘역">
        {graveEntries.map(button)}
      </div>
      <div className={styles.zoom} role="group" aria-label="감정 표현">
        <span>감정 표현</span>
        <button type="button" className={ui.button} onClick={() => act("wave")}>
          손 흔들기
        </button>
        <button type="button" className={ui.button} onClick={() => act("cheer")}>
          환호
        </button>
      </div>
      <div className={styles.zoom} role="group" aria-label="화면 확대·축소">
        <span>화면 크기</span>
        <button type="button" className={cx(ui.button, ui.icon)} onClick={() => bridge.emit("camera:zoom", { delta: -1 })} aria-label="축소">
          <PixelIcon name="minus" />
        </button>
        <button type="button" className={cx(ui.button, ui.icon)} onClick={() => bridge.emit("camera:zoom", { delta: 1 })} aria-label="확대">
          <PixelIcon name="plus" />
        </button>
      </div>
    </Dialog>
  );
}
