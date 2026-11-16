"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { GAMES, POTIONS, SKILLS, type GameKind, type SkillId } from "@/lib/rpg/catalog";
import { comboMult } from "@/lib/rpg/plan";
import { STATUSES } from "@/lib/rpg/status";
import { ULT_SLOT } from "@/lib/rpg/hotbar";
import { readItem, writeItem } from "@/lib/storage";
import FloatingStick from "../ui/FloatingStick";
import type { RpgAction, RpgHud } from "@/lib/rpg/types";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { mmss } from "./format";
import { HUNT_KEYS, HUNT_TOUCH } from "./huntKeys";
// 11/15 야근 빌딩 능력 카드: 고르기 창 · 판 레벨·가진 카드
import CardPick from "./CardPick";
import RunCards from "./RunCards";
import StatBox from "./StatBox";
import RpgIcon from "./RpgIcon";
import s from "./rpg.module.css";

// 판 진행 중 오버레이: 캔버스 위 전체를 덮고(탭은 rpg:tap으로 게임에 넘긴다) 상태·버튼을 그린다.
// 사냥터: 캔버스·공격 버튼을 누르고 있으면 rpg:action hold로 계속 공격 (36번). 말풍선 버튼은 없앴다 (26번).

/** 머리 위 버프 이름 (HuntScene buffs 키). 없는 키(내부용)는 숨긴다 */
const BUFF_NAMES: Record<string, string> = {
  invuln: "무적",
  em_stoke: "장작",
  so_swift: "바람 넋",
  so_friend: "길동무",
  fr_ward: "얼음 방패",
};

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

/** 11/15 H: 사냥 키 안내 (키 목록은 huntKeys — 사냥터 고르기 화면과 같다) */
function KeyHelp() {
  const coarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
  const rows = coarse ? HUNT_TOUCH : HUNT_KEYS;
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
  onChat,
}: {
  game: GameKind;
  hotbar: (SkillId | null)[];
  onPause: () => void;
  /** 11/17 손가락 기기 사냥 중 [채팅] (채널 채팅 한 줄 입력칸 — 멈춤 아래, 조이스틱·스킬 칸을 가리지 않는 자리) */
  onChat?: () => void;
  title?: string;
  look?: "meadow";
  totalMs?: number;
}) {
  const [hud, setHud] = useState<RpgHud | null>(null);
  useBridgeEvent("rpg:hud", setHud);
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

  // 11/15 스킬 칸: 왼쪽 누름 = 쓰기, 우클릭 = 그 칸 자동 켜기·끄기.
  // [자동] 설정 중(손가락용, 데스크톱도 됨)에는 칸을 눌러도 쓰지 않고 자동만 바꾼다. 다시 [자동]을 누르거나 6초 가만있으면 끝
  const [editing, setEditing] = useState(false);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setEdit = (on: boolean) => {
    if (editTimer.current) clearTimeout(editTimer.current);
    editTimer.current = on ? setTimeout(() => setEditing(false), AUTO_EDIT_IDLE_MS) : null;
    setEditing(on);
  };
  const slotDown = (e: React.PointerEvent, i: number) => {
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
    if (!window.matchMedia?.("(pointer: coarse)").matches && !readItem(LS_KEYS_KNOWN)) {
      helpTimer = setTimeout(() => {
        setHelp(true);
        helpTimer = setTimeout(() => setHelp(false), KEYS_SHOW_MS);
      }, 0);
    }
    if (!readItem(LS_AUTO_HINT)) {
      writeItem(LS_AUTO_HINT, "1");
      const touch = window.matchMedia?.("(pointer: coarse)").matches;
      setHint(
        touch
          ? "[자동]을 누르고 스킬 칸을 누르면 그 칸이 자동이 돼요. 화면 왼쪽을 누른 채 끌면 걸어요."
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
  }, [hunt]);

  return (
    <div
      className={s.capture}
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
      <div className={s.hudTop}>
        <div className={s.hudLine}>
          {look === "meadow" ? (
            <MeadowBoard hud={hud} title={title ?? GAMES[game].name} totalMs={totalMs} />
          ) : (
            <div className={s.hudPanel}>
              <div className={s.hudStats}>
                <strong>{title ?? GAMES[game].name}</strong>
                <span>
                  남은 시간 <strong className={s.timer}>{hud ? mmss(hud.leftMs) : "–"}</strong>
                </span>
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
                {game === "hunt" && (
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
                            {BUFF_NAMES[b.id]} {Math.ceil(b.leftMs / 1000)}초
                          </span>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div className={s.topButtons}>
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
            {hunt && onChat && (
              <button type="button" className={cx(ui.button, ui.icon)} onPointerDown={stop} onClick={onChat} aria-label="채팅">
                <PixelIcon name="chat" />
              </button>
            )}
          </div>
        </div>
        {/* 11/15 능력치 판 (C로 접기, 폰은 [능력] 버튼) */}
        {hunt && <StatBox stats={hud?.stats} />}
        {hud?.boss && (
          <div className={s.boss}>
            <span>{hud.boss.name}</span>
            <div className={s.bar}>
              <span style={{ width: `${hud.boss.ratio * 100}%` }} />
            </div>
          </div>
        )}
        {hud?.message && (
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
        {help && <KeyHelp />}
      </div>
      {hunt && <CardPick />}

      <div className={s.hudBottom}>
        {game === "hunt" && (
          <>
            <div className={s.skillBar} data-edit={editing || undefined}>
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
                return (
                  <button
                    key={i}
                    type="button"
                    className={cx(s.skillBtn, ult && s.ultBtn, short && s.spShort, auto && s.autoSlot, live && s.autoLive, editing && s.slotEdit)}
                    onPointerDown={(e) => slotDown(e, i)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    aria-label={`${sk.name} (${key})${auto ? (live ? ", 자동" : ", 자동 꺼둠") : ""}${short ? `, SP ${need} 필요` : ""}`}
                    title={ult ? `${sk.name} (F). 궁극기는 직접 써요` : `${sk.name} (${key}). 오른쪽 클릭이나 Shift+${key}로 자동을 켜고 꺼요`}
                  >
                    <RpgIcon art={sk.art} size={32} />
                    <span className={s.skillKey}>{key}</span>
                    {auto && <span className={s.autoMark}>자동</span>}
                    {short && <span className={s.spNeed}>{need}</span>}
                    {cd > 0 && <span className={s.cool} style={ring(cd)} />}
                  </button>
                );
              })}
              {hotbar.some((id) => id) && (
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
            </div>
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
          </>
        )}
        {game !== "hunt" && (
          <p className={s.keysHint}>{look === "meadow" ? "덤불을 눌러요 (Q W E / A S D / Z X C). 벌과 낙엽은 그냥 둬요. Esc는 멈춤." : `${GAMES[game].how} · Esc 멈춤`}</p>
        )}
      </div>
    </div>
  );
}
