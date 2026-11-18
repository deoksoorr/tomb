"use client";

import { bridge } from "@/game/bridge";
import { ATTEND_STAY_TEXT } from "@/lib/attendStay";
import { useMe } from "@/lib/hooks/useMe";
import { countLabel } from "../account/items";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import PixelIcon, { type IconName } from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./MenuSheet.module.css";
import TodayFacts from "./TodayFacts";

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
  | "race"
  | "notices"
  | "activity"
  | "say"
  /** 즐겨찾기 표현 원형 목록 (Y) */
  | "favs"
  | "me"
  | "guide"
  // 10·11번
  | "calendar"
  | "gifts"
  | "friends"
  /** 운영자 전용 포인트 현황 */
  | "staffEarn";

type Props = {
  canBury: boolean;
  myGraveCount: number | null;
  /** 11/16 가방에 새로 생긴 물건이 있음 (예전 숫자 배지 대신 점) */
  bagNew: boolean;
  fireworkCount: number;
  unreadNotice: boolean;
  activityUnread: number;
  points: number | null;
  /** 10번: 오늘 출석 도장을 받을 수 있음 (빨간 점) */
  calendarReady?: boolean;
  /** 11번: 안 받은 선물 수 (빨간 점) */
  giftCount?: number;
  /** 친구: 받은 친구 신청 수 (빨간 점) */
  friendIncoming?: number;
  /** 가방 [칭호]에서 아직 안 본 새 칭호가 있다 (가방 타일에 점) */
  titleNew?: boolean;
  /** 운영자 계정: 친구 기능을 쓸 수 없어 친구 타일 대신 포인트 현황 타일 */
  noFriends?: boolean;
  /** 11/16 탈것에 타 있어 사냥터에 못 가는 이유 (타일을 흐리게, 설명 대신) — lib/rideGate */
  huntBlocked?: string | null;
  onPick: (target: MenuTarget) => void;
  onClose: () => void;
};

type Entry = {
  target: MenuTarget;
  icon: IconName;
  label: string;
  /** 타일 아래 한 줄 설명 */
  desc: string;
  badge?: string;
  dot?: boolean;
  redDot?: boolean;
  primary?: boolean;
  /** 지금은 못 쓰는 타일 (흐리게, 설명에 이유) — 누르면 onPick이 안내한다 */
  off?: boolean;
};

/**
 * 메뉴: 터치 화면은 아래쪽에 조이스틱·행동 버튼만 두고 나머지는 모두 여기에. 데스크톱도 [메뉴]로 연다.
 * 48번: 즐길 거리(가방·사냥·집)를 앞에, 묘비(내 묘비 가기·묘비 쓰기·성불한 이야기들)는 뒤쪽 묶음으로.
 * 큰 아이콘 타일 + 한 줄 설명 + 빨간 점, 아래에 오늘의 정보(출석·남은 포인트 한도·채널·날씨/시간대)
 */
