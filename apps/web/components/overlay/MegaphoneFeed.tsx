"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MegaPin } from "@tomb/protocol";
import { useBridgeEvent, useBridgeValue } from "@/lib/hooks/useBridge";
import { tabHidden } from "@/lib/hooks/visibleAgain";
import { feedOpen, megaphoneStore, useMegaphone } from "@/lib/hooks/useMegaphone";
import { reportStore } from "@/lib/reportClient";
import { toUi } from "@/lib/uiScale";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./MegaphoneFeed.module.css";
import MegaphoneSpotlight from "./MegaphoneSpotlight";
import { TopLeftItem } from "./TopLeftCluster";
import { MegaPinDialog, MegaPinRemove } from "./MegaPinDialog";

/** 기록을 다시 받는 간격 (관리자 숨김 반영·놓친 방송 보충. 새 방송은 실시간으로 오므로 10분, 숨긴 탭은 받지 않는다) */
const RELOAD_MS = 10 * 60_000;
/** 11/21 펼친 기록에 한 번에 보이는 소식 수 (나머지는 스크롤) */
const VISIBLE_LINES = 5;

/**
 * 23번 확성기 창 (데스크톱은 화면 왼쪽 위). 최근 20개는 펼쳐 볼 수 있다(접기 가능).
 * 새 한마디는 화면 가운데에 몇 초간 크게 뜨고(여러 개면 차례로), 기록의 그 줄도 잠깐 밝게 표시된다.
 * floating = 터치 화면: 왼쪽 위 [메뉴] 줄 바로 아래에 따로 띄운다
 * 11/17 바 아래·기록 위에 운영자 고정 공지(채널 것, 모든 채널 것 최대 2줄). 새 외침에 밀리지 않고, 한 줄로 줄였다가 누르면 펼친다.
 * 기록을 접어 두면 첫 공지 한 줄만 (둘이면 +1). 운영자에게만 [공지 쓰기]·[지우기]
 * 11/17 터치 화면(floating)은 확성기 줄([확성기]·[외치기]·기록)을 아예 빼고, 공지가 있을 때만 [📌 공지] 칩 하나 (PinChip).
 * 새 외침을 화면 가운데 크게 띄우는 연출(MegaphoneSpotlight)은 그대로
 * 11/19 데스크톱 왼쪽 위 한 줄: lead(배경 음악 줄)를 [확성기]·[외치기] 앞에 붙여 한 줄로 (옛 묘역이 언덕 위로 올라가 묘비를 덜 가리게).
 * 외침이 하나도 없으면 「아직 아무도 외치지 않았어요」 줄도 빼고, 외침이 오면 그 아래에 기록이 뜬다
 * 11/21 「마을 소식」으로 이름을 바꾸고 [외치기]를 뺐다 (확성기 판매 중지 — 사용자). 시스템 줄·고정 공지 딱지는 「소식」, 기록은 하루 보관
 */
