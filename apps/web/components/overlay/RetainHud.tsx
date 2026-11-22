"use client";

import { itemById } from "@tomb/protocol";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { api, errorMessage, onApiJson } from "@/lib/api";
import { DAY_RESET_TEXT, gameDay, msUntilDayReset } from "@/lib/gameDay";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import {
  FIRST_ALL,
  FIRST_REWARD,
  FIRST_STEPS,
  firstGuideTarget,
  firstStepById,
  nextPathGift,
  PATH,
  PATH_GIFTS,
  PATH_NAME,
  owedPathGifts,
  PATH_WEAR_DAYS,
  PLAY_MIN_MS,
  TODO_BONUS_GIFT,
  TODO_GIFT,
  TODO_NAME,
  TODO_PROT_EVERY,
  todoDef,
  todoProgressText,
  type FirstGuideTarget,
  type Reward,
  type FirstStep,
  type FirstStepId,
  type PathGift,
  type PlayKind,
  type TodoItem,
  type TodoKind,
  type TodoTick,
} from "@/lib/retain";
import { rewardText } from "@/lib/rewardText";
import { potionById } from "@/lib/rpg/catalog";
import { isMatId, MAT_INFO } from "@/lib/rpg/setGear";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import type { Me } from "@/lib/types";
import RpgIcon from "../rpg/RpgIcon";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import { watchMoreBelow } from "../ui/moreBelow";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./RetainHud.module.css";
import { TopLeftItem } from "./TopLeftCluster";

// 11/18 둘째 날 다시 오게 (lib/retain.ts): 새 이웃 꾸러미(가입 첫 7일) · 첫 걸음 미션 · 오늘 미션(11/19 「오늘의 할 일」에서 바꿈). 11/19 보상은 모두 아이템
//  - 칩: 데스크톱은 오른쪽 아래 묶음(RetainDock — 꾸러미·「미션 n/3」 칩 + 첫 걸음 칩). 11/19 폰은 [메뉴] 줄 아래 칩 하나(RetainPhoneChip):
//    첫 걸음이 남아 있으면 「첫 걸음 n/14」, 다 끝내 사라지면 「미션 n/3」 → 칸을 모은 창(hub). 위쪽 줄(메뉴·음악·채널)에는 칩을 두지 않는다
//  - 창(RetainLayer): 칩이 어디 있든 같은 창을 연다. 진행은 행동 응답에 실려 온 `todo`로 바로 맞춘다 (lib/api onApiJson — 추가 요청 없음)

/** hub = 11/19 폰: 첫 걸음·꾸러미·할 일을 칸으로 모은 창 ([메뉴] 아래 칩 하나) */
type Panel = "path" | "todo" | "hub" | null;
type HubTab = "first" | "path" | "todo";
let hubTab: HubTab = "first";

// ── 열린 창 (칩 여러 곳이 같은 창을 연다) ──
let panelNow: Panel = null;
/** 꾸러미를 저절로 연 계정:날 (화면을 새로 읽기 전까지 한 번만) */
let autoOpenedKey = "";
const panelSubs = new Set<() => void>();
function setPanel(p: Panel): void {
  panelNow = p;
  panelSubs.forEach((fn) => fn());
}
const subscribePanel = (fn: () => void) => {
  panelSubs.add(fn);
  return () => {
    panelSubs.delete(fn);
  };
};
function usePanel(): Panel {
  return useSyncExternalStore(subscribePanel, () => panelNow, () => null);
}

// ── 첫 걸음 반짝임 (방금 한 칸) ──
let flashNow: { id: FirstStepId; at: number } | null = null;
const flashSubs = new Set<() => void>();
const subscribeFlash = (fn: () => void) => {
  flashSubs.add(fn);
  return () => {
    flashSubs.delete(fn);
  };
};
function useFlash() {
  return useSyncExternalStore(subscribeFlash, () => flashNow, () => null);
}

// ── 11/19 첫 걸음·오늘 미션 길 안내 (목록에서 미션을 누르면 게임이 그곳까지 걷는 길에 화살표 — game/world/RouteGuide) ──
/** 첫 걸음 미션 id 또는 「todo:종류」 (오늘 미션) */
type GuideKey = FirstStepId | `todo:${TodoKind}`;
const todoKey = (kind: TodoKind): GuideKey => `todo:${kind}`;
const todoOfKey = (key: GuideKey): TodoKind | null => (key.startsWith("todo:") ? (key.slice(5) as TodoKind) : null);
/** 안내 목적지 (갈 곳이 없으면 null) */
function guideTargetOf(key: GuideKey): FirstGuideTarget | null {
  const kind = todoOfKey(key);
  return kind ? (todoDef(kind)?.guide ?? null) : firstGuideTarget(key as FirstStepId);
}
/** 닿았을 때 알려 줄 하는 법 */
function guideHintOf(key: GuideKey, touch: boolean): string | null {
  const kind = todoOfKey(key);
  if (kind) return todoDef(kind)?.hint ?? null;
  const step = firstStepById(key);
  return step ? stepHint(step, touch) : null;
}
let guideNow: GuideKey | null = null;
const guideSubs = new Set<() => void>();
const subscribeGuide = (fn: () => void) => {
  guideSubs.add(fn);
  return () => {
    guideSubs.delete(fn);
  };
};
function useGuide(): GuideKey | null {
  return useSyncExternalStore(subscribeGuide, () => guideNow, () => null);
}
/** 안내 켜기·끄기 (send = 게임에도 알린다 — 게임이 먼저 끝낸 경우(route:state)는 false) */
function setGuide(id: GuideKey | null, send = true): void {
  if (guideNow === id) return;
  guideNow = id;
  guideSubs.forEach((fn) => fn());
  if (send) bridge.emit("route:guide", { target: id ? guideTargetOf(id) : null });
}

/** 운영자가 아니고 리텐션 값이 있는 내 정보 */
function retainOf(me: Me | null) {
  return me && !me.staff ? (me.retain ?? null) : null;
}

/**
 * 11/19 새 이웃(가입 이틀 안 + 첫 걸음 큰 선물 전): 폰 위쪽을 단순하게 — 긴급 의뢰·고정 공지 칩을 숨긴다 (GameShell).
 * 꾸러미·할 일·첫 걸음은 모든 계정이 [메뉴] 아래 칩 하나(RetainPhoneChip)로 본다. 꾸러미가 열린 수(받은 수 + 받을 수)가 가입한 날부터 지난 날 수 + 1이다
 */
export function isNewbie(me: Me | null): boolean {
  const r = retainOf(me);
  return !!r?.first && !!r.path && r.path.got + r.path.owed <= 2;
}
export function useNewbie(): boolean {
  return isNewbie(useMe().me);
}

/** 받침 있으면 a, 없으면 b (한글이 아니면 b) */
function josa(word: string, a: string, b: string): string {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return b;
  return (c - 0xac00) % 28 ? a : b;
}

