"use client";

import { useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { GAMES, POTIONS, SKILLS, type GameKind, type SkillId } from "@/lib/rpg/catalog";
import type { RpgAction, RpgHud } from "@/lib/rpg/types";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { mmss } from "./format";
import RpgIcon from "./RpgIcon";
import s from "./rpg.module.css";

// 판 진행 중 오버레이: 캔버스 위 전체를 덮고(탭은 rpg:tap으로 게임에 넘긴다) 상태·버튼을 그린다.

const BUFF_NAMES: Record<string, string> = {
  rollback: "롤백",
  cache_hit: "캐시 히트",
  debugging: "디버깅",
  pair_prog: "페어",
  overtime: "야근",
};

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

/** 왼쪽 아래 가상 조이스틱 (손가락 조작 기기에서만 보인다) */
function Joystick() {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const R = r.width / 2;
    let x = (e.clientX - (r.left + R)) / R;
    let y = (e.clientY - (r.top + R)) / R;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    setKnob({ x, y });
    bridge.emit("rpg:joystick", { x, y });
  };
  const end = () => {
    id.current = null;
    setKnob({ x: 0, y: 0 });
    bridge.emit("rpg:joystick", { x: 0, y: 0 });
  };
  return (
    <div
      ref={ref}
      className={cx(s.joystick, s.touchOnly)}
      aria-hidden="true"
      onPointerDown={(e) => {
        e.stopPropagation();
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => id.current === e.pointerId && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className={s.knob} style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }} />
    </div>
  );
}

/** 누르고 있는 동안 조이스틱 x를 보낸다 (데드라인 피하기 좌우 버튼) */
function HoldButton({ dir, label }: { dir: -1 | 1; label: string }) {
  const down = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    bridge.emit("rpg:joystick", { x: dir, y: 0 });
  };
  const up = () => bridge.emit("rpg:joystick", { x: 0, y: 0 });
  return (
    <button type="button" className={ui.button} aria-label={label} onPointerDown={down} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}>
      {dir < 0 ? "◀" : "▶"}
    </button>
  );
}

export default function RunHud({ game, hotbar, onPause }: { game: GameKind; hotbar: (SkillId | null)[]; onPause: () => void }) {
  const [hud, setHud] = useState<RpgHud | null>(null);
  useBridgeEvent("rpg:hud", setHud);
  const act = (e: React.PointerEvent, a: RpgAction) => {
    e.stopPropagation();
    e.preventDefault();
    bridge.emit("rpg:action", a);
  };
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div
      className={s.capture}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) bridge.emit("rpg:tap", { x: e.clientX, y: e.clientY });
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={s.hudTop}>
        <div className={s.hudLine}>
          <div className={s.hudPanel}>
            <div className={s.hudStats}>
              <strong>{GAMES[game].name}</strong>
              <span>
                남은 시간 <strong className={s.timer}>{hud ? mmss(hud.leftMs) : "–"}</strong>
              </span>
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
              {game !== "hunt" && (
                <span>
                  점수 <strong>{hud?.score ?? 0}</strong>
                </span>
              )}
              {game === "bugs" && (hud?.combo ?? 0) >= 2 && <span className={s.timer}>{hud!.combo}콤보</span>}
              {game === "deadline" && (
                <span>
                  남은 목숨 <strong>{hud?.hp ?? 3}</strong> · 커피 <strong>{hud?.kills ?? 0}</strong>
                </span>
              )}
            </div>
            {game === "hunt" && hud && (
              <>
                <Bar value={hud.hp} max={hud.maxHp} className={s.hp} label="HP" />
                <Bar value={hud.sp} max={hud.maxSp} className={s.sp} label="SP" />
                {hud.buffs.length > 0 && (
                  <div className={s.buffs}>
                    {hud.buffs.map((b) => (
                      <span key={b.id}>
                        {BUFF_NAMES[b.id] ?? b.id} {Math.ceil(b.leftMs / 1000)}초
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <button type="button" className={cx(ui.button, ui.icon, s.pause)} onPointerDown={stop} onClick={onPause} aria-label="멈춤">
            <PixelIcon name="pause" />
          </button>
        </div>
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
      </div>

      <div className={s.hudBottom}>
        {game === "hunt" && (
          <>
            <Joystick />
            <div className={s.skillBar}>
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
                    {(hud?.potionCooldown ?? 0) > 0 && <span className={s.cool} style={{ height: `${hud!.potionCooldown * 100}%` }} />}
                  </button>
                );
              })}
              {hotbar.map((id, i) => {
                const sk = SKILLS.find((x) => x.id === id);
                const cd = hud?.cooldowns[i] ?? 0;
                if (!sk) return null;
                return (
                  <button
                    key={i}
                    type="button"
                    className={s.skillBtn}
                    onPointerDown={(e) => act(e, { kind: "skill", slot: i })}
                    aria-label={`${sk.name} (${i + 1})`}
                  >
                    <RpgIcon art={sk.art} size={32} />
                    <span className={s.skillKey}>{i + 1}</span>
                    {cd > 0 && <span className={s.cool} style={{ height: `${cd * 100}%` }} />}
                  </button>
                );
              })}
            </div>
            <button type="button" className={cx(s.skillBtn, s.attack, s.touchOnly)} onPointerDown={(e) => act(e, { kind: "attack" })} aria-label="공격">
              공격
            </button>
          </>
        )}
        {game === "deadline" && (
          <div className={cx(s.lr, s.touchOnly)}>
            <HoldButton dir={-1} label="왼쪽으로" />
            <HoldButton dir={1} label="오른쪽으로" />
          </div>
        )}
        {game !== "hunt" && <p className={s.keysHint}>{GAMES[game].how} · Esc 멈춤</p>}
      </div>
    </div>
  );
}
