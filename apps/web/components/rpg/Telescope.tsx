"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { meStore } from "@/lib/hooks/useMe";
import { DIFFICULTIES, DIFFS, GAMES, potionById, type Difficulty } from "@/lib/rpg/catalog";
import { rpgApi } from "@/lib/rpg/client";
import type { RunReward, RunResult } from "@/lib/rpg/types";
import { STARRY_NIGHT_BONUS, starryNight } from "@/lib/stargaze";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import LevelUpSound from "./LevelUpSound";
import RpgIcon from "./RpgIcon";
import RunHud from "./RunHud";
import s from "./rpg.module.css";
import { readStarsRecords, saveStarsRecord, StarsInfo, StarsPreview } from "./TelescopeExtras";

// 22번 별 보기 언덕의 망원경 (월드에서 망원경 앞 E → portal:open {kind:"telescope"}).
// 사냥터 로비에 있던 "별자리 잇기"를 여기서 한다. 판 시작·결과 검증은 사냥터와 같은 /api/rpg/run (game "stars") —
// 시드로 다시 만든 별 계획으로 결과 상한을 검사하고, 판 시작 시각이 진짜 맑은 밤(KST)이면 포인트 ×1.5 (lib/stargaze).
// 망원경 속은 언제나 밤하늘이라 낮에도 할 수 있다.

type Phase = "intro" | "starting" | "playing" | "paused" | "submitting" | "result";
type Run = { ticket: string; difficulty: Difficulty };
type Outcome = { result: RunResult; aborted: boolean; reward?: RunReward; error?: string };

const LS_DIFF = "tomb.stars.diff";

function readDiff(): Difficulty {
  try {
    const v = localStorage.getItem(LS_DIFF);
    if (v && (DIFFICULTIES as readonly string[]).includes(v)) return v as Difficulty;
  } catch {
    /* 저장소를 못 쓰면 기본값 */
  }
  return "easy";
}