/** 남은 시간 「5시간 12분」 (1분 아래는 「곧」) */
function leftText(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  if (m < 1) return "곧";
  const h = Math.floor(m / 60);
  return h ? `${h}시간 ${m % 60}분` : `${m}분`;
}

function useNow(period = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), period);
    return () => clearInterval(t);
  }, [period]);
  return now;
}

/** 머무르기 할 일은 머무르기 응답(내 정보의 오늘 머문 시간)으로 바로 맞춘다 */
function todoItems(me: Me): TodoItem[] {
  const todo = me.retain?.todo;
  if (!todo) return [];
  const stay = Math.floor(me.attendance.stayMinutes / 10);
  return todo.items.map((it) => (it.kind === "stay" ? { ...it, have: Math.max(it.have, stay) } : it));
}
const isDone = (it: TodoItem) => it.have >= it.need;

/** 첫 걸음 한 칸 했음 (화면이 아는 행동 — 서버에 알리고, 내 정보 사본은 바로 바꾼다). 이미 했거나 새 계정이 아니면 아무것도 안 한다 */
const sending = new Set<string>();
export function markFirstStep(id: FirstStepId): void {
  const me = meStore.getSnapshot().me;
  const r = retainOf(me);
  const step = firstStepById(id);
  if (!me || !r?.first || !step || r.first.mask & step.bit || sending.has(id)) return;
  sending.add(id);
  if (guideNow === id) setGuide(null);
  meStore.set({ ...me, retain: { ...r, first: { mask: r.first.mask | step.bit } } });
  flashNow = { id, at: Date.now() };
  flashSubs.forEach((fn) => fn());
  api
    .retainStep(id)
    .then((res) => {
      const cur = meStore.getSnapshot().me;
      const f = cur?.retain?.first;
      if (cur?.retain && f && typeof res.mask === "number" && res.mask >= 0) meStore.set({ ...cur, retain: { ...cur.retain, first: { mask: f.mask | res.mask } } });
      // 처음 한 미션이면 작은 선물 (사냥 가방에 바로)
      if (res.text) {
        showToast(`+${res.text}! 첫 걸음 「${step.label}」 완료`, 4_500);
        void meStore.refresh();
      }
    })
    .catch(() => {
      // 다음 입장 때 다시 하면 된다 (선물은 서버가 네 칸을 다 본 뒤에만)
    })
    .finally(() => sending.delete(id));
}

/** 행동 응답의 할 일 진행 한 칸을 내 정보 사본에 */
function applyTodoTick(t: TodoTick): void {
  const me = meStore.getSnapshot().me;
  const todo = me?.retain?.todo;
  if (!me?.retain || !todo || todo.day !== t.day) return;
  const finished = todo.items.find((it) => it.kind === t.kind && !it.claimed && it.have < it.need && t.have >= it.need);
  const items = todo.items.map((it) => (it.kind === t.kind && t.have > it.have ? { ...it, have: t.have } : it));
  meStore.set({ ...me, retain: { ...me.retain, todo: { ...todo, items } } });
  if (finished) {
    if (guideNow === todoKey(finished.kind)) setGuide(null);
    showToast(`${TODO_NAME} 「${finished.label}」${josa(finished.label, "을", "를")} 했어요. [미션]에서 ${rewardText(TODO_GIFT)}${josa(rewardText(TODO_GIFT), "을", "를")} 받아요.`, 6_000);
  }
}

// ── 11/19 오늘 미션 놀이 판 기록 (lib/retainPlay): 귀신의 집·범퍼카·관람차/열기구·불멍 ──
// 그날 미션에 든 놀이이고 아직 못 채웠을 때만 시작 표를 받는다 (아니면 요청 없음). 끝까지 했으면 표를 돌려줘 서버가 진행 +1 (응답의 todo → applyTodoTick)

type PlayRun = { at: number; ticket: Promise<{ ticket: string; seed?: number } | null> };
const playRuns = new Map<PlayKind, PlayRun>();

/** 오늘 미션에 든 놀이이고 아직 못 채웠는지 */
export function playWanted(kind: PlayKind): boolean {
  const it = retainOf(meStore.getSnapshot().me)?.todo.items.find((i) => i.kind === kind);
  return !!it && !it.claimed && it.have < it.need;
}

/** 놀이 시작 (미션이 아니면 null — 요청하지 않는다). 귀신의 집은 서버가 고른 미로 시드가 같이 온다 */
export function startPlayTodo(kind: PlayKind): Promise<{ ticket: string; seed?: number } | null> {
  if (!playWanted(kind)) return Promise.resolve(null);
  const ticket = api
    .retainPlayStart(kind)
    .then((r) => (r.ticket ? { ticket: r.ticket, ...(r.seed !== undefined ? { seed: r.seed } : {}) } : null))
    .catch(() => null);
  playRuns.set(kind, { at: Date.now(), ticket });
  return ticket;
}

/** 놀이 끝: done = 끝까지 (귀신의 집은 출구 도착). 중간에 나왔거나 너무 짧으면 서버에 알리지 않는다 */
export function endPlayTodo(kind: PlayKind, done: boolean, ms?: number): void {
  const run = playRuns.get(kind);
  if (!run) return;
  playRuns.delete(kind);
  if (!done) {
    if (kind === "haunt") showToast("귀신의 집 미션은 중간에 나오지 않고 끝까지 돌파해야 세요.", 4_500);
    return;
  }
  if (kind !== "haunt" && Date.now() - run.at < PLAY_MIN_MS[kind] - 1_000) {
    const d = todoDef(kind);
    if (d) showToast(`조금 더 즐겨야 미션에 세요. ${d.hint}`, 4_500);
    return;
  }
  void run.ticket.then((t) => {
    if (!t) return;
    return api.retainPlayEnd(t.ticket, true, ms).catch((e) => showToast(errorMessage(e)));
  });
}

// ── 선물 그림 ──

export function GiftArt({ gift, size = 32 }: { gift: PathGift; size?: number }) {
  const a = gift.art;
  if ("item" in a) return <ItemIcon itemId={a.item} size={size} />;
  if ("potion" in a) {
    const p = potionById(a.potion);
    return p ? <RpgIcon art={p.art} size={size} /> : null;
  }
  if ("mat" in a) return isMatId(a.mat) ? <RpgIcon art={MAT_INFO[a.mat].art} size={size} /> : null;
  return (
    <span className={styles.titleArt} style={{ width: size, height: size }} aria-hidden="true">
      <PixelIcon name="trophy" size={Math.round(size * 0.6)} />
    </span>
  );
}

// ── 칩 ──

