"use client";

import { useState } from "react";
import { bridge } from "@/game/bridge";
import { GAMES } from "@/lib/rpg/catalog";
import { comboMult } from "@/lib/rpg/plan";
import type { RpgHud } from "@/lib/rpg/types";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { mmss } from "./format";
import r from "./rpg.module.css";
import s from "./StarsHud.module.css";

// 별자리 잇기 진행 중 오버레이 (망원경 창 전용, 사냥터 RunHud와 따로).
// 캔버스 위 전체를 덮고(탭은 rpg:tap으로 게임에 넘긴다 — 어디를 눌러도 다음 별) 밤하늘 점수판·멈춤 버튼을 그린다.
// 점수판: 남은 시간 막대 · 점수 · 콤보 배수 · 지금 잇는 별자리의 별(이은 것은 금빛, 끊기면 회색) · 이번 판 완성 수와 마지막 별자리 이름.

const JUDGE_TEXT = { perfect: "완벽", good: "좋아", miss: "놓침" } as const;

export default function StarsHud({ onPause, totalMs, starry }: { onPause: () => void; totalMs: number; starry: boolean }) {
  const [hud, setHud] = useState<RpgHud | null>(null);
  useBridgeEvent("rpg:hud", setHud);
  const left = hud?.leftMs ?? totalMs;
  const pct = totalMs > 0 ? Math.max(0, Math.min(100, (left / totalMs) * 100)) : 0;
  const combo = hud?.combo ?? 0;
  const st = hud?.stars;
  return (
    <div
      className={r.capture}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        bridge.emit("rpg:tap", { x: e.clientX, y: e.clientY });
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={r.hudTop}>
        <div className={r.hudLine}>
          <div className={s.board}>
            <div className={s.head}>
              <strong>{GAMES.stars.name}</strong>
              {starry && <span className={s.starry}>맑은 밤</span>}
              <span className={s.time}>{mmss(left)}</span>
            </div>
            <div
              className={cx(s.bar, left <= 5000 && s.barLow)}
              role="meter"
              aria-label="남은 시간"
              aria-valuenow={Math.ceil(left / 1000)}
              aria-valuemin={0}
              aria-valuemax={Math.round(totalMs / 1000)}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className={s.row}>
              <span className={s.score} aria-label={`점수 ${hud?.score ?? 0}`}>
                {(hud?.score ?? 0).toLocaleString("ko-KR")}
                <small>점</small>
              </span>
              {combo >= 2 && (
                <span className={s.combo} data-hot={combo >= 10 || undefined}>
                  {combo}콤보 ×{comboMult(combo)}
                </span>
              )}
              {hud?.judge && (
                <span key={`${hud.judge}${hud.kills}`} className={s.judge} data-judge={hud.judge} aria-hidden="true">
                  {JUDGE_TEXT[hud.judge]}
                </span>
              )}
            </div>
            <div className={s.row}>
              {st && st.size > 0 && (
                <span className={s.dots} data-broken={st.broken || undefined} aria-label={`지금 별자리 ${st.hit}/${st.size}${st.broken ? " (끊김)" : ""}`}>
                  {Array.from({ length: st.size }, (_, i) => (
                    <i key={i} data-on={i < st.hit || undefined} />
                  ))}
                </span>
              )}
              <span className={s.done}>
                완성 <b>{st?.done ?? 0}</b>
                {st?.last ? <span className={s.last}> · {st.last}</span> : null}
              </span>
            </div>
          </div>
          <div className={r.topButtons}>
            <button type="button" className={cx(ui.button, ui.icon)} onPointerDown={(e) => e.stopPropagation()} onClick={onPause} aria-label="멈춤">
              <PixelIcon name="pause" />
            </button>
          </div>
        </div>
      </div>
      <div className={r.hudBottom}>
        <p className={r.keysHint}>{GAMES.stars.how} · 한 별자리를 놓치지 않고 이으면 도감 등록 · Esc 멈춤</p>
      </div>
    </div>
  );
}
