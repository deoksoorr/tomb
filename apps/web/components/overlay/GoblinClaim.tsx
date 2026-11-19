"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { GOBLIN_JACKPOT_POINTS } from "@tomb/protocol";
import { errorMessage, request } from "@/lib/api";
import type { GoblinClaimResponse } from "@/lib/goblin";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { meStore } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { cx } from "../ui/cx";
import { chatStore } from "./chatLines";
import { goblinCaughtLine, goblinCaughtTitle, goblinPointsText, goblinSpawnSub } from "./goblinText";
import styles from "./GoblinClaim.module.css";

// 22번 황금 고블린(보너스 요정): 내가 가장 먼저 잡으면 실시간 서버가 증서를 준다(goblin:grant) → 웹 API로 보상을 받는다.
// 같은 고블린 증서는 서버가 한 번만 받는다.
// 11/19 강조: 나타나면 화면 위 금빛 띠(goblin:spawn — 마을), 잡히면 「○○님이 황금 고블린을 잡았어요! +800P」 띠 + 채팅 소식 줄
// (goblin:caught — 채널 모두, 이름은 실시간 서버가 아는 이름), 내가 잡았으면 가운데 큰 「+800P!」와 튀는 금화.
// 포인터는 모두 통과시킨다 (게임 조작을 막지 않게).

const seen = new Set<string>();
const caughtSeen = new Set<string>();

/** 띠가 떠 있는 시간 */
const SPAWN_MS = 4_200;
const CAUGHT_MS = 3_800;
/** 큰 숫자 연출 시간 */
const BURST_MS = 2_000;
/** 사라지는 연출 시간 */
const LEAVE_MS = 400;
/** 큰 숫자 둘레에서 튀는 금화 수 */
const COINS = 12;

type Band = { key: string; kind: "spawn" | "caught"; title: string; sub: string; points?: string; jackpot: boolean; until: number };
type Burst = { key: string; text: string; jackpot: boolean; until: number };

export default function GoblinClaim() {
  const [band, setBand] = useState<Band | null>(null);
  const [burst, setBurst] = useState<Burst | null>(null);

  useBridgeEvent("goblin:grant", ({ id, grant }) => {
    if (seen.has(id)) return;
    seen.add(id);
    request<GoblinClaimResponse>("/api/goblin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant }) })
      .then((r) => {
        meStore.set(r.me);
        showToast(r.earned > 0 ? `황금 고블린 보너스 +${goblinPointsText(r.earned)}P를 받았어요!` : "지갑이 가득 차서 보너스를 못 받았어요");
      })
      .catch((e) => {
        if ((e as { code?: string }).code === "ALREADY_CLAIMED") return;
        showToast(errorMessage(e));
      });
  });

  useBridgeEvent("goblin:spawn", ({ id, zone, resumed }) => {
    if (caughtSeen.has(id)) return;
    setBand({
      key: `s:${id}`,
      kind: "spawn",
      title: resumed ? "지금 마을에 황금 고블린이 있어요!" : "황금 고블린이 나타났어요!",
      sub: goblinSpawnSub(zone),
      jackpot: false,
      until: Date.now() + SPAWN_MS,
    });
  });

  useBridgeEvent("goblin:caught", ({ id, name, points, mine }) => {
    if (caughtSeen.has(id)) return;
    caughtSeen.add(id);
    const jackpot = points >= GOBLIN_JACKPOT_POINTS;
    setBand({ key: `c:${id}`, kind: "caught", title: goblinCaughtTitle(name, mine), sub: "", points: `+${goblinPointsText(points)}P`, jackpot, until: Date.now() + CAUGHT_MS });
    chatStore.notice(goblinCaughtLine(name, mine, points), "goblin", `goblin:${id}`);
    if (mine && points > 0) setBurst({ key: id, text: `+${goblinPointsText(points)}P!`, jackpot, until: Date.now() + BURST_MS });
  });

  return (
    <>
      {band && <GoblinBand key={band.key} band={band} onDone={() => setBand((b) => (b?.key === band.key ? null : b))} />}
      {burst && <GoblinBurst key={burst.key} burst={burst} onDone={() => setBurst((b) => (b?.key === burst.key ? null : b))} />}
    </>
  );
}

function GoblinBand({ band, onDone }: { band: Band; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const left = Math.max(0, band.until - Date.now());
    const a = setTimeout(() => setLeaving(true), Math.max(0, left - LEAVE_MS));
    const b = setTimeout(onDone, left);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [band.until, onDone]);
  return (
    <div className={styles.layer} aria-hidden={leaving || undefined}>
      <div className={cx(styles.band, band.kind === "caught" && styles.caught, band.jackpot && styles.jackpot, leaving && styles.leaving)} role="status" aria-live="polite">
        <span className={styles.shine} aria-hidden="true" />
        <span className={styles.icon} aria-hidden="true">
          <GoblinCoinIcon />
        </span>
        <span className={styles.words}>
          {band.jackpot && <span className={styles.tag}>대박!</span>}
          <b className={styles.title}>{band.title}</b>
          {band.points && <b className={styles.points}>{band.points}</b>}
          {band.sub && <span className={styles.sub}>{band.sub}</span>}
        </span>
      </div>
    </div>
  );
}

function GoblinBurst({ burst, onDone }: { burst: Burst; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, Math.max(0, burst.until - Date.now()));
    return () => clearTimeout(t);
  }, [burst.until, onDone]);
  return (
    <div className={styles.burstLayer} aria-hidden="true">
      <div className={cx(styles.burst, burst.jackpot && styles.jackpot)}>
        {Array.from({ length: COINS }, (_, i) => (
          <span key={i} className={styles.coin} style={{ "--a": `${(360 / COINS) * i + (i % 2) * 12}deg`, "--d": `${i % 3 === 0 ? 120 : i % 3 === 1 ? 92 : 74}px`, "--delay": `${(i % 4) * 40}ms` } as CSSProperties} />
        ))}
        <span className={styles.big}>{burst.text}</span>
      </div>
    </div>
  );
}

/** 띠 왼쪽 작은 금화 (픽셀) */
function GoblinCoinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 8 8" shapeRendering="crispEdges">
      <path d="M2 0h4v1h1v1h1v4h-1v1h-1v1h-4v-1h-1v-1h-1v-4h1v-1h1z" fill="#6a4512" />
      <path d="M2 1h4v1h1v4h-1v1h-4v-1h-1v-4h1z" fill="#f2c14e" />
      <path d="M5 5h1v1h-1zM4 6h2v1h-2z" fill="#d09a2c" />
      <path d="M2 2h2v1h-1v1h-1z" fill="#fff4c0" />
      <path d="M4 2h1v4h-1z" fill="#b07a1c" />
    </svg>
  );
}