/** 새 이웃 꾸러미·오늘 미션 칩 (데스크톱. 11/19 폰은 위쪽 줄에 두지 않고 [메뉴] 아래 RetainPhoneChip 하나로) */
export function RetainChips({ dock = false }: { dock?: boolean }) {
  const { me } = useMe();
  const now = useNow();
  const r = retainOf(me);
  if (!me || !r) return null;
  const path = r.path;
  const items = todoItems(me);
  const doneN = items.filter(isDone).length;
  const claimable = items.some((it) => isDone(it) && !it.claimed) || (items.length > 0 && items.every((it) => it.claimed) && !r.todo.bonus);
  const next = path ? nextPathGift(path) : null;
  const pathLabel = !path ? "" : path.canClaim ? "오늘 꾸러미 받기" : next ? `다음 꾸러미 ${leftText(msUntilDayReset(now))} 뒤` : "꾸러미를 다 받았어요";
  // 11/19 데스크톱 아래 줄(RetainDock): 바로 가기 줄 단추처럼 짧게 (자세한 글은 title·aria-label)
  const pathShort = path?.canClaim ? "꾸러미 받기" : "꾸러미";
  const btn = dock ? cx(ui.button, styles.dockChip) : cx(ui.button, styles.chip);
  return (
    <div className={styles.chips}>
      {path && (
        <button
          type="button"
          className={cx(btn, path.canClaim && styles.chipReady)}
          onClick={() => setPanel("path")}
          aria-label={`${PATH_NAME} (${pathLabel})`}
          title={`${PATH_NAME} · ${pathLabel}`}
        >
          <PixelIcon name="gift" />
          <span className={dock ? styles.dockText : undefined}>{dock ? pathShort : pathLabel}</span>
          {path.canClaim && <span className={styles.dot} aria-hidden="true" />}
        </button>
      )}
      {items.length > 0 && (
        <button
          type="button"
          className={cx(btn, claimable && styles.chipReady)}
          onClick={() => setPanel("todo")}
          aria-label={`${TODO_NAME} (${doneN}/${items.length})`}
          title={TODO_NAME}
        >
          <PixelIcon name="todo" />
          <span className={dock ? styles.dockText : undefined}>{dock ? "미션" : TODO_NAME}</span>
          <b className={styles.count}>
            {doneN}/{items.length}
          </b>
          {claimable && <span className={styles.dot} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

// ── 첫 걸음 ──

const OPEN_KEY = "tomb.firstOpen";

/** 미션 조작 안내 (폰은 버튼, 데스크톱은 키) */
const stepHint = (s: FirstStep, touch: boolean) => (touch ? s.touch : s.pc);

/** 보상 칩들 (첫 걸음·오늘 미션·꾸러미 공용): 포인트는 촛불빛 동전 + 금액, 아이템은 그림 + 개수 */
function RewardChips({ reward }: { reward: Reward }) {
  const items: { key: string; art: Parameters<typeof RpgIcon>[0]["art"]; text: string }[] = [];
  for (const [id, n] of Object.entries(reward.bundle?.potions ?? {})) {
    const p = potionById(id);
    if (p && n > 0) items.push({ key: id, art: p.art, text: `${n}개` });
  }
  for (const [id, n] of Object.entries(reward.bundle?.mats ?? {})) if (isMatId(id) && (n ?? 0) > 0) items.push({ key: id, art: MAT_INFO[id].art, text: `${n}장` });
  return (
    <span className={styles.rewards} title={`${rewardText(reward)}${josa(rewardText(reward), "을", "를")} 줘요`}>
      {!!reward.points && (
        <span className={cx(styles.reward, styles.rewardPoints)}>
          <span className={styles.coin} style={{ width: 13, height: 13, fontSize: 8 }} aria-hidden="true">
            P
          </span>
          {reward.points.toLocaleString("ko-KR")}P
        </span>
      )}
      {items.map((it) => (
        <span key={it.key} className={styles.reward}>
          <RpgIcon art={it.art} size={14} />
          {it.text}
        </span>
      ))}
      <span className="visually-hidden">{rewardText(reward)}</span>
    </span>
  );
}

/**
 * 11/19 미션 누르기: 갈 곳이 있는 미션은 길 안내를 켜고(같은 미션을 다시 누르면 끈다), 없는 미션은 조작 안내만.
 * onRoute = 안내를 켰을 때 (폰은 창을 닫아 화면의 길이 보이게)
 */
function pickStep(s: FirstStep, touch: boolean, onRoute?: () => void): void {
  if (!firstGuideTarget(s.id)) {
    setGuide(null);
    showToast(stepHint(s, touch), 4_000);
    return;
  }
  if (guideNow === s.id) {
    setGuide(null);
    return;
  }
  setGuide(s.id);
  const map = bridge.last("map:changed")?.map;
  if (map && map !== "village") showToast("마을로 돌아가면 길이 보여요.", 4_000);
  else showToast(touch ? "금빛 화살표를 따라가요." : "금빛 화살표를 따라가요. Esc로 꺼요.", 4_000);
  onRoute?.();
}

/**
 * 11/19 오늘 미션 [안내]: 첫 걸음처럼 그곳까지 금빛 화살표 (다시 누르면 끈다). 캠핑장·바닷가 미션은 마을 정류장까지 —
 * 이미 그 장소에 있으면 하는 법만 알려 준다
 */
function pickTodoGuide(kind: TodoKind, touch: boolean, onRoute?: () => void): void {
  const d = todoDef(kind);
  const key = todoKey(kind);
  if (!d?.guide) return;
  if (guideNow === key) {
    setGuide(null);
    return;
  }
  const map = bridge.last("map:changed")?.map;
  if ((d.guide === "busSea" && map === "sea") || (d.guide === "busCamp" && map === "camp")) {
    setGuide(null);
    showToast(`여기서 해요. ${d.hint}`, 5_000);
    return;
  }
  setGuide(key);
  if (map && map !== "village") showToast("마을로 돌아가면 길이 보여요.", 4_000);
  else showToast(touch ? "금빛 화살표를 따라가요." : "금빛 화살표를 따라가요. Esc로 꺼요.", 4_000);
  onRoute?.();
}

/**
 * 11/19 의뢰판 보기 창(QuestPeek)의 [게시판까지 안내]: 첫 걸음 「의뢰 하나 해결하기」와 같은 길 안내(목적지 의뢰 게시판)를 켠다.
 * 첫 걸음을 다 끝낸 계정도 쓴다 (닿으면 「다 왔어요」 알림 — RetainLayer route:state)
 */
export function guideToQuestBoard(touch: boolean): void {
  setGuide("quest");
  const map = bridge.last("map:changed")?.map;
  if (map && map !== "village") showToast("마을로 돌아가면 의뢰 게시판까지 길이 보여요.", 4_000);
  else showToast(touch ? "금빛 화살표를 따라 의뢰 게시판으로 가요." : "금빛 화살표를 따라 의뢰 게시판으로 가요. Esc로 꺼요.", 4_000);
}

function FirstList({ mask, onRoute }: { mask: number; onRoute?: () => void }) {
  const flash = useFlash();
  const guide = useGuide();
  const touch = useMediaQuery("(pointer: coarse)");
  return (
    <ol ref={watchMoreBelow} className={cx(styles.firstList, "more-fade")}>
      {FIRST_STEPS.map((s) => {
        const done = (mask & s.bit) !== 0;
        const routed = !!firstGuideTarget(s.id);
        const on = !done && guide === s.id;
        return (
          <li key={s.id} className={styles.firstRow} data-done={done || undefined} data-guide={on || undefined}>
            {!done && (
              <button
                type="button"
                className={styles.firstPick}
                aria-pressed={routed ? on : undefined}
                aria-label={routed ? `${s.label}: ${on ? "길 안내 끄기" : "가는 길 보기"}` : `${s.label}: 하는 법 보기`}
                title={routed ? (on ? "누르면 길 안내를 꺼요" : "누르면 가는 길을 보여 줘요") : "누르면 하는 법을 보여 줘요"}
                onClick={() => pickStep(s, touch, onRoute)}
              />
            )}
            <span className={styles.box} aria-hidden="true">
              {done && <PixelIcon name="check" size={12} />}
            </span>
            <span className={styles.firstText}>
              <span className={styles.firstLabel}>
                {s.label}
                {on ? (
                  <span className={styles.guiding}>안내 중</span>
                ) : (
                  routed && !done && (
                    <span className={styles.routeMark} aria-hidden="true">
                      <PixelIcon name="target" size={10} />
                    </span>
                  )
                )}
              </span>
              {!done && <small className={styles.firstHint}>{stepHint(s, touch)}</small>}
            </span>
            {done ? <span className={styles.claimed}>했어요</span> : <RewardChips reward={s.reward} />}
            {flash?.id === s.id && done && <span key={flash.at} className={styles.sparkle} aria-hidden="true" />}
            <span className="visually-hidden">{done ? " (했어요)" : " (아직)"}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** 큰 선물 글귀 (lib/retainServer firstRewardText와 같다) */
function rewardName(): string {
  return [rewardText({ points: FIRST_REWARD.points }), `${itemById(FIRST_REWARD.itemId)?.name ?? "꾸미기"} 하루권`, rewardText({ bundle: FIRST_REWARD.bundle })].filter(Boolean).join(", ");
}

async function claimFirst(): Promise<void> {
  try {
    const res = await api.retainFirst();
    if (res.me) meStore.set(res.me);
    showToast(`첫 걸음 미션을 다 했어요! ${res.text ?? rewardName()}${josa(res.text ?? rewardName(), "을", "를")} 받았어요.`, 7_000);
    setPanel(null);
  } catch (e) {
    showToast(errorMessage(e));
  }
}

/** 미션 칸에 받을 것이 있는지 (다 한 칸을 아직 안 받았거나, 셋 다 받고 도장을 안 받았거나) */
function todoReadyOf(me: Me, items: TodoItem[]): boolean {
  return items.some((it) => isDone(it) && !it.claimed) || (items.length > 0 && items.every((it) => it.claimed) && !me.retain?.todo.bonus);
}

/**
 * 11/19 폰: [메뉴] 줄 아래 칩 하나 (모든 계정 — 위쪽 줄에는 꾸러미·미션 칩을 두지 않는다).
 * 첫 걸음이 남아 있으면 「첫 걸음 n/14」 → 창의 첫 걸음 칸, 큰 선물까지 받아 사라졌으면 「미션 n/3」 → 오늘 미션 칸 (꾸러미가 남았으면 꾸러미 칸도).
 * 칸 어디든 받을 것이 있으면 빨간 점. 높이·여백·글자는 [지도] 등 위쪽 단추(ui.top)와 같다
 * 11/22 왼쪽 위 칩 묶음(TopLeftCluster) 둘째 줄 끝 (좁으면 들어가는 줄에). 그 아래 칸은 묶음 높이(--tl-bottom)로 내려간다
 */
export function RetainPhoneChip() {
  const { me } = useMe();
  const r = retainOf(me);
  const first = r?.first ?? null;
  const items = me && r ? todoItems(me) : [];
  const shown = !!r && (!!first || items.length > 0 || !!r.path);
  if (!me || !r || !shown) return null;
  const path = r.path;
  const todoReady = todoReadyOf(me, items);
  const doneN = items.filter(isDone).length;
  const firstN = first ? FIRST_STEPS.filter((s) => first.mask & s.bit).length : 0;
  const firstAll = !!first && (first.mask & FIRST_ALL) === FIRST_ALL;
  const ready = firstAll || !!path?.canClaim || todoReady;
  const extra = [path?.canClaim ? "오늘 꾸러미 받기" : "", todoReady ? "미션 선물 받기" : ""].filter(Boolean).join(", ");
  return (
    <TopLeftItem kind="retain" overlay>
      <button
        type="button"
        className={cx(ui.button, ui.top, styles.firstChip, ready && styles.chipReady)}
        onClick={() => {
          // 첫 걸음이 있으면 첫 걸음 칸부터, 없으면 미션 칸부터 (꾸러미는 그날 처음 들어올 때 저절로 열린다)
          hubTab = first ? "first" : items.length ? "todo" : "path";
          setPanel("hub");
        }}
        aria-label={first ? `첫 걸음 미션 ${firstN}/${FIRST_STEPS.length}${extra ? `, ${extra}` : ""} (꾸러미·${TODO_NAME}도 여기서)` : `${TODO_NAME} ${doneN}/${items.length}${extra ? `, ${extra}` : ""}`}
      >
        <PixelIcon name={first ? "check" : "todo"} />
        {first ? "첫 걸음" : "미션"}
        <b className={styles.count}>{first ? `${firstN}/${FIRST_STEPS.length}` : `${doneN}/${items.length}`}</b>
        {ready && <span className={styles.dot} aria-hidden="true" />}
      </button>
    </TopLeftItem>
  );
}

/**
 * 첫 걸음 미션 (데스크톱): 오른쪽 아래 확대·축소 단추 왼쪽의 칩(RetainDock) — 누르면 위로 목록이 펼쳐진다(접힘 기억).
 * 폰은 RetainPhoneChip → 창
 */
export function FirstSteps() {
  const { me } = useMe();
  // 11/19 처음엔 접힌 칩. 펼친 것만 기억한다
  const [open, setOpen] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pending, setPending] = useState(false);
  const r = retainOf(me);
  const first = r?.first ?? null;
  if (!first) return null;
  const n = FIRST_STEPS.filter((s) => first.mask & s.bit).length;
  const all = (first.mask & FIRST_ALL) === FIRST_ALL;
  const total = FIRST_STEPS.length;

  const toggle = () => {
    setOpen((v) => {
      try {
        window.localStorage.setItem(OPEN_KEY, v ? "0" : "1");
      } catch {
        // 저장이 막혀도 이번 화면에서는 바뀐다
      }
      return !v;
    });
  };
  return (
    <div className={styles.firstDock}>
      {open && (
        <section className={cx(ui.panel, styles.first)} aria-label="첫 걸음 미션" id="first-steps-panel">
          <div className={styles.firstHead}>
            <b>첫 걸음 미션</b>
            <span className={styles.count}>
              {n}/{total}
            </span>
            <button type="button" className={styles.fold} onClick={toggle}>
              접기
            </button>
          </div>
          <FirstList mask={first.mask} />
          {all ? (
            <button
              type="button"
              className={cx(ui.button, ui.primary, styles.claim)}
              disabled={pending}
              onClick={() => {
                setPending(true);
                claimFirst().finally(() => setPending(false));
              }}
            >
              큰 선물 받기
            </button>
          ) : (
            <small className={styles.note}>
              미션을 다 하면 {rewardName()}
              {josa(rewardName(), "을", "를")} 더 줘요.
            </small>
          )}
        </section>
      )}
      <button
        type="button"
        className={cx(ui.button, styles.dockChip, (all || open) && styles.chipReady)}
        onClick={toggle}
        aria-expanded={open}
        aria-controls="first-steps-panel"
        aria-label={`첫 걸음 미션 (${n}/${total})`}
        title="첫 걸음 미션"
      >
        <PixelIcon name="check" size={12} />
        <span className={styles.dockText}>첫 걸음</span>
        <b className={styles.count}>
          {n}/{total}
        </b>
        {all && <span className={styles.dot} aria-hidden="true" />}
      </button>
    </div>
  );
}

/**
 * 11/19 데스크톱: 오른쪽 아래 확대·축소 단추 왼쪽 한 줄 — 새 이웃 꾸러미·「미션 n/3」 칩 + 첫 걸음 칩(위로 펼침).
 * 타는 펫 단추가 확대·축소 아래 줄 왼쪽을 쓰므로 그 위 줄(+ 단추 높이)에 둔다. 왼쪽 위(음악·확성기)를 비운다
 */
export function RetainDock({ showFirst }: { showFirst: boolean }) {
  // 첫 방문 안내(Tutorial)가 떠 있는 동안은 묶음 전체를 숨긴다 (안내 카드·창이 겹치지 않게 — 안내를 마치면 나온다)
  if (!showFirst) return null;
  return (
    <div className={styles.dock}>
      <RetainChips dock />
      {showFirst && <FirstSteps />}
    </div>
  );
}

// ── 창 ──

function PathDialog({ me, onOpenBag }: { me: Me; onOpenBag: () => void }) {
  return (
    <Dialog title={PATH_NAME} onClose={() => setPanel(null)} fitHeight phoneCard>
      <PathBody me={me} onOpenBag={onOpenBag} />
    </Dialog>
  );
}

function PathBody({ me, onOpenBag }: { me: Me; onOpenBag: () => void }) {
  const now = useNow();
  const [pending, setPending] = useState(false);
  const [got, setGot] = useState<PathGift[] | null>(null);
  const path = me.retain?.path ?? null;
  // 7개를 다 받으면 path가 없어진다 → 방금 받은 것만 보여 주고 닫으면 끝
  if (!path && !got) return <p className={styles.lead}>꾸러미를 모두 받았어요. 내일도 마을에서 만나요.</p>;
  const owed = path ? owedPathGifts(path) : [];
  const gotN = path?.got ?? PATH_GIFTS;
  const next = path ? nextPathGift({ got: path.got + path.owed }) : null;

  async function claim() {
    setPending(true);
    try {
      const res = await api.retainPath();
      if (res.me) meStore.set(res.me);
      if (res.gifts?.length) setGot(res.gifts);
      else if (res.gift) setGot([res.gift]);
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.pathBody}>
      {/* 11/19 짧게 (폰 첫 입장에 저절로 열리는 창 — 받기 단추 하나가 눈에 들어오게) */}
      <p className={styles.lead}>날마다 하나씩, 7일 동안 열려요.</p>
      <ol className={styles.track} aria-label={`꾸러미 ${PATH_GIFTS}개 중 ${gotN}개 받음`}>
        {PATH.map((g, i) => {
          const state = i < gotN ? "got" : path && i < path.got + path.owed ? "today" : i === (path ? path.got + path.owed : PATH_GIFTS) ? "next" : "later";
          return (
            <li key={g.n} className={styles.slot} data-state={state}>
              <span className={styles.slotDay}>{g.n}일</span>
              <span className={styles.slotArt}>
                <GiftArt gift={g} size={28} />
                {state === "got" && (
                  <span className={styles.slotCheck} aria-hidden="true">
                    <PixelIcon name="check" size={12} />
                  </span>
                )}
              </span>
              <span className={styles.slotName}>{g.name}</span>
            </li>
          );
        })}
      </ol>

      {got && (
        <div className={cx(styles.card, styles.cardGot)} aria-live="polite">
          <span className={styles.cardArt}>
            <GiftArt gift={got[got.length - 1]} size={48} />
            <span key={got.length} className={styles.sparkle} aria-hidden="true" />
          </span>
          <div>
            <b className={styles.cardName}>{got.length > 1 ? `꾸러미 ${got.length}개를 한꺼번에 받았어요` : `${got[0].name}${josa(got[0].name, "을", "를")} 받았어요`}</b>
            {/* 11/22 하나만 받았으면 제목에 이름이 이미 있어 같은 이름을 또 쓰지 않고 설명을 (폰에서 같은 글이 두 줄로 보였다) */}
            <p className={styles.cardDesc}>{got.length > 1 ? got.map((g) => g.name).join(", ") : got[0].desc}</p>
            {got.some((g) => g.wear) && (
              <button type="button" className={cx(ui.button, styles.small)} onClick={onOpenBag}>
                가방에서 입어 보기 ({PATH_WEAR_DAYS}일)
              </button>
            )}
          </div>
        </div>
      )}

      {path?.canClaim ? (
        <div className={cx(styles.card, styles.cardToday)}>
          <span className={styles.cardArt}>
            <GiftArt gift={owed[0]} size={48} />
          </span>
          <div>
            <small className={styles.cardTag}>{owed.length > 1 ? `밀린 ${owed.length}개를 한꺼번에 받아요` : `오늘의 꾸러미 (${owed[0].n}일째)`}</small>
            <b className={styles.cardName}>{owed.map((g) => g.name).join(", ")}</b>
            <p className={styles.cardDesc}>{owed.length > 1 ? "받기를 누르면 모두 들어와요." : owed[0].desc}</p>
          </div>
          <button type="button" className={cx(ui.button, ui.primary, styles.cardButton, styles.bigClaim)} disabled={pending} onClick={claim}>
            {owed.length > 1 ? `${owed.length}개 받기` : "받기"}
          </button>
        </div>
      ) : next ? (
        <div className={cx(styles.card, styles.cardNext)}>
          <span className={styles.cardArt}>
            <GiftArt gift={next} size={48} />
          </span>
          <div>
            <small className={styles.cardTag}>다음 꾸러미 ({next.n}일째)</small>
            <b className={styles.cardName}>{next.name}</b>
            <p className={styles.cardDesc}>{next.desc}</p>
            <p className={styles.cardWhen}>
              {DAY_RESET_TEXT}에 열려요. <b>{leftText(msUntilDayReset(now))}</b> 남았어요.
            </p>
          </div>
        </div>
      ) : (
        <div className={cx(styles.card, styles.cardNext)}>
          <span className={styles.cardArt}>
            <GiftArt gift={PATH[PATH.length - 1]} size={48} />
          </span>
          <div>
            <b className={styles.cardName}>꾸러미 7개를 모두 받았어요</b>
            <p className={styles.cardDesc}>가방 [칭호]에서 「마을 새내기 졸업」을 달 수 있어요.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function TodoDialog({ me }: { me: Me }) {
  return (
    <Dialog title={TODO_NAME} onClose={() => setPanel(null)} fitHeight>
      <TodoBody me={me} onRoute={() => setPanel(null)} />
    </Dialog>
  );
}

function TodoBody({ me, onRoute }: { me: Me; onRoute?: () => void }) {
  const [pending, setPending] = useState<number | null>(null);
  const guide = useGuide();
  const touch = useMediaQuery("(pointer: coarse)");
  const todo = me.retain?.todo;
  const items = todoItems(me);
  const allClaimed = items.length > 0 && items.every((it) => it.claimed);

  async function claim(which: number) {
    setPending(which);
    try {
      const res = await api.retainTodo(which);
      if (res.me) meStore.set(res.me);
      if (res.text) showToast(`+${res.text}${which === 3 ? ". 도장도 하나 찍었어요" : ""}`, 4_500);
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  return (
    // 11/22 위 안내는 한 문장만 (도장·강화 증폭권 이야기는 아래 도장 카드에 같은 말이 있다). 폰 새 이웃 창에서는 이 칸이 스크롤 칸 (watchMoreBelow → 아래 흐림)
    <div ref={watchMoreBelow} className={cx(styles.todoBody, "more-fade")}>
      <p className={styles.lead}>날마다 {DAY_RESET_TEXT}에 새 미션 3개가 무작위로 나와요.</p>
      <ul className={styles.todoList}>
        {items.map((it, i) => {
          const done = isDone(it);
          const d = todoDef(it.kind);
          const routed = !!d?.guide && !done;
          const on = routed && guide === todoKey(it.kind);
          return (
            // 11/22 칸 배치: 체크 · [제목 + 보상] · [진행 막대 + 숫자] · [하는 법 + 안내] · 받기. 넓으면 받기가 오른쪽 세로 가운데,
            // 폰(560px 이하)은 받기가 맨 아래 줄 오른쪽으로 내려와 글이 화면 폭을 다 쓴다 (네 칸이 한 줄에 끼어 글이 글자 단위로 끊기던 것)
            <li key={it.kind} className={styles.todoRow} data-done={done || undefined} data-guide={on || undefined}>
              <span className={styles.box} aria-hidden="true">
                {it.claimed && <PixelIcon name="check" size={12} />}
              </span>
              <span className={styles.todoHead}>
                <span className={styles.todoLabel}>{it.label}</span>
                <RewardChips reward={TODO_GIFT} />
              </span>
              <span className={styles.todoProg}>
                <span className={styles.bar} aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (it.have / it.need) * 100)}%` }} />
                </span>
                <small className={styles.todoCount}>{todoProgressText(it)}</small>
              </span>
              {d && !it.claimed && (
                <span className={styles.todoHintRow}>
                  <small className={styles.firstHint}>{d.hint}</small>
                  {routed && (
                    <button
                      type="button"
                      className={styles.todoGuide}
                      aria-pressed={on}
                      aria-label={`${it.label}: ${on ? "길 안내 끄기" : "가는 길 보기"}`}
                      title={on ? "누르면 길 안내를 꺼요" : "누르면 가는 길을 화살표로 보여 줘요"}
                      onClick={() => pickTodoGuide(it.kind, touch, onRoute)}
                    >
                      <PixelIcon name="target" size={10} />
                      {on ? "안내 중" : "안내"}
                    </button>
                  )}
                </span>
              )}
              <span className={styles.todoAct}>
                {it.claimed ? (
                  <span className={styles.claimed}>받았어요</span>
                ) : (
                  <button type="button" className={cx(ui.button, done && ui.primary, styles.small)} disabled={!done || pending !== null} onClick={() => claim(i)}>
                    {done ? "받기" : "아직"}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className={cx(styles.card, styles.stampCard)}>
        <span className={styles.stamp} data-on={todo?.bonus || undefined} aria-hidden="true">
          <PixelIcon name="check" size={20} />
        </span>
        <div>
          <b className={styles.cardName}>미션 셋을 다 하면 도장과 보너스</b>
          <RewardChips reward={TODO_BONUS_GIFT} />
          <p className={styles.cardDesc}>
            모은 도장 {todo?.stamps ?? 0}개. 도장 {TODO_PROT_EVERY}개마다 강화 증폭권 1장을 더 줘요.
          </p>
        </div>
        {todo?.bonus ? (
          <span className={styles.claimed}>받았어요</span>
        ) : (
          <button type="button" className={cx(ui.button, allClaimed && ui.primary, styles.cardButton)} disabled={!allClaimed || pending !== null} onClick={() => claim(3)}>
            도장 받기
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 11/19 폰: [메뉴] 아래 칩 하나 → 첫 걸음·꾸러미·오늘 미션을 칸으로 모은 창 (칸마다 받을 것이 있으면 빨간 점).
 * 제목은 첫 걸음이 남아 있으면 「마을 첫 걸음」, 다 끝냈으면 「오늘 미션」. 칸이 하나뿐이면 칸 줄을 숨긴다
 */
function HubDialog({ me, onOpenBag }: { me: Me; onOpenBag: () => void }) {
  const [tab, setTab] = useState<HubTab>(hubTab);
  const r = me.retain;
  const todoReady = todoReadyOf(me, todoItems(me));
  const tabs: { id: HubTab; label: string; ready: boolean }[] = [
    ...(r?.first ? [{ id: "first" as const, label: "첫 걸음", ready: (r.first.mask & FIRST_ALL) === FIRST_ALL }] : []),
    ...(r?.path ? [{ id: "path" as const, label: "꾸러미", ready: r.path.canClaim }] : []),
    { id: "todo", label: TODO_NAME, ready: todoReady },
  ];
  const cur = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const tabsRef = useRef<HTMLDivElement>(null);
  // 11/22 가운데 카드 창(phoneCard). 칸을 바꿀 때마다 창 높이가 바뀌면 가운데 맞춤 창의 칸 줄이 손가락 밑에서 위아래로 튄다 →
  // 칸 몸통을 모두 한 자리에 겹쳐 두고 지금 칸만 보여 준다. 창 높이 = 꾸러미 칸 — 첫 걸음·오늘 미션은 그 높이 안에서 목록만 스크롤
  // (가장 긴 첫 걸음에 맞추면 꾸러미 칸 아래가 40%, 오늘 미션에 맞춰도 16~36%가 비었다). 꾸러미를 다 받아 칸이 없으면 오늘 미션 높이. RetainHud.module.css .hubPane
  return (
    <Dialog title={r?.first ? "마을 첫 걸음" : TODO_NAME} onClose={() => setPanel(null)} fitHeight phoneCard>
      {tabs.length > 1 && (
      <div ref={tabsRef} className={styles.hubTabs} role="tablist" aria-label="마을 안내">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={cur === t.id}
            className={cx(ui.button, styles.hubTab, cur === t.id && styles.hubTabOn)}
            onClick={() => {
              hubTab = t.id;
              setTab(t.id);
              // 11/22 새 칸은 맨 위부터 (칸 줄은 창 본문 맨 위에 붙어 있다 — 본문 = 칸 줄의 부모)
              const body = tabsRef.current?.parentElement;
              if (body) {
                body.scrollTop = 0;
                // 칸 안에서 스크롤하는 목록(첫 걸음·오늘 미션)도 맨 위로
                for (const el of body.querySelectorAll<HTMLElement>(`[data-pane="${t.id}"] .more-fade`)) el.scrollTop = 0;
              }
            }}
          >
            {t.label}
            {t.ready && <span className={styles.dot} aria-hidden="true" />}
          </button>
        ))}
      </div>
      )}
      <div className={styles.hubPanes}>
        {tabs.map((t) => (
          <div key={t.id} className={styles.hubPane} role="tabpanel" aria-label={t.label} data-pane={t.id} data-on={cur === t.id || undefined} inert={cur !== t.id}>
            {t.id === "first" ? <FirstBody me={me} /> : t.id === "path" ? <PathBody me={me} onOpenBag={onOpenBag} /> : <TodoBody me={me} onRoute={() => setPanel(null)} />}
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function FirstBody({ me }: { me: Me }) {
  const [pending, setPending] = useState(false);
  const first = me.retain?.first;
  if (!first) return null;
  const all = (first.mask & FIRST_ALL) === FIRST_ALL;
  // 11/22 목록과 아래 글·단추 사이를 띄운다 (붙어 있었다). 다 했으면 받기 카드를 목록 위에 — 열자마자 보이게, 단추는 꾸러미 받기처럼 크게
  const claimCard = all && (
    <div className={cx(styles.card, styles.cardToday)}>
      <div>
        <small className={styles.cardTag}>첫 걸음 미션을 다 했어요</small>
        <b className={styles.cardName}>{rewardName()}</b>
      </div>
      <button
        type="button"
        className={cx(ui.button, ui.primary, styles.cardButton, styles.bigClaim)}
        disabled={pending}
        onClick={() => {
          setPending(true);
          claimFirst().finally(() => setPending(false));
        }}
      >
        선물 받기
      </button>
    </div>
  );
  return (
    <div className={styles.firstBody}>
      {claimCard}
      <FirstList mask={first.mask} onRoute={() => setPanel(null)} />
      {!all && (
        <small className={styles.note}>
          미션을 다 하면 {rewardName()}
          {josa(rewardName(), "을", "를")} 더 줘요.
        </small>
      )}
    </div>
  );
}

/**
 * 창 + 진행 듣기 (게임 화면에 한 번만): 행동 응답의 `todo`로 할 일 진행을 맞추고, 첫 걸음 행동(인사·눈·표현·낚시·별자리·이웃 집)을 알린다.
 * 첫날에는 30분 머물렀거나 처음 나가려 할 때(창 밖으로 마우스·탭 숨김) 한 번 「내일 ○○가 기다려요」
 */
export function RetainLayer({ onOpenBag }: { onOpenBag: () => void }) {
  const { me } = useMe();
  const panel = usePanel();
  const r = retainOf(me);

  // 행동 응답 엿듣기: 할 일 진행 · 낚시 한 마리·채집 한 번(첫 걸음 미션)
  useEffect(
    () =>
      onApiJson((path, body) => {
        const b = body as { todo?: TodoTick; result?: unknown; items?: unknown[]; board?: unknown } | null;
        if (b?.todo) applyTodoTick(b.todo);
        if (path === "/api/forage/fish/reel" && b?.result) markFirstStep("fish");
        if (path === "/api/forage/gather/finish" && Array.isArray(b?.items) && b.items.length) markFirstStep("gather");
        // 11/19 마을 의뢰 게시판에 의뢰 하나를 납품했다 (성공 응답만 온다)
        if (path === "/api/forage/quests/deliver" && b?.board) markFirstStep("quest");
      }),
    [],
  );
  useBridgeEvent("rpg:ended", ({ result, aborted }) => {
    if (aborted) return;
    if (result.game === "hunt") markFirstStep("hunt");
  });
  useBridgeEvent("input:chat", () => markFirstStep("chat"));
  useBridgeEvent("input:whisper", () => markFirstStep("chat"));
  useBridgeEvent("input:say", () => markFirstStep("emote"));
  useBridgeEvent("input:emo", () => markFirstStep("emote"));
  useBridgeEvent("input:act", () => markFirstStep("emote"));
  useBridgeEvent("house:enter", ({ mine }) => {
    if (!mine) markFirstStep("visit");
  });
  // 11/19 버스 나들이: 캠핑장·바닷가에 내리면
  useBridgeEvent("map:changed", ({ map }) => {
    if (map === "camp") markFirstStep("camp");
    if (map === "sea") markFirstStep("sea");
  });
  // 11/19 오늘 미션 놀이: 범퍼카 타고 내리기 · 관람차·열기구 하늘 시점 · 모닥불 불멍 (귀신의 집은 HauntDialog)
  // 11/20 범퍼카는 가만히 앉아 있던 시간은 빼고 실제로 몰고 다닌 시간이 1분을 넘으면, 내리지 않아도 그 자리에서 미션에 센다.
  // 서버는 표를 낸 때부터 시계로 1분을 보니(lib/retainPlay), 몬 시간이 그보다 길 수 없게 1.5초 여유를 둔다
  const bumperSent = useRef(false);
  useBridgeEvent("bumper:riding", ({ riding }) => {
    if (riding) {
      bumperSent.current = false;
      void startPlayTodo("bumper");
      return;
    }
    if (bumperSent.current) return;
    const wanted = playWanted("bumper");
    endPlayTodo("bumper", false);
    if (wanted) showToast("범퍼카 미션은 1분 넘게 몰고 다녀야 채워져요. 멈춰 있던 시간은 세지 않아요.", 4_500);
  });
  useBridgeEvent("bumper:drive", ({ ms }) => {
    if (bumperSent.current || ms < PLAY_MIN_MS.bumper + 1_500) return;
    bumperSent.current = true;
    endPlayTodo("bumper", true);
  });
  const skyOn = useRef(false);
  useBridgeEvent("sky:hud", (hud) => {
    const on = !!hud;
    if (on === skyOn.current) return;
    skyOn.current = on;
    if (on) void startPlayTodo("sky");
    else endPlayTodo("sky", true);
  });
  const fireOn = useRef(false);
  useBridgeEvent("view:mode", ({ mode }) => {
    const on = mode === "campfire";
    if (on === fireOn.current) return;
    fireOn.current = on;
    if (on) void startPlayTodo("fire");
    else endPlayTodo("fire", true);
  });
  // 11/19 길 안내가 끝났다 (게임이 먼저 지웠다): 닿았으면 할 일을 한 번 더 알려 준다
  useBridgeEvent("route:state", ({ target, status }) => {
    const id = guideNow;
    if (!id || guideTargetOf(id) !== target) return;
    setGuide(null, false);
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const hint = guideHintOf(id, touch);
    if (!hint) return;
    if (status === "arrived") showToast(`다 왔어요. ${hint}`, 5_000);
    else if (status === "missing") showToast(target === "gather" ? "지금 피어 있는 채집 지점이 없어요. 조금 뒤에 다시 눌러 봐요." : target === "visit" ? "아직 이웃 집이 없어요. 다른 채널에서 찾아봐요." : "가까운 곳을 못 찾았어요.", 5_000);
    else showToast("걸어서 갈 길을 못 찾았어요. 조금 움직인 뒤 다시 눌러 봐요.", 5_000);
  });
  // 폰 버튼 (터치 조작은 화면 버튼이 게임에 알린다)
  useBridgeEvent("input:jump", () => markFirstStep("jump"));
  useBridgeEvent("input:runToggle", ({ on }) => {
    if (on) markFirstStep("run");
  });
  useBridgeEvent("input:interact", () => markFirstStep("look"));
  // 벤치·의자에 앉으면 게임이 앉은 상태를 알린다 (키보드·폰 모두)
  useBridgeEvent("mood:state", ({ seated }) => {
    if (seated) markFirstStep("sit");
  });
  // 데스크톱 키 (게임이 직접 받는 키라 화면에서 엿듣는다 — 글자를 쓰는 중이거나 창이 열려 있으면 세지 않는다)
  const firstOn = !!r?.first;
  // 11/19 길 안내: Esc로 끄기 (창이 열려 있으면 창이 먼저 닫힌다). 첫 걸음이 사라지면(다 받음·운영자) 같이 끈다
  const guiding = useGuide() !== null;
  useEffect(() => {
    // 첫 걸음이 사라지면 첫 걸음 안내만 끈다 (오늘 미션 안내는 그대로)
    if (!firstOn && guideNow && !todoOfKey(guideNow)) setGuide(null);
  }, [firstOn]);
  useEffect(() => {
    if (!guiding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      setGuide(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guiding]);
  useEffect(() => {
    if (!firstOn) return;
    const MOVE = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (e.repeat && e.code !== "ShiftLeft" && !MOVE.has(e.code)) return;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable) return;
      if (document.querySelector("dialog[open]")) return;
      if (e.code === "Space") markFirstStep("jump");
      else if (e.code === "KeyE") markFirstStep("look");
      else if (e.shiftKey && MOVE.has(e.code)) markFirstStep("run");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [firstOn]);

  // 날이 바뀌면(새벽 5시) 새 미션·선물을 받으러 내 정보를 한 번 다시 읽는다
  const now = useNow(60_000);
  const day = gameDay(now);
  const todoDay = r?.todo.day;
  useEffect(() => {
    if (todoDay && todoDay < day) void meStore.refresh();
  }, [todoDay, day]);

  // 11/19 받을 꾸러미가 있으면 그날 처음 들어왔을 때 한 번 저절로 연다 (첫 방문 안내를 마친 뒤 — 서버에 열린 날을 적어 하루 한 번)
  const path = r?.path ?? null;
  // 11/19 같은 화면에서는 계정·날마다 한 번만 (서버 seen이 늦게 돌아오는 사이 상점·집을 드나들며 다시 뜨던 것 막기)
  const autoKey = `${me?.accountId ?? ""}:${day}`;
  const autoOpen = !!path?.canClaim && !path.seen && !!me?.tutorialDone && panel === null && autoOpenedKey !== autoKey;
  useEffect(() => {
    if (!autoOpen) return;
    const t = setTimeout(() => {
      autoOpenedKey = autoKey;
      setPanel("path");
      const cur = meStore.getSnapshot().me;
      if (cur?.retain?.path) meStore.set({ ...cur, retain: { ...cur.retain, path: { ...cur.retain.path, seen: true } } });
      void api.retainSeen().catch(() => undefined);
    }, 1_500);
    return () => clearTimeout(t);
  }, [autoOpen, autoKey]);

  // 첫날 한 번: 「내일 ○○가 기다려요」 (꾸러미를 막 받기 시작한 새 계정)
  const firstDay = !!path && path.got <= 1 && !path.canClaim;
  const accountId = me?.accountId;
  const stay = me?.attendance.stayMinutes ?? 0;
  const byeRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    byeRef.current = () => {
      if (!firstDay || !path || !accountId) return;
      const key = `tomb.retainBye.${accountId}`;
      try {
        if (window.localStorage.getItem(key)) return;
        window.localStorage.setItem(key, day);
      } catch {
        // 저장이 막힌 기기는 이 화면에서 한 번만
        if (byeShown) return;
      }
      byeShown = true;
      const next = nextPathGift(path);
      if (!next) return;
      showToast(`내일 ${next.name}${josa(next.name, "이", "가")} 기다려요. ${DAY_RESET_TEXT}에 열려요.`, 9_000);
    };
  });
  useEffect(() => {
    if (firstDay && stay >= 30) byeRef.current();
  }, [firstDay, stay]);
  useEffect(() => {
    if (!firstDay) return;
    let hidden = false;
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) byeRef.current();
    };
    // 탭을 숨겼다 돌아오면 그때 보여 준다 (숨긴 동안 뜬 알림은 못 본다)
    const onVis = () => {
      if (document.hidden) hidden = true;
      else if (hidden) {
        hidden = false;
        byeRef.current();
      }
    };
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [firstDay]);

  if (!me || !r || !panel) return null;
  if (panel === "path") return <PathDialog me={me} onOpenBag={() => (setPanel(null), onOpenBag())} />;
  if (panel === "todo") return <TodoDialog me={me} />;
  return <HubDialog me={me} onOpenBag={() => (setPanel(null), onOpenBag())} />;
}

let byeShown = false;

/** 가방(또는 상점)을 열면 첫 걸음 미션 「가방 열어 보기」 */
export function useLookStep(open: boolean): void {
  useEffect(() => {
    if (open) markFirstStep("bag");
  }, [open]);
}

