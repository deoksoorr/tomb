"use client";

import { useEffect, useRef, useState } from "react";
import RunHud from "@/components/rpg/RunHud";
import { cx } from "@/components/ui/cx";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { CHAIR_UNFAIR_TEXT, chairQuitNote } from "@/lib/chairman/rules";
import type { SkillId } from "@/lib/rpg/catalog";
import { bridge, type UiEvents } from "../bridge";
import { sealBrief } from "@/components/chairman/chairText";
import { CHAIR_HEAL_MUL, chairTimes, clock, MODE_NAME, phaseName } from "./rules";
import { CenterLine, PhoneTop } from "./PhoneHud";
import { sealCard } from "./sealText";
import RpgIcon from "@/components/rpg/RpgIcon";
import { SealCenter, SealDock, SealRow, type StampEv } from "./SealParts";
import s from "./chairman.module.css";
import { usePageZoomLock } from "@/lib/hooks/usePageZoomLock";

// 11/20 회장님 독대 오버레이 (ChairmanHostScene이 document.body에 띄운다):
// 사냥 HUD(체력·스킬 칸·물약·낙법·조이스틱 — RunHud 그대로) + 위 가운데 피해 계기판 + 업무 브리핑 + 처음 보는 기술 + 배너 + 결과 창.
// 계기판 숫자는 매 프레임 DOM 글자만 바꾼다 (React 다시 그리기 없이).

type Hud = UiEvents["chairman:hud"];
type Result = UiEvents["chairman:result"];
type Status = "starting" | "fight" | "dead" | "error";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;


