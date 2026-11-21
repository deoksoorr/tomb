"use client";

import { useRef, useState } from "react";
import RpgIcon from "@/components/rpg/RpgIcon";
import { cx } from "@/components/ui/cx";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { sealCard } from "./sealText";
import s from "./chairman.module.css";

// 11/21 사용자 「자동 반려면 표현을 해 줘야지. 패시브는 티가 안 난다」: 헬 반려를 눈에 보이게.
//  - SealDock: 스킬 칸 바로 위 — 다음 반려까지 남은 시간 고리 · 3초 전엔 무엇이 반려될지(패시브도) · 반려함(순서대로)
//  - SealCenter(PC): 11/22 사용자 「예고는 맵 가운데 크게」 — 3초 전 가운데 카드(아이콘·이름·종류·3-2-1) → 반려 순간 같은 카드에 「반려」 도장 → 걷힌다.
//    회장님·말풍선·내 캐릭터가 밑에 오면 옮기지 않고 반투명
// 고리는 hud(초당 8번)마다 DOM만 바꾼다 (React 다시 그리기는 남은 초·반려·예고가 바뀔 때만)

type Lv = Partial<Record<string, number>>;
type Bar = readonly (string | null)[];
type St = { ids: string[]; next: string | null; reveal: boolean; total: number; secs: number };

const REVEAL_MS = 3_000;
const EVERY_MS = 45_000;

