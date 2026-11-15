"use client";

import { useEffect, useRef, useState } from "react";
import { clockText, FEST_FIREWORK_MS, FEST_MS, URGENT_DEF, URGENT_LAST_MS, URGENT_NOBODY_LINE, urgentFilled, urgentRewardLine, urgentStage } from "@/lib/forage/quests/urgent";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { showToast } from "@/lib/hooks/useToasts";
import { useUrgent } from "./urgentStore";
import u from "./urgent.module.css";

// 11/15: 긴급 의뢰 위쪽 막대 (GameShell이 게임이 뜨면 붙인다 — 마을 어디서든 보인다).
//  - 시작하면 확성기처럼 큰 알림 한 번 (의뢰마다 한 번만 — urgentStore가 정한다)
//  - 진행 중: 남은 시간(마지막 1분은 붉게 깜빡) · 서버 전체 막대(50%·100%·150% 눈금)
//  - 끝나면 막대가 멈추고 결과 · 축제 남은 시간. 닫기(×)로 숨길 수 있다
//    (11/15 아무도 내지 않았으면 막대 없이 한 줄만 몇 초 보여 주고 저절로 내린다. 「게시판에서 보상 받기」는 내가 받을 보상이 있을 때만)
// 사냥·미니게임 중에는 숨긴다 (그 화면 위쪽 막대와 겹치지 않게)

/** "00:30" (남은 ms, 분도 두 자리) */
const mmss = (ms: number) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
};

/** 아무도 내지 않고 끝났을 때 한 줄을 보여 주는 시간 */
const NOBODY_SHOW_MS = 8_000;

/** 막대 폭 (150%가 끝) */
const fill = (n: number, goal: number) => `${Math.min(100, goal > 0 ? (n / (goal * 1.5)) * 100 : 0)}%`;

