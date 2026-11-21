"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { bridge } from "@/game/bridge";
import { GAMES, POTIONS, SKILLS, type GameKind, type SkillId } from "@/lib/rpg/catalog";
import { comboMult } from "@/lib/rpg/plan";
import { STATUSES } from "@/lib/rpg/status";
import { autoBlock, ULT_SLOT } from "@/lib/rpg/hotbar";
import { readItem, writeItem } from "@/lib/storage";
import FloatingStick from "../ui/FloatingStick";
import type { RpgAction, RpgHud } from "@/lib/rpg/types";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { mmss } from "./format";
import { CHAIR_RUN_KEY, CHAIR_RUN_TOUCH, HUNT_KEYS, HUNT_TOUCH } from "./huntKeys";
// 11/15 야근 빌딩 능력 카드: 고르기 창 · 판 레벨·가진 카드
import CardPick from "./CardPick";
import RunCards from "./RunCards";
// 11/17 발동형 카드·세트 장비 효과가 터지는 순간 그 그림 (오른쪽, 폰은 위 가운데)
import ProcToasts from "./ProcToasts";
import StatBox from "./StatBox";
// 11/22 사냥터·야근 빌딩 폰 위 HUD (시안 B)
import HuntPhoneTop from "./HuntPhoneTop";
import RpgIcon from "./RpgIcon";
import s from "./rpg.module.css";
import { usePageZoomLock } from "@/lib/hooks/usePageZoomLock";

// 판 진행 중 오버레이: 캔버스 위 전체를 덮고(탭은 rpg:tap으로 게임에 넘긴다) 상태·버튼을 그린다.
// 사냥터: 캔버스·공격 버튼을 누르고 있으면 rpg:action hold로 계속 공격 (36번). 말풍선 버튼은 없앴다 (26번).

/** 머리 위 버프 이름 (HuntScene buffs 키). 없는 키(내부용)는 숨긴다 */
const BUFF_NAMES: Record<string, string> = {
  invuln: "무적",
  em_stoke: "장작",
  so_swift: "바람 넋",
  so_friend: "길동무",
  fr_ward: "얼음 방패",
  wk_tireless: "쉬지 않는 손",
  wk_whirl: "회오리",
};

/** 11/17 낙법 칸 그림 (game/rpg/icons dodge) */
const DODGE_ART = { shape: "dodge", main: 0x9fc5e8, accent: 0xf2ead3 };

/** 아이콘 위 원형 쿨다운 (남은 비율만큼 시계 방향으로 어둡게) */
const ring = (left: number) => ({ background: `conic-gradient(rgba(10, 11, 9, 0.75) ${Math.round(left * 360)}deg, transparent 0deg)` });

