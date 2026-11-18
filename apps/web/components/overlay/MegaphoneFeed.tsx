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
 * floating = 터치 화면: 왼쪽 위 [메뉴] 줄 바로 아래에 따로 띄운다
 * 11/17 바 아래·기록 위에 운영자 고정 공지(채널 것, 모든 채널 것 최대 2줄). 새 외침에 밀리지 않고, 한 줄로 줄였다가 누르면 펼친다.
 * 기록을 접어 두면 첫 공지 한 줄만 (둘이면 +1). 운영자에게만 [공지 쓰기]·[지우기]
 * 11/17 터치 화면(floating)은 확성기 줄([확성기]·[외치기]·기록)을 아예 빼고, 공지가 있을 때만 [📌 공지] 칩 하나 (PinChip).
 * 새 외침을 화면 가운데 크게 띄우는 연출(MegaphoneSpotlight)은 그대로
 */
export default function MegaphoneFeed({ channel, floating = false }: { channel: number; floating?: boolean }) {
  const { entries, flash, flashUntil, collapsed, pins } = useMegaphone();
  const logRef = useRef<HTMLOListElement>(null);
  const iAmStaff = useBridgeValue("me:staff")?.on === true;
  // 고정 공지 전체 펼침 · 운영자 쓰기 창 · 지울 공지
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
  // 11/18 데스크톱 고정 공지는 늘 모두 펼쳐 둔다 (사용자 — 접기 없음). 터치는 칩(아래 floating)
  const shownPins = pins;

  // 터치: 확성기 줄 없이 공지 칩 + 가운데 연출만
  if (floating) {
    return (
      <>
        <PinChip channel={channel} pins={pins} staff={iAmStaff} onWrite={() => setWriting(true)} onRemove={setRemoving} />
        <MegaphoneSpotlight entry={flash} until={flashUntil} />
        {writing && iAmStaff && <MegaPinDialog channel={channel} pins={pins} onClose={() => setWriting(false)} />}
        {removing && iAmStaff && <MegaPinRemove channel={channel} pin={removing} onClose={() => setRemoving(null)} />}
      </>
    );
  }

  const toggle = () => {
    megaphoneStore.setCollapsed(!collapsed);
    if (collapsed) void megaphoneStore.load(channel);
  };

  return (
    <section className={styles.feed} aria-label="확성기">
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
        <ul className={cx(styles.pins, styles.pinsOpen)} aria-label="고정 공지">
          {shownPins.map((p) => (
            <li key={p.scope} className={styles.pin}>
              <div className={styles.pinBody}>
                {/* 모든 채널 공지는 딱지를 붉게 (전체 확성기와 같은 색) */}
                <span className={cx(styles.pinTag, p.scope === "all" && styles.pinTagAll)}>공지</span>
                <span className={styles.pinText}>{p.text}</span>
              </div>
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

/**
 * 11/17 터치 화면 고정 공지 칩: 긴급 의뢰 칩 아래(없으면 그 자리)에 [📌 공지] 한 줄. 누르면 공지 전문이 펼쳐지고 다시 누르면 접힌다.
 * 차지한 높이를 --pin-h(문서 루트)로 알려 그 아래 칸(접속 보너스·물때·포인트 이벤트 줄)이 내려간다.
 * 운영자는 공지가 없어도 칩이 보이고(누르면 바로 쓰기 창), 펼친 안에 [공지 쓰기]·[지우기]
 */
function PinChip({ channel, pins, staff, onWrite, onRemove }: { channel: number; pins: MegaPin[]; staff: boolean; onWrite: () => void; onRemove: (p: MegaPin) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const shown = pins.length > 0 || staff;
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el || !shown) return;
    const put = () => root.style.setProperty("--pin-h", `${Math.ceil(el.getBoundingClientRect().height) + 6}px`);
    put();
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--pin-h");
    };
  }, [shown]);
  if (!shown) return null;
  // 운영자이고 공지가 없으면 칩이 곧 쓰기 단추
  const empty = pins.length === 0;
  return (
    <div ref={ref} className={styles.pinChipBox}>
      <button
        type="button"
        className={cx(styles.pinChip, open && styles.pinChipOpen)}
        onClick={empty ? onWrite : () => setOpen(!open)}
        aria-expanded={empty ? undefined : open}
      >
        <span aria-hidden="true">📌</span>
        {empty ? "공지 쓰기" : "공지"}
        {pins.length > 1 && <span className={styles.pinMore}>{pins.length}</span>}
      </button>
      {open && !empty && (
        <ul className={cx(styles.pins, styles.pinsOpen, styles.pinSheet)} aria-label="고정 공지">
          {pins.map((p) => (
            <li key={p.scope} className={styles.pin}>
              <button type="button" className={styles.pinBody} onClick={() => setOpen(false)}>
                <span className={cx(styles.pinTag, p.scope === "all" && styles.pinTagAll)}>공지</span>
                <span className={styles.pinText}>{p.text}</span>
              </button>
              {staff && (
                <button
                  type="button"
                  className={styles.pinDel}
                  aria-label={p.scope === "all" ? "모든 채널 공지 지우기" : `${channel}채널 공지 지우기`}
                  onClick={() => onRemove(p)}
                >
                  지우기
                </button>
              )}
            </li>
          ))}
          {staff && (
            <li className={styles.pinWrite}>
              <button type="button" className={cx(ui.button, styles.shout)} onClick={onWrite}>
                공지 쓰기
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
