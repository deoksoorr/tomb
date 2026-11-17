"use client";

import { useEffect, useRef, useState } from "react";
import type { MegaPin } from "@tomb/protocol";
import { useBridgeEvent, useBridgeValue } from "@/lib/hooks/useBridge";
import { tabHidden } from "@/lib/hooks/visibleAgain";
import { megaphoneStore, openMegaphone, useMegaphone } from "@/lib/hooks/useMegaphone";
import { reportStore } from "@/lib/reportClient";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./MegaphoneFeed.module.css";
import MegaphoneSpotlight from "./MegaphoneSpotlight";
import { MegaPinDialog, MegaPinRemove } from "./MegaPinDialog";

/** 기록을 다시 받는 간격 (관리자 숨김 반영·놓친 방송 보충. 새 방송은 실시간으로 오므로 10분, 숨긴 탭은 받지 않는다) */
const RELOAD_MS = 10 * 60_000;

/**
 * 23번 확성기 창 (데스크톱은 화면 왼쪽 위). 최근 20개는 펼쳐 볼 수 있다(접기 가능).
 * 새 한마디는 화면 가운데에 몇 초간 크게 뜨고(여러 개면 차례로), 기록의 그 줄도 잠깐 밝게 표시된다.
 * floating = 터치 화면: 왼쪽 위 [메뉴] 줄 바로 아래에 따로 띄운다 (펼친 기록은 아래로, 11/16)
 * 11/17 바 아래·기록 위에 운영자 고정 공지(채널 것, 모든 채널 것 최대 2줄). 새 외침에 밀리지 않고, 한 줄로 줄였다가 누르면 펼친다.
 * 기록을 접어 두면 첫 공지 한 줄만 (둘이면 +1). 운영자에게만 [공지 쓰기]·[지우기]
 */
export default function MegaphoneFeed({ channel, floating = false }: { channel: number; floating?: boolean }) {
  const { entries, flash, flashUntil, collapsed, pins } = useMegaphone();
  const logRef = useRef<HTMLOListElement>(null);
  const iAmStaff = useBridgeValue("me:staff")?.on === true;
  // 고정 공지 전체 펼침 · 운영자 쓰기 창 · 지울 공지
  const [pinOpen, setPinOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [removing, setRemoving] = useState<MegaPin | null>(null);

  useBridgeEvent("megaphone:heard", (m) => megaphoneStore.push(m));
  useBridgeEvent("megaphone:pin", (m) => megaphoneStore.applyPin(m, channel));
  useEffect(() => {
    void megaphoneStore.load(channel);
    const t = setInterval(() => {
      if (!tabHidden()) void megaphoneStore.load(channel);
    }, RELOAD_MS);
    return () => clearInterval(t);
  }, [channel]);
  // 펼쳐 둔 기록은 새 줄이 오면 맨 아래로
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, collapsed]);

  // 기록을 접어 두면 첫 공지 한 줄만 (펼쳐 보면 모두)
  const shownPins = collapsed && !pinOpen ? pins.slice(0, 1) : pins;
  const hiddenPins = pins.length - shownPins.length;

  const toggle = () => {
    megaphoneStore.setCollapsed(!collapsed);
    if (collapsed) void megaphoneStore.load(channel);
  };

  return (
    <section
      className={cx(styles.feed, floating && styles.floating)}
      aria-label="확성기"
      // 터치: 기록을 펼치면 아래 가운데 안내 줄·낚시 창 등이 그 위로 올라간다 (GameShell .shell --hud-bottom)
      data-megaphone-open={floating && !collapsed ? "" : undefined}
    >
      <div className={styles.bar}>
        <button type="button" className={cx(ui.button, styles.toggle)} onClick={toggle} aria-expanded={!collapsed}>
          <PixelIcon name="megaphone" />
          확성기
          <span className={styles.caret} aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="visually-hidden">{collapsed ? " 기록 펼치기" : " 기록 접기"}</span>
        </button>
        <button type="button" className={cx(ui.button, styles.shout)} onClick={openMegaphone}>
          외치기
        </button>
        {iAmStaff && (
          <button type="button" className={cx(ui.button, styles.shout)} onClick={() => setWriting(true)}>
            공지 쓰기
          </button>
        )}
      </div>
      {shownPins.length > 0 && (
        <ul className={cx(styles.pins, pinOpen && styles.pinsOpen)} aria-label="고정 공지">
          {shownPins.map((p) => (
            <li key={p.scope} className={styles.pin}>
              <button type="button" className={styles.pinBody} onClick={() => setPinOpen(!pinOpen)} aria-expanded={pinOpen} title={pinOpen ? undefined : p.text}>
                {/* 모든 채널 공지는 딱지를 붉게 (전체 확성기와 같은 색) */}
                <span className={cx(styles.pinTag, p.scope === "all" && styles.pinTagAll)}>공지</span>
                <span className={styles.pinText}>{p.text}</span>
                {hiddenPins > 0 && <span className={styles.pinMore}>+{hiddenPins}</span>}
              </button>
              {iAmStaff && (
                <button
                  type="button"
                  className={styles.pinDel}
                  aria-label={p.scope === "all" ? "모든 채널 공지 지우기" : `${channel}채널 공지 지우기`}
                  onClick={() => setRemoving(p)}
                >
                  지우기
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!collapsed && (
        <ol ref={logRef} className={styles.log} aria-label="최근 확성기 20개">
          {entries.length === 0 && <li className={styles.empty}>아직 아무도 외치지 않았어요.</li>}
          {entries.map((e) => (
            <li key={e.id} className={cx(styles.line, flash?.id === e.id && styles.newLine)}>
              {e.scope === "all" && <span className={styles.all}>전체</span>}
              <b className={cx(styles.name, e.staff && styles.staff)}>
                {/* 11/15 운영자는 닉네임 그대로라 "운영자" 딱지로 알린다 (마을 공지 줄은 빼고) */}
                {e.staff && !e.system && <span className={styles.staffTag}>운영자</span>}
                {e.mgr && !e.staff && <span className={styles.mgrTag}>매니저</span>}
                {e.name}
              </b>
              <span className={styles.text}>{e.text}</span>
              {/* 47번 확성기 신고 (운영자 확성기는 신고 대상이 아니라 버튼이 없다) */}
              {!e.staff && (
                <button
                  type="button"
                  className={styles.report}
                  aria-label={`${e.name}의 확성기 신고`}
                  title="신고"
                  onClick={() => reportStore.open({ type: "megaphone", id: e.id, name: e.name, text: e.text })}
                >
                  신고
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <MegaphoneSpotlight entry={flash} until={flashUntil} />
      {writing && iAmStaff && <MegaPinDialog channel={channel} pins={pins} onClose={() => setWriting(false)} />}
      {removing && iAmStaff && <MegaPinRemove channel={channel} pin={removing} onClose={() => setRemoving(null)} />}
    </section>
  );
}