export default function Telescope({ onClose }: { onClose: () => void }) {
  const [diff, setDiff] = useState<Difficulty>(readDiff);
  const [phase, setPhase] = useState<Phase>("intro");
  const [notice, setNotice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [starry, setStarry] = useState(() => starryNight(Date.now()));
  const [records, setRecords] = useState(readStarsRecords);
  const run = useRef<Run | null>(null);
  const phaseRef = useRef<Phase>("intro");
  phaseRef.current = phase;

  useBlockingLayer(phase === "playing" || phase === "submitting");

  // 맑은 밤인지 1분마다 다시 (날씨는 2시간 블록, 밤은 KST 시각)
  useEffect(() => {
    const t = setInterval(() => setStarry(starryNight(Date.now())), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_DIFF, diff);
    } catch {
      /* 무시 */
    }
  }, [diff]);

  // 판 도중 창이 내려가면 판을 포기로 끝낸다
  useEffect(
    () => () => {
      if (phaseRef.current === "playing" || phaseRef.current === "paused") bridge.emit("rpg:quit");
    },
    [],
  );

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

  async function start() {
    setPhase("starting");
    setNotice(null);
    try {
      const res = await rpgApi.start("stars", diff);
      const c = res.view.character;
      run.current = { ticket: res.ticket, difficulty: diff };
      setOutcome(null);
      setStarry(starryNight(Date.now()));
      setPhase("playing");
      bridge.emit("rpg:play", {
        game: "stars",
        difficulty: diff,
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
      setPhase(outcome ? "result" : "intro");
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
        setOutcome({ result, aborted, reward: res.reward });
        void meStore.refresh();
        // 이 기기의 최근 기록 (끝까지 본 판만)
        if (!aborted && result.game === "stars") {
          saveStarsRecord({
            at: Date.now(),
            diff: r.difficulty,
            perfect: result.perfect,
            good: result.good,
            miss: result.miss,
            points: res.reward.points,
            night: !!res.reward.nightBonus,
          });
          setRecords(readStarsRecords());
        }
      })
      .catch((e) => setOutcome({ result, aborted, error: errorMessage(e) }))
      .finally(() => setPhase("result"));
  });

  if (phase === "playing" || phase === "paused" || phase === "submitting") {
    return (
      <>
        <RunHud game="stars" hotbar={[]} onPause={pause} />
        {phase === "submitting" && (
          <div className={s.submitting} role="status">
            별자리를 정리하는 중…
          </div>
        )}
        {phase === "paused" && (
          <Dialog kind="confirm" title="잠깐 멈춤" onClose={resume}>
            <div className={s.result}>
              <p>멈춘 동안 별은 움직이지 않아요. 너무 오래(2분 넘게) 멈추면 결과를 받을 수 없어요.</p>
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
                  그만 보기
                </button>
              </div>
            </div>
          </Dialog>
        )}
      </>
    );
  }

  if (phase === "result" && outcome) {
    const r = outcome.reward;
    const all = outcome.result.game === "stars" ? outcome.result.perfect + outcome.result.good + outcome.result.miss : 0;
    const clean = outcome.result.game === "stars" && all > 0 && outcome.result.miss === 0;
    return (
      <Dialog title="별자리 잇기 결과" onClose={onClose}>
        <div className={s.result}>
          <p className={s.resultBig}>{outcome.aborted ? "중간에 망원경에서 눈을 뗐어요" : clean ? "모든 별을 이었어요!" : "밤하늘이 흘러갔어요"}</p>
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
                  <strong>{r.score.toLocaleString("ko-KR")}</strong>점수
                </div>
              </div>
              {r.nightBonus && <p className={s.levelUp}>맑은 밤 보너스 ×{STARRY_NIGHT_BONUS} — 진짜 별이 잘 보이는 밤이었어요</p>}
              {r.capped && <p className={ui.hint}>오늘 사냥·미니게임 포인트 한도(또는 하루 전체 한도)에 닿아서 {r.pointsRaw}P 중 {r.points}P만 받았어요.</p>}
              {r.levelsGained > 0 && (
                <p className={s.levelUp} role="status">
                  레벨 업! Lv.{r.newLevel}
                  <LevelUpSound level={r.newLevel} />
                </p>
              )}
              {r.drops.length > 0 && (
                <div className={s.drops}>
                  {r.drops.map((d, i) => {
                    const def = potionById(d.id);
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
              )}
            </>
          ) : null}
        </div>
        <div className={s.buttons} style={{ marginTop: 14 }}>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void start()}>
            한 번 더 보기
          </button>
          <button type="button" className={cx(ui.button, ui.quiet)} onClick={onClose}>
            망원경에서 물러나기
          </button>
        </div>
        {notice && <p className={s.notice}>{notice}</p>}
        <div style={{ marginTop: 14 }}>
          <StarsInfo records={records} />
        </div>
      </Dialog>
    );
  }

  const G = GAMES.stars;
  return (
    <Dialog title="망원경" onClose={onClose}>
      <div className={s.lobby}>
        <p>
          <b>{G.name}</b> — {G.desc}
        </p>
        <p className={s.meta}>망원경 속은 언제나 밤하늘이라 낮에도 볼 수 있어요. {G.how}</p>
        <p className={starry ? s.levelUp : ui.hint} role="status">
          {starry
            ? `지금은 진짜 맑은 밤이에요 — 포인트 ×${STARRY_NIGHT_BONUS}!`
            : `진짜 밤(한국 시간 저녁 7시 반~새벽 5시)에 하늘이 맑으면 포인트 ×${STARRY_NIGHT_BONUS}`}
        </p>
        <section className={s.section} aria-labelledby="stars-diff">
          <h3 id="stars-diff" className={s.sectionTitle}>
            별이 얼마나 빠를까요
          </h3>
          <div className={s.diffs} role="radiogroup" aria-labelledby="stars-diff">
            {DIFFICULTIES.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={diff === d} className={s.card} onClick={() => setDiff(d)}>
                <span className={s.cardName}>{DIFFS[d].name}</span>
                <span className={s.meta}>
                  권장 Lv.{DIFFS[d].recLevel}+
                  <br />
                  최대 {starry ? Math.round(DIFFS[d].miniPoints * STARRY_NIGHT_BONUS) : DIFFS[d].miniPoints}P
                </span>
              </button>
            ))}
          </div>
        </section>
        <div className={s.buttons}>
          <button type="button" className={cx(ui.button, ui.primary)} disabled={phase === "starting"} onClick={() => void start()}>
            {phase === "starting" ? "초점 맞추는 중…" : "망원경 들여다보기"}
          </button>
          <button type="button" className={cx(ui.button, ui.quiet)} onClick={onClose}>
            물러나기
          </button>
        </div>
        <p className={s.notice} role="status">
          {notice}
        </p>
        <StarsPreview starry={starry} />
        <StarsInfo records={records} />
      </div>
    </Dialog>
  );
}