/** PC 위 가운데 피해 계기판 (11/21 시간 칸 셋 · 아래 반려 아이콘 줄 — 회장님이 밑에 오면 통째로 흐려진다) */
function Meter({ hotbar, skills }: { hotbar: readonly (string | null)[]; skills: Partial<Record<string, number>> }) {
  const hud = useRef<Hud | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const totalEl = useRef<HTMLParagraphElement>(null);
  const dpsEl = useRef<HTMLElement>(null);
  const heatEl = useRef<HTMLElement>(null);
  const bestEl = useRef<HTMLElement>(null);
  const progEl = useRef<HTMLElement>(null);
  const leftEl = useRef<HTMLSpanElement>(null);
  const upEl = useRef<HTMLElement>(null);
  const phLabel = useRef<HTMLElement>(null);
  const phEl = useRef<HTMLElement>(null);
  const sealEl = useRef<HTMLElement>(null);
  const [hell, setHell] = useState(false);
  useBridgeEvent("chairman:hud", (h) => {
    hud.current = h;
    if ((h.mode === "hell") !== hell) setHell(h.mode === "hell");
  });
  useEffect(() => {
    let shown = 0;
    let shownDps = 0;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const h = hud.current;
      const el = root.current;
      if (!h || !el) return;
      shown += (h.total - shown) * Math.min(1, dt * 10);
      if (h.total < shown) shown = h.total;
      shownDps += (h.dps - shownDps) * Math.min(1, dt * 4);
      const best = h.best;
      const rec = best > 0 && h.total > best;
      const heat = Math.min(1, shownDps / Math.max(140000, best / 300));
      totalEl.current!.textContent = fmt(shown);
      dpsEl.current!.textContent = fmt(shownDps);
      heatEl.current!.style.width = `${(heat * 100).toFixed(1)}%`;
      bestEl.current!.textContent = fmt(best);
      progEl.current!.style.width = `${(best > 0 ? Math.min(1, shown / best) * 100 : 0).toFixed(1)}%`;
      leftEl.current!.textContent = best <= 0 ? "첫 기록 도전 중" : rec ? "신기록 달성 중!" : `신기록까지 ${fmt(best - shown)}`;
      // 11/21 시간 칸: 버틴 시간 · 다음 단계까지(크런치면 「크런치」) · 다음 반려까지(헬)
      const t = chairTimes(h.ms ?? 0);
      upEl.current!.textContent = t.up;
      phLabel.current!.textContent = t.phLabel;
      phEl.current!.textContent = t.ph;
      el.classList.toggle(s.crunchNow, t.crunch);
      if (sealEl.current) {
        const sl = h.seal;
        sealEl.current.textContent = !sl ? "-" : sl.next ? clock(sl.left) : "다 반려됨";
        el.classList.toggle(s.sealSoon, !!sl?.next && sl.left <= 3_000);
      }
      el.classList.toggle(s.rec, rec);
      el.classList.toggle(s.hot, heat > 0.75);
      el.classList.toggle(s.under, h.under);
      el.classList.toggle(s.practice, h.practice);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={root} className={s.meter} role="status" aria-label="이번 판 피해">
      <p className={s.mk}>이번 판 피해</p>
      <p ref={totalEl} className={s.total}>
        0
      </p>
      <div className={s.row}>
        <span className={s.dps}>
          초당 <b ref={dpsEl}>0</b>
        </span>
        <span className={s.heat}>
          <i ref={heatEl} />
        </span>
      </div>
      <div className={s.row}>
        <span className={s.best}>
          내 최고 <b ref={bestEl}>0</b>
        </span>
        <span ref={leftEl} className={s.left} />
      </div>
      {/* 11/20 연습 판일 때만 (.meter.practice) */}
      <span className={s.pnote}>연습이라 기록이 남지 않아요</span>
      <span className={s.prog}>
        <i ref={progEl} />
      </span>
      {/* 11/21 시간 칸 셋 (이름 위 · 값 아래) */}
      <dl className={s.timers}>
        <div>
          <dt>버틴 시간</dt>
          <dd>
            <b ref={upEl}>0:00</b>
          </dd>
        </div>
        <div className={s.tPhase}>
          <dt ref={phLabel}>다음 단계까지</dt>
          <dd>
            <b ref={phEl}>1:00</b>
          </dd>
        </div>
        {hell && (
          <div className={s.tSeal}>
            <dt>다음 반려까지</dt>
            <dd>
              <b ref={sealEl}>-</b>
            </dd>
          </div>
        )}
      </dl>
      {hell && <SealRow hotbar={hotbar} skills={skills} />}
    </div>
  );
}

/** 11/22 브리핑 멈춤 창 나가기 안내: 첫 문장 + 나머지 (돌려받기면 초록, 판을 쓰면 주황, 연습은 그대로) */
function QuitNote({ text }: { text: string }) {
  const k = text.indexOf(". ");
  const [head, rest] = k < 0 ? [text, ""] : [text.slice(0, k + 1), text.slice(k + 2)];
  return (
    <p className={s.pauseNote}>
      {head}
      {rest && <small data-tone={rest.includes("돌려드려요") ? "good" : rest.includes("쓴 것으로") ? "warn" : undefined}>{rest}</small>}
    </p>
  );
}

/** 11/21 개발 서버 운영자 무적(시험) 단추 (키 안내 옆 · G) — 운영 빌드에서는 그리지 않는다 */
const GOD_UI = process.env.NODE_ENV !== "production";
function GodBtn({ on, small }: { on: boolean; small: boolean }) {
  return (
    <button
      type="button"
      className={cx(s.godBtn, on && s.godOn, small && s.godSmall)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => bridge.emit("chairman:god")}
      aria-pressed={on}
      aria-label={`무적(시험) ${on ? "켜짐" : "꺼짐"}`}
      title="시험용: 맞지 않고 즉사도 없어요. 켠 판은 기록이 남지 않아요"
    >
      {/* 11/21 손가락 기기: 「무적」 두 글자 작은 단추 (켜짐은 초록) */}
      {small ? (
        "무적"
      ) : (
        <>
          무적 {on ? "켜짐" : "꺼짐"} <kbd>G</kbd>
        </>
      )}
    </button>
  );
}

/** 11/22 사용자 「처음 입장 설명이 구구절절 길다 → 간략화」: 3초 안에 읽히게 칩 두 줄 + (헬) 한 줄 + 시작 단추. 기술마다 피하는 법은 「처음 보는 기술」이 알려 준다 */
function Brief({ phase, hell, slim, onGo }: { phase: number; hell: boolean; slim: boolean; onGo: () => void }) {
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const touch = slim || coarse;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        onGo();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onGo]);
  return (
    <div className={s.brief} role="dialog" aria-label="업무 브리핑">
      <p className={s.bTitle}>
        업무 브리핑 <small>{phaseName(phase)}</small>
      </p>
      <ul className={s.chips} aria-label="바닥 색">
        <li>
          <i className={s.lr} />
          맞아요
        </li>
        <li>
          <i className={s.lg} />
          안전
        </li>
        <li>
          <i className={s.ly} />
          구르기
        </li>
      </ul>
      <ul className={s.chips} aria-label="조작">
        {touch ? (
          <>
            <li className={s.cKey}>
              <kbd>달리기</kbd>
            </li>
            <li className={s.cKey}>
              <kbd>구르기</kbd>
            </li>
          </>
        ) : (
          <>
            <li className={s.cKey}>
              <kbd>Shift</kbd> 달리기
            </li>
            <li className={s.cKey}>
              <kbd>Z</kbd> 구르기
            </li>
          </>
        )}
        <li className={s.cHeal}>회복 −{Math.round((1 - CHAIR_HEAL_MUL) * 100)}%</li>
        <li className={s.cCoffee}>단계마다 커피 ☕</li>
      </ul>
      {hell && <p className={s.sealRuleTip}>{sealBrief(45_000)}</p>}
      <button type="button" className={s.btn} onClick={onGo} autoFocus>
        바로 시작{!touch && <kbd>Enter</kbd>}
      </button>
    </div>
  );
}

