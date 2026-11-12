"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { DIR, DYE_PART_NAMES, DYE_PARTS, type DyePart } from "@tomb/protocol";
import { avatarColors, specDye, withDyePart } from "@/game/sprites/avatar";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { dyeApi } from "@/lib/dye/client";
import { colorLabel, swatchStyle } from "@/lib/dye/look";
import { boardColor, buildBoard, cellOf, chunkRgba, chunkSpots, DYE_BOARD_H, DYE_BOARD_W, DYE_TIERS, DYE_TIME_MS, specialLabel, wobbleLabel, type DyeTier } from "@/lib/dye/palette";
import { DYE_DECIDE_MS, fixedAllows } from "@/lib/dye/rules";
import type { DyeCandidate, DyeSessionView, DyeTimeoutResponse, StyleChangeResponse } from "@/lib/dye/types";
import { meStore } from "@/lib/hooks/useMe";
import { applyStyle } from "../account/actions";
import { OutfitCanvas } from "../shop/OutfitPreview";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { aimAt, BoardPointers, clampView, minScale, toBoard, wheelFactor, zoomAt, type BoardView } from "./board";
import { drawSpots } from "./spots";
import styles from "./DyeDialog.module.css";

// 46번 염색 창. 무작위 염색권: 부위 고르기 → 60초 동안 무작위 팔레트(일부만 보이는 연속 색 공간)를 드래그·휠(핀치)로 뒤진다.
// 조준점은 마우스를 따라가고(폰은 화면 가운데) 흔들린다 — 그 아래 색이 바로 "지금 고른 색"(미리보기에 입혀짐).
// [이 색으로 염색]·엔터를 누른 순간의 조준점 색으로 확정. 시간이 끝나면 그 순간 조준점 색을 후보로 "지금 색 vs 새 색"을 고른다
// (안 고르면 지금 색 유지). 도중에 창을 닫으면 포기 — 색은 그대로, 염색권은 쓴 것으로.
// 고정 색 염색권: 부위만 고르면 미리 보고 바로 그 색. 결과 색은 서버가 정한다 (여기서는 판 좌표만 보낸다).

export type DyeTicket =
  | { itemId: string; name: string; mode: "random"; tier: DyeTier }
  | { itemId: string; name: string; mode: "fixed"; color: string; parts?: DyePart[] };

type Props = {
  /** 쓸 염색권 (진행 중인 판을 이어서 할 때는 null) */
  ticket: DyeTicket | null;
  /** 진행 중인 판 (있으면 바로 판으로) */
  resume?: DyeSessionView | null;
  /** 내 아바타 (색 표기에 지금 염색이 들어 있다) */
  avatar: { color: string; body: string };
  look: readonly string[];
  /** 창 닫기. pending = 닫으며 보낸 포기 요청 (끝난 뒤에 가방 상태를 다시 받아야 진행 중 판이 남아 보이지 않는다) */
  onClose: (pending?: Promise<unknown>) => void;
  /** 끝났을 때 한 줄 안내 (부모의 알림 줄) */
  onDone?: (message: string) => void;
};

type Phase = "part" | "play" | "choose" | "sending" | "done";
type Picked = { x: number; y: number; color: string };

const hexOf = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
/** 지금 그 부위 색 (기본 포인트는 몸마다 달라 "기본"으로 보인다) */
function partColor(spec: string, part: DyePart): string | null {
  const d = specDye(spec)[part];
  if (d) return d;
  if (part === "accent") return null;
  const c = avatarColors(spec);
  return hexOf(part === "head" ? c.head : c.body);
}

