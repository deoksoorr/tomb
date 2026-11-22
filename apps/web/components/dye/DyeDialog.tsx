"use client";

import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { DIR, dyeOfTarget, isCharDyePart, itemById, type DirId, type DyePart, type DyeSpecial, type DyeTarget } from "@tomb/protocol";
import { avatarColors, specDye, withDyePart } from "@/game/sprites/avatar";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { dyeApi } from "@/lib/dye/client";
import { colorLabel, swatchStyle } from "@/lib/dye/look";
import { boardColor, buildBoard, cellOf, DYE_BOARD_H, DYE_BOARD_W, DYE_TIERS, DYE_TIME_MS, specialLabel, wobbleLabel, type DyeSpot, type DyeTier } from "@/lib/dye/palette";
import { DYE_DECIDE_MS, dyeTargetBlock, dyeTargetName, fixedAllows, specialDyeColor } from "@/lib/dye/rules";
import type { DyeCandidate, DyeSessionView, DyeTimeoutResponse, StyleChangeResponse } from "@/lib/dye/types";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { applyStyle } from "../account/actions";
import { OutfitCanvas } from "../shop/OutfitPreview";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { aimAt, BoardPointers, clampView, dyeCloseGuard, easeVelocity, keyTarget, overwriteDismissCloses, PAN_KEYS, startScale, tilePlan, toBoard, visibleChunks, wheelFactor, zoomAt, type BoardView } from "./board";
import { DyeTiles } from "./tiles";
import { coverGame } from "@/lib/gameCover";
import { drawSpots } from "./spots";
import { fittingLook } from "../shop/fitting";
import { ColorPicker, hexHsv, hsvHex, SpecialPicker, type Hsv } from "./colorPick";
import { defaultDyeSlot, needsOverwrite, openColors, otherEmptySlot, otherPaintedColors, type ItemDyes } from "./colorSlots";
import { colorText, SlotPicker, TargetPicker } from "./DyeTargetPicker";
import ZoomStage from "./ZoomStage";
import styles from "./DyeDialog.module.css";
import { OddsLink } from "../odds/OddsLayer";

// 46번 염색 창 (11/22 염색권 네 가지가 한 창: 무작위 · 고정 색 · 색 확정 · 특수색 확정).
// 새 고르기 화면 = ① 어디에 칠할까요(캐릭터 · 입은 꾸미기) ② 어느 칸에(아이템 색 보관함 칸) → [다음] (염색권 탭·상점에서 열 때).
// 그다음 실제 염색은 예전 화면 그대로: 무작위 = 60초 판, 고정 색·색 확정·특수색 확정 = 미리보기 + 색 고르기 + [염색하기] (칠할 곳 한 줄만 더했다).
// 가방 아이템 페이지에서 열면 칠할 곳·칸이 정해져 고르기 화면 없이 바로 예전 화면(무작위는 바로 판). 칠한 칸에 다시 칠하면 한 번 묻는다
// (비어 있는 다른 칸이 있으면 그 칸에 칠하기도 고를 수 있다).
// 무작위 염색권: 60초 동안 무작위 팔레트(일부만 보이는 연속 색 공간)를 드래그·휠(핀치)로 뒤진다.
// 조준점은 마우스를 따라가고(폰은 화면 가운데) 흔들린다 — 그 아래 색이 바로 "지금 고른 색"(미리보기에 입혀짐).
// [이 색으로 염색]·엔터를 누른 순간의 조준점 색으로 확정. 시간이 끝나면 그 순간 조준점 색을 후보로 "지금 색 vs 새 색"을 고른다
// (안 고르면 지금 색 유지). 도중에 창을 닫으면 포기 — 색은 그대로, 염색권은 쓴 것으로.
// 고정 색·색 확정·특수색 확정: 미리 보고 [칠하기]를 누를 때만 염색권 1장을 쓴다. 결과 색은 서버가 정한다 (무작위는 판 좌표만 보낸다).

export type DyeTicket =
  | { itemId: string; name: string; mode: "random"; tier: DyeTier }
  | { itemId: string; name: string; mode: "fixed"; color: string; parts?: DyePart[] }
  /** 11/15 수집 의뢰 염색권: 색 확정(pick) · 특수색 확정(special) — 판 없이 색을 골라 바로 칠한다 */
  | { itemId: string; name: string; mode: "pick" | "special" };

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
  /** 11/22 아이템마다 색 보관함 (내 정보 itemDyes) — 칠할 칸 고르기 */
  itemDyes?: ItemDyes;
  /** 11/22 처음 골라 둘 대상 (가방 아이템 페이지에서 열면 그 아이템 id) */
  initialTarget?: DyeTarget;
  /** 11/22 처음 골라 둘 칸 (아이템 페이지에서 고른 커스텀 칸) */
  initialSlot?: number;
  /** 11/22 칠할 곳·칸이 정해진 채 연다 (아이템 페이지 [이 칸 칠하기]) — 고르기 화면 없이 바로 예전 염색 화면 */
  lockTarget?: boolean;
  /** 11/22 열자마자 시작 (아이템 페이지에서 무작위 염색권 [판 시작]) — 칠한 칸이면 먼저 묻는다 */
  autoStart?: boolean;
};

