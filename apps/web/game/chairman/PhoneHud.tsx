"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import RpgIcon from "@/components/rpg/RpgIcon";
import { cx } from "@/components/ui/cx";
import PixelIcon from "@/components/ui/PixelIcon";
import ui from "@/components/ui/ui.module.css";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import type { RpgHud } from "@/lib/rpg/types";
import { bridge, type UiEvents } from "../bridge";
import { CHAIR_HEAL_TEXT, chairTimes } from "./rules";
import { SealIcons } from "./SealParts";
import { sealCard } from "./sealText";
import s from "./chairman.module.css";

// 11/21 회장님 독대 폰 HUD (시안 B 「체력은 머리 위」): 체력·SP는 HuntScene이 이름 아래에 그리고,
// 위에는 판 없이 테두리 글자만 — 왼쪽 단계·버틴 시간·다음 단계까지(11/22), 오른쪽 이번 판 피해(크게)·다음 반려(헬)·멈춤·무적(개발 운영자).
// 피해 숫자를 누르면 자세히 칸(D처럼): 체력·SP 숫자 · 초당 피해 · 내 최고 · 반려함 · 회복 감소 · 스킬 자동 전체 · 능력.
// 회복 감소 한 줄은 싸움 시작 뒤 3초만 보였다가 숨는다.
// 11/22 사용자 「모바일에서 반려 리스트를 출력하기엔 빡센가?」 → 「반려 N초」 밑에 반려된 스킬 작은 아이콘 줄 (새것이 오른쪽 · 6개 + 「+N」) — 누르면 자세히 칸.

type Lv = Partial<Record<string, number>>;
type ChairHud = UiEvents["chairman:hud"];

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const HEAL_SHOW_MS = 3_000;
const STRIP_MAX = 6;
const REVEAL_MS = 3_000;

