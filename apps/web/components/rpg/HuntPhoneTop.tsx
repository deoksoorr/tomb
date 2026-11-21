"use client";

import { useState } from "react";
import { bridge } from "@/game/bridge";
import ph from "@/game/chairman/chairman.module.css";
import { STATUSES } from "@/lib/rpg/status";
import type { RpgHud } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import RpgIcon from "./RpgIcon";
import RunCards from "./RunCards";
import s from "./rpg.module.css";

// 11/22 사냥터·야근 빌딩 폰 위 HUD (회장님 독대 시안 B와 같은 모양 — game/chairman/PhoneHud):
// 판 없이 테두리 글자만. 왼쪽 = 어디(사냥터 이름·야근 빌딩) · 크게 층(야근 빌딩)·처치(사냥터) · 이번 층 웨이브,
// 오른쪽 = 남은 시간(크게, 누르면 자세히 칸) · 멈춤. 체력·SP는 HuntScene이 이름 아래에 그린다.
// 자세히 칸: 체력·SP 숫자 · 처치·웨이브 · 판 레벨·카드(야근 빌딩) · 버프 · [스킬 자동] [능력] [키 안내] [닫기]

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const clock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000 - 1e-6));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export default function HuntPhoneTop({
  hud,
  place,
  buffNames,
  onPause,
  onHelp,
}: {
  hud: RpgHud | null;
  /** 사냥터 이름 · 「야근 빌딩」 */
  place: string;
  buffNames: Record<string, string>;
  onPause: () => void;
  onHelp: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(false);
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const tower = hud?.floor !== undefined;
  const left = hud?.leftMs ?? 0;
  const wave = hud?.wave;
  const buffs = hud?.buffs.filter((b) => buffNames[b.id]) ?? [];
  return (
    <div className={cx(ph.phTop, s.huntTop)}>
      <div className={ph.phL}>
        <p className={ph.phPhase}>
          {place}
          {(hud?.peers ?? 0) > 1 && (
            <i className={ph.phTag}>함께 {hud!.peers}명</i>
          )}
        </p>
        <p className={ph.phTime}>
          {tower ? (
            <>
              {hud!.floor}
              <small>층</small>
            </>
          ) : (
            <>
              {fmt(hud?.kills ?? 0)}
              <small>처치</small>
            </>
          )}
        </p>
        {/* 이번 층(판) 웨이브 · 야근 빌딩은 처치도 */}
        {(wave || tower) && (
          <p className={s.huntTopSub}>
            {wave && (
              <>
                웨이브 <b>{wave[0]}</b>/{wave[1]}
              </>
            )}
            {tower && <> · 처치 {fmt(hud?.kills ?? 0)}</>}
          </p>
        )}
        {(hud?.statuses?.length ?? 0) > 0 && (
          <div
            className={s.huntTopStatus}
            role="status"
            aria-label="걸린 상태 이상"
          >
            {hud!.statuses!.map((x) => {
              const def = STATUSES[x.id];
              return (
                <span
                  key={x.id}
                  className={cx(
                    s.statusChip,
                    x.leftMs < 1000 && s.statusEnding,
                  )}
                  style={{
                    color: `#${def.color.toString(16).padStart(6, "0")}`,
                  }}
                >
                  <RpgIcon art={def.art} size={14} />
                  {def.name} {(x.leftMs / 1000).toFixed(0)}초
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className={ph.phR}>
        <button
          type="button"
          className={ph.phDmg}
          onPointerDown={stop}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`남은 시간 ${clock(left)}. 누르면 자세히 봐요`}
        >
          <small>남은 시간</small>
          <b className={cx(left <= 10_000 && s.huntTopLow)}>{clock(left)}</b>
        </button>
        <div className={ph.phBtns}>
          <button
            type="button"
            className={cx(ui.button, ui.icon, ph.phPause)}
            onPointerDown={stop}
            onClick={onPause}
            aria-label="멈춤"
          >
            <PixelIcon name="pause" />
          </button>
        </div>
      </div>
      {open && (
        <section
          className={cx(ph.phSheet, s.huntSheet)}
          aria-label="이번 판 자세히"
          onPointerDown={stop}
        >
          <dl className={ph.phRows}>
            <div>
              <dt>HP</dt>
              <dd>
                {fmt(hud?.hp ?? 0)} / {fmt(hud?.maxHp ?? 0)}
              </dd>
            </div>
            <div>
              <dt>SP</dt>
              <dd>
                {fmt(hud?.sp ?? 0)} / {fmt(hud?.maxSp ?? 0)}
              </dd>
            </div>
            {tower && (
              <div>
                <dt>층</dt>
                <dd>{hud!.floor}층</dd>
              </div>
            )}
            {wave && (
              <div>
                <dt>웨이브</dt>
                <dd>
                  {wave[0]} / {wave[1]}
                </dd>
              </div>
            )}
            <div>
              <dt>처치</dt>
              <dd>{fmt(hud?.kills ?? 0)}</dd>
            </div>
          </dl>
          {hud?.run && <RunCards run={hud.run} />}
          {buffs.length > 0 && (
            <p className={s.huntSheetBuffs}>
              {buffs.map((b) => (
                <span key={b.id}>
                  {buffNames[b.id]} {Math.ceil(b.leftMs / 1000)}초
                </span>
              ))}
            </p>
          )}
          {stats && hud?.stats && (
            <dl className={cx(ph.phRows, ph.phStats)}>
              {hud.stats.rows.map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.v}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className={ph.phPills}>
            {hud?.auto && (
              <button
                type="button"
                className={ph.phPill}
                aria-pressed={hud.auto.on}
                onClick={() =>
                  bridge.emit("rpg:action", {
                    kind: "auto",
                    slot: "all",
                    every: true,
                  })
                }
              >
                스킬 자동 {hud.auto.on ? "켜짐" : "꺼짐"}
              </button>
            )}
            <button
              type="button"
              className={ph.phPill}
              aria-pressed={stats}
              onClick={() => setStats((v) => !v)}
            >
              능력
            </button>
            <button type="button" className={ph.phPill} onClick={onHelp}>
              조작
            </button>
            <button
              type="button"
              className={ph.phPill}
              onClick={() => setOpen(false)}
            >
              닫기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
