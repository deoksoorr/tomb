"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { itemById, type ItemDef } from "@tomb/protocol";
import { errorMessage, request } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import type { XmasOpenResponse } from "@/lib/xmas/box";
import { XBOX_H, XBOX_W, xmasBoxPieces } from "@/game/sprites/xmasBoxArt";
import { playPocketPop, playPocketRustle } from "../forage/pocketSound";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import s from "./XmasBoxOpen.module.css";
import { OddsLink } from "../odds/OddsLayer";

// 12월 크리스마스 선물상자 열기 (가방 소모품 [열기]).
// [열기] → 상자가 들썩 → 금 리본 고리가 양옆으로 풀려 날아가고 띠가 흘러내림 → 뚜껑이 튀어 오르며 빛살·반짝이 → 나온 꾸미기가 떠오른다.
// 무엇이 나올지는 서버가 뽑는다 (lib/xmas/box). 여러 개면 하나씩

type Phase = "ready" | "untie" | "open" | "done";
/** 리본이 풀리는 시간 (서버 답이 더 빨라도 이만큼은 보여 준다) */
const UNTIE_MS = 900;
const OPEN_MS = 650;
/** 그림 1px → 화면 px */
const K = 4;

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

/** 받침에 맞춰 "이/가" */
function subj(w: string): string {
  const c = w.charCodeAt(w.length - 1);
  const hasBatchim = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return `${w}${hasBatchim ? "이" : "가"}`;
}

const GRADE_LABEL: Record<NonNullable<ItemDef["grade"]>, string> = { common: "일반", fine: "고급", rare: "희귀", legend: "전설" };

/** 반짝이 조각 (터질 때 사방으로 — 자리·지연은 고정 값이라 렌더가 늘 같다) */
const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
  const r = 70 + ((i * 37) % 40);
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r * 0.8 - 20), delay: (i % 5) * 40, kind: i % 3 };
});

export default function XmasBoxOpen({ count, onClose }: { count: number; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [res, setRes] = useState<XmasOpenResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const left = res ? res.left : count;

  // 상자 조각 그림 (브라우저에서 한 번)
  const pieces = useMemo(
    () =>
      typeof document === "undefined"
        ? []
        : xmasBoxPieces().map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.grid.w, h: p.grid.h, src: p.grid.toCanvas().toDataURL("image/png") })),
    [],
  );

  async function open() {
    setErr(null);
    setRes(null);
    setPhase("untie");
    playPocketRustle();
    const started = Date.now();
    try {
      const r = await request<XmasOpenResponse>("/api/xmas/open", post({}));
      meStore.set(r.me);
      const wait = Math.max(0, UNTIE_MS - (Date.now() - started));
      timers.current.push(
        setTimeout(() => {
          setRes(r);
          setPhase("open");
          playPocketPop();
          timers.current.push(setTimeout(() => setPhase("done"), OPEN_MS));
        }, wait),
      );
    } catch (e) {
      setErr(errorMessage(e));
      setPhase("ready");
      void meStore.refresh();
    }
  }

  const prize = res?.prize ?? null;
  const prizeId = prize ? (prize.kind === "cosmetic" ? prize.id : prize.itemId) : null;
  const item = prizeId ? itemById(prizeId) : undefined;
  const grade = prize?.kind === "cosmetic" ? item?.grade : undefined;

  return (
    <Dialog title="크리스마스 선물상자" kind="confirm" onClose={onClose}>
      <div className={s.opener}>
        <div className={s.stage} data-phase={phase} style={{ width: XBOX_W * K, height: XBOX_H * K + 24 } as CSSProperties}>
          {/* 뒤에서 퍼지는 빛살 (열릴 때부터) */}
          {(phase === "open" || phase === "done") && <span className={s.rays} data-grade={grade} aria-hidden="true" />}
          <span className={s.box} aria-hidden="true">
            {pieces.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element -- 픽셀 그림 조각 (dataURL)
              <img
                key={p.id}
                src={p.src}
                alt=""
                className={s.piece}
                data-piece={p.id}
                width={p.w * K}
                height={p.h * K}
                style={{ left: p.x * K, top: p.y * K + 24 }}
              />
            ))}
          </span>
          {(phase === "open" || phase === "done") && (
            <span className={s.sparks} aria-hidden="true">
              {SPARKS.map((p, i) => (
                <i key={i} data-kind={p.kind} style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, animationDelay: `${p.delay}ms` } as CSSProperties} />
              ))}
            </span>
          )}
          {phase === "done" && prizeId && (
            <span className={s.prize} data-grade={grade}>
              <ItemIcon itemId={prizeId} size={64} />
            </span>
          )}
        </div>
        <div className={s.text} role="status" aria-live="polite">
          {phase === "ready" && (
            <>
              <b>{count > 1 ? `선물상자가 ${count}개 있어요. 하나씩 열어요` : "무엇이 들어 있을까요?"}</b>
              <OddsLink section="xmas" label="나오는 확률 보기" />
            </>
          )}
          {phase === "untie" && <b>리본이 스르르 풀려요…</b>}
          {phase === "open" && <b>짠!</b>}
          {phase === "done" && prize && item && (
            <>
              {prize.kind === "cosmetic" ? (
                <>
                  <b>
                    {grade && <span className={s.grade} data-grade={grade}>{GRADE_LABEL[grade]}</span>} {subj(item.name)} 나왔어요!
                  </b>
                  <small>영구로 옷장에 들어갔어요. 가방의 꾸미기에서 입어 보세요</small>
                </>
              ) : (
                <>
                  <b>크리스마스 세트를 모두 모았어요!</b>
                  <small>
                    대신 {item.name} {prize.count}개를 가방에 넣었어요
                  </small>
                </>
              )}
            </>
          )}
          {err && <small className={ui.error}>{err}</small>}
        </div>
        <div className={s.btns}>
          {(phase === "ready" || (phase === "done" && left > 0)) && (
            <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void open()}>
              {phase === "done" ? `하나 더 열기 (${left}개 남음)` : "열기"}
            </button>
          )}
          <button type="button" className={ui.button} disabled={phase === "untie" || phase === "open"} onClick={onClose}>
            {phase === "done" ? "확인" : "닫기"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