export default function MegaphoneFeed({ channel, floating = false, lead }: { channel: number; floating?: boolean; lead?: ReactNode }) {
  const { entries, flash, flashUntil, collapsed, pins } = useMegaphone();
  const logRef = useRef<HTMLOListElement>(null);
  const feedRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const iAmStaff = useBridgeValue("me:staff")?.on === true;
  // 지울 공지 (11/19 운영자 쓰기 창은 위쪽 줄의 MegaPinButton이 연다)
  const [removing, setRemoving] = useState<MegaPin | null>(null);
  // 11/19 한 줄로 합친 뒤 외침이 없으면 기록 줄을 숨기는데, 이번에 직접 펼쳤으면 비어도 「아직 소식이 없어요」를 보여 준다
  const [asked, setAsked] = useState(false);

  useBridgeEvent("megaphone:heard", (m) => megaphoneStore.push(m));
  useBridgeEvent("megaphone:pin", (m) => megaphoneStore.applyPin(m, channel));
  useEffect(() => {
    void megaphoneStore.load(channel);
    const t = setInterval(() => {
      if (!tabHidden()) void megaphoneStore.load(channel);
    }, RELOAD_MS);
    return () => clearInterval(t);
  }, [channel]);
  // 펼쳐 둔 기록은 새 줄이 오면 맨 아래로.
  // 11/21 높이는 최근 소식 VISIBLE_LINES개만큼 (두 줄로 접히는 소식이 있어도 개수로 맞춘다 — 사용자), 나머지는 위로 스크롤
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const kids = [...el.children] as HTMLElement[];
    if (kids.length > VISIBLE_LINES) {
      const cs = getComputedStyle(el);
      const last = kids.slice(-VISIBLE_LINES);
      const h = last.reduce((s, k) => s + k.offsetHeight, 0) + (parseFloat(cs.rowGap) || 0) * (last.length - 1) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      el.style.maxHeight = `${Math.ceil(Math.min(h, toUi(window.innerHeight) * 0.4))}px`;
    } else el.style.maxHeight = "";
    el.scrollTop = el.scrollHeight;
  }, [entries, collapsed, asked]);

  // 11/20 데스크톱: 위 줄 아래로 자라는 고정 공지·기록 높이를 --feed-h(문서 루트)로 알린다 → 왼쪽 위 새 개발자 노트 카드가 그 밑에 선다 (공지와 겹쳤다)
  useEffect(() => {
    const feed = feedRef.current;
    const bar = barRef.current;
    const root = document.documentElement;
    if (floating || !feed || !bar) return;
    const put = () => {
      // 11/22 큰 화면 HUD 배율(zoom) 안의 CSS px로 (lib/uiScale)
      const below = Math.ceil(toUi(feed.getBoundingClientRect().bottom - bar.getBoundingClientRect().bottom));
      if (below > 0) root.style.setProperty("--feed-h", `${below + 6}px`);
      else root.style.removeProperty("--feed-h");
    };
    put();
    const ro = new ResizeObserver(put);
    ro.observe(feed);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--feed-h");
    };
  }, [floating]);

  // 기록을 접어 두면 첫 공지 한 줄만 (펼쳐 보면 모두)
  // 11/18 데스크톱 고정 공지는 늘 모두 펼쳐 둔다 (사용자 — 접기 없음). 터치는 칩(아래 floating)
  const shownPins = pins;

  // 터치: 확성기 줄 없이 공지 칩 + 가운데 연출만
  if (floating) {
    return (
      <>
        <PinChip channel={channel} pins={pins} staff={iAmStaff} onRemove={setRemoving} />
        <MegaphoneSpotlight entry={flash} until={flashUntil} />
        {removing && iAmStaff && <MegaPinRemove channel={channel} pin={removing} onClose={() => setRemoving(null)} />}
      </>
    );
  }

  // 11/21 열림은 접힘 상태 하나로 (목록 수에 따라 두 상태를 오가다 펼치자마자 접히던 것 고침 — feedOpen)
  const open = feedOpen(collapsed, lead != null ? entries.length : 1, asked);
  const toggle = () => {
    megaphoneStore.setCollapsed(open);
    setAsked(!open);
    if (!open) void megaphoneStore.load(channel);
  };

  return (
    <section ref={feedRef} className={cx(styles.feed, lead != null && styles.joined)} aria-label="소식">
      <div ref={barRef} className={styles.bar}>
        {lead}
        <button type="button" className={cx(ui.button, styles.toggle)} onClick={toggle} aria-expanded={open}>
          <PixelIcon name="bell" />
          소식
          <span className={styles.caret} aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          <span className="visually-hidden">{open ? " 기록 접기" : " 기록 펼치기"}</span>
        </button>
        {/* 11/19 운영자 [공지 쓰기]는 오른쪽 위 선물 옆(MegaPinButton)으로 — 이 줄은 음악·마을 소식만 (좁은 줄이 깨지지 않게) */}
      </div>
      {shownPins.length > 0 && (
        <ul className={cx(styles.pins, styles.pinsOpen)} aria-label="고정 소식">
          {shownPins.map((p) => (
            <li key={p.scope} className={styles.pin}>
              <div className={styles.pinBody}>
                {/* 모든 채널 공지는 딱지를 붉게 (전체 확성기와 같은 색) */}
                <span className={cx(styles.pinTag, p.scope === "all" && styles.pinTagAll)}>소식</span>
                {/* 11/22 데스크톱은 긴급 의뢰 자리 앞까지 한 줄 — 넘치면 …, 올리면 전문 */}
                <span className={styles.pinText} title={p.text}>
                  {p.text}
                </span>
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
      {open && (
        <ol ref={logRef} className={styles.log} aria-label="최근 소식 20개">
          {entries.length === 0 && <li className={styles.empty}>아직 마을 소식이 없어요</li>}
          {entries.map((e) => (
            // 11/22 좁은 데스크톱은 줄마다 한 줄로 줄인다 (MegaphoneFeed.module.css) — 올리면 전문
            <li key={e.id} className={cx(styles.line, flash?.id === e.id && styles.newLine)} title={e.system ? e.text : `${e.name}: ${e.text}`}>
              {/* 11/21 마을 공지 줄(시스템)은 보낸 이 이름 대신 「소식」 딱지 하나 */}
              {e.system ? (
                <span className={styles.newsTag}>소식</span>
              ) : (
                <>
                  {e.scope === "all" && <span className={styles.all}>전체</span>}
                  <b className={cx(styles.name, e.staff && styles.staff)}>
                    {/* 11/15 운영자는 닉네임 그대로라 "운영자" 딱지로 알린다 */}
                    {e.staff && <span className={styles.staffTag}>운영자</span>}
                    {e.mgr && !e.staff && <span className={styles.mgrTag}>매니저</span>}
                    {e.name}
                  </b>
                </>
              )}
              <span className={styles.text}>{e.text}</span>
              {/* 47번 확성기 신고 (운영자 확성기는 신고 대상이 아니라 버튼이 없다) */}
              {!e.staff && (
                <button
                  type="button"
                  className={styles.report}
                  aria-label={`${e.name}의 외침 신고`}
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
      {removing && iAmStaff && <MegaPinRemove channel={channel} pin={removing} onClose={() => setRemoving(null)} />}
    </section>
  );
}

/**
 * 11/17 터치 화면 고정 공지 칩: 긴급 의뢰 칩 아래(없으면 그 자리)에 [📌 공지] 한 줄. 누르면 공지 전문이 펼쳐지고 다시 누르면 접힌다.
 * 11/22 왼쪽 위 칩 묶음(TopLeftCluster) 둘째 줄 맨 앞 (펼치면 한 줄을 다 쓴다). 그 아래 칸은 묶음 높이(--tl-bottom)로 내려간다.
 * 운영자에게는 펼친 안에 [지우기] (11/19 [공지 쓰기]는 위쪽 줄 운영자 단추 MegaPinButton으로 옮겼다)
 */
function PinChip({ channel, pins, staff, onRemove }: { channel: number; pins: MegaPin[]; staff: boolean; onRemove: (p: MegaPin) => void }) {
  const [open, setOpen] = useState(false);
  // 11/19 운영자 쓰기 단추는 위쪽 줄(MegaPinButton)로 옮겼다 — 칩은 공지가 있을 때만
  if (pins.length === 0) return null;
  return (
    <TopLeftItem kind="pin" overlay>
      <div className={styles.pinChipBox} data-open={open || undefined}>
        <button
          type="button"
          className={cx(styles.pinChip, open && styles.pinChipOpen)}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <span aria-hidden="true">📌</span>
          소식
          {pins.length > 1 && <span className={styles.pinMore}>{pins.length}</span>}
        </button>
        {open && (
          <ul className={cx(styles.pins, styles.pinsOpen, styles.pinSheet)} aria-label="고정 소식">
            {pins.map((p) => (
              <li key={p.scope} className={styles.pin}>
                <button type="button" className={styles.pinBody} onClick={() => setOpen(false)}>
                  <span className={cx(styles.pinTag, p.scope === "all" && styles.pinTagAll)}>소식</span>
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
          </ul>
        )}
      </div>
    </TopLeftItem>
  );
}

/**
 * 11/19 운영자 전용 [📌 공지 쓰기] — 오른쪽 위 단추 줄의 선물 단추 바로 옆(데스크톱), 폰은 위쪽 줄의 운영자 단추 옆.
 * 누르면 예전과 같은 공지 쓰기 창. 일반 사용자에게는 아무것도 그리지 않는다. 공지 [지우기]는 공지 줄마다 그대로
 */
export function MegaPinButton({ channel, className }: { channel: number; className?: string }) {
  const iAmStaff = useBridgeValue("me:staff")?.on === true;
  const { pins } = useMegaphone();
  const [writing, setWriting] = useState(false);
  if (!iAmStaff) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setWriting(true)} aria-label="공지 쓰기 (운영자)" title="공지 쓰기 (운영자)">
        <span aria-hidden="true">📌</span>
      </button>
      {writing && <MegaPinDialog channel={channel} pins={pins} onClose={() => setWriting(false)} />}
    </>
  );
}
