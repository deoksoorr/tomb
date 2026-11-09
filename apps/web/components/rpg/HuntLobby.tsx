"use client";

import { useEffect, useId, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { meStore } from "@/lib/hooks/useMe";
import { DIFFS, GAMES, gearById, potionById, ZONES, type Difficulty, type GameKind, type SkillId } from "@/lib/rpg/catalog";
import { rpgApi, type CharacterAction } from "@/lib/rpg/client";
import type { RpgView, RunReward, RunResult } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { pts } from "./format";
import { CharacterPanel, GearPanel, ShopPanel, SkillPanel, StartPanel } from "./Panels";
import RpgIcon from "./RpgIcon";
import RunHud from "./RunHud";
import s from "./rpg.module.css";

// 사냥터 입구 창 (월드의 사냥터 입구에서 portal:open {kind:"hunt"} → UI가 이 컴포넌트를 띄운다).
// 로비(출발·캐릭터·장비·스킬·상점) → 판 진행(게임 씬 + 이 오버레이 HUD) → 결과 → 다시 로비, 의 흐름을 모두 맡는다.
// 판이 진행되는 동안에도 마운트돼 있어야 한다 (닫히면 판을 포기로 끝낸다).

type Tab = "start" | "character" | "gear" | "skills" | "shop";
const TABS: [Tab, string][] = [
  ["start", "출발"],
  ["character", "캐릭터"],
  ["gear", "장비"],
  ["skills", "스킬"],
  ["shop", "상점"],
];

type Phase = "lobby" | "starting" | "playing" | "paused" | "submitting" | "result";
type Run = { ticket: string; game: GameKind; difficulty: Difficulty; hotbar: (SkillId | null)[]; seed: number };
type Outcome = { result: RunResult; aborted: boolean; difficulty: Difficulty; reward?: RunReward; error?: string };

const LS_PICK = "tomb.rpg.pick";

function readPick(): { game: GameKind; diff: Difficulty } {
  try {
    const v = JSON.parse(localStorage.getItem(LS_PICK) ?? "null") as { game: GameKind; diff: Difficulty } | null;
    if (v && v.game in GAMES && v.diff in DIFFS) return v;
  } catch {
    /* 저장소를 못 쓰면 기본값 */
  }
  return { game: "hunt", diff: "easy" };
}

export default function HuntLobby({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<RpgView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("start");
  const [pick, setPick] = useState(readPick);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const run = useRef<Run | null>(null);
  const phaseRef = useRef<Phase>("lobby");
  phaseRef.current = phase;
  const baseId = useId();

  // 판이 진행되는 동안(대화상자가 없을 때)도 월드 키 입력을 막아 둔다 → 월드의 내 아바타는 입구에 멈춰 있다
  useBlockingLayer(phase === "playing" || phase === "submitting");

  useEffect(() => {
    let alive = true;
    rpgApi
      .view()
      .then((v) => alive && setView(v))
      .catch((e) => alive && setLoadError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  // 판 도중 창이 내려가면(다른 창이 열림 등) 판을 포기로 끝낸다
  useEffect(
    () => () => {
      if (phaseRef.current === "playing" || phaseRef.current === "paused") bridge.emit("rpg:quit");
    },
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem(LS_PICK, JSON.stringify(pick));
    } catch {
      /* 무시 */
    }
  }, [pick]);

  // 진행 중 Esc → 멈춤
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      pause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function pause() {
    bridge.emit("rpg:pause", { paused: true });
    setPhase("paused");
  }

  function resume() {
    bridge.emit("rpg:pause", { paused: false });
    setPhase("playing");
  }

  async function act(fn: () => Promise<RpgView>, ok?: string) {
    setBusy(true);
    setNotice(null);
    try {
      setView(await fn());
      if (ok) setNotice(ok);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const onCharacter = (a: CharacterAction, ok?: string) => void act(() => rpgApi.character(a), ok);

  const onBuy = (id: string, qty: number) =>
    void act(async () => {
      const v = await rpgApi.buy(id, qty);
      void meStore.refresh();
      return v;
    }, `${gearById(id)?.name ?? potionById(id)?.name}${qty > 1 ? ` ${qty}개` : ""}을(를) 샀어요.`);

  const onSell = (id: string) => {
    setBusy(true);
    setNotice(null);
    rpgApi
      .sell(id)
      .then((v) => {
        setView(v);
        void meStore.refresh();
        const name = gearById(id)?.name ?? id;
        setNotice(v.sold?.capped ? `${name}을(를) 팔았어요. 오늘 사냥 포인트 한도라 일부만 받았어요.` : `${name}을(를) ${pts(v.sold?.value ?? 0)}에 팔았어요.`);
      })
      .catch((e) => setNotice(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  async function start(game = pick.game, difficulty = pick.diff) {
    setPhase("starting");
    setNotice(null);
    try {
      const res = await rpgApi.start(game, difficulty);
      const c = res.view.character;
      setView(res.view);
      run.current = { ticket: res.ticket, game, difficulty, hotbar: c.hotbar, seed: res.seed };
      setOutcome(null);
      setPhase("playing");
      bridge.emit("rpg:play", {
        game,
        difficulty,
        seed: res.seed,
        timeLimitSec: res.timeLimitSec,
        level: c.level,
        derived: res.view.derived,
        skills: c.skills,
        hotbar: c.hotbar,
        potions: c.potions,
        equip: c.equip,
      });
    } catch (e) {
      setNotice(errorMessage(e));
      setPhase(outcome ? "result" : "lobby");
    }
  }

  useBridgeEvent("rpg:ended", ({ result, aborted }) => {
    const r = run.current;
    if (!r) return;
    run.current = null;
    setPhase("submitting");
    rpgApi
      .finish(r.ticket, result)
      .then((res) => {
        setView(res.view);
        setOutcome({ result, aborted, difficulty: r.difficulty, reward: res.reward });
        void meStore.refresh();
      })
      .catch((e) => setOutcome({ result, aborted, difficulty: r.difficulty, error: errorMessage(e) }))
      .finally(() => setPhase("result"));
  });

  // ── 그리기 ──

  if (phase === "playing" || phase === "paused" || phase === "submitting") {
    const r = run.current;
    return (
      <>
        {r && <RunHud game={r.game} hotbar={r.hotbar} onPause={pause} />}
        {phase === "submitting" && (
          <div className={s.submitting} role="status">
            결과를 정리하는 중…
          </div>
        )}
        {phase === "paused" && (
          <Dialog title="잠깐 멈춤" onClose={resume} size="sm">
            <div className={s.result}>
              <p>멈춘 동안 게임 시간은 흐르지 않아요. 너무 오래(2분 넘게) 멈추면 결과를 받을 수 없어요.</p>
              <div className={s.buttons}>
                <button type="button" className={cx(ui.button, ui.primary)} onClick={resume}>
                  계속하기
                </button>
                <button
                  type="button"
                  className={cx(ui.button, ui.danger)}
                  onClick={() => {
                    bridge.emit("rpg:pause", { paused: false });
                    setPhase("playing");
                    bridge.emit("rpg:quit");
                  }}
                >
                  그만하고 나가기
                </button>
              </div>
            </div>
          </Dialog>
        )}
      </>
    );
  }

  if (phase === "result" && outcome) {
    return (
      <Dialog title={`${GAMES[outcome.result.game].name} 결과`} onClose={() => setPhase("lobby")} size="md">
        <ResultView outcome={outcome} view={view} />
        <div className={s.buttons} style={{ marginTop: 14 }}>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void start(outcome.result.game, pick.diff)}>
            한 판 더
          </button>
          <button type="button" className={ui.button} onClick={() => setPhase("lobby")}>
            로비로
          </button>
          <button type="button" className={cx(ui.button, ui.quiet)} onClick={onClose}>
            월드로 나가기
          </button>
        </div>
        {notice && <p className={s.notice}>{notice}</p>}
      </Dialog>
    );
  }

  const c = view?.character;
  return (
    <Dialog title="사냥터" onClose={onClose} size="lg">
      <div className={s.lobby}>
        {view && c ? (
          <>
            <div className={s.summary}>
              <span>
                Lv.<strong>{c.level}</strong>
              </span>
              <span>
                EXP <strong>{c.exp.toLocaleString("ko-KR")}</strong>
                {view.expToNext > 0 && ` / ${view.expToNext.toLocaleString("ko-KR")}`}
              </span>
              <span>
                포인트 <strong className={s.points}>{pts(view.points)}</strong>
              </span>
              <span>
                오늘 사냥 <strong>{view.today.huntPoints}</strong> / {view.today.cap}P
              </span>
            </div>
            <div className={s.expBar} role="meter" aria-label="경험치" aria-valuenow={c.exp} aria-valuemin={0} aria-valuemax={view.expToNext || 1}>
              <span style={{ width: `${view.expToNext ? Math.min(100, (c.exp / view.expToNext) * 100) : 100}%` }} />
            </div>
            <div className={s.tabs} role="tablist" aria-label="사냥터 메뉴">
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  id={`${baseId}-${k}`}
                  aria-selected={tab === k}
                  aria-controls={`${baseId}-panel`}
                  className={s.tab}
                  onClick={() => {
                    setTab(k);
                    setNotice(null);
                  }}
                >
                  {label}
                  {k === "character" && c.statPoints > 0 && <span className={s.dot}>{c.statPoints}</span>}
                  {k === "skills" && c.skillPoints > 0 && <span className={s.dot}>{c.skillPoints}</span>}
                </button>
              ))}
            </div>
            <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`}>
              {tab === "start" && (
                <StartPanel
                  view={view}
                  game={pick.game}
                  diff={pick.diff}
                  onGame={(game) => setPick((p) => ({ ...p, game }))}
                  onDiff={(diff) => setPick((p) => ({ ...p, diff }))}
                  onStart={() => void start()}
                  busy={phase === "starting"}
                />
              )}
              {tab === "character" && <CharacterPanel view={view} busy={busy} onCharacter={onCharacter} />}
              {tab === "gear" && <GearPanel view={view} busy={busy} onCharacter={onCharacter} onSell={onSell} />}
              {tab === "skills" && <SkillPanel view={view} busy={busy} onCharacter={onCharacter} />}
              {tab === "shop" && <ShopPanel view={view} busy={busy} onBuy={onBuy} />}
            </div>
          </>
        ) : (
          <p className={loadError ? ui.error : ui.hint}>{loadError ?? "사냥터 문을 여는 중…"}</p>
        )}
        <p className={s.notice} role="status">
          {notice}
        </p>
      </div>
    </Dialog>
  );
}

function headline(o: Outcome): string {
  const r = o.result;
  if (r.game === "hunt") {
    if (r.died) return "쓰러졌어요…";
    if (o.aborted) return "중간에 나왔어요";
    return r.wavesCleared >= ZONES[o.difficulty].waves ? "모든 웨이브를 막아 냈어요!" : "시간이 다 됐어요";
  }
  if (r.game === "stars") {
    if (o.aborted) return "중간에 나왔어요";
    const all = r.perfect + r.good + r.miss;
    return all > 0 && r.miss === 0 ? "모든 별을 이었어요!" : "밤이 끝났어요";
  }
  return o.aborted ? "중간에 나왔어요" : "시간 끝!";
}

function ResultView({ outcome, view }: { outcome: Outcome; view: RpgView | null }) {
  const r = outcome.reward;
  return (
    <div className={s.result}>
      <p className={s.resultBig}>{headline(outcome)}</p>
      {outcome.error ? (
        <p className={ui.error}>{outcome.error}</p>
      ) : r ? (
        <>
          <div className={s.rewards}>
            <div>
              <strong>+{r.exp.toLocaleString("ko-KR")}</strong>EXP
            </div>
            <div>
              <strong>+{r.points}</strong>포인트
            </div>
            <div>
              <strong>{r.score.toLocaleString("ko-KR")}</strong>
              {outcome.result.game === "hunt" ? "처치 점수" : "점수"}
            </div>
          </div>
          {r.capped && <p className={ui.hint}>오늘 사냥 포인트 한도(또는 하루 전체 한도)에 닿아서 {r.pointsRaw}P 중 {r.points}P만 받았어요.</p>}
          {r.levelsGained > 0 && (
            <p className={s.levelUp} role="status">
              레벨 업! Lv.{r.newLevel} · 능력치·스킬 포인트를 받았어요
            </p>
          )}
          {r.drops.length > 0 && (
            <div>
              <p className={ui.hint}>주운 것</p>
              <div className={s.drops}>
                {r.drops.map((d, i) => {
                  const def = d.kind === "gear" ? gearById(d.id) : potionById(d.id);
                  if (!def) return null;
                  return (
                    <span key={i} className={s.drop}>
                      <RpgIcon art={def.art} size={32} />
                      {def.name}
                      {d.qty > 1 && ` ×${d.qty}`}
                    </span>
                  );
                })}
              </div>
              {r.lostDrops > 0 && <p className={s.warn}>가방이 가득 차서 {r.lostDrops}개는 못 챙겼어요.</p>}
            </div>
          )}
          {view && (
            <p className={ui.hint}>
              Lv.{view.character.level} · EXP {view.character.exp}/{view.expToNext || "MAX"} · 오늘 사냥 포인트 {view.today.huntPoints}/{view.today.cap}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