export default function MenuSheet({
  canBury,
  myGraveCount,
  bagNew,
  fireworkCount,
  unreadNotice,
  activityUnread,
  points,
  calendarReady = false,
  giftCount = 0,
  friendIncoming = 0,
  titleNew = false,
  noFriends = false,
  huntBlocked = null,
  onPick,
  onClose,
}: Props) {
  // 운영자 계정은 출석 도장을 받지 않는다 → 출석 달력 칸을 뺀다
  const staff = !!useMe().me?.staff;
  /** 감정 표현은 시트를 닫고 바로 보여 준다 */
  const act = (kind: "wave" | "cheer") => {
    onClose();
    bridge.emit("input:act", { kind });
  };
  const entries: Entry[] = [
    { target: "say", icon: "chat", label: "표현 (T)", desc: "말풍선·이모티콘으로 인사하기" },
    { target: "favs", icon: "spark", label: "즐겨찾기 표현 (Y)", desc: "별 표시한 표현을 바로 보내기" },
    { target: "bag", icon: "bag", label: "가방 (I)", desc: titleNew ? "새 칭호를 얻었어요!" : bagNew ? "새로 생긴 물건이 있어요" : "꾸미기·폭죽·잡은 것 꺼내기", dot: titleNew || bagNew },
    { target: "hunt", icon: "sword", label: "사냥터", desc: huntBlocked ?? "몬스터를 잡고 포인트 모으기", off: !!huntBlocked },
    { target: "dex", icon: "book", label: "도감", desc: "물고기·곤충·약초 모으기" },
    { target: "housing", icon: "house", label: "집·분양 마을", desc: "내 집 분양받고 꾸미기" },
    ...(fireworkCount > 0
      ? [{ target: "fireworks" as const, icon: "spark" as const, label: "폭죽 쏘기 (G)", desc: "채널 하늘에 불꽃 한 발", badge: countLabel(fireworkCount) }]
      : []),
    ...(staff
      ? []
      : [{ target: "calendar" as const, icon: "calendar" as const, label: "출석 달력 (B)", desc: calendarReady ? "오늘 출석 도장을 찍을 수 있어요!" : `${ATTEND_STAY_TEXT} 머물면 오늘 출석 도장`, redDot: calendarReady }]),
    {
      target: "gifts",
      icon: "gift",
      label: "선물함",
      desc: giftCount > 0 ? `안 받은 선물 ${giftCount}개` : "마을 관리인이 보낸 선물",
      badge: giftCount ? String(giftCount) : undefined,
      redDot: giftCount > 0,
    },
    ...(noFriends
      ? [{ target: "staffEarn" as const, icon: "list" as const, label: "포인트 현황", desc: "사람들이 오늘 한도를 얼마나 채웠는지 보기" }]
      : [
          {
            target: "friends" as const,
            icon: "friends" as const,
            label: "친구 (O)",
            desc: friendIncoming > 0 ? `받은 친구 신청 ${friendIncoming}개` : "친구가 어디 있는지 보고 찾아가기",
            badge: friendIncoming ? String(friendIncoming) : undefined,
            redDot: friendIncoming > 0,
          },
        ]),
    { target: "activity", icon: "heart", label: "내 소식", desc: "헌화·방명록·좋아요 소식", badge: activityUnread ? String(activityUnread) : undefined },
    { target: "race", icon: "trophy", label: "이번 주 레이스 (U)", desc: "이번 주 1위를 겨뤄요" },
    { target: "ranking", icon: "list", label: "랭킹 (L)", desc: "포인트·사냥·집·헌화 순위" },
    { target: "notices", icon: "bell", label: "공지 (N)", desc: unreadNotice ? "새 공지가 있어요" : "업데이트·점검 소식", dot: unreadNotice },
    { target: "me", icon: "user", label: "내 정보 (P)", desc: "닉네임·개인 코드·내 집", badge: points !== null ? `${points.toLocaleString("ko-KR")}P` : undefined },
    { target: "guide", icon: "info", label: "안내", desc: "조작법·포인트 규칙·문의" },
  ];
  const graveEntries: Entry[] = [
    { target: "graves", icon: "grave", label: "내 묘비 가기", desc: "내가 세운 묘비 앞으로 걸어가기", badge: myGraveCount ? String(myGraveCount) : undefined },
    ...(canBury ? [{ target: "bury" as const, icon: "grave" as const, label: "묘비 쓰기", desc: "끝내지 못한 일을 묻어 주기" }] : []),
    { target: "passed", icon: "candle", label: "성불한 이야기들", desc: "묘역을 떠난 묘비들의 기록" },
  ];
  const button = (e: Entry) => (
    <button
      key={e.target}
      type="button"
      className={cx(ui.button, styles.entry, e.primary && ui.primary)}
      aria-disabled={e.off ? true : undefined}
      title={e.off ? e.desc : undefined}
      onClick={() => onPick(e.target)}
    >
      <span className={styles.tileIcon} aria-hidden="true">
        <PixelIcon name={e.icon} size={21} />
      </span>
      <span className={styles.text}>
        <span className={styles.labelRow}>
          <span className={styles.label}>{e.label}</span>
          {e.badge && <span className={styles.badge}>{e.badge}</span>}
        </span>
        <span className={styles.desc}>{e.desc}</span>
      </span>
      {e.dot && <span className={cx(styles.dot, styles.corner)} aria-label={e.target === "bag" ? "새 칭호" : "새 공지"} />}
      {e.redDot && <span className={cx(styles.dot, styles.redDot, styles.corner)} aria-label="받을 것이 있어요" />}
    </button>
  );

  return (
    <Dialog title="메뉴" onClose={onClose}>
      <div className={styles.grid}>{entries.map(button)}</div>
      <h3 className={styles.section}>묘역</h3>
      <div className={styles.grid} role="group" aria-label="묘역">
        {graveEntries.map(button)}
      </div>
      <section className={styles.today} aria-labelledby="menu-today">
        <h3 id="menu-today" className={styles.section}>
          오늘
        </h3>
        <TodayFacts />
      </section>
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
