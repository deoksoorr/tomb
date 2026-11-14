"use client";

import { bridge } from "@/game/bridge";
import { ATTEND_STAY_TEXT } from "@/lib/attendStay";
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
  | "friends";

type Props = {
  canBury: boolean;
  myGraveCount: number | null;
  bagCount: number;
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
  /** 운영자 계정: 친구 기능을 쓸 수 없어 친구 타일을 뺀다 */
  noFriends?: boolean;
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
};

/**
 * 메뉴: 터치 화면은 아래쪽에 조이스틱·행동 버튼만 두고 나머지는 모두 여기에. 데스크톱도 [메뉴]로 연다.
 * 48번: 즐길 거리(가방·사냥·집)를 앞에, 묘비(내 묘비 가기·묘비 쓰기·성불한 이야기들)는 뒤쪽 묶음으로.
 * 큰 아이콘 타일 + 한 줄 설명 + 빨간 점, 아래에 오늘의 정보(출석·남은 포인트 한도·채널·날씨/시간대)
 */
export default function MenuSheet({
  canBury,
  myGraveCount,
  bagCount,
  fireworkCount,
  unreadNotice,
  activityUnread,
  points,
  calendarReady = false,
  giftCount = 0,
  friendIncoming = 0,
  noFriends = false,
  onPick,
  onClose,
}: Props) {
  /** 감정 표현은 시트를 닫고 바로 보여 준다 */
  const act = (kind: "wave" | "cheer") => {
    onClose();
    bridge.emit("input:act", { kind });
  };
  const entries: Entry[] = [
    { target: "say", icon: "chat", label: "표현 (T)", desc: "말풍선·이모티콘으로 인사하기" },
    { target: "favs", icon: "spark", label: "즐겨찾기 표현 (Y)", desc: "별 표시한 표현을 내 둘레에 펼치기" },
    { target: "bag", icon: "bag", label: "가방", desc: "꾸미기·폭죽·잡은 것 꺼내기", badge: bagCount ? String(bagCount) : undefined },
    { target: "hunt", icon: "sword", label: "사냥터", desc: "몬스터 사냥 · 경험치와 포인트" },
    { target: "dex", icon: "book", label: "도감", desc: "물고기·곤충·약초 모으기" },
    { target: "housing", icon: "house", label: "집·분양 마을", desc: "내 집 분양받고 꾸미기" },
    ...(fireworkCount > 0
      ? [{ target: "fireworks" as const, icon: "spark" as const, label: "폭죽 쏘기", desc: "채널 하늘에 불꽃 한 발", badge: String(fireworkCount) }]
      : []),
    { target: "calendar", icon: "calendar", label: "출석 달력", desc: calendarReady ? "오늘 출석 도장을 찍을 수 있어요!" : `${ATTEND_STAY_TEXT} 머물면 오늘 출석 도장`, redDot: calendarReady },
    {
      target: "gifts",
      icon: "gift",
      label: "선물함",
      desc: giftCount > 0 ? `안 받은 선물 ${giftCount}개` : "마을 관리인이 보낸 선물",
      badge: giftCount ? String(giftCount) : undefined,
      redDot: giftCount > 0,
    },
    ...(noFriends
      ? []
      : [
          {
            target: "friends" as const,
            icon: "friends" as const,
            label: "친구",
            desc: friendIncoming > 0 ? `받은 친구 신청 ${friendIncoming}개` : "친구 위치·가기·집 놀러 가기",
            badge: friendIncoming ? String(friendIncoming) : undefined,
            redDot: friendIncoming > 0,
          },
        ]),
    { target: "activity", icon: "heart", label: "내 소식", desc: "헌화·방명록·좋아요 소식", badge: activityUnread ? String(activityUnread) : undefined },
    { target: "race", icon: "trophy", label: "이번 주 레이스", desc: "주간 1위 다툼 · 마감까지 남은 시간" },
    { target: "ranking", icon: "list", label: "랭킹", desc: "포인트·사냥·집·헌화 순위" },
    { target: "notices", icon: "bell", label: "공지", desc: unreadNotice ? "새 공지가 있어요" : "업데이트·점검 소식", dot: unreadNotice },
    { target: "me", icon: "user", label: "내 정보", desc: "닉네임·개인 코드·내 집", badge: points !== null ? `${points.toLocaleString("ko-KR")}P` : undefined },
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
      {e.dot && <span className={cx(styles.dot, styles.corner)} aria-label="새 공지" />}
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