export default function UrgentHud() {
  const { pub, mine, announce: ann } = useUrgent();
  const scene = useBridgeValue("scene:changed")?.scene;
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<string | null>(null);
  const toasted = useRef(new Set<string>());
  const ev = pub?.ev ?? null;
  // 아무도 내지 않고 끝났으면 한 줄을 몇 초 보여 주고 저절로 닫는다 (닫기 ×도 그대로)
  const nobodyId = ev && now >= ev.end && ev.n <= 0 ? ev.id : null;
  useEffect(() => {
    if (!nobodyId) return;
    const t = setTimeout(() => setHidden(nobodyId), NOBODY_SHOW_MS);
    return () => clearTimeout(t);
  }, [nobodyId]);

  useEffect(() => {
    if (!ev) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [ev]);

  // 끝났고 받을 보상이 있으면 한 번 알린다
  useEffect(() => {
    for (const r of mine?.rows ?? []) {
      if (!r.done || !r.reward || r.claimed || toasted.current.has(r.id)) continue;
      toasted.current.add(r.id);
      showToast("긴급 의뢰 보상이 기다려요. 버스 정류장 마당 의뢰 게시판에서 받아 가세요.", 6_000);
    }
  }, [mine]);

  if (!ev || scene === "hunt" || scene === "minigame") return null;
  const live = now < ev.end;
  // 시작 알림은 의뢰가 끝나면 바로 내린다 (남은 시간 "(20분)"이 끝난 막대와 같이 보이지 않게)
  const announce = live && ann && ann.id === ev.id && now < ann.until ? ann : null;
  const left = ev.end - now;
  const hurry = live && left <= URGENT_LAST_MS;
  const pct = ev.goal > 0 ? Math.floor((ev.n * 100) / ev.goal) : 0;
  const stage = urgentStage(ev.n, ev.goal);
  const fest = ev.festUntil > now;
  const d = URGENT_DEF[ev.kind];
  // 불꽃축제: 축제가 열린 처음 30초 (게임이 폭죽을 쏘는 시간과 같은 기준 festUntil − FEST_MS) — 이 동안은 막대 자리에 타이머
  const fwLeft = fest ? ev.festUntil - FEST_MS + FEST_FIREWORK_MS - now : 0;
  const fireworks = fwLeft > 0 && fwLeft <= FEST_FIREWORK_MS;
  // 끝난 뒤: 아무도 안 냈으면 한 줄만 몇 초. 냈으면 결과 + 보상 한 줄 (내 것을 아직 모르면 보상 줄은 비운다)
  const nobody = !live && ev.n <= 0;
  const myRow = mine?.rows.find((r) => r.id === ev.id) ?? null;
  const iGave = mine ? !!myRow && myRow.mine > 0 : null;
  const rewardLine = live || nobody ? "" : urgentRewardLine({ n: ev.n, goal: ev.goal, mine: iGave, claimed: !!myRow?.claimed });
  const canClaim = !live && !!myRow?.reward && !myRow.claimed;

  return (
    <>
      {announce && (
        <div className={u.announce} role="alert" key={announce.id}>
          <span className={u.siren} aria-hidden="true" />
          <span className={u.announceText}>
            <b>{announce.text}</b>
            <small>의뢰 게시판에 내면 서버 전체 막대가 차요</small>
          </span>
        </div>
      )}
      {fireworks && (
        <div className={u.fwTimer} role="status" aria-label={`불꽃축제 남은 시간 ${mmss(fwLeft)}`}>
          <span className={u.fwSpark} aria-hidden="true">
            ✦
          </span>
          <b>불꽃축제</b>
          <span className={u.fwClock}>{mmss(fwLeft)}</span>
          <small>목표의 150%를 채웠어요! 모닥불이 1시간 동안 금빛으로 타요.</small>
        </div>
      )}
      {hidden !== ev.id && !fireworks && nobody && (
        <div className={u.hud} data-done role="status" aria-label="긴급 의뢰">
          <div className={u.hudTop}>
            <span className={u.endLine}>{URGENT_NOBODY_LINE}</span>
            <button type="button" className={u.close} onClick={() => setHidden(ev.id)} aria-label="긴급 의뢰 막대 닫기">
              ×
            </button>
          </div>
        </div>
      )}
      {hidden !== ev.id && !fireworks && !nobody && (
        <div className={u.hud} data-hurry={hurry || undefined} data-done={!live || undefined} data-fest={fest || undefined} role="status" aria-label="긴급 의뢰">
          <div className={u.hudTop}>
            <span className={u.tag}>{live ? "긴급 의뢰" : "긴급 의뢰 끝"}</span>
            <span className={u.what}>
              {d.label} {ev.goal}
              {d.unit}
            </span>
            {live ? (
              <span className={u.clock} aria-label={`남은 시간 ${clockText(left)}`}>
                {clockText(left)}
              </span>
            ) : null}
            {!live && (
              <button type="button" className={u.close} onClick={() => setHidden(ev.id)} aria-label="긴급 의뢰 막대 닫기">
                ×
              </button>
            )}
          </div>
          <div className={u.bar} aria-hidden="true">
            <span className={u.fill} style={{ width: fill(ev.n, ev.goal) }} />
            <i className={u.mark} style={{ left: "33.333%" }} data-on={stage >= 50 || undefined} />
            <i className={u.mark} style={{ left: "66.667%" }} data-on={stage >= 100 || undefined} />
          </div>
          <div className={u.hudBottom}>
            <span>
              {ev.n} / {ev.goal}
              {d.unit}
            </span>
            {live ? <span className={u.pct}>{pct}%</span> : <span className={u.result}>{urgentFilled(ev.kind, ev.n, ev.goal, !!ev.early)}</span>}
            {live && <span className={u.hudHint}>정류장 마당 게시판</span>}
          </div>
          {!live && (rewardLine || canClaim) && (
            <div className={u.hudReward}>
              {rewardLine && <span>{rewardLine}</span>}
              {canClaim && <span className={u.claimHint}>게시판에서 보상 받기</span>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