function Bar({ value, max, className, label }: { value: number; max: number; className: string; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className={s.barLabel}>
        <span>{label}</span>
        <span>
          {value} / {max}
        </span>
      </div>
      <div className={cx(s.bar, className)} role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 11/15 첫 사냥 안내 (한 번만) */
const LS_AUTO_HINT = "tomb.rpg.autoHint";
/** H를 한 번이라도 눌렀다 (판 시작 키 안내를 더 띄우지 않는다) */
const LS_KEYS_KNOWN = "tomb.rpg.keysKnown";
/** 판 시작 키 안내가 떠 있는 시간 */
const KEYS_SHOW_MS = 6000;
const AUTO_HINT_MS = 8000;
/** [자동] 설정: 이만큼 아무것도 안 누르면 저절로 끝난다 */
const AUTO_EDIT_IDLE_MS = 6000;
/** 11/21 회장님 독대 폰(slim): 스킬 칸을 이만큼 누르고 있으면 그 칸 자동 켜기·끄기 */
const LONG_PRESS_MS = 450;
const TOAST_MS = 1300;
/** 야근 빌딩 층이 바뀔 때 「자동 스킬 3칸 켜져 있어요」 */
const FLOOR_TOAST_MS = 2000;

/** 11/15 H: 사냥 키 안내 (키 목록은 huntKeys — 사냥터 고르기 화면과 같다) */
function KeyHelp({ chair }: { chair: boolean }) {
  const coarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
  const base = coarse ? HUNT_TOUCH : HUNT_KEYS;
  // 11/20 회장님 독대만 달리기 (걷기 바로 아래)
  const rows = chair ? [base[0], coarse ? CHAIR_RUN_TOUCH : CHAIR_RUN_KEY, ...base.slice(1)] : base;
  return (
    <div className={s.keyHelp} role="note" aria-label="사냥 키 안내">
      <strong>{coarse ? "조작" : "사냥 키"}</strong>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <small>자동 스킬은 쓰기 좋은 때를 기다렸다가 써요. 궁극기와 이동 스킬은 자동이 안 돼요.</small>
    </div>
  );
}

/** 콤보 단계 0..4 (점수 배수가 오르는 5콤보마다) — game/rpg/meadowLayout comboTier와 같다 */
const tierOf = (combo: number) => Math.max(0, Math.min(4, Math.floor(combo / 5)));

/** 32번 곤충 채집 점수판: 나무 팻말에 남은 시간 막대·점수·콤보 */
function MeadowBoard({ hud, title, totalMs }: { hud: RpgHud | null; title: string; totalMs: number }) {
  const left = hud?.leftMs ?? totalMs;
  const pct = totalMs > 0 ? Math.max(0, Math.min(100, (left / totalMs) * 100)) : 0;
  const combo = hud?.combo ?? 0;
  return (
    <div className={s.meadowBoard}>
      <div className={s.boardHead}>
        <strong>{title}</strong>
        <span className={s.boardTime}>{mmss(left)}</span>
      </div>
      <div
        className={cx(s.boardBar, left <= 5000 && s.boardBarLow)}
        role="meter"
        aria-label="남은 시간"
        aria-valuenow={Math.ceil(left / 1000)}
        aria-valuemin={0}
        aria-valuemax={Math.round(totalMs / 1000)}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className={s.boardRow}>
        <span className={s.boardScore} aria-label={`점수 ${hud?.score ?? 0}`}>
          {hud?.score ?? 0}
          <small>점</small>
        </span>
        {combo >= 2 && (
          <span className={s.boardCombo} data-tier={tierOf(combo)}>
            {combo}콤보 ×{comboMult(combo)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * title: 게임 이름 대신 (32번 곤충 채집은 "곤충 채집").
 * look="meadow": 곤충 채집 들판 — 나무 팻말 점수판(totalMs: 판 전체 시간), 콤보 단계만큼 화면 가장자리가 은은히 밝아진다
 */
export default function RunHud({
  game,
  hotbar,
  onPause,
  title,
  look,
  totalMs = 0,
  topExtra,
  barTop,
  modeChip,
  noHint,
  slim = false,
  place,
}: {
  game: GameKind;
  hotbar: (SkillId | null)[];
  onPause: () => void;
  title?: string;
  look?: "meadow";
  totalMs?: number;
  /** 11/21 위 단추 줄 맨 앞에 끼우는 것 (회장님 독대 개발 서버 무적(시험) 단추) */
  topExtra?: ReactNode;
  /** 11/21 스킬 칸 바로 위에 띄우는 것 (회장님 독대 헬 반려 예고·반려함) — 칸 자리를 밀지 않는다 */
  barTop?: ReactNode;
  /** 11/21 위 판 이름 바로 옆 작은 표 (회장님 독대 폰 「무적(시험) · 기록 안 남음」) */
  modeChip?: ReactNode;
  /** 11/21 첫 사냥 안내 줄을 띄우지 않는다 (회장님 독대 — 브리핑이 조작을 알려 준다) · 11/22 판 시작 키 안내도 (브리핑 뒤에 겹쳐 떴다) */
  noHint?: boolean;
  /**
   * 11/21 폰 HUD (시안 B): 위 판·단추는 PhoneTop이 그리고 여기서는 뺀다.
   * 11/22 아래 칸·단추(조이스틱·스킬 칸·[자동]·구르기·공격)는 slim이어도 야근 빌딩 폰과 똑같다
   */
  slim?: boolean;
  /** 11/22 폰 위 HUD에 쓰는 사냥터 이름 (없으면 title) */
  place?: string;
}) {
  // 11/22 판 중엔 페이지 확대 막기 (사냥터 창 밖에서 쓰는 회장님 독대·채집도)
  usePageZoomLock();
  const [hud, setHud] = useState<RpgHud | null>(null);
  useBridgeEvent("rpg:hud", setHud);
  // 11/21 회장님 독대: 회장님 몸·말풍선이 위 판(HUD·능력치·버튼) 밑이면 그 판만 반투명 (DOM 클래스만 바꾼다)
  const panelEl = useRef<HTMLDivElement>(null);
  const statEl = useRef<HTMLElement>(null);
  const btnEl = useRef<HTMLDivElement>(null);
  useBridgeEvent("chairman:hud", (h) => {
    const b = h.box;
    for (const el of [panelEl.current, statEl.current, btnEl.current]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      el.classList.toggle(s.chairUnder, !!b && b[0] < r.right && b[2] > r.left && b[1] < r.bottom && b[3] > r.top);
    }
  });
  const holding = useRef<number | null>(null);
  const hunt = game === "hunt";
  const release = (e: React.PointerEvent) => {
    if (holding.current !== e.pointerId) return;
    holding.current = null;
    bridge.emit("rpg:action", { kind: "hold", on: false });
  };
  const act = (e: React.PointerEvent, a: RpgAction) => {
    e.stopPropagation();
    e.preventDefault();
    bridge.emit("rpg:action", a);
  };
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  // 11/20 회장님 독대 폰 [달리기]: 마을 [달리기]처럼 눌러서 켜고 끈다
  const [running, setRunning] = useState(false);
  const toggleRun = (e: React.PointerEvent) => {
    const on = !running;
    setRunning(on);
    act(e, { kind: "run", on });
  };
  // 11/17 낙법 남은 쿨타임 (칸·버튼에 시계와 남은 초)
  const dodgeLeft = hud?.dodge?.left ?? 0;
  const dodgeSec = Math.ceil((hud?.dodge?.ms ?? 0) / 1000);

  // 11/15 스킬 칸: 왼쪽 누름 = 쓰기, 우클릭 = 그 칸 자동 켜기·끄기.
  // [자동] 설정 중(손가락용, 데스크톱도 됨)에는 칸을 눌러도 쓰지 않고 자동만 바꾼다. 다시 [자동]을 누르거나 6초 가만있으면 끝
  const [editing, setEditing] = useState(false);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setEdit = (on: boolean) => {
    if (editTimer.current) clearTimeout(editTimer.current);
    editTimer.current = on ? setTimeout(() => setEditing(false), AUTO_EDIT_IDLE_MS) : null;
    setEditing(on);
  };
  // 11/21 손가락 기기(모든 사냥 — 사냥터·야근 빌딩·회장실): 길게 누르기(450ms) = 그 칸 자동 켜기·끄기
  // (누르는 순간 스킬은 그대로 나간다) + 진동 + 「1번 칸 자동 켜짐」. 자동 칸은 늘 보이는 초록 점, [자동]은 전체 켜기·끄기 (고르기 모드 없음). PC는 그대로
  const coarse = useMediaQuery("(pointer: coarse)");
  // 11/22 사냥터·야근 빌딩도 폰(폭 ≤560 · 높이 ≤520)이면 위 HUD 시안 B (HuntScene chairSlim과 같은 기준). 회장님 독대는 slim으로 온다
  const phone = useMediaQuery("(max-width: 560px), (max-height: 520px)");
  const phoneTop = !slim && phone && hunt && !hud?.chair && look !== "meadow";
  const slimTop = slim || phoneTop;
  const touch = slim || coarse;
  const [toast, setToast] = useState<{ text: string; at: number; ms?: number } | null>(null);
  const toastSeq = useRef(0);
  const press = useRef<{ id: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const pressEnd = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.ms ?? TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  // 야근 빌딩 층이 바뀌면 (폰) 자동 스킬이 그대로 켜져 있다고 짧게
  const floorSeen = useRef<number | undefined>(undefined);
  const floorNow = hud?.floor;
  useEffect(() => {
    const prev = floorSeen.current;
    floorSeen.current = floorNow;
    if (!touch || floorNow === undefined || prev === undefined || prev === floorNow || !hud?.auto) return;
    const n = hud.auto.slots.filter(Boolean).length;
    setToast({ text: hud.auto.on && n > 0 ? `자동 스킬 ${n}칸 켜져 있어요` : "자동 스킬이 꺼져 있어요", at: ++toastSeq.current, ms: FLOOR_TOAST_MS });
    // hud는 층이 바뀐 그 순간 값만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorNow, touch]);
  useEffect(() => pressEnd, []);
  const longPress = (i: number) => {
    const id = hotbar[i];
    if (!id) return;
    const why = i === ULT_SLOT ? "궁극기는 직접 써요" : hud?.chair?.sealed.includes(i) ? "반려된 칸이에요" : autoBlock(id);
    if (!why) bridge.emit("rpg:action", { kind: "auto", slot: i });
    try {
      navigator.vibrate?.(why ? [10, 40, 10] : 18);
    } catch {
      // 진동이 없는 기기
    }
    const was = hud?.auto?.slots[i] ?? false;
    setToast({ text: why ?? `${i + 1}번 칸 자동 ${was ? "꺼짐" : "켜짐"}`, at: ++toastSeq.current });
  };
  const slotDown = (e: React.PointerEvent, i: number) => {
    if (touch && e.button === 0 && !editing) {
      pressEnd();
      press.current = { id: e.pointerId, timer: setTimeout(() => (pressEnd(), longPress(i)), LONG_PRESS_MS) };
    }
    if (e.button === 2 || editing) {
      act(e, { kind: "auto", slot: i });
      if (editing) setEdit(true);
      return;
    }
    if (e.button !== 0) return stop(e);
    act(e, { kind: "skill", slot: i });
  };

  // 11/15 H = 키 안내, 처음 사냥에 들어오면 자동 스킬 안내 한 번
  const [help, setHelp] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!hunt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyH" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      // H를 한 번이라도 눌렀으면 키를 아는 사람: 판 시작마다 저절로 띄우지 않는다
      writeItem(LS_KEYS_KNOWN, "1");
      setHelp((h) => !h);
    };
    window.addEventListener("keydown", onKey);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let helpTimer: ReturnType<typeof setTimeout> | undefined;
    // 11/15 PC: 판이 시작되면 키 안내를 잠깐 띄운다 (H를 한 번 누르기 전까지는 판마다)
    if (!noHint && !window.matchMedia?.("(pointer: coarse)").matches && !readItem(LS_KEYS_KNOWN)) {
      helpTimer = setTimeout(() => {
        setHelp(true);
        helpTimer = setTimeout(() => setHelp(false), KEYS_SHOW_MS);
      }, 0);
    }
    if (!noHint && !readItem(LS_AUTO_HINT)) {
      writeItem(LS_AUTO_HINT, "1");
      const touch = window.matchMedia?.("(pointer: coarse)").matches;
      setHint(
        touch
          ? "[자동]을 누르면 자동 스킬이 전부 켜지고 꺼져요. 화면 왼쪽을 누른 채 끌면 걸어요."
          : "H를 누르면 키 안내가 다시 떠요",
      );
      timer = setTimeout(() => setHint(null), AUTO_HINT_MS);
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer) clearTimeout(timer);
      if (helpTimer) clearTimeout(helpTimer);
      if (editTimer.current) clearTimeout(editTimer.current);
    };
  }, [hunt, noHint]);

  return (
    <div
      className={s.capture}
      data-chair-hud={hud?.chair ? "" : undefined}
      data-slim={slimTop || undefined}
      data-phtop={phoneTop || undefined}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        bridge.emit("rpg:tap", { x: e.clientX, y: e.clientY });
        if (!hunt || e.button !== 0) return;
        // 누르고 있으면 그쪽으로 계속 공격 (뗄 때까지 포인터를 잡아 둔다)
        holding.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        bridge.emit("rpg:action", { kind: "hold", on: true, x: e.clientX, y: e.clientY });
      }}
      onPointerMove={(e) => {
        if (holding.current === e.pointerId) bridge.emit("rpg:action", { kind: "hold", on: true, x: e.clientX, y: e.clientY });
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 11/15 손가락: 왼쪽 아무 데나 누르면 그 자리에 조이스틱 (오른쪽은 예전처럼 누르기·끌기 공격) */}
      {hunt && <FloatingStick className={s.stickZone} onStick={(x, y) => bridge.emit("rpg:joystick", { x, y })} />}
      {look === "meadow" && <div className={s.meadowGlow} data-tier={tierOf(hud?.combo ?? 0)} aria-hidden="true" />}
      {phoneTop && (
        <HuntPhoneTop
          hud={hud}
          place={place ?? title ?? GAMES[game].name}
          buffNames={BUFF_NAMES}
          onPause={onPause}
          onHelp={() => {
            writeItem(LS_KEYS_KNOWN, "1");
            setHelp((h) => !h);
          }}
        />
      )}
      <div className={s.hudTop}>
        {!slimTop && (
        <div className={s.hudLine}>
          {look === "meadow" ? (
            <MeadowBoard hud={hud} title={title ?? GAMES[game].name} totalMs={totalMs} />
          ) : (
            <div ref={panelEl} className={s.hudPanel} data-practice={hud?.chair?.practice || undefined} data-chair={hud?.chair ? "" : undefined}>
              <div className={s.hudStats}>
                <strong>{hud?.chair?.title ?? title ?? GAMES[game].name}</strong>
                {modeChip}
                {/* 11/20 회장님 독대: 남은 시간 대신 단계 이름 */}
                {hud?.chair ? (
                  <>
                    <span>
                      <strong className={s.timer}>{hud.chair.phase}</strong>
                    </span>
                    {/* 버틴 시간: 크런치(10분)부터 빨강 */}
                    <span aria-label="버틴 시간">
                      <strong className={cx(s.timer, hud.chair.crunch && s.crunchTime)}>{mmss(Math.floor(hud.chair.ms / 1000) * 1000)}</strong>
                    </span>
                    {/* 11/20 회복 감소 (흡혈·재생·스킬 회복 — 물약은 그대로) */}
                    {hud.chair.heal && (
                      <span className={s.healCut} title="흡혈·재생·스킬 회복이 30%로, 초당 최대 체력의 2%까지만 차요. 물약은 그대로예요">
                        {hud.chair.heal}
                      </span>
                    )}
                  </>
                ) : (
                  <span>
                    남은 시간 <strong className={s.timer}>{hud ? mmss(hud.leftMs) : "–"}</strong>
                  </span>
                )}
                {/* 11/15 야근 빌딩: 지금 층 */}
                {hud?.floor !== undefined && (
                  <span>
                    <strong className={s.timer}>{hud.floor}층</strong>
                  </span>
                )}
                {hud?.wave && (
                  <span>
                    웨이브 <strong>{hud.wave[0]}</strong>/{hud.wave[1]}
                  </span>
                )}
                {game === "hunt" && !hud?.chair && (
                  <span>
                    처치 <strong>{hud?.kills ?? 0}</strong>
                  </span>
                )}
                {game === "hunt" && (hud?.peers ?? 0) > 1 && <span className={s.together}>함께 {hud!.peers}명</span>}
                {game === "hunt" && hud?.auto && (
                  <button
                    type="button"
                    className={cx(s.autoChip, hud.auto.on && s.autoChipOn)}
                    onPointerDown={(e) => act(e, { kind: "auto", slot: "all" })}
                    aria-pressed={hud.auto.on}
                    title="자동 스킬을 전부 켜고 꺼요 (X)"
                  >
                    스킬 자동 <kbd>X</kbd>
                  </button>
                )}
                {game !== "hunt" && (
                  <span>
                    점수 <strong>{hud?.score ?? 0}</strong>
                  </span>
                )}
                {game !== "hunt" && (hud?.combo ?? 0) >= 2 && (
                  <span className={s.timer}>
                    {hud!.combo}콤보 ×{comboMult(hud!.combo!)}
                  </span>
                )}
              </div>
              {game === "hunt" && hud && (
                <>
                  <Bar value={hud.hp} max={hud.maxHp} className={s.hp} label="HP" />
                  {(hud.statuses?.length ?? 0) > 0 && (
                    <div className={s.statuses} role="status" aria-label="걸린 상태 이상">
                      {hud.statuses!.map((x) => {
                        const def = STATUSES[x.id];
                        return (
                          <span
                            key={x.id}
                            className={cx(s.statusChip, x.leftMs < 1000 && s.statusEnding)}
                            style={{ color: `#${def.color.toString(16).padStart(6, "0")}` }}
                            title={def.desc}
                          >
                            <RpgIcon art={def.art} size={16} />
                            {def.name} {(x.leftMs / 1000).toFixed(1)}초
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <Bar value={hud.sp} max={hud.maxSp} className={s.sp} label="SP" />
                  {hud.run && <RunCards run={hud.run} />}
                  {hud.buffs.some((b) => BUFF_NAMES[b.id]) && (
                    <div className={s.buffs}>
                      {hud.buffs
                        .filter((b) => BUFF_NAMES[b.id])
                        .map((b) => (
                          <span key={b.id}>
                            {BUFF_NAMES[b.id]} {b.id === "wk_whirl" ? "켜짐" : `${Math.ceil(b.leftMs / 1000)}초`}
                          </span>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div ref={btnEl} className={s.topButtons}>
            {topExtra}
            {hunt && (
              // 11/15 키 안내 버튼: 판 시작 6초 안내가 사라진 뒤에도 H가 있다는 걸 늘 보이게 (손가락 기기는 ?)
              <button
                type="button"
                className={cx(ui.button, s.helpBtn, help && s.helpBtnOn)}
                onPointerDown={stop}
                onClick={() => {
                  writeItem(LS_KEYS_KNOWN, "1");
                  setHelp((h) => !h);
                }}
                aria-pressed={help}
                aria-label="조작 키 안내"
              >
                <span className={s.helpKey}>키 안내</span> <kbd>H</kbd>
                <span className={s.helpQ}>?</span>
              </button>
            )}
            <button type="button" className={cx(ui.button, ui.icon)} onPointerDown={stop} onClick={onPause} aria-label="멈춤">
              <PixelIcon name="pause" />
            </button>
          </div>
        </div>
        )}
        {/* 11/15 능력치 판 (C로 접기, 폰은 [능력] 버튼) — slim은 PhoneTop 자세히 칸의 [능력] */}
        {hunt && !slimTop && <StatBox stats={hud?.stats} chair={!!hud?.chair} boxRef={statEl} />}
        {hud?.boss && (
          <div className={s.boss}>
            <span>{hud.boss.name}</span>
            <div className={s.bar}>
              <span style={{ width: `${hud.boss.ratio * 100}%` }} />
            </div>
          </div>
        )}
        {hud?.message && !slimTop && !(touch && toast) && (
          <p className={s.banner} role="status">
            {hud.message}
          </p>
        )}
        {editing && (
          <p className={cx(s.banner, s.autoHint)} role="status">
            자동으로 쓸 스킬 칸을 눌러요. 다 고르면 [자동]을 다시 눌러요.
          </p>
        )}
        {hint && !hud?.message && !editing && (
          <p className={cx(s.banner, s.autoHint)} role="status">
            {hint}
          </p>
        )}
        {help && <KeyHelp chair={!!hud?.chair} />}
      </div>
      {hunt && <ProcToasts />}
      {hunt && <CardPick />}

      <div className={s.hudBottom}>
        {game === "hunt" && (
          <>
            <div className={s.skillBar} data-edit={editing || undefined}>
              {/* 11/21 slim: 길게 누르기 결과·게임 알림을 스킬 칸 바로 위 한 줄로 */}
              {(toast || (slimTop && hud?.message)) && (
                <p key={toast?.at ?? hud?.message} className={s.slimToast} role="status">
                  {toast?.text ?? hud?.message}
                </p>
              )}
              {barTop && (
                <div className={s.barTop} onPointerDown={stop}>
                  {barTop}
                </div>
              )}
              {POTIONS.filter((p) => p.key).map((p) => {
                const n = hud?.potions[p.id] ?? 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={s.skillBtn}
                    disabled={n <= 0}
                    onPointerDown={(e) => act(e, { kind: "potion", id: p.id })}
                    aria-label={`${p.name} 마시기 (${p.key}), ${n}개 남음`}
                  >
                    <RpgIcon art={p.art} size={32} />
                    <span className={s.skillKey}>{p.key}</span>
                    <span className={s.skillCount}>{n}</span>
                    {(hud?.potionCooldown ?? 0) > 0 && <span className={s.cool} style={ring(hud!.potionCooldown)} />}
                  </button>
                );
              })}
              {/* 11/17 낙법 칸 (Z): 물약과 스킬 사이. 손가락 기기는 공격 버튼 위 [구르기]가 대신한다 */}
              <button
                type="button"
                className={cx(s.skillBtn, s.dodgeSlot)}
                onPointerDown={(e) => act(e, { kind: "dodge" })}
                aria-label={`낙법 (Z)${dodgeSec > 0 ? `, ${dodgeSec}초 뒤에 다시 써요` : ""}`}
                title="낙법 (Z · K). 보는 쪽으로 구르고, 구르는 동안은 안 맞아요"
              >
                <RpgIcon art={DODGE_ART} size={32} />
                <span className={s.skillKey}>Z</span>
                {dodgeLeft > 0 && <span className={s.cool} style={ring(dodgeLeft)} />}
                {dodgeSec > 0 && <span className={s.coolSec}>{dodgeSec}</span>}
              </button>
              {hotbar.map((id, i) => {
                const sk = SKILLS.find((x) => x.id === id);
                const cd = hud?.cooldowns[i] ?? 0;
                if (!sk) return null;
                // 11/15 1~5 + 궁극기 칸(F) · SP 모자람(어둡게 + 필요한 SP) · 자동(초록 테두리가 돈다, 전체 스위치가 꺼져 있으면 멈춘 점선)
                const ult = i === ULT_SLOT;
                const key = ult ? "F" : String(i + 1);
                const need = hud?.skillSp?.[i] ?? 0;
                const short = !!hud && need > hud.sp;
                const auto = hud?.auto?.slots[i] ?? false;
                const live = auto && !!hud?.auto?.on;
                // 11/20 회장님 독대 지옥: 반려(봉인)된 칸 · 3초 뒤 봉인될 칸 깜빡임
                const sealed = !!hud?.chair?.sealed.includes(i);
                const warn = !!hud?.chair?.warn.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    className={cx(s.skillBtn, ult && s.ultBtn, short && s.spShort, auto && !touch && s.autoSlot, live && !touch && s.autoLive, editing && s.slotEdit, sealed && s.sealedSlot, warn && s.sealWarn)}
                    onPointerDown={(e) => slotDown(e, i)}
                    onPointerUp={touch ? pressEnd : undefined}
                    onPointerCancel={touch ? pressEnd : undefined}
                    onPointerLeave={touch ? pressEnd : undefined}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    aria-label={`${sk.name} (${key})${auto ? (live ? ", 자동" : ", 자동 꺼둠") : ""}${short ? `, SP ${need} 필요` : ""}`}
                    title={ult ? `${sk.name} (F). 궁극기는 직접 써요` : `${sk.name} (${key}). 오른쪽 클릭이나 Shift+${key}로 자동을 켜고 꺼요`}
                  >
                    <RpgIcon art={sk.art} size={32} />
                    <span className={s.skillKey}>{key}</span>
                    {auto && !touch && <span className={s.autoMark}>자동</span>}
                    {auto && touch && <span className={cx(s.autoDot, live && s.autoDotOn)} aria-hidden="true" />}
                    {short && <span className={s.spNeed}>{need}</span>}
                    {cd > 0 && <span className={s.cool} style={ring(cd)} />}
                    {sealed && <span className={s.sealStamp}>반려</span>}
                  </button>
                );
              })}
              {hotbar.some((id) => id) && !slim && !touch && (
                <button
                  type="button"
                  className={cx(s.skillBtn, s.autoEditBtn)}
                  aria-pressed={editing}
                  onPointerDown={(e) => {
                    stop(e);
                    e.preventDefault();
                    setEdit(!editing);
                  }}
                  aria-label={editing ? "자동 고르기 끝내기" : "자동 고르기. 누른 다음 스킬 칸을 누르면 그 칸이 자동이 돼요"}
                  title="누른 다음 스킬 칸을 누르면 그 칸이 자동이 돼요. 스킬은 나가지 않아요."
                >
                  자동
                </button>
              )}
              {/* 11/21 손가락: [자동]은 전체 켜기·끄기 — 켜져 있으면 늘 초록 「자동 켜짐」, 꺼져 있으면 회색 「자동 꺼짐」 */}
              {hotbar.some((id) => id) && touch && (
                <button
                  type="button"
                  className={cx(s.skillBtn, s.autoEditBtn, s.autoAllBtn)}
                  aria-pressed={!!hud?.auto?.on}
                  onPointerDown={(e) => act(e, { kind: "auto", slot: "all", every: true })}
                  aria-label={hud?.auto?.on ? "자동 스킬 켜짐. 누르면 전부 꺼요" : "자동 스킬 꺼짐. 누르면 전부 켜요"}
                >
                  {hud?.auto?.on ? "자동 켜짐" : "자동 꺼짐"}
                </button>
              )}
            </div>
            {/* 11/17 손가락: 공격 버튼 바로 위에 [구르기] (스킬 칸과 떨어진 오른쪽 끝 세로 줄) */}
            <div className={cx(s.actionPad, s.touchOnly)}>
              {hud?.chair && (
                <button type="button" className={cx(s.skillBtn, s.runBtn)} aria-pressed={running} onPointerDown={toggleRun} aria-label={running ? "달리기 켜짐. 누르면 걸어요" : "달리기. 누르면 달려요"}>
                  <span className={s.runGlyph} aria-hidden="true">
                    »
                  </span>
                  <span className={s.dodgeLabel}>{running ? "달리는 중" : "달리기"}</span>
                </button>
              )}
              <button
                type="button"
                className={cx(s.skillBtn, s.dodgeBtn)}
                onPointerDown={(e) => act(e, { kind: "dodge" })}
                aria-label={`구르기${dodgeSec > 0 ? `, ${dodgeSec}초 뒤에 다시 써요` : ". 구르는 동안은 안 맞아요"}`}
              >
                <RpgIcon art={DODGE_ART} size={32} />
                <span className={s.dodgeLabel}>구르기</span>
                {dodgeLeft > 0 && <span className={s.cool} style={ring(dodgeLeft)} />}
                {dodgeSec > 0 && <span className={s.coolSec}>{dodgeSec}</span>}
              </button>
              <button
                type="button"
                className={cx(s.skillBtn, s.attack, s.touchOnly, hud?.attackBuffered && s.buffered)}
                onPointerDown={(e) => {
                  act(e, { kind: "attack" });
                  // 누르고 있으면 지금 방향으로 계속 공격
                  holding.current = e.pointerId;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  bridge.emit("rpg:action", { kind: "hold", on: true });
                }}
                onPointerUp={release}
                onPointerCancel={release}
                onLostPointerCapture={release}
                aria-label="공격. 누르고 있으면 계속 때려요"
              >
                {(hud?.attack ?? 0) > 0 && <span className={s.cool} style={ring(hud!.attack!)} />}
                <span className={s.attackLabel}>공격</span>
              </button>
            </div>
          </>
        )}
        {game !== "hunt" && (
          <p className={s.keysHint}>{look === "meadow" ? "덤불을 눌러요 (Q W E / A S D / Z X C). 벌과 낙엽은 그냥 둬요. Esc는 멈춤." : `${GAMES[game].how} · Esc 멈춤`}</p>
        )}
      </div>
    </div>
  );
}