type Phase = "part" | "play" | "choose" | "sending" | "done";
type Picked = { x: number; y: number; color: string };

/** 돌려 보기 순서 (앞 → 오른쪽 → 뒤 → 왼쪽) */
const TURN: readonly DirId[] = [DIR.down, DIR.right, DIR.up, DIR.left];
/** 11/22 운영자: 등 칸 꾸미기(망토·배낭 등)를 칠할 땐 뒷모습으로 보여 준다 */
function facingOf(part: DyeTarget): DirId {
  return !isCharDyePart(part) && itemById(part)?.slot === "pack" ? DIR.up : DIR.down;
}

const hexOf = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
/** 지금 그 부위·아이템 색 (기본 포인트·안 칠한 아이템은 몸·꾸미기마다 달라 "기본"으로 보인다) */
function partColor(spec: string, part: DyeTarget): string | null {
  const d = dyeOfTarget(specDye(spec), part);
  if (d) return d;
  if (part === "accent" || !isCharDyePart(part)) return null;
  const c = avatarColors(spec);
  return hexOf(part === "head" ? c.head : c.body);
}

export default function DyeDialog({ ticket, resume, avatar, look: wornLook, onClose, onDone, itemDyes, initialTarget, initialSlot, lockTarget = false, autoStart = false }: Props) {
  const { me } = useMe();
  const [phase, setPhase] = useState<Phase>(resume?.candidate ? "choose" : resume ? "play" : "part");
  const [part, setPart] = useState<DyeTarget>(resume?.part ?? initialTarget ?? (ticket?.mode === "fixed" && ticket.parts?.length ? ticket.parts[0] : "body"));
  /** 11/22 아이템의 칠할 색 칸 (대상이 바뀌면 그 아이템의 기본 칸) */
  const [slotPick, setSlotPick] = useState<{ t: DyeTarget; k: number } | null>(initialTarget && initialSlot !== undefined ? { t: initialTarget, k: initialSlot } : null);
  const slot = slotPick?.t === part ? slotPick.k : defaultDyeSlot(itemDyes, part);
  const itemTarget = !isCharDyePart(part);
  const slotColors = itemTarget ? openColors(itemDyes, part) : [];
  /**
   * 11/22 시작 단계 화면: where = 새 고르기 화면(① 칠할 곳 ② 칸, 염색권 탭·상점에서 열 때),
   * color = 예전 염색 화면(미리보기 · 색 고르기 · [염색하기] — 아이템 페이지에서 칠할 곳·칸을 정하고 열면 바로 여기)
   */
  const [step, setStep] = useState<"where" | "color">(lockTarget ? "color" : "where");
  /** 이미 칠한 칸에 다시 칠하기 확인 */
  const [askOverwrite, setAskOverwrite] = useState(false);
  // 입지 않은 아이템을 칠하면(가방에서 연 경우) 미리보기에 그 아이템을 입혀 본다
  const look = useMemo(() => (itemTarget ? fittingLook(wornLook, part).look : [...wornLook]), [wornLook, part, itemTarget]);
  const [session, setSession] = useState<DyeSessionView | null>(resume ?? null);
  const [error, setError] = useState<string | null>(null);
  /** 끝난 결과 (before = 염색 전 내 색 표기 — 결과 창에서 전·후를 나란히 보여 준다) */
  const [result, setResult] = useState<{ part: DyeTarget; late: boolean; kept: boolean; before: string } | null>(null);
  /** 시간이 끝나 고르는 중인 후보 색 (decideBy = 내 시계 기준 마감) */
  const [candidate, setCandidate] = useState<DyeCandidate | null>(() =>
    resume?.candidate ? { color: resume.candidate.color, decideBy: Date.now() + (resume.candidate.decideBy - resume.serverNow) } : null,
  );
  // 칠하기 전 모습: 입지 않은 아이템의 색 보관함 색도 입혀 둔다 (가방에서 고른 색으로 보이게)
  const [spec, setSpec] = useState(() => {
    const t = initialTarget;
    const st = t && !isCharDyePart(t) ? itemDyes?.[t] : undefined;
    const c = st && st.sel >= 0 ? st.colors[st.sel] : null;
    return t && c && !dyeOfTarget(specDye(avatar.color), t) ? withDyePart(avatar.color, t, c) : avatar.color;
  });
  const [body, setBody] = useState(avatar.body);
  /** Esc로 띄운 "그만둘까요?" 확인 (판·고르기 단계) */
  const [confirmQuit, setConfirmQuit] = useState(false);
  // 색 확정: 처음 색은 칠할 칸·부위의 지금 색 (없으면 하늘색)
  const [hsv, setHsv] = useState<Hsv>(() => {
    const now = itemTarget ? openColors(itemDyes, part)[slot] : partColor(avatar.color, part);
    return hexHsv(now ? now.slice(0, 7) : "#4aa8f0");
  });
  const [kind, setKind] = useState<DyeSpecial>("s");
  /** 예전 색 확정 화면의 [돌려 보기] */
  const [dirIdx, setDirIdx] = useState(() => TURN.indexOf(facingOf(part)));
  // 칠할 곳을 바꾸면 그쪽이 잘 보이는 방향부터
  useEffect(() => setDirIdx(TURN.indexOf(facingOf(part))), [part]);

  const mode = ticket?.mode ?? "random";
  const allowed = (p: DyeTarget) => ticket?.mode !== "fixed" || fixedAllows(ticket.parts, p);
  // 11/22 색을 바꿀 수 없는 꾸미기면 시작하지 않는다 (서버도 같은 규칙으로 거절 — 염색권은 그대로)
  const blocked = phase === "part" || phase === "sending" ? dyeTargetBlock(part, () => true) : null;
  /** 칠할 색 (무작위는 판에서 고르니 아직 없다). 특수색 바탕은 서버와 같은 규칙: 아이템은 칠할 칸의 색, 캐릭터는 지금 색 */
  const newColor =
    ticket?.mode === "fixed"
      ? ticket.color
      : ticket?.mode === "pick"
        ? hsvHex(hsv)
        : ticket?.mode === "special"
          ? specialDyeColor(kind, itemTarget ? slotColors[slot] : dyeOfTarget(specDye(spec), part))
          : null;
  // 끄는 동안은 120ms마다 한 번만 미리보기에 입힌다
  const [preview, setPreview] = useState(newColor);
  useEffect(() => {
    const t = setTimeout(() => setPreview(newColor), PREVIEW_MS);
    return () => clearTimeout(t);
  }, [newColor]);
  const owned = ticket ? (me?.inventory[ticket.itemId] ?? 0) : 0;

  function finished(res: StyleChangeResponse, late = false) {
    // 내 정보 + 게임의 내 아바타(look:set)를 바로 바꾼다
    applyStyle(res);
    const p = res.part ?? part;
    const kept = !!res.kept || !res.color;
    const color = kept ? "" : (res.color ?? "");
    if (!kept) setSpec(withDyePart(spec, p, color));
    if (res.me.body) setBody(res.me.body);
    setCandidate(null);
    setResult({ part: p, late: late || !!res.late, kept, before: spec });
    setPhase("done");
    onDone?.(kept ? `${dyeTargetName(p)} 색은 그대로 두었어요.` : `${dyeTargetName(p)}을(를) ${colorLabel(color)}(으)로 염색했어요.`);
  }

  /** 시간 끝 → 후보 색 (없으면 너무 늦어 색 그대로 끝남) */
  function timedOut(res: DyeTimeoutResponse) {
    if (!res.candidate) {
      setCandidate(null);
      setResult({ part: res.part, late: true, kept: true, before: spec });
      setPhase("done");
      onDone?.(`시간이 지나 ${dyeTargetName(res.part)} 색은 그대로 두었어요.`);
      return;
    }
    setCandidate({ color: res.candidate.color, decideBy: Date.now() + (res.candidate.decideBy - res.serverNow) });
    setPhase("choose");
  }

  /** 창 닫기: 판이 진행 중이거나 고르는 중이면 포기 (색 그대로, 염색권은 쓴 것으로) */
  function close() {
    if (session && (phase === "play" || phase === "choose")) {
      const pending = dyeApi.cancel(session.seed).catch(() => {});
      onDone?.(`${dyeTargetName(session.part)} 염색을 그만뒀어요. 색은 그대로예요.`);
      onClose(pending);
      return;
    }
    onClose();
  }

  /** 칠하기·판 시작. k = 칠할 칸 (덮어쓰기 확인에서 [빈 칸에 칠하기]를 고르면 그 칸) */
  async function begin(confirmed = false, k = slot) {
    if (!ticket) return;
    setError(null);
    // 11/22 이미 칠한 칸에 다시 칠하면 덮어쓴다 → 한 번 묻는다
    if (itemTarget && needsOverwrite(slotColors, k) && !confirmed) {
      setAskOverwrite(true);
      return;
    }
    setAskOverwrite(false);
    const slotArg = itemTarget ? k : undefined;
    setPhase("sending");
    try {
      if (ticket.mode === "random") {
        const res = await dyeApi.start(ticket.itemId, part, slotArg);
        // 서버가 염색권 1장을 뺐다(또는 진행 중인 판을 이어 줌) → 가방 표시를 서버 값으로
        meStore.set(res.me);
        setSession(res.session);
        setPart(res.session.part);
        setPhase("play");
        return;
      }
      finished(
        ticket.mode === "fixed"
          ? await dyeApi.fixed(ticket.itemId, part, slotArg)
          : ticket.mode === "pick"
            ? await dyeApi.pick(ticket.itemId, part, hsvHex(hsv), slotArg)
            : await dyeApi.special(ticket.itemId, part, kind, slotArg),
      );
    } catch (e) {
      setError(errorMessage(e));
      setPhase("part");
      // 가방에 없다(표시가 서버와 어긋남) → 내 정보를 다시 받아 개수를 맞춘다
      if (e instanceof ApiRequestError && e.code === "NO_ITEM") void meStore.refresh();
    }
  }

  // 11/22 아이템 페이지에서 [판 시작]을 눌러 열었으면 바로 시작 (칠한 칸이면 덮어쓰기부터 묻는다)
  const autoRef = useRef(autoStart);
  useEffect(() => {
    if (!autoRef.current) return;
    autoRef.current = false;
    void begin();
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = phase === "choose" ? "색 고르기" : phase === "play" ? "염색 중" : phase === "done" ? "염색" : (ticket?.name ?? "염색");
  const guard = dyeCloseGuard(phase);
  const setup = phase === "part" || phase === "sending";
  /** 새 고르기 화면(① 칠할 곳 ② 칸)인지 — 아니면 예전 염색 화면 (색 고르기·시작) */
  const choosing = setup && step === "where";
  const sending = phase === "sending";
  const targetName = dyeTargetName(part);
  const where = itemTarget ? `${targetName} 커스텀 ${slot + 1}` : targetName;
  const empty = itemTarget ? otherEmptySlot(itemDyes, part, slot) : null;
  /**
   * 덮어쓰기 확인을 그만두기 (× · Esc · [그만두기]): 아이템 페이지에서 무작위 염색권으로 바로 연 창(autoStart)이면 판 설명 화면에 남지 않고
   * 창을 닫아 아이템 페이지로 돌아간다 (11/22 운영자 보고 — 다시 [염색 시작]을 누르면 같은 확인이 되풀이됐다). 색 고르기 화면에서 물었으면 그 화면으로
   */
  function dismissOverwrite() {
    setAskOverwrite(false);
    if (overwriteDismissCloses({ autoStart, lockTarget, phase })) onClose();
  }

  return (
    // 시작 화면·판은 표준 창, 시간 끝 고르기·결과는 내용 크기에 맞는 작은 창
    // 판·고르기·결과 단계는 배경 클릭으로 닫히지 않는다. 판·고르기는 Esc가 그만두기 확인을 거친다 (× 만 바로 닫는다)
    <Dialog
      title={title}
      onClose={close}
      onBack={setup ? (step === "color" && !lockTarget ? () => setStep("where") : close) : undefined}
      kind={phase === "play" || choosing ? "window" : "confirm"}
      // 11/22 연 창(가방·아이템 페이지·상점)은 감추고, 데스크톱은 창 높이를 내용에 맞춘다 (판은 정해 둔 높이 — DyeDialog.module.css .play)
      coverBelow
      fitHeight={choosing || phase === "play"}
      backdropClose={guard.backdrop}
      onEscape={guard.escConfirm ? () => setConfirmQuit((q) => !q) : undefined}
    >
      <div className={styles.wrap}>
        {confirmQuit && guard.escConfirm && (
          <div className={styles.quit} role="alertdialog" aria-label="염색 그만두기 확인">
            <p className={styles.note}>염색을 그만둘까요? 색은 그대로이고 염색권은 쓴 것으로 쳐요.</p>
            <div className={styles.actions}>
              <button type="button" className={ui.button} autoFocus onClick={() => setConfirmQuit(false)}>
                계속하기
              </button>
              <button type="button" className={cx(ui.button, ui.danger)} onClick={close}>
                그만두기
              </button>
            </div>
          </div>
        )}
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
          <div className={styles.choose}>
            <p className={styles.note} role="status">
              {result.kept
                ? `${dyeTargetName(result.part)} 색은 그대로예요${result.late ? " (고르는 시간이 지났어요)" : ""}.`
                : `${dyeTargetName(result.part)} 염색 완료! 다른 사람 화면에도 바로 이 색으로 보여요.`}
            </p>
            <DyeVersus
              part={result.part}
              before={result.before}
              after={spec}
              body={body}
              look={look}
              beforeTitle="이전"
              afterTitle={result.kept ? "그대로" : "바꾼 뒤"}
            />
            {!result.kept && (
              <p className={styles.note}>
                {isCharDyePart(result.part) ? "원래 색으로 되돌리기는 상점의 염색·외형에서 할 수 있어요." : "가방 [꾸미기]의 색 보관함에서 언제든 다른 칸 색으로 바꿔 입어요."}
              </p>
            )}
            <div className={styles.actions}>
              <button type="button" className={cx(ui.button, ui.primary)} onClick={close}>
                닫기
              </button>
            </div>
          </div>
        ) : choosing ? (
            // ── 새 고르기 화면: ① 어디에 칠할까요 ② 어느 칸에 → [다음] (무작위는 바로 60초 판) ──
            <div className={styles.setup}>
              <figure className={styles.now}>
                <figcaption className={styles.baCap}>지금 내 모습</figcaption>
                <ZoomStage className={styles.nowStage} color={spec} body={body} look={look} label="지금 내 모습" dir={facingOf(part)} />
              </figure>
              <div className={styles.steps}>
                <section className={styles.step}>
                  <h3 className={styles.stepHead}>
                    <span className={styles.stepN}>1</span>
                    어디에 칠할까요
                  </h3>
                  <TargetPicker
                    spec={spec}
                    look={wornLook}
                    target={part}
                    onPick={setPart}
                    allowed={allowed}
                    disabled={sending}
                    baseColor={(p) => partColor(spec, p)}
                    extraItem={initialTarget && !isCharDyePart(initialTarget) ? initialTarget : null}
                  />
                </section>
                <section className={styles.step}>
                  <h3 className={styles.stepHead}>
                    <span className={styles.stepN}>2</span>
                    어느 칸에 칠할까요
                    {itemTarget && !blocked && <span className={styles.stepAside}>원래 색 칸은 칠할 수 없어요</span>}
                  </h3>
                  {itemTarget && !blocked ? (
                    <SlotPicker itemDyes={itemDyes} item={part} slot={slot} onPick={(k) => setSlotPick({ t: part, k })} disabled={sending} />
                  ) : (
                    <p className={styles.note}>{blocked ? `${blocked} 염색권은 쓰지 않아요.` : "캐릭터 부위는 칸 없이 한 가지 색이에요."}</p>
                  )}
                </section>
                {error && <p className={ui.error}>{error}</p>}
                <div className={styles.bar}>
                  <span className={styles.barSum}>
                    <b>{where}</b>에 칠해요
                    <span className={styles.barCount}>
                      {ticket?.name} {owned}장 있어요
                    </span>
                  </span>
                  <button
                    type="button"
                    className={cx(ui.button, ui.primary, styles.go)}
                    disabled={!ticket || owned < 1 || !allowed(part) || !!blocked || sending}
                    onClick={() => (mode === "random" ? void begin() : setStep("color"))}
                  >
                    {sending ? "잠깐만요…" : mode === "random" ? "시작 · 60초" : "다음"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // ── 예전 염색 화면 (오늘 개편 전 모양 그대로 + 칠할 곳 한 줄): 미리보기 · 설명 · 색 고르기 · [염색하기] ──
            <div className={cx(styles.row, styles.start)}>
              {/* 11/22 미리보기는 낮게, 캐릭터는 크게 (빈 땅을 줄여 창이 화면 안에 들어오게) */}
              <div className={styles.colorFig}>
                <ZoomStage
                  className={styles.colorStage}
                  color={preview ? withDyePart(spec, part, preview) : spec}
                  body={body}
                  look={look}
                  label={preview ? "염색해 본 내 모습" : "지금 내 모습"}
                  dir={TURN[dirIdx]}
                />
                <button type="button" className={cx(ui.button, styles.turn)} onClick={() => setDirIdx((i) => (i + 1) % TURN.length)}>
                  돌려 보기
                </button>
              </div>
              <div className={styles.side}>
                <p className={styles.target}>
                  {itemTarget && <ItemIcon itemId={part} size={24} dye={slotColors[slot] ?? undefined} />}
                  <span>
                    <b>{where}</b>
                    {itemTarget && <span className={styles.note}> · {slotColors[slot] ? `${colorText(slotColors[slot]!)} 위에 덮어 칠해요` : "빈 칸에 칠해요"}</span>}
                  </span>
                </p>
                <p className={styles.note}>
                  {ticket?.mode === "pick" ? (
                    "원하는 색을 골라 그대로 칠해요. [염색하기]를 누를 때만 염색권 1장을 써요."
                  ) : ticket?.mode === "special" ? (
                    "특수 색 하나를 골라 입혀요. 금빛 광택 말고는 지금 색에 효과만 더해요."
                  ) : ticket?.mode === "fixed" ? (
                    "정해진 색으로 바로 칠해요. 누를 때만 염색권 1장을 써요."
                  ) : (
                    <>
                      {ticket?.name ?? "염색권"} · 60초 안에 무작위 판에서 색을 찾아요. 흔들림 {ticket?.mode === "random" ? wobbleLabel(ticket.tier) : ""}, 특수 색은{" "}
                      {ticket?.mode === "random" ? specialLabel(ticket.tier) : ""}. <OddsLink section="dye" label="특수 색 확률 보기" />
                    </>
                  )}
                </p>
                {ticket?.mode === "pick" && <ColorPicker hsv={hsv} onChange={setHsv} disabled={sending} mine={itemTarget ? otherPaintedColors(itemDyes, part, slot) : []} />}
                {ticket?.mode === "special" && <SpecialPicker kind={kind} onChange={setKind} disabled={sending} />}
                {newColor && ticket?.mode !== "pick" && (
                  <p className={styles.pick}>
                    <span className={styles.swatchBig} style={swatchStyle(newColor)} aria-hidden="true" />
                    <span className={styles.hex}>{colorLabel(newColor)}</span>
                  </p>
                )}
                {ticket?.mode === "random" && (
                  <p className={styles.note}>
                    시작하면 염색권 1장을 써요. 판을 끌어서 옮기고, 휠로 확대·축소해요. 폰은 두 손가락을 써요. 가운데 조준점 아래 색이 지금 고른 색이에요. [이 색으로
                    염색]을 누르면 정해져요. 시간이 끝나면 그때 색과 지금 색 중에서 골라요. 도중에 창을 닫으면 색은 그대로고 염색권은 돌아오지 않아요.
                  </p>
                )}
                {blocked && (
                  <p className={styles.note} role="status">
                    {blocked} 염색권은 쓰지 않아요.
                  </p>
                )}
                {error && <p className={ui.error}>{error}</p>}
                <div className={styles.actions}>
                  <button type="button" className={ui.button} onClick={close}>
                    닫기
                  </button>
                  <button type="button" className={cx(ui.button, ui.primary)} disabled={!ticket || owned < 1 || !allowed(part) || !!blocked || sending} onClick={() => void begin()}>
                    {/* 대상 이름은 위 칠할 곳 줄에 있으니 단추는 짧게 (폰에서 두 줄로 꺾이지 않게) */}
                    {sending ? "잠깐만요…" : ticket?.mode === "random" ? "염색 시작 (60초)" : "염색하기"}
                  </button>
                </div>
              </div>
            </div>
        )}
        {(phase === "play" || phase === "choose") && error && <p className={ui.error}>{error}</p>}
      </div>
      {askOverwrite && (
        <Dialog title={`커스텀 ${slot + 1}을 바꿀까요?`} onClose={dismissOverwrite} kind="confirm">
          <div className={styles.over}>
            <div className={styles.swap}>
              <span className={styles.swapSide} data-gone="">
                <span className={styles.swapBox}>
                  <ItemIcon itemId={part} size={48} dye={slotColors[slot] ?? undefined} />
                </span>
                <span className={styles.note}>{slotColors[slot] ? colorText(slotColors[slot]!) : ""}</span>
              </span>
              <span className={styles.baArrow} aria-hidden="true">
                ▶
              </span>
              <span className={styles.swapSide}>
                <span className={styles.swapBox}>{newColor ? <ItemIcon itemId={part} size={48} dye={newColor} /> : <span className={styles.qmark}>?</span>}</span>
                <span className={styles.note}>{newColor ? colorText(newColor) : "판에서 골라요"}</span>
              </span>
            </div>
            <p className={styles.note}>
              지금 색은 사라져요.{empty !== null ? ` 비어 있는 커스텀 ${empty + 1}에 칠할 수도 있어요.` : ""}
            </p>
            <div className={styles.actions}>
              <button type="button" className={ui.button} onClick={dismissOverwrite}>
                그만두기
              </button>
              {empty !== null && (
                <button
                  type="button"
                  className={ui.button}
                  onClick={() => {
                    setSlotPick({ t: part, k: empty });
                    void begin(true, empty);
                  }}
                >
                  비어 있는 커스텀 {empty + 1}에 칠하기
                </button>
              )}
              <button type="button" className={cx(ui.button, ui.danger)} autoFocus={empty === null} onClick={() => void begin(true)}>
                <PixelIcon name="brush" size={12} />
                바꾸기
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}

// ── 판 (60초) ──

/** 미리보기 캐릭터를 다시 그리는 최소 간격 (색이 거의 매 프레임 바뀌므로) */
const PREVIEW_MS = 120;
/**
 * 11/22 판을 옮기는 동안은 미리보기를 이 간격으로만 (새 색마다 캐릭터 시트를 통째로 다시 물들여 폰에서 한 번에 ~20ms —
 * 판 그리기와 같은 프레임에 겹치면 끊긴다). 멈추면 바로 그 색으로
 */
const PREVIEW_MOVING_MS = 320;
/** 마지막 이동(끌기·키·휠) 뒤 이만큼 지나면 멈춘 것으로 본다 */
const SETTLE_MS = 140;

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
  /** 누르고 있는 판 이동 키 (e.code) · Shift */
  const heldRef = useRef(new Set<string>());
  const fastRef = useRef(false);
  /** 루프 안에서 부르는 최신 함수 (시간 끝 → 그 순간 색을 후보로) */
  const timeoutRef = useRef<() => void>(() => {});

  /** 마지막으로 판이 움직인 때 (미리보기 간격 · 타일 미리 그리기 방향) */
  const movedAt = useRef(0);
  /** 키 이동 속도 (화면 px/초 — 누르면 짧게 빨라지고 떼면 짧게 멈춘다) */
  const velRef = useRef({ x: 0, y: 0 });

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
    if (!canvas || !box) return;
    // 11/22 구역 그림은 일꾼이 그린다 (화면 스레드는 받은 그림을 올리기만) — tiles.ts
    const tiles = new DyeTiles(palette);
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
      const v = viewRef.current ?? { cx: DYE_BOARD_W / 2, cy: DYE_BOARD_H / 2, scale: startScale(r.width, r.height) };
      viewRef.current = clampView(v, r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    let lastFrame = 0;
    /** 지난 프레임 화면 (움직이는 방향 → 그쪽 타일 먼저) */
    let prevView: BoardView | null = null;
    let dir = { x: 0, y: 0 };
    let plan: { v: BoardView; w: number; h: number; list: ReturnType<typeof tilePlan> } | null = null;
    const loop = (now: number) => {
      // 다음 프레임을 먼저 예약한다 — 그리기에서 예외가 나도 루프가 죽지 않는다 (시간 끝이면 아래에서 취소)
      raf = requestAnimationFrame(loop);
      // WASD·방향키: 키 반복이 아니라 프레임 시간(dt)만큼 연속으로 옮긴다. 누르면 짧게 빨라지고 떼면 짧게 멈춘다 (board.ts easeVelocity)
      const dt = lastFrame ? now - lastFrame : 0;
      lastFrame = now;
      const v0 = viewRef.current;
      if (v0 && !sentRef.current) {
        const target = keyTarget(heldRef.current, fastRef.current);
        const vel = (velRef.current = easeVelocity(velRef.current, target, dt));
        if (vel.x || vel.y) {
          const { w, h } = sizeRef.current;
          const k = Math.min(100, Math.max(0, dt)) / 1000 / v0.scale;
          aimBase.current = null;
          viewRef.current = clampView({ ...v0, cx: v0.cx + vel.x * k, cy: v0.cy + vel.y * k }, w, h);
        }
      }
      const v1 = viewRef.current;
      if (v1 && prevView && (v1.cx !== prevView.cx || v1.cy !== prevView.cy || v1.scale !== prevView.scale)) {
        movedAt.current = now;
        // 움직이는 방향 (판 좌표) — 조금씩 따라가게 섞는다
        dir = { x: dir.x * 0.7 + (v1.cx - prevView.cx) * 0.3, y: dir.y * 0.7 + (v1.cy - prevView.cy) * 0.3 };
      }
      prevView = v1;
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
        // 보이는 구역 + 둘레를 미리 (움직이는 쪽 먼저). 선명한 그림이 아직이면 거친 그림을 부드럽게 늘려 채운다 → 검은 칸이 보이지 않게
        const vis = visibleChunks(v, w, h);
        // 화면이 그대로면 지난 순서를 그대로 쓴다 (순서 계산·문자열을 프레임마다 만들지 않게)
        if (!plan || plan.v !== v || plan.w !== w || plan.h !== h) plan = { v, w, h, list: tilePlan(v, w, h, dir, tiles.keep) };
        tiles.update(plan.list, (t) => t.i >= vis.i0 && t.i <= vis.i1 && t.j >= vis.j0 && t.j <= vis.j1);
        const spots: DyeSpot[] = [];
        // 타일 가장자리를 기기 픽셀에 맞춘다 (이웃 타일과 같은 경계 → 사이에 실금이 생기지 않게). 위치는 소수로 들고 그릴 때만 맞춘다
        const snap = (n: number) => Math.round(n * k) / k;
        for (let j = vis.j0; j <= vis.j1; j++)
          for (let i = vis.i0; i <= vis.i1; i++) {
            const t = tiles.get(i, j);
            if (!t) continue;
            const x0 = snap(left0 + i * DYE_BOARD_W * v.scale);
            const y0 = snap(top0 + j * DYE_BOARD_H * v.scale);
            const x1 = snap(left0 + (i + 1) * DYE_BOARD_W * v.scale);
            const y1 = snap(top0 + (j + 1) * DYE_BOARD_H * v.scale);
            ctx.imageSmoothingEnabled = !t.sharp;
            ctx.drawImage(t.canvas, x0, y0, x1 - x0, y1 - y0);
            if (t.spots.length) spots.push(...t.spots);
          }
        ctx.imageSmoothingEnabled = false;
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
          // 글자 마디만 바꾼다 (textContent는 자식 마디를 갈아 끼워 창의 MutationObserver가 매 프레임 레이아웃을 읽었다)
          const el = liveTextRef.current;
          if (el) {
            const label = colorLabel(a.color);
            if (el.firstChild && el.firstChild === el.lastChild && el.firstChild.nodeType === Node.TEXT_NODE) el.firstChild.nodeValue = label;
            else el.textContent = label;
          }
        }
        const moving = now - movedAt.current < SETTLE_MS;
        if (a.color !== shown && now - lastPreview > (moving ? PREVIEW_MOVING_MS : PREVIEW_MS)) {
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
      tiles.dispose();
    };
    // aimNow는 ref만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, amp, localEnds]);

  useEffect(() => {
    timeoutRef.current = () => void expire(aimNow());
  });

  // 11/22 판이 열린 동안 뒤 마을은 그리기만 줄인다 (갱신·동기화는 그대로 — game/backgroundLoop). 판이 닫히면 바로 원래대로
  useEffect(() => coverGame(), []);

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

  // 창 초점을 잃으면 끌기 기록·누른 키를 모두 지운다 (버튼·키를 창 밖에서 놓아도 계속 움직이지 않게)
  useEffect(() => {
    const forget = () => {
      pointers.current.clear();
      heldRef.current.clear();
    };
    window.addEventListener("blur", forget);
    return () => window.removeEventListener("blur", forget);
  }, []);

  // WASD·방향키: 창 어디에 포커스가 있든 판을 옮긴다. 가장 먼저(window 캡처) 받아 게임 이동 키로 새지 않게 막는다 (입력칸은 제외)
  useEffect(() => {
    const field = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || t.matches("input, textarea, select"));
    const onDown = (e: globalThis.KeyboardEvent) => {
      fastRef.current = e.shiftKey;
      if (!PAN_KEYS[e.code] || e.ctrlKey || e.metaKey || e.altKey || field(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      heldRef.current.add(e.code);
    };
    const onUp = (e: globalThis.KeyboardEvent) => {
      fastRef.current = e.shiftKey;
      if (!PAN_KEYS[e.code]) return;
      heldRef.current.delete(e.code);
      if (!field(e.target)) e.stopPropagation();
    };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const v = viewRef.current;
    if (!v || sending) return;
    const { w, h } = sizeRef.current;
    // 방향키·WASD는 위 window 리스너가 누르는 동안 부드럽게 옮긴다
    if (e.key === "+" || e.key === "=" || e.key === "-") {
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
      <div className={styles.stage}>
        <div
          ref={boxRef}
          className={styles.board}
          tabIndex={0}
          role="application"
          aria-label="염색 팔레트. 조준점 아래 색이 바로 고른 색이 돼요. 끌어서 옮기고 휠이나 두 손가락으로 확대·축소. 키보드: WASD·화살표 이동(Shift 빠르게), +/- 확대, 엔터 확정"
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
        {/* 조작 안내 — 판 아래 늘 보인다 (터치 기기는 CSS로 터치 안내만) */}
        <p className={styles.keys}>
          <span className={styles.keysMouse}>WASD나 끌기로 판을 옮기고(Shift는 빠르게), 휠로 확대·축소해요. 가운데 조준점 색이 골라져요.</span>
          <span className={styles.keysTouch}>끌어서 옮기고 두 손가락으로 확대·축소해요. 가운데 조준점 색이 골라져요.</span>
        </p>
      </div>
      <div className={styles.panel}>
        <TimeLeft label={`${dyeTargetName(session.part)} 염색`} left={left} total={DYE_TIME_MS} />
        <div className={styles.compare}>
          <LookCard spec={spec} body={body} look={look} label="지금 내 모습" title="지금 색" color={now} dir={facingOf(session.part)} />
          <LookCard
            spec={preview}
            body={body}
            look={look}
            label="지금 고른 색으로 염색해 본 내 모습"
            title="새 색"
            dir={facingOf(session.part)}
            color={live?.color ?? null}
            swatchRef={liveRef}
            hexRef={liveTextRef}
            hexTestId="dye-live"
          />
        </div>
        <p className={cx(styles.note, styles.tip)}>
          가운데 조준점 아래 색이 지금 고른 색이에요. 판이 흔들리니 원하는 색에서 멈추고 확정하세요. 확대할수록 덜 흔들려요. 시간이 끝나면 그때
          색과 지금 색 중에서 골라요.
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

/**
 * 비교 칸 하나: 그 색을 입은 내 모습(칸을 꽉 채워 크게) + 이름 · 견본 · 색 코드.
 * 11/22 memo: 판의 남은 시간(0.2초마다)이 바뀌어도 캐릭터 칸은 다시 그리지 않는다
 */
const LookCard = memo(function LookCard({
  spec,
  body,
  look,
  label,
  title,
  color,
  swatchRef,
  hexRef,
  hexTestId,
  dir = DIR.down,
}: {
  dir?: DirId;
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
        <OutfitCanvas color={spec} body={body} look={look} label={label} dir={dir} walking={false} />
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
});

/** 지금 모습 → 바꾼 뒤 모습을 나란히 (시간 끝 고르기·확정 결과가 같은 모양). 특수 색은 무대가 그 연출로 그린다 */
function DyeVersus({
  part,
  before,
  after,
  body,
  look,
  beforeTitle = "지금",
  afterTitle = "바꾼 뒤",
}: {
  part: DyeTarget;
  /** 바꾸기 전 / 바꾼 뒤 색 표기 (spec) */
  before: string;
  after: string;
  body: string;
  look: readonly string[];
  beforeTitle?: string;
  afterTitle?: string;
}) {
  const name = dyeTargetName(part);
  return (
    <div className={styles.versus}>
      <LookCard spec={before} body={body} look={look} label={`${beforeTitle} 내 모습`} title={`${beforeTitle} · ${name}`} color={partColor(before, part)} dir={facingOf(part)} />
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
      <LookCard spec={after} body={body} look={look} label={`${afterTitle} 내 모습`} title={`${afterTitle} · ${name}`} color={partColor(after, part)} dir={facingOf(part)} />
    </div>
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

  const name = dyeTargetName(session.part);
  // [지금] → [바꾼 뒤] 아바타를 나란히, 아래에 남은 시간 · 버튼 (결과 창과 같은 모양)
  return (
    <div className={styles.choose}>
      <p className={styles.note} role="status">
        시간이 끝났어요. {name}을(를) 이 색으로 바꿀까요? {Math.ceil(left / 1000)}초 안에 고르지 않으면 지금 색 그대로예요.
      </p>
      <DyeVersus part={session.part} before={spec} after={withDyePart(spec, session.part, candidate.color)} body={body} look={look} />
      <TimeLeft label="고르는 시간" left={left} total={DYE_DECIDE_MS} />
      <div className={styles.actions}>
        <button type="button" className={cx(ui.button, ui.primary)} disabled={sending} onClick={() => void choose(true)}>
          {sending ? "잠깐만요…" : "이 색으로 바꾸기"}
        </button>
        <button type="button" className={ui.button} disabled={sending} onClick={() => void choose(false)}>
          지금 색 유지
        </button>
      </div>
    </div>
  );
}