export default function DyeDialog({ ticket, resume, avatar, look, onClose, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>(resume?.candidate ? "choose" : resume ? "play" : "part");
  const [part, setPart] = useState<DyePart>(resume?.part ?? (ticket?.mode === "fixed" && ticket.parts?.length ? ticket.parts[0] : "body"));
  const [session, setSession] = useState<DyeSessionView | null>(resume ?? null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ color: string; part: DyePart; late: boolean; kept: boolean } | null>(null);
  /** 시간이 끝나 고르는 중인 후보 색 (decideBy = 내 시계 기준 마감) */
  const [candidate, setCandidate] = useState<DyeCandidate | null>(() =>
    resume?.candidate ? { color: resume.candidate.color, decideBy: Date.now() + (resume.candidate.decideBy - resume.serverNow) } : null,
  );
  const [spec, setSpec] = useState(avatar.color);
  const [body, setBody] = useState(avatar.body);

  const fixedColor = ticket?.mode === "fixed" ? ticket.color : null;
  const allowed = (p: DyePart) => ticket?.mode !== "fixed" || fixedAllows(ticket.parts, p);

  function finished(res: StyleChangeResponse, late = false) {
    // 내 정보 + 게임의 내 아바타(look:set)를 바로 바꾼다
    applyStyle(res);
    const p = res.part ?? part;
    const kept = !!res.kept || !res.color;
    const color = kept ? "" : (res.color ?? "");
    if (!kept) setSpec(withDyePart(spec, p, color));
    if (res.me.body) setBody(res.me.body);
    setCandidate(null);
    setResult({ color, part: p, late: late || !!res.late, kept });
    setPhase("done");
    onDone?.(kept ? `${DYE_PART_NAMES[p]} 색은 그대로 두었어요.` : `${DYE_PART_NAMES[p]}을(를) ${color}(으)로 염색했어요.`);
  }

  /** 시간 끝 → 후보 색 (없으면 너무 늦어 색 그대로 끝남) */
  function timedOut(res: DyeTimeoutResponse) {
    if (!res.candidate) {
      setCandidate(null);
      setResult({ color: "", part: res.part, late: true, kept: true });
      setPhase("done");
      onDone?.(`시간이 지나 ${DYE_PART_NAMES[res.part]} 색은 그대로 두었어요.`);
      return;
    }
    setCandidate({ color: res.candidate.color, decideBy: Date.now() + (res.candidate.decideBy - res.serverNow) });
    setPhase("choose");
  }

  /** 창 닫기: 판이 진행 중이거나 고르는 중이면 포기 (색 그대로, 염색권은 쓴 것으로) */
  function close() {
    if (session && (phase === "play" || phase === "choose")) {
      const pending = dyeApi.cancel(session.seed).catch(() => {});
      onDone?.(`${DYE_PART_NAMES[session.part]} 염색을 그만뒀어요. 색은 그대로예요.`);
      onClose(pending);
      return;
    }
    onClose();
  }

  async function begin() {
    if (!ticket) return;
    setError(null);
    if (ticket.mode === "fixed") {
      setPhase("sending");
      try {
        finished(await dyeApi.fixed(ticket.itemId, part));
      } catch (e) {
        setError(errorMessage(e));
        setPhase("part");
      }
      return;
    }
    setPhase("sending");
    try {
      const res = await dyeApi.start(ticket.itemId, part);
      // 서버가 염색권 1장을 뺐다(또는 진행 중인 판을 이어 줌) → 가방 표시를 서버 값으로
      meStore.set(res.me);
      setSession(res.session);
      setPart(res.session.part);
      setPhase("play");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("part");
      // 가방에 없다(표시가 서버와 어긋남) → 내 정보를 다시 받아 개수를 맞춘다
      if (e instanceof ApiRequestError && e.code === "NO_ITEM") void meStore.refresh();
    }
  }

  const title = phase === "choose" ? "색 고르기" : phase === "play" || phase === "sending" ? "염색 중" : "염색";
  const previewSpec = phase === "part" && fixedColor ? withDyePart(spec, part, fixedColor) : spec;

  return (
    // 결과·비교(고르기) 단계는 내용 높이에 맞는 작은 창 (판을 도는 동안만 표준 창)
    <Dialog title={title} onClose={close} kind={phase === "done" || phase === "choose" ? "confirm" : "window"}>
      <div className={styles.wrap}>
        {phase === "play" && session ? (
          <DyeBoard
            session={session}
            spec={spec}
            body={body}
            look={look}
            onFinish={finished}
            onTimeout={timedOut}
            onError={(m) => setError(m)}
          />
        ) : phase === "choose" && session && candidate ? (
          <DyeChoice session={session} candidate={candidate} spec={spec} body={body} look={look} onDone={finished} onError={(m) => setError(m)} />
        ) : phase === "done" && result ? (
          <div className={styles.row}>
            <div className={styles.figure}>
              <OutfitCanvas color={spec} body={body} look={look} label="염색한 내 모습" dir={DIR.down} walking={false} />
            </div>
            <div className={styles.side}>
              {result.kept ? (
                <p className={styles.result} role="status">
                  {DYE_PART_NAMES[result.part]} 색은 그대로예요{result.late ? " (고르는 시간이 지났어요)" : ""}.
                </p>
              ) : (
                <>
                  <p className={styles.result} role="status">
                    <span className={styles.swatchBig} style={swatchStyle(result.color)} aria-hidden="true" />
                    {DYE_PART_NAMES[result.part]} 염색 완료 · {colorLabel(result.color)}
                  </p>
                  <p className={styles.note}>다른 사람 화면에도 바로 이 색으로 보여요. 원래 색으로 되돌리기는 상점의 염색·외형에서 할 수 있어요.</p>
                </>
              )}
              <div className={styles.actions}>
                <button type="button" className={cx(ui.button, ui.primary)} onClick={close}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.row}>
            <div className={styles.figure}>
              <OutfitCanvas color={previewSpec} body={body} look={look} label={fixedColor ? "염색해 본 내 모습" : "지금 내 모습"} dir={DIR.down} walking={false} />
            </div>
            <div className={styles.side}>
              <p className={styles.note}>
                {ticket?.name ?? "염색권"} ·{" "}
                {ticket?.mode === "fixed"
                  ? "정해진 색으로 바로 염색해요."
                  : `60초 안에 무작위 팔레트에서 색을 찾아요. 흔들림 ${ticket ? wobbleLabel(ticket.tier) : ""} · 특수 색 ${ticket ? specialLabel(ticket.tier) : ""}.`}
              </p>
              <div className={styles.parts} role="group" aria-label="염색할 부위">
                {DYE_PARTS.map((p) => {
                  const c = partColor(spec, p);
                  return (
                    <button
                      key={p}
                      type="button"
                      className={cx(ui.button, styles.part)}
                      aria-pressed={part === p}
                      disabled={!allowed(p) || phase === "sending"}
                      onClick={() => setPart(p)}
                    >
                      <span className={styles.swatch} style={c ? swatchStyle(c) : { background: DEFAULT_SWATCH }} aria-hidden="true" />
                      {DYE_PART_NAMES[p]}
                      {!c && <span className={styles.note}>기본</span>}
                    </button>
                  );
                })}
              </div>
              {fixedColor && (
                <p className={styles.pick}>
                  <span className={styles.swatchBig} style={{ background: fixedColor }} aria-hidden="true" />
                  {fixedColor} — 왼쪽은 염색해 본 모습이에요.
                </p>
              )}
              {ticket?.mode === "random" && (
                <p className={styles.note}>
                  시작하면 염색권 1장을 써요. 판은 일부만 보여요 — 끌어서 옮기고, 휠(폰은 두 손가락)로 확대·축소해 원하는 색을 찾으세요. 조준점 아래 색이 바로 고른
                  색이 되고, [이 색으로 염색]을 누른 순간 정해져요. 시간이 끝나면 그 순간 조준점 아래 색과 지금 색 중에서 골라요. 도중에 창을
                  닫으면 색은 그대로이고 염색권은 돌아오지 않아요.
                </p>
              )}
              {error && <p className={ui.error}>{error}</p>}
              <div className={styles.actions}>
                <button type="button" className={ui.button} onClick={close}>
                  닫기
                </button>
                <button type="button" className={cx(ui.button, ui.primary)} disabled={!ticket || !allowed(part) || phase === "sending"} onClick={begin}>
                  {phase === "sending" ? "잠깐만요…" : ticket?.mode === "fixed" ? `${DYE_PART_NAMES[part]}을(를) 이 색으로` : `${DYE_PART_NAMES[part]} 염색 시작 (60초)`}
                </button>
              </div>
            </div>
          </div>
        )}
        {(phase === "play" || phase === "choose") && error && <p className={ui.error}>{error}</p>}
      </div>
    </Dialog>
  );
}

