"use client";

import { useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { GAMES, POTIONS, SKILLS, type GameKind, type SkillId } from "@/lib/rpg/catalog";
import { comboMult } from "@/lib/rpg/plan";
import type { RpgAction, RpgHud } from "@/lib/rpg/types";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { mmss } from "./format";
import RpgIcon from "./RpgIcon";
import s from "./rpg.module.css";

// 판 진행 중 오버레이: 캔버스 위 전체를 덮고(탭은 rpg:tap으로 게임에 넘긴다) 상태·버튼을 그린다.
// 사냥터: 캔버스·공격 버튼을 누르고 있으면 rpg:action hold로 계속 공격 (36번). 말풍선 버튼은 없앴다 (26번).

const BUFF_NAMES: Record<string, string> = {
  rollback: "못 들은 척",
  cache_hit: "칼퇴 질주",
  debugging: "매의 눈",
  pair_prog: "동기",
  overtime: "야근",
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

/** title: 게임 이름 대신 (32번 곤충 채집은 "곤충 채집") */
export default function RunHud({ game, hotbar, onPause, title }: { game: GameKind; hotbar: (SkillId | null)[]; onPause: () => void; title?: string }) {
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
      <div className={s.hudTop}>
        <div className={s.hudLine}>
          <div className={s.hudPanel}>
            <div className={s.hudStats}>
              <strong>{title ?? GAMES[game].name}</strong>
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
              {game === "hunt" && (hud?.peers ?? 0) > 1 && <span className={s.together}>함께 {hud!.peers}명</span>}
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
          <div className={s.topButtons}>
            <button type="button" className={cx(ui.button, ui.icon)} onPointerDown={stop} onClick={onPause} aria-label="멈춤">
              <PixelIcon name="pause" />
            </button>
          </div>
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
                    {(hud?.potionCooldown ?? 0) > 0 && <span className={s.cool} style={ring(hud!.potionCooldown)} />}
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
                    {cd > 0 && <span className={s.cool} style={ring(cd)} />}
                  </button>
                );
              })}
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
              aria-label="공격 (누르고 있으면 계속)"
            >
              {(hud?.attack ?? 0) > 0 && <span className={s.cool} style={ring(hud!.attack!)} />}
              <span className={s.attackLabel}>공격</span>
            </button>
          </>
        )}
        {game !== "hunt" && <p className={s.keysHint}>{GAMES[game].how} · Esc 멈춤</p>}
      </div>
    </div>
  );
}