export function PhoneTop({
  hotbar,
  skills,
  briefing,
  onPause,
  godBtn,
}: {
  hotbar: readonly (string | null)[];
  skills: Lv;
  briefing: boolean;
  onPause: () => void;
  godBtn?: ReactNode;
}) {
  const [rh, setRh] = useState<RpgHud | null>(null);
  const [ch, setCh] = useState<ChairHud | null>(null);
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(false);
  const [heal, setHeal] = useState(false);
  useBridgeEvent("rpg:hud", setRh);
  useBridgeEvent("chairman:hud", setCh);
  // 회복 감소: 브리핑이 걷히면 3초 (판을 띄운 직후 브리핑이 오기 전에는 안 띄운다)
  const briefed = useRef(false);
  useEffect(() => {
    if (briefing) {
      briefed.current = true;
      return;
    }
    if (!briefed.current) return;
    setHeal(true);
    const t = setTimeout(() => setHeal(false), HEAL_SHOW_MS);
    return () => clearTimeout(t);
  }, [briefing]);

  const c = rh?.chair;
  const t = chairTimes(c?.ms ?? 0);
  const sl = ch?.seal;
  const reveal = !!sl?.next && sl.left <= REVEAL_MS;
  const next = reveal && sl?.next ? sealCard(sl.next, skills[sl.next] ?? 0, hotbar) : null;
  const practice = !!(ch?.practice ?? c?.practice);
  // 11/22 무적(시험)을 켰거나 켠 채 싸운 판 (개발 서버 운영자) — 연습과 따로 보라색
  const godRun = !practice && !!(ch?.god || ch?.godUsed);
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div className={s.phTop} data-practice={practice || undefined}>
      <div className={s.phL}>
        <p className={s.phPhase}>
          {c?.phase ?? "1단계"}
          {practice && <i className={s.phTag}>연습</i>}
          {godRun && <i className={cx(s.phTag, s.phGod)}>무적 시험</i>}
        </p>
        {/* 11/22 시간 칸 둘: 버틴 시간 · 다음 단계까지 (크런치면 「지금 단계 크런치」 — PC 계기판과 같은 글 rules chairTimes). 헬 다음 반려는 오른쪽 「반려 N초」 */}
        <dl className={s.phTimes}>
          <div>
            <dt>버틴 시간</dt>
            <dd>{t.up}</dd>
          </div>
          <div className={cx(t.crunch && s.phCrunch)}>
            <dt>{t.phLabel}</dt>
            <dd>{t.ph}</dd>
          </div>
        </dl>
        {heal && <p className={s.phHeal}>{CHAIR_HEAL_TEXT}</p>}
      </div>
      <div className={s.phR}>
        <button
          type="button"
          className={s.phDmg}
          onPointerDown={stop}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`이번 판 피해${sl?.ids.length ? `, 반려 ${sl.ids.length}개` : ""}. 누르면 자세히 봐요`}
        >
          <small>이번 판</small>
          <b>{fmt(ch?.total ?? 0)}</b>
          {sl && (
            <span className={cx(s.phSeal, reveal && s.phSealSoon)}>
              {!sl.next ? (
                "다 반려됨"
              ) : next ? (
                <>
                  {next.art && <RpgIcon art={next.art} size={16} />}곧 반려 {next.name}
                </>
              ) : (
                <>
                  <i className={s.phRing} style={{ "--k": String(Math.min(1, sl.left / 45_000)) } as React.CSSProperties} />
                  반려 {Math.ceil(sl.left / 1000)}초
                </>
              )}
            </span>
          )}
          {sl && sl.ids.length > 0 && <SealStrip ids={sl.ids} hotbar={hotbar} skills={skills} />}
        </button>
        <div className={s.phBtns}>
          <button type="button" className={cx(ui.button, ui.icon, s.phPause)} onPointerDown={stop} onClick={onPause} aria-label="멈춤">
            <PixelIcon name="pause" />
          </button>
          {godBtn}
        </div>
      </div>
      {open && (
        <section className={s.phSheet} aria-label="이번 판 자세히" onPointerDown={stop}>
          <dl className={s.phRows}>
            <div>
              <dt>HP</dt>
              <dd>
                {fmt(rh?.hp ?? 0)} / {fmt(rh?.maxHp ?? 0)}
              </dd>
            </div>
            <div>
              <dt>SP</dt>
              <dd>
                {fmt(rh?.sp ?? 0)} / {fmt(rh?.maxSp ?? 0)}
              </dd>
            </div>
            <div>
              <dt>초당 피해</dt>
              <dd>{fmt(ch?.dps ?? 0)}</dd>
            </div>
            <div>
              <dt>내 최고</dt>
              <dd>{ch && ch.best > 0 ? fmt(ch.best) : "첫 기록 도전 중"}</dd>
            </div>
          </dl>
          {sl && (
            <div className={s.phBox}>
              <p>
                <b>반려 {sl.ids.length}</b>
                <span>남은 스킬 {sl.total - sl.ids.length}</span>
              </p>
              {sl.ids.length > 0 ? <SealIcons ids={sl.ids} hotbar={hotbar} skills={skills} size={30} /> : <span className={s.phNone}>아직 반려된 스킬이 없어요</span>}
            </div>
          )}
          <p className={s.phNote}>{CHAIR_HEAL_TEXT}</p>
          {practice && <p className={s.phPrac}>연습이라 기록이 남지 않아요</p>}
          {godRun && <p className={cx(s.phPrac, s.phGodNote)}>무적 시험 판이라 기록이 남지 않아요</p>}
          {stats && rh?.stats && (
            <dl className={cx(s.phRows, s.phStats)}>
              {rh.stats.rows.map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.v}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className={s.phPills}>
            {rh?.auto && (
              <button type="button" className={s.phPill} aria-pressed={rh.auto.on} onClick={() => bridge.emit("rpg:action", { kind: "auto", slot: "all", every: true })}>
                스킬 자동 {rh.auto.on ? "켜짐" : "꺼짐"}
              </button>
            )}
            <button type="button" className={s.phPill} aria-pressed={stats} onClick={() => setStats((v) => !v)}>
              능력
            </button>
            <button type="button" className={s.phPill} onClick={() => setOpen(false)}>
              닫기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** 반려된 스킬 작은 아이콘 줄 (단추 안이라 span만 — 빨간 도장 빛 · 새것이 오른쪽 · 넘치면 왼쪽에 「+N」) */
function SealStrip({ ids, hotbar, skills }: { ids: readonly string[]; hotbar: readonly (string | null)[]; skills: Lv }) {
  const more = ids.length - STRIP_MAX;
  const shown = more > 0 ? ids.slice(-STRIP_MAX) : ids;
  return (
    <span className={s.phStrip} aria-hidden="true">
      {more > 0 && <i className={s.phMore}>+{more}</i>}
      {shown.map((id) => {
        const c = sealCard(id, skills[id] ?? 0, hotbar);
        return (
          <span key={id} className={s.phStripIc}>
            {c.art && <RpgIcon art={c.art} size={16} />}
          </span>
        );
      })}
    </span>
  );
}

/** 단계·반려 알림: 가운데 한 줄 1.5초 (폰) */
export function CenterLine({ children, hot }: { children: ReactNode; hot?: boolean }) {
  return (
    <p className={cx(s.cline, hot && s.clineHot)} role="status" aria-live="assertive">
      {children}
    </p>
  );
}