// ── 판 (60초) ──

/** 미리보기 캐릭터를 다시 그리는 최소 간격 (색이 거의 매 프레임 바뀌므로) */
const PREVIEW_MS = 120;

function DyeBoard({
  session,
  spec,
  body,
  look,
  onFinish,
  onTimeout,
  onError,
}: {
  session: DyeSessionView;
  spec: string;
  body: string;
  look: readonly string[];
  onFinish: (res: StyleChangeResponse, late?: boolean) => void;
  onTimeout: (res: DyeTimeoutResponse) => void;
  onError: (m: string) => void;
}) {
  // 11/12 끝없는 판: 구역(판 한 장)이 상하좌우로 이어진다. 서버도 같은 함수로 색을 정한다
  const palette = useMemo(() => buildBoard(session.seed, session.tier), [session.seed, session.tier]);
  // 조준점은 판 정가운데에 고정, 흔들림은 염색권 등급대로(얼룩 많이 · 고운 덜 · 무지개 거의 없음)
  const amp = DYE_TIERS[session.tier].wobblePx;
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLSpanElement>(null);
  const liveTextRef = useRef<HTMLSpanElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  const sizeRef = useRef({ w: 1, h: 1 });
  const pointers = useRef(new BoardPointers());
  /** 조준 기준 (보드 안 화면 좌표). 마우스는 포인터 자리, 폰·키보드는 null = 화면 가운데 */
  const aimBase = useRef<{ x: number; y: number } | null>(null);
  const t0 = useRef(0);
  const sentRef = useRef(false);
  // 서버 시계 기준 마감 → 내 시계로 (요청 지연만큼 조금 이르게 끝난다)
  const [localEnds] = useState(() => Date.now() + (session.endsAt - session.serverNow));
  const [left, setLeft] = useState(() => Math.max(0, session.endsAt - session.serverNow));
  /** 지금 조준점 아래 색 (미리보기 캐릭터에 입힌다 — 너무 자주 그리지 않게 간격을 둔다) */
  const [live, setLive] = useState<Picked | null>(null);
  const [sending, setSending] = useState(false);
  /** 루프 안에서 부르는 최신 함수 (시간 끝 → 그 순간 색을 후보로) */
  const timeoutRef = useRef<() => void>(() => {});

  // 판 그림 타일 (구역 하나 = 칸 1개 1px 캔버스) — 보이는 구역만 그려 두고 다시 쓴다 (오래된 것부터 버린다)
  const sheet = useMemo(() => {
    if (typeof document === "undefined") return null;
    const tiles = new Map<string, HTMLCanvasElement>();
    /** 구역 (i, j) 타일. make = false면 없을 때 만들지 않는다 (한 프레임에 하나만 새로 만들어 끊김을 줄인다) */
    return (i: number, j: number, make: boolean): HTMLCanvasElement | null => {
      const key = `${i},${j}`;
      const hit = tiles.get(key);
      if (hit || !make) return hit ?? null;
      const c = document.createElement("canvas");
      c.width = DYE_BOARD_W;
      c.height = DYE_BOARD_H;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      const img = ctx.createImageData(DYE_BOARD_W, DYE_BOARD_H);
      img.data.set(chunkRgba(palette, i, j));
      ctx.putImageData(img, 0, 0);
      tiles.set(key, c);
      if (tiles.size > 16) tiles.delete(tiles.keys().next().value!);
      return c;
    };
  }, [palette]);

  /** 지금 조준점이 가리키는 칸과 그 색 (확정·미리보기·그리기가 모두 이 값) */
  const aimNow = (now = performance.now()): Picked => {
    const v = viewRef.current ?? { cx: DYE_BOARD_W / 2, cy: DYE_BOARD_H / 2, scale: 1 };
    const { w, h } = sizeRef.current;
    const a = aimAt(v, w, h, aimBase.current, amp, (now - t0.current) / 1000);
    const c = cellOf(a.x, a.y);
    return { x: a.x, y: a.y, color: boardColor(palette, c.cx, c.cy) };
  };

  async function send(at: Picked) {
    if (sentRef.current) return;
    sentRef.current = true;
    setSending(true);
    setLive(at);
    try {
      onFinish(await dyeApi.finish(session.seed, at.x, at.y), false);
    } catch (e) {
      onError(errorMessage(e));
      sentRef.current = false;
      setSending(false);
    }
  }

  /** 시간 끝: 그 순간 조준점 좌표를 보내 후보 색을 받는다 (아직 칠하지 않는다) */
  async function expire(at: Picked) {
    if (sentRef.current) return;
    sentRef.current = true;
    setSending(true);
    setLive(at);
    try {
      onTimeout(await dyeApi.timeout(session.seed, at.x, at.y));
    } catch (e) {
      onError(`${errorMessage(e)} 창을 다시 열면 이어서 고를 수 있어요.`);
    }
  }

  // 그리기 루프 + 남은 시간 + 조준점 아래 색 (포인터를 움직이면 그 색이 바로 "지금 고른 색")
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box || !sheet) return;
    t0.current = performance.now();
    let raf = 0;
    let lastTick = 0;
    let lastLive = "";
    let lastPreview = 0;
    let shown = "";
    const fit = () => {
      const r = box.getBoundingClientRect();
      // 창이 아직 안 열려(이어 하기 — 자식 효과가 창 열기보다 먼저 돈다) 크기가 0이면 건너뛴다 (배율 0 → NaN 방지). 열리면 ResizeObserver가 다시 부른다
      if (r.width < 1 || r.height < 1) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { w: r.width, h: r.height };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      const v = viewRef.current ?? { cx: DYE_BOARD_W / 2, cy: DYE_BOARD_H / 2, scale: minScale(r.width, r.height) * 1.4 };
      viewRef.current = clampView(v, r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    const loop = (now: number) => {
      // 다음 프레임을 먼저 예약한다 — 그리기에서 예외가 나도 루프가 죽지 않는다 (시간 끝이면 아래에서 취소)
      raf = requestAnimationFrame(loop);
      try {
        draw(now);
      } catch (err) {
        console.error("[dye] 판 그리기 실패", err);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
      }
      if (now - lastTick > 200) {
        lastTick = now;
        const remain = Math.max(0, localEnds - Date.now());
        setLeft(remain);
        if (remain <= 0) {
          // 시간 끝: 그 순간 조준점 아래 색을 후보로 (지금 색과 비교해 고른다)
          cancelAnimationFrame(raf);
          timeoutRef.current();
        }
      }
    };
    const draw = (now: number) => {
      const ctx = canvas.getContext("2d");
      const v = viewRef.current;
      if (ctx && v && !sentRef.current) {
        const { w, h } = sizeRef.current;
        const k = canvas.width / w;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#0b0a10";
        ctx.fillRect(0, 0, w, h);
        const left0 = w / 2 - v.cx * v.scale;
        const top0 = h / 2 - v.cy * v.scale;
        // 보이는 구역 타일만 (한 프레임에 새 타일은 하나만 만든다 — 아직 없는 구역은 바탕색)
        const i0 = Math.floor((v.cx - w / 2 / v.scale) / DYE_BOARD_W);
        const i1 = Math.floor((v.cx + w / 2 / v.scale) / DYE_BOARD_W);
        const j0 = Math.floor((v.cy - h / 2 / v.scale) / DYE_BOARD_H);
        const j1 = Math.floor((v.cy + h / 2 / v.scale) / DYE_BOARD_H);
        let budget = 1;
        const spots: ReturnType<typeof chunkSpots> = [];
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const had = sheet(i, j, false);
            const tile = had ?? sheet(i, j, budget > 0);
            if (!had && tile) budget--;
            if (tile) {
              ctx.drawImage(tile, left0 + i * DYE_BOARD_W * v.scale, top0 + j * DYE_BOARD_H * v.scale, DYE_BOARD_W * v.scale, DYE_BOARD_H * v.scale);
              spots.push(...chunkSpots(palette, i, j));
            }
          }
        // 특수 색 무리 연출 (판에 아주 드물게 숨은 희귀 색 — 금빛 광택·반짝이·무지개·야광)
        drawSpots(ctx, spots, left0, top0, v.scale, w, h, now);
        // 흔들리는 조준점 (마우스 자리 또는 화면 가운데 + 흔들림)
        const a = aimNow(now);
        const ax = left0 + a.x * v.scale;
        const ay = top0 + a.y * v.scale;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.beginPath();
        ctx.arc(ax, ay, 9, 0, Math.PI * 2);
        ctx.moveTo(ax - 15, ay);
        ctx.lineTo(ax - 5, ay);
        ctx.moveTo(ax + 5, ay);
        ctx.lineTo(ax + 15, ay);
        ctx.moveTo(ax, ay - 15);
        ctx.lineTo(ax, ay - 5);
        ctx.moveTo(ax, ay + 5);
        ctx.lineTo(ax, ay + 15);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#fff8e0";
        ctx.stroke();
        if (a.color !== lastLive) {
          lastLive = a.color;
          if (liveRef.current) {
            const st = swatchStyle(a.color);
            liveRef.current.style.background = String(st.background ?? "");
            liveRef.current.style.boxShadow = String(st.boxShadow ?? "");
          }
          if (liveTextRef.current) liveTextRef.current.textContent = colorLabel(a.color);
        }
        if (a.color !== shown && now - lastPreview > PREVIEW_MS) {
          lastPreview = now;
          shown = a.color;
          setLive(a);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // aimNow는 ref만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, palette, amp, localEnds]);

  useEffect(() => {
    timeoutRef.current = () => void expire(aimNow());
  });

  // 휠 확대·축소 (passive가 아니어야 페이지가 스크롤되지 않는다)
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (!v) return;
      // 조준점은 가운데 고정 → 커서 자리와 상관없이 화면 가운데를 기준으로 확대·축소 (한계에서 멈춘다)
      const { w, h } = sizeRef.current;
      viewRef.current = zoomAt(v, w, h, w / 2, h / 2, wheelFactor(e.deltaY, e.deltaMode));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  function local(e: ReactPointerEvent) {
    const r = boxRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: NaN, y: NaN };
  }

  // 커서 자리·클릭은 판에 영향이 없다: 끌기(왼쪽 버튼·손가락)·두 손가락·휠·키만 판을 옮긴다 (BoardPointers)
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (sending) return;
    const p = local(e);
    if (!pointers.current.down(e.pointerId, e.pointerType, e.button, p.x, p.y)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 이미 끝난 포인터 (붙잡기 없이도 움직임은 받는다) */
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const p = local(e);
    const { w, h } = sizeRef.current;
    const next = pointers.current.move(e.pointerId, e.pointerType, e.buttons, p.x, p.y, viewRef.current, w, h);
    if (next) viewRef.current = next;
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const at = pointers.current.up(e.pointerId);
    if (!at || sending) return;
    // 폰에서 짧게 누르기: 그 자리를 화면 가운데(조준점)로 옮긴다 (마우스 클릭은 at = null)
    const v = viewRef.current;
    if (!v) return;
    const { w, h } = sizeRef.current;
    const q = toBoard(v, w, h, at.x, at.y);
    viewRef.current = clampView({ ...v, cx: q.x, cy: q.y }, w, h);
  }

  /** 취소·붙잡기 풀림: 그 포인터만 잊는다 (판은 그대로) */
  function onPointerDrop(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.drop(e.pointerId);
  }

  // 창 초점을 잃으면 끌기 기록을 모두 지운다 (버튼을 창 밖에서 놓아도 끌기가 이어지지 않게)
  useEffect(() => {
    const forget = () => pointers.current.clear();
    window.addEventListener("blur", forget);
    return () => window.removeEventListener("blur", forget);
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const v = viewRef.current;
    if (!v || sending) return;
    const { w, h } = sizeRef.current;
    const step = 24 / v.scale;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      aimBase.current = null; // 키보드는 화면 가운데 조준점
      viewRef.current = clampView({ ...v, cx: v.cx + moves[e.key][0], cy: v.cy + moves[e.key][1] }, w, h);
    } else if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault();
      viewRef.current = zoomAt(v, w, h, w / 2, h / 2, e.key === "-" ? 1 / 1.25 : 1.25);
    } else if (e.key === "Enter") {
      e.preventDefault();
      void send(aimNow());
    }
  }

  const preview = live ? withDyePart(spec, session.part, live.color) : spec;
  const now = partColor(spec, session.part);

  // 판은 남는 자리를 모두 쓰고(데스크톱은 왼쪽, 폰은 위), 옆(아래) 칸에 남은 시간 · 지금 색 vs 새 색 · 확정 버튼
  return (
    <div className={styles.play}>
      <div
        ref={boxRef}
        className={styles.board}
        tabIndex={0}
        role="application"
        aria-label="염색 팔레트. 조준점 아래 색이 바로 고른 색이 돼요. 끌어서 옮기고 휠이나 두 손가락으로 확대·축소. 키보드: 화살표 이동, +/- 확대, 엔터 확정"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerDrop}
        onLostPointerCapture={onPointerDrop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
      >
        <canvas ref={canvasRef} />
      </div>
      <div className={styles.panel}>
        <TimeLeft label={`${DYE_PART_NAMES[session.part]} 염색`} left={left} total={DYE_TIME_MS} />
        <div className={styles.compare}>
          <LookCard spec={spec} body={body} look={look} label="지금 내 모습" title="지금 색" color={now} />
          <LookCard
            spec={preview}
            body={body}
            look={look}
            label="지금 고른 색으로 염색해 본 내 모습"
            title="새 색"
            color={live?.color ?? null}
            swatchRef={liveRef}
            hexRef={liveTextRef}
            hexTestId="dye-live"
          />
        </div>
        <p className={cx(styles.note, styles.tip)}>
          조준점 아래 색이 바로 고른 색이에요(폰은 화면 가운데 조준점). 흔들리니 원하는 색에서 잘 멈춰 확정하세요. 확대할수록 덜 흔들려요. 시간이 끝나면 그 순간 조준점
          아래 색과 지금 색 중에서 골라요.
        </p>
        <div className={styles.actions}>
          <button type="button" className={cx(ui.button, ui.primary)} disabled={sending} onClick={() => void send(aimNow())}>
            {sending ? "염색하는 중…" : "이 색으로 염색"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 남은 시간: 이름 · 초(크게) + 줄어드는 막대 */
function TimeLeft({ label, left, total }: { label: string; left: number; total: number }) {
  const secs = Math.ceil(left / 1000);
  return (
    <div className={styles.hud}>
      <span className={styles.hudLabel}>{label}</span>
      <span className={styles.secs} aria-live={secs <= 10 ? "polite" : "off"}>
        {secs}초
      </span>
      <div
        className={styles.timer}
        data-low={secs <= 10 || undefined}
        role="progressbar"
        aria-label="남은 시간"
        aria-valuemin={0}
        aria-valuemax={Math.round(total / 1000)}
        aria-valuenow={secs}
      >
        <div className={styles.timerFill} style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
      </div>
    </div>
  );
}

const DEFAULT_SWATCH = "repeating-linear-gradient(45deg,#d9ceb2 0 4px,#e6a3b0 4px 8px)";

/** 비교 칸 하나: 그 색을 입은 내 모습(칸을 꽉 채워 크게) + 이름 · 견본 · 색 코드 */
function LookCard({
  spec,
  body,
  look,
  label,
  title,
  color,
  swatchRef,
  hexRef,
  hexTestId,
}: {
  spec: string;
  body: string;
  look: readonly string[];
  label: string;
  title: string;
  /** null이면 기본 색 (판에서는 아직 고른 색이 없을 때 — 견본·코드는 ref로 바로 바뀐다) */
  color: string | null;
  swatchRef?: Ref<HTMLSpanElement>;
  hexRef?: Ref<HTMLSpanElement>;
  hexTestId?: string;
}) {
  const live = !!swatchRef;
  return (
    <figure className={styles.look}>
      <div className={styles.stageBox}>
        <OutfitCanvas color={spec} body={body} look={look} label={label} dir={DIR.down} walking={false} />
      </div>
      <figcaption className={styles.caption}>
        <span className={styles.capTitle}>{title}</span>
        <span
          ref={swatchRef}
          className={styles.swatchBig}
          style={live ? undefined : color ? swatchStyle(color) : { background: DEFAULT_SWATCH }}
          aria-hidden="true"
        />
        <span ref={hexRef} className={styles.hex} data-testid={hexTestId}>
          {color ? colorLabel(color) : live ? "" : "기본"}
        </span>
      </figcaption>
    </figure>
  );
}

// ── 시간 끝: 지금 색 vs 새 색 ──

function DyeChoice({
  session,
  candidate,
  spec,
  body,
  look,
  onDone,
  onError,
}: {
  session: DyeSessionView;
  candidate: DyeCandidate;
  spec: string;
  body: string;
  look: readonly string[];
  onDone: (res: StyleChangeResponse) => void;
  onError: (m: string) => void;
}) {
  const [left, setLeft] = useState(() => Math.max(0, candidate.decideBy - Date.now()));
  const [sending, setSending] = useState(false);
  const sentRef = useRef(false);
  const now = partColor(spec, session.part);

  async function choose(apply: boolean) {
    if (sentRef.current) return;
    sentRef.current = true;
    setSending(true);
    try {
      onDone(await dyeApi.choose(session.seed, apply));
    } catch (e) {
      onError(errorMessage(e));
      sentRef.current = false;
      setSending(false);
    }
  }
  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });

  // 고르는 시간이 끝나면 지금 색 유지
  useEffect(() => {
    const t = window.setInterval(() => {
      const remain = Math.max(0, candidate.decideBy - Date.now());
      setLeft(remain);
      if (remain <= 0) {
        window.clearInterval(t);
        void chooseRef.current(false);
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [candidate.decideBy]);

  const name = DYE_PART_NAMES[session.part];
  // 지금 색 vs 새 색을 창을 꽉 채워 크게 나란히, 아래에 남은 시간 · 버튼
  return (
    <div className={styles.choose}>
      <p className={styles.note} role="status">
        시간이 끝났어요. {name}을(를) 새 색으로 바꿀까요? {Math.ceil(left / 1000)}초 안에 고르지 않으면 지금 색 그대로예요.
      </p>
      <div className={cx(styles.compare, styles.compareWide)}>
        <LookCard spec={spec} body={body} look={look} label="지금 내 모습" title="지금 색" color={now} />
        <LookCard
          spec={withDyePart(spec, session.part, candidate.color)}
          body={body}
          look={look}
          label="새 색으로 염색해 본 내 모습"
          title="새 색"
          color={candidate.color}
        />
      </div>
      <TimeLeft label="고르는 시간" left={left} total={DYE_DECIDE_MS} />
      <div className={styles.actions}>
        <button type="button" className={ui.button} disabled={sending} onClick={() => void choose(false)}>
          지금 색 유지
        </button>
        <button type="button" className={cx(ui.button, ui.primary)} disabled={sending} onClick={() => void choose(true)}>
          {sending ? "잠깐만요…" : "새 색으로 바꾸기"}
        </button>
      </div>
    </div>
  );
}