function Confetti() {
  return (
    <div className={s.confetti} aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 9) * 0.12}s`, background: ["#ffd25a", "#ff7a9a", "#9ad8ff", "#9ff0c8", "#fff4dc"][i % 5] }} />
      ))}
    </div>
  );
}

function ResultCard({ r }: { r: Result }) {
  const num = useRef<HTMLParagraphElement>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1600);
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      if (num.current) num.current.textContent = fmt(r.damage * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [r.damage]);
  const left = r.remaining ? r.remaining[r.mode] : 0;
  // 11/22 무적(시험)을 켠 실전 판: 「연습」이 아니라 「무적 시험」으로 따로 (진짜 연습 판만 연습 모드)
  const god = !r.practice && r.god === true;
  return (
    <div className={cx(s.result, r.practice && s.practice, god && s.godRun)} role="dialog" aria-label="회장님 독대 결과">
      {done && r.newBest && <Confetti />}
      {r.practice && <p className={s.pband}>연습 모드</p>}
      {god && <p className={cx(s.pband, s.godBand)}>무적 시험</p>}
      <p className={s.bk}>
        회장님 독대 · {MODE_NAME[r.mode]}
        {r.practice ? " · 연습 판 (포인트·기록 없음)" : god ? " · 무적 시험 판 (포인트·기록 없음)" : ""}
      </p>
      <h3>퇴근 실패… 회장님은 사표를 반려했습니다</h3>
      <p className={s.rk}>넣은 피해</p>
      <p ref={num} className={s.rTotal}>
        0
      </p>
      {done && r.newBest && <p className={s.newBest}>최고 기록 갱신!</p>}
      <dl className={s.rList}>
        <div>
          <dt>버틴 시간</dt>
          <dd>{mmss(r.durationMs)}</dd>
        </div>
        <div>
          <dt>내 최고</dt>
          <dd>{fmt(r.best)}</dd>
        </div>
        {/* 11/22 기록이 안 남는 판(연습·무적 시험)은 순위 줄을 뺀다 */}
        {r.weekRank !== null && !r.practice && !god && (
          <div>
            <dt>이번 주 순위</dt>
            <dd>{r.weekRank}위</dd>
          </div>
        )}
      </dl>
      {r.error ? (
        <p className={s.warn}>기록을 보내지 못했어요: {r.error}</p>
      ) : r.practice ? (
        <p className={s.pts}>연습 판이라 포인트와 기록은 없어요</p>
      ) : god ? (
        <p className={s.pts}>무적 시험 판이라 기록이 남지 않아요</p>
      ) : r.pointsReason ? (
        <p className={s.warn}>{r.pointsReason || CHAIR_UNFAIR_TEXT}</p>
      ) : (
        <p className={s.pts}>
          판 포인트 <b>+{fmt(r.points ?? 0)}P</b>
        </p>
      )}
      <div className={s.btns}>
        <button type="button" className={s.btn} onClick={() => bridge.emit("chairman:retry")}>
          {left > 0 && !r.practice ? `한 판 더 (오늘 ${left}판 남음)` : "연습 판 한 번 더"}
        </button>
        <button type="button" className={s.btnGhost} onClick={() => bridge.emit("chairman:exit")}>
          마을로
        </button>
      </div>
    </div>
  );
}

/** 폰 반려 알림 한 줄: 아이콘 + 「종류 · 이름 반려」 */
function SealLine({ ev, hotbar, skills }: { ev: StampEv; hotbar: readonly (string | null)[]; skills: Partial<Record<string, number>> }) {
  const c = sealCard(ev.id, skills[ev.id] ?? 0, hotbar);
  return (
    <CenterLine hot>
      {c.art && <RpgIcon art={c.art} size={20} />}
      {c.kind} · {c.name} <b>반려</b>
    </CenterLine>
  );
}

export default function ChairmanOverlay() {
  useBlockingLayer(true);
  // 11/22 독대·결과 창 동안 페이지 확대 막기 (오버레이가 게임 셸 밖 body에 붙는다)
  usePageZoomLock();
  const [status, setStatus] = useState<Status>("starting");
  const [message, setMessage] = useState<string | null>(null);
  const [hotbar, setHotbar] = useState<(SkillId | null)[] | null>(null);
  // 11/21 헬 반려 예고·반려함·도장 (스킬 랭크 = 잃는 효과 수치)
  // 11/22 refundLeft·refundUntil: 브리핑 멈춤 창 판 돌려받기 안내 (유료 판만)
  const [play, setPlay] = useState<{ hell: boolean; practice: boolean; skills: Partial<Record<string, number>>; refundLeft?: number; refundUntil?: number }>({ hell: false, practice: false, skills: {} });
  // 11/22 브리핑에서 나가는 중 (판 돌려받기 답을 기다린다 — 브리핑·멈춤을 걷고 한 줄만)
  const [leaving, setLeaving] = useState(false);
  // 11/22 돌려받기 마감이 지났다 (멈춤 창을 열 때 · 열어 둔 채 마감이 오면 바뀐다)
  const [refundLate, setRefundLate] = useState(false);
  const [stamp, setStamp] = useState<StampEv | null>(null);
  const [brief, setBrief] = useState<number | null>(null);
  const [caption, setCaption] = useState<{ name: string; how: string; at: number } | null>(null);
  const [banner, setBanner] = useState<{ text: string; hot?: boolean; big?: boolean; at: number } | null>(null);
  const [phaseCard, setPhaseCard] = useState<{ n: number; name: string; sub: string; crunch: boolean; reduced: boolean; at: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [paused, setPaused] = useState(false);
  // 11/21 무적(시험): 개발 서버 운영자일 때만 hud에 실려 온다 (null = 단추 없음)
  const [god, setGod] = useState<boolean | null>(null);
  // 11/22 이번 판에 무적을 켠 채 싸운 적이 있다 (끄더라도 기록이 남지 않는다 — 「무적 시험」 표시는 남긴다)
  const [godUsed, setGodUsed] = useState(false);
  // 11/21 폰(세로 ≤560 · 낮은 가로 ≤520): 시안 B HUD (PhoneTop · 체력은 머리 위 — HuntScene chairCamPad와 같은 기준)
  // 손가락 기기(태블릿): 무적 표는 판 이름 옆 칩, 단추는 작게
  const slim = useMediaQuery("(max-width: 560px), (max-height: 520px)");
  const coarse = useMediaQuery("(pointer: coarse)");
  const tagIn = slim || coarse;
  useBridgeEvent("chairman:hud", (h) => {
    setGod(GOD_UI && typeof h.god === "boolean" ? h.god : null);
    setGodUsed(GOD_UI && h.godUsed === true);
  });
  const godRun = !!god || godUsed;
  useEffect(() => {
    if (god === null || result) return;
    // G는 마을 폭죽 창 단축키이기도 해서 먼저 잡고(capture) 넘기지 않는다
    const k = (e: KeyboardEvent) => {
      if (e.code !== "KeyG" || (e.target as HTMLElement | null)?.closest?.("input,textarea")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) bridge.emit("chairman:god");
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [god, result]);

  useBridgeEvent("rpg:play", (p) => {
    if (!p.chairman) return;
    setHotbar(p.hotbar);
    setPlay({ hell: p.chairman.mode === "hell", practice: p.chairman.practice, skills: p.skills, refundLeft: p.chairman.refundLeft, refundUntil: p.chairman.refundUntil });
    setLeaving(false);
    setStamp(null);
    setResult(null);
    setGod(null);
    setGodUsed(false);
    setStatus("fight");
  });
  useBridgeEvent("chairman:ui", (u) => {
    if (u.kind === "status") {
      setStatus(u.state === "fight" ? "fight" : u.state);
      setMessage(u.message ?? null);
      if (u.state === "starting") {
        setResult(null);
        setHotbar(null);
      }
      if (u.state === "fight") setBrief(null);
    } else if (u.kind === "brief") {
      setBrief(u.phase);
    }
    else if (u.kind === "caption") setCaption({ name: u.name, how: u.how, at: Date.now() });
    else if (u.kind === "banner") setBanner({ text: u.text, hot: u.hot, big: u.big, at: Date.now() });
    else if (u.kind === "seal") setStamp({ id: u.id, line: u.line, reduced: u.reduced, side: u.side ?? "l", at: Date.now() });
    else if (u.kind === "phase") setPhaseCard({ n: u.n, name: u.name, sub: u.sub, crunch: u.crunch, reduced: u.reduced, at: Date.now() });
  });
  useBridgeEvent("chairman:result", (r) => {
    setResult(r);
    setPaused(false);
  });
  // 처음 보는 기술·배너는 잠깐 떴다 사라진다
  useEffect(() => {
    if (!caption) return;
    const t = setTimeout(() => setCaption(null), 2600);
    return () => clearTimeout(t);
  }, [caption]);
  // 단계 전환 화면 (게임은 1.4초 슬로 — 화면은 조금 더 남았다가 걷힌다)
  useEffect(() => {
    if (!phaseCard) return;
    const t = setTimeout(() => setPhaseCard(null), slim ? 1500 : 1700);
    return () => clearTimeout(t);
  }, [phaseCard, slim]);
  useEffect(() => {
    if (!stamp) return;
    const t = setTimeout(() => setStamp(null), slim ? 1500 : 2600);
    return () => clearTimeout(t);
  }, [stamp, slim]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2400);
    return () => clearTimeout(t);
  }, [banner]);

  const pause = () => {
    if (result || status !== "fight" || leaving) return;
    setPaused(true);
    setRefundLate(Date.now() > (play.refundUntil ?? 0));
    bridge.emit("rpg:pause", { paused: true });
  };
  const resume = () => {
    setPaused(false);
    bridge.emit("rpg:pause", { paused: false });
  };
  useEffect(() => {
    if (!paused || refundLate || !play.refundUntil) return;
    const t = setTimeout(() => setRefundLate(true), Math.max(0, play.refundUntil - Date.now()));
    return () => clearTimeout(t);
  }, [paused, refundLate, play.refundUntil]);
  // Esc: 멈춤 창 열기·닫기 (사냥 로비와 같은 키)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || result || status !== "fight" || leaving) return;
      e.preventDefault();
      if (paused) resume();
      else pause();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  return (
    <>
      {hotbar && !result && (
        <RunHud
          game="hunt"
          hotbar={hotbar}
          onPause={pause}
          title="회장님 독대"
          slim={slim}
          topExtra={god !== null && !slim ? <GodBtn on={god} small={tagIn} /> : undefined}
          barTop={play.hell && brief === null && !slim ? <SealDock hotbar={hotbar} skills={play.skills} box={false} reveal={false} /> : undefined}
          modeChip={godRun && tagIn && !slim ? <span className={s.godChip}>무적 시험 · 기록 안 남음</span> : undefined}
          noHint
        />
      )}
      <div className={s.layer}>
        {godRun && !result && !tagIn && <p className={s.godTag}>무적 시험 · 기록 안 남음</p>}
        {hotbar && !result && !slim && <Meter hotbar={hotbar} skills={play.skills} />}
        {hotbar && !result && slim && <PhoneTop hotbar={hotbar} skills={play.skills} briefing={brief !== null} onPause={pause} godBtn={god !== null ? <GodBtn on={god} small /> : undefined} />}
        {/* 11/22 멈춤 창이 떠 있으면 브리핑은 잠깐 걷는다 (멈춤 창만 보이게 · 브리핑의 Enter·Space도 같이 쉰다) */}
        {brief !== null && hotbar && !result && !paused && !leaving && <Brief phase={brief} hell={play.hell} slim={slim} onGo={() => bridge.emit("chairman:go")} />}
        {/* 11/22 PC: 다음 반려 예고(3·2·1)와 도장은 맵 가운데 카드 하나 */}
        {play.hell && hotbar && !result && !slim && brief === null && <SealCenter stamp={stamp} hotbar={hotbar} skills={play.skills} />}
        {/* 11/21 폰: 반려는 가운데 한 줄 1.5초. 11/22 같은 ms에 뜬 알림끼리 key가 겹치지 않게 앞에 종류를 붙인다 */}
        {stamp && !result && slim && <SealLine key={`seal${stamp.at}`} ev={stamp} hotbar={hotbar ?? []} skills={play.skills} />}
        {caption && !result && (
          <div key={`cap${caption.at}`} className={s.caption} role="note">
            <p className={s.ck}>처음 보는 기술</p>
            <b>{caption.name}</b>
            <span>{caption.how}</span>
          </div>
        )}
        {/* 11/20 단계 전환 화면: 화면을 가로지르는 띠 + PHASE n · 이름 · 부제 (크런치는 붉게, 움직임 줄이기면 띠 없이 글자만) */}
        {phaseCard && !result && slim && (
          <CenterLine key={`ph${phaseCard.at}`} hot={phaseCard.crunch}>
            {phaseCard.crunch ? `CRUNCH MODE · ${phaseCard.sub}` : `PHASE ${phaseCard.n} · ${phaseCard.name}`}
          </CenterLine>
        )}
        {phaseCard && !result && !slim && (
          <div key={`ph${phaseCard.at}`} className={`${s.phaseCard} ${phaseCard.crunch ? s.phaseCrunch : ""} ${phaseCard.reduced ? s.phaseStill : ""}`} role="status" aria-live="assertive">
            <div className={s.phaseBand}>
              <p className={s.phaseN}>{phaseCard.crunch ? "CRUNCH MODE" : `PHASE ${phaseCard.n}`}</p>
              {!phaseCard.crunch && <p className={s.phaseName}>{phaseCard.name}</p>}
              <p className={s.phaseSub}>{phaseCard.sub}</p>
            </div>
          </div>
        )}
        {banner && !result && (
          <p key={`bn${banner.at}`} className={`${s.banner} ${banner.hot ? s.bannerHot : ""} ${banner.big ? s.bannerBig : ""}`}>
            {banner.text}
          </p>
        )}
        {status === "starting" && !hotbar && <div className={s.card}>판교의 등대 꼭대기로 출근하는 중…</div>}
        {status === "error" && (
          <div className={s.card} role="alert">
            <p>{message ?? "들어갈 수 없어요"}</p>
            <button type="button" className={s.btn} onClick={() => bridge.emit("chairman:exit")}>
              마을로
            </button>
          </div>
        )}
        {paused && !result && (
          <div className={s.card} role="dialog" aria-label="멈춤">
            <p>잠깐 멈췄어요</p>
            {/* 11/22 사용자 「안내글 나올 때 일시정지 → 나가기가 바로 안 된다」: 브리핑(시작 전)이면 기록 없이 바로 마을로 */}
            {/* 11/22 유료 판은 하루 한 번 판을 돌려준다 (서버 /abort — 판 시작 90초 안) */}
            {brief !== null && <QuitNote text={chairQuitNote({ practice: play.practice, refundLeft: play.refundLeft ?? 0, late: !play.practice && (play.refundLeft ?? 0) > 0 && refundLate })} />}
            <div className={s.btns}>
              <button type="button" className={s.btn} onClick={resume} autoFocus>
                계속하기
              </button>
              <button
                type="button"
                className={s.btnGhost}
                onClick={() => {
                  resume();
                  if (brief !== null) {
                    setLeaving(true);
                    bridge.emit("chairman:leave");
                  } else bridge.emit("rpg:quit");
                }}
              >
                {brief !== null ? "나가기 (마을로)" : "그만두기 (여기까지 기록)"}
              </button>
            </div>
          </div>
        )}
        {status === "dead" && !result && <div className={s.sending}>퇴근 기록을 올리는 중…</div>}
        {leaving && !result && <div className={s.sending}>마을로 가는 중…</div>}
        {result && <ResultCard r={result} />}
      </div>
    </>
  );
}
