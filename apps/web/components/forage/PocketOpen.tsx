"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";
import { RARITY_LABEL, speciesById } from "@/lib/forage/catalog";
import { prizeText, type BoxPrize } from "@/lib/forage/quests/urgent";
import { urgentApi } from "@/lib/forage/quests/urgentClient";
import type { UrgentOpenResponse } from "@/lib/forage/quests/urgentTypes";
import { meStore } from "@/lib/hooks/useMe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { forageStore } from "./forageStore";
import { playPocketPop, playPocketRustle } from "./pocketSound";
import { questStore } from "./questStore";
import u from "./urgent.module.css";

// 11/15: 가방의 「수집가의 뒷주머니」 열기. [열기] → 주머니가 흔들리고(부스럭) → 펑! → 나온 것을 보여 준다.
// 내용물은 서버가 (의뢰, 계정)으로 미리 정해 두었다 — 몇 번을 다시 시도해도 같다. 여러 개면 하나씩

type Phase = "ready" | "shake" | "pop" | "done";
/** 흔들리는 시간 (서버 답이 더 빨라도 이만큼은 흔든다) */
const SHAKE_MS = 1_100;
const POP_MS = 420;

function prizeIcon(p: BoxPrize) {
  if (p.kind === "stamps") return <span className={u.openSeal}>印</span>;
  return <ItemIcon itemId={p.kind === "fish" ? p.id : p.kind === "dye_pick" ? "q_dye_pick" : "q_dye_special"} size={48} />;
}

/** 받침에 맞춰 "이/가" ("의뢰 도장 4개가" · "색 확정 염색권이") */
function subj(w: string): string {
  const c = w.charCodeAt(w.length - 1);
  const hasBatchim = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return `${w}${hasBatchim ? "이" : "가"}`;
}

function prizeSub(r: UrgentOpenResponse): string {
  const p = r.prize;
  if (p.kind === "stamps") return `도장 교환소에서 쓸 수 있어요. 지금 도장 ${r.stamps}개`;
  if (p.kind === "fish") return r.fishKept === false ? "가방 칸이 가득해서 도장 3개로 바꿨어요" : `${RARITY_LABEL[speciesById(p.id)?.rarity ?? 3]} 물고기를 가방에 넣었어요`;
  if (p.kind === "dye_special") return "아주 드문 행운! 가방의 염색권 칸에 넣었어요";
  return "가방의 염색권 칸에 넣었어요";
}

export default function PocketOpen({ count, onClose }: { count: number; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [res, setRes] = useState<UrgentOpenResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const left = res ? res.left : count;

  async function open() {
    setErr(null);
    setRes(null);
    setPhase("shake");
    playPocketRustle();
    const started = Date.now();
    try {
      const r = await urgentApi.open();
      meStore.set(r.me);
      void questStore.refresh(true);
      if (r.prize.kind === "fish") void forageStore.refresh();
      const wait = Math.max(0, SHAKE_MS - (Date.now() - started));
      timers.current.push(
        setTimeout(() => {
          setRes(r);
          setPhase("pop");
          playPocketPop();
          timers.current.push(setTimeout(() => setPhase("done"), POP_MS));
        }, wait),
      );
    } catch (e) {
      setErr(errorMessage(e));
      setPhase("ready");
      void meStore.refresh();
    }
  }

  return (
    <Dialog title="수집가의 뒷주머니" onClose={onClose}>
      <div className={u.opener}>
        <div className={u.openStage} data-phase={phase}>
          {phase !== "done" && (
            <span className={u.openBag} aria-hidden="true">
              <ItemIcon itemId="u_box_pocket" size={96} />
            </span>
          )}
          {phase === "pop" && <span className={u.openBurst} aria-hidden="true" />}
          {phase === "done" && res && (
            <span className={u.openPrize} data-rare={res.prize.kind === "dye_special" || undefined}>
              {prizeIcon(res.prize)}
            </span>
          )}
        </div>
        <div className={u.openText} role="status" aria-live="polite">
          {phase === "ready" && <b>{count > 1 ? `주머니가 ${count}개 있어요. 하나씩 열어요` : "무엇이 들어 있을까요?"}</b>}
          {phase === "shake" && <b>부스럭부스럭…</b>}
          {phase === "pop" && <b>펑!</b>}
          {phase === "done" && res && (
            <>
              <b>{subj(prizeText(res.prize))} 나왔어요!</b>
              <small>{prizeSub(res)}</small>
            </>
          )}
          {err && <small className={ui.error}>{err}</small>}
        </div>
        <div className={u.openBtns}>
          {(phase === "ready" || (phase === "done" && left > 0)) && (
            <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void open()}>
              {phase === "done" ? `하나 더 열기 (${left}개 남음)` : "열기"}
            </button>
          )}
          <button type="button" className={ui.button} disabled={phase === "shake" || phase === "pop"} onClick={onClose}>
            {phase === "done" ? "확인" : "닫기"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