/** box=false: 11/21 PC — 반려함은 위 계기판 아래 아이콘 줄(SealRow)이 맡아서 여기는 시계만. reveal=false: 11/22 PC — 3초 예고는 가운데 카드(SealCenter)가 맡는다 */
export function SealDock({ hotbar, skills, box = true, reveal: showReveal = true }: { hotbar: Bar; skills: Lv; box?: boolean; reveal?: boolean }) {
  const [st, setSt] = useState<St | null>(null);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const ring = useRef<HTMLSpanElement>(null);
  useBridgeEvent("chairman:hud", (h) => {
    const sl = h.seal;
    if (!sl) return;
    const reveal = showReveal && !!sl.next && sl.left <= REVEAL_MS;
    const secs = Math.ceil(sl.left / 1000);
    setSt((p) => (p && p.ids.length === sl.ids.length && p.next === sl.next && p.reveal === reveal && p.total === sl.total && p.secs === secs ? p : { ids: sl.ids, next: sl.next, reveal, total: sl.total, secs }));
    ring.current?.style.setProperty("--k", String(Math.min(1, sl.left / EVERY_MS)));
  });
  if (!st) return null;
  const done = !st.next;
  const next = st.next ? sealCard(st.next, skills[st.next] ?? 0, hotbar) : null;
  const shown = pick && st.ids.includes(pick) ? pick : st.ids[st.ids.length - 1];
  const shownCard = shown ? sealCard(shown, skills[shown] ?? 0, hotbar) : null;
  const left = st.total - st.ids.length;
  return (
    <div className={s.sealDock} data-reveal={st.reveal || undefined}>
      {box && (
      <div className={s.sealBox} data-open={open || undefined}>
        {/* 폰: 접힌 칩 「반려 3」 → 눌러서 펼친다 */}
        <button type="button" className={s.sealChip} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`반려함, ${st.ids.length}개 반려됨, 남은 스킬 ${left}개`}>
          반려 <b>{st.ids.length}</b>
        </button>
        <div className={s.sealList}>
          <p className={s.sealHead}>
            반려함 <b>{st.ids.length}</b>
            <span>남은 스킬 {left}</span>
          </p>
          {st.ids.length > 0 && (
            <ul>
              {st.ids.map((id) => {
                const c = sealCard(id, skills[id] ?? 0, hotbar);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={cx(s.sealItem, id === shown && s.sealItemOn)}
                      title={`${c.kind} · ${c.name}`}
                      aria-label={`${c.kind} ${c.name} 반려됨`}
                      onPointerEnter={() => setPick(id)}
                      onClick={() => setPick(id)}
                    >
                      {c.art && <RpgIcon art={c.art} size={32} />}
                      <i>반려</i>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={s.sealPick}>{shownCard ? `${shownCard.kind} · ${shownCard.name}` : "아직 반려된 스킬이 없어요"}</p>
        </div>
      </div>
      )}
      <div className={s.sealClock} role="timer" aria-live={st.reveal ? "assertive" : "off"} aria-label={done ? "모든 스킬이 반려됐어요" : st.reveal && next ? `곧 반려, ${next.kind} ${next.name}` : "다음 반려까지 남은 시간"}>
        <span ref={ring} className={s.sealRing}>
          {st.reveal && next?.art ? <RpgIcon art={next.art} size={32} /> : <i>반려</i>}
        </span>
        <span className={s.sealTxt}>
          {done ? (
            <b>다 반려됐어요</b>
          ) : st.reveal && next ? (
            <>
              <em>곧 반려돼요</em>
              <b>
                {next.kind} · {next.name}
              </b>
            </>
          ) : (
            <>
              <em>다음 반려까지</em>
              <b>{st.secs}초</b>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

/** 반려된 스킬 아이콘 줄 (반려 순서 — 새것이 오른쪽, 빨간 도장, 이름은 툴팁). PC 계기판 아래 · 폰 자세히 칸 */
export function SealIcons({ ids, hotbar, skills, size = 28 }: { ids: readonly string[]; hotbar: Bar; skills: Lv; size?: number }) {
  return (
    <ul className={s.sealIcons}>
      {ids.map((id) => {
        const c = sealCard(id, skills[id] ?? 0, hotbar);
        return (
          <li key={id} title={`${c.kind} · ${c.name} 반려됨`} aria-label={`${c.kind} ${c.name} 반려됨`} style={{ width: size, height: size }}>
            {c.art && <RpgIcon art={c.art} size={size} />}
            <i>반려</i>
          </li>
        );
      })}
    </ul>
  );
}

/** PC 계기판 아래 반려 줄 + 남은 스킬 수 (반려가 생길 때만 다시 그린다) */
export function SealRow({ hotbar, skills }: { hotbar: Bar; skills: Lv }) {
  const [st, setSt] = useState<{ ids: string[]; total: number } | null>(null);
  useBridgeEvent("chairman:hud", (h) => {
    const sl = h.seal;
    if (!sl) return;
    setSt((p) => (p && p.ids.length === sl.ids.length && p.total === sl.total ? p : { ids: sl.ids, total: sl.total }));
  });
  if (!st || !st.ids.length) return null;
  return (
    <div className={s.sealRow} aria-label={`반려된 스킬 ${st.ids.length}개`}>
      <SealIcons ids={st.ids} hotbar={hotbar} skills={skills} />
      <span className={s.sealRowLeft}>남은 스킬 {st.total - st.ids.length}</span>
    </div>
  );
}

export type StampEv = { id: string; line: string; reduced: boolean; side: "l" | "r"; at: number };

const hit = (b: readonly number[] | undefined, r: DOMRect) => !!b && b[0] < r.right && b[2] > r.left && b[1] < r.bottom && b[3] > r.top;

/**
 * 11/22 PC 반려 카드 (맵 가운데): 3초 전부터 다음 반려 스킬(아이콘·종류·이름·잃는 것) + 3·2·1 → 반려 순간(stamp) 같은 카드에 「반려」 도장이 꽝 → 걷힌다.
 * stamp는 ChairmanOverlay가 2.6초 들고 있다. 회장님 몸·말풍선·내 캐릭터가 카드 밑이면 반투명 (자리는 그대로)
 */
export function SealCenter({ stamp, hotbar, skills }: { stamp: StampEv | null; hotbar: Bar; skills: Lv }) {
  const [pre, setPre] = useState<{ id: string; n: number } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  useBridgeEvent("chairman:hud", (h) => {
    const sl = h.seal;
    const next = sl?.next && sl.left <= REVEAL_MS ? { id: sl.next, n: Math.max(1, Math.ceil(sl.left / 1000)) } : null;
    setPre((p) => (p?.id === next?.id && p?.n === next?.n ? p : next));
    const d = el.current;
    if (!d) return;
    const r = d.getBoundingClientRect();
    d.classList.toggle(s.centerUnder, hit(h.box, r) || hit(h.me, r));
  });
  const id = stamp?.id ?? pre?.id;
  if (!id) return null;
  const c = sealCard(id, skills[id] ?? 0, hotbar);
  const done = !!stamp;
  return (
    <div
      ref={el}
      className={cx(s.center, done && s.centerDone, done && stamp.reduced && s.centerStill)}
      role="status"
      aria-live="assertive"
      aria-label={done ? `${c.kind} ${c.name} 반려됐어요` : `${pre?.n}초 뒤 반려, ${c.kind} ${c.name}`}
    >
      <p className={s.centerHead}>{done ? `「${stamp.line}」` : "곧 반려돼요"}</p>
      <div className={s.centerBody}>
        <span className={s.centerIcon}>
          {c.art && <RpgIcon art={c.art} size={64} />}
          {done && <i>반려</i>}
        </span>
        <span className={s.centerTxt}>
          <em data-kind={c.kind}>{c.kind}</em>
          <b>{c.name}</b>
          <span>{c.lost}</span>
        </span>
        {!done && pre && (
          <span key={pre.n} className={s.centerCount} aria-hidden="true">
            {pre.n}
          </span>
        )}
      </div>
    </div>
  );
}
