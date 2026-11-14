"use client";

import { itemName } from "@tomb/protocol";
import { useEffect, useId, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { meStore, useMe } from "@/lib/hooks/useMe";
import {
  DIFFS,
  GAMES,
  gearById,
  HUNT_ZONES,
  isZoneId,
  MONSTERS,
  potionById,
  ZONE_IDS,
  ZONES,
  zoneFor,
  type Difficulty,
  type GameKind,
  type MonsterId,
  type SkillId,
  type ZoneId,
} from "@/lib/rpg/catalog";
import { rpgApi, type CharacterAction } from "@/lib/rpg/client";
import type { RpgView, RunReward, RunResult } from "@/lib/rpg/types";
import { readItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { currentLook } from "../account/items";
import { resolveAvatar } from "../account/wardrobe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { mmss, pts } from "./format";
import { gearGrade } from "./gear";
import HuntCapMeter from "./HuntCap";
import HuntGuide from "./HuntGuide";
import { CharacterPanel, GearPanel, LOBBY_HIDDEN, ShopPanel, SkillPanel, StartPanel } from "./Panels";
import LevelUpSound from "./LevelUpSound";
import RpgIcon from "./RpgIcon";
import ItemIcon from "../ui/ItemIcon";
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
type Run = {
  ticket: string;
  game: GameKind;
  difficulty: Difficulty;
  zone?: ZoneId;
  hotbar: (SkillId | null)[];
  seed: number;
};
type Outcome = {
  result: RunResult;
  aborted: boolean;
  difficulty: Difficulty;
  zone?: ZoneId;
  reward?: RunReward;
  error?: string;
};

const LS_PICK = "tomb.rpg.pick";

/** 40번: zone = 고른 사냥터 (난이도와 맞아야 한다). 없으면 로비가 열린 사냥터 중 가장 높은 곳을 골라 준다 */
type Pick = { game: GameKind; diff: Difficulty; zone?: ZoneId };

function readPick(): Pick {
  try {
    const v = JSON.parse(localStorage.getItem(LS_PICK) ?? "null") as Pick | null;
    if (v && v.game in GAMES && !LOBBY_HIDDEN.has(v.game) && v.diff in DIFFS) {
      const zone = isZoneId(v.zone) && HUNT_ZONES[v.zone].difficulty === v.diff ? v.zone : undefined;
      return { game: v.game, diff: v.diff, ...(zone ? { zone } : {}) };
    }
  } catch {
    /* 저장소를 못 쓰면 기본값 */
  }
  return { game: "hunt", diff: "easy" };
}

export default function HuntLobby({ onClose, avatar }: { onClose: () => void; avatar?: { color: string; body?: string } }) {
  const [view, setView] = useState<RpgView | null>(null);
  // 장비창 가운데 내 아바타 (게임 속 색·몸 + 지금 입은 꾸미기)
  const { me } = useMe();
  const [savedColor] = useState(() => readItem(LS.color));
  const [openedAt] = useState(() => Date.now());
  const figure = {
    ...resolveAvatar(avatar, me, savedColor),
    look: me ? currentLook(me.equipped, openedAt) : [],
  };
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("start");
  const [pick, setPick] = useState(readPick);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // 사냥 안내서 (로비·멈춤 창 대신 같은 크기 창으로 띄운다)
  const [guide, setGuide] = useState(false);
  const run = useRef<Run | null>(null);
  const phaseRef = useRef<Phase>("lobby");
  phaseRef.current = phase;
  const baseId = useId();
  // 40번: 사냥터를 고른 적이 없으면 지금 레벨로 갈 수 있는 가장 높은 사냥터
  const level = view?.character.level;
  const auto = !pick.zone && level !== undefined ? ([...ZONE_IDS].reverse().find((id) => HUNT_ZONES[id].unlockLevel <= level) ?? ZONES.easy.id) : undefined;
  const cur: Pick = auto ? { ...pick, diff: HUNT_ZONES[auto].difficulty, zone: auto } : pick;

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

  const onCharacter = (a: CharacterAction, ok?: string) =>
    void act(async () => {
      const v = await rpgApi.character(a);
      // 스킬·능력치 초기화는 지갑 포인트를 쓸 수 있다
      if (a.type === "respec" || a.type === "resetStats") void meStore.refresh();
      return v;
    }, ok);

  const onBuy = (id: string, qty: number) =>
    void act(
      async () => {
        const v = await rpgApi.buy(id, qty);
        void meStore.refresh();
        return v;
      },
      `${gearById(id)?.name ?? potionById(id)?.name}${qty > 1 ? ` ${qty}개` : ""}을(를) 샀어요.`,
    );

  const onSell = (id: string, count = 1) => {
    setBusy(true);
    setNotice(null);
    rpgApi
      .sell(id, count)
      .then((v) => {
        setView(v);
        void meStore.refresh();
        const name = gearById(id)?.name ?? potionById(id)?.name ?? id;
        const n = v.sold?.count ?? count;
        const what = `${name}${n > 1 ? ` ${n}개` : ""}`;
        // 한도에 막혀 못 판 것은 가방에 그대로 남는다 (서버가 되돌린다)
        const left = count - n;
        setNotice(
          n <= 0
            ? `오늘 사냥 포인트 한도라 ${name}을(를) 팔지 못했어요. 가방에 그대로 있어요.`
            : v.sold?.capped
              ? `${what}을(를) ${pts(v.sold.value)}에 팔았어요. 오늘 사냥 포인트 한도라 일부만 받았어요${left > 0 ? ` (${left}개는 가방에 그대로)` : ""}.`
              : `${what}을(를) ${pts(v.sold?.value ?? 0)}에 팔았어요.`,
        );
      })
      .catch((e) => setNotice(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  async function start(game = cur.game, difficulty = cur.diff) {
    setPhase("starting");
    setNotice(null);
    try {
      const res = await rpgApi.start(game, difficulty, cur.zone);
      const c = res.view.character;
      setView(res.view);
      run.current = {
        ticket: res.ticket,
        game,
        difficulty,
        ...(res.zone ? { zone: res.zone } : {}),
        hotbar: c.hotbar,
        seed: res.seed,
      };
      setOutcome(null);
      setPhase("playing");
      bridge.emit("rpg:play", {
        game,
        difficulty,
        ...(res.zone ? { zone: res.zone } : {}),
        seed: res.seed,
        timeLimitSec: res.timeLimitSec,
        level: c.level,
        derived: res.view.derived,
        skills: c.skills,
        hotbar: c.hotbar,
        potions: c.potions,
        equip: c.equip,
        // 테스트 서버 운영자 시험 드롭 (판 끝에 우두머리 자리에서 떨어진다)
        ...(res.testDrops?.length ? { testDrops: res.testDrops } : {}),
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
        setOutcome({
          result,
          aborted,
          difficulty: r.difficulty,
          zone: r.zone,
          reward: res.reward,
        });
        void meStore.refresh();
      })
      .catch((e) =>
        setOutcome({
          result,
          aborted,
          difficulty: r.difficulty,
          zone: r.zone,
          error: errorMessage(e),
        }),
      )
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
        {phase === "paused" && guide && <HuntGuide onClose={() => setGuide(false)} />}
        {phase === "paused" && !guide && (
          <Dialog kind="confirm" title="잠깐 멈춤" onClose={resume}>
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
              <button type="button" className={s.linkBtn} onClick={() => setGuide(true)}>
                사냥 안내서 보기
              </button>
            </div>
          </Dialog>
        )}
      </>
    );
  }

  if (phase === "result" && outcome) {
    return (
      <Dialog title={`${GAMES[outcome.result.game].name} 결과`} onClose={() => setPhase("lobby")}>
        <div className={s.resultFill}>
          <ResultView outcome={outcome} view={view} />
          {notice && <p className={s.notice}>{notice}</p>}
          <div className={cx(s.buttons, s.resultDock)}>
            <button type="button" className={cx(ui.button, ui.primary, s.start)} onClick={() => void start(outcome.result.game, cur.diff)}>
              한 판 더
            </button>
            <button type="button" className={ui.button} onClick={() => setPhase("lobby")}>
              로비로
            </button>
            <button type="button" className={cx(ui.button, ui.quiet)} onClick={onClose}>
              월드로 나가기
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  if (guide) return <HuntGuide onClose={() => setGuide(false)} />;

  const c = view?.character;
  return (
    <Dialog title="사냥터" onClose={onClose}>
      <div className={cx(s.lobby, s.lobbyFill)}>
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
              <button type="button" className={cx(ui.button, s.small, s.guideOpen)} onClick={() => setGuide(true)}>
                사냥 안내서
              </button>
            </div>
            <div className={s.expBar} role="meter" aria-label="경험치" aria-valuenow={c.exp} aria-valuemin={0} aria-valuemax={view.expToNext || 1}>
              <span
                style={{
                  width: `${view.expToNext ? Math.min(100, (c.exp / view.expToNext) * 100) : 100}%`,
                }}
              />
            </div>
            {c.treeNotice && tab !== "skills" && (
              <p className={s.meta} role="status">
                스킬 트리가 새로 바뀌어 스킬 포인트를 모두 돌려드렸어요.{" "}
                <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setTab("skills")}>
                  스킬 트리 보기
                </button>
              </p>
            )}
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
            <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={s.tabPanel}>
              {tab === "start" && (
                <StartPanel
                  view={view}
                  game={pick.game}
                  diff={cur.diff}
                  zoneId={cur.zone}
                  onDiff={(diff) => setPick((p) => ({ ...p, diff, zone: undefined }))}
                  onZone={(z) => setPick((p) => ({ ...p, diff: z.difficulty, zone: z.id }))}
                  onStart={() => void start()}
                  busy={phase === "starting"}
                  onGuide={() => setGuide(true)}
                />
              )}
              {tab === "character" && <CharacterPanel view={view} busy={busy} onCharacter={onCharacter} />}
              {tab === "gear" && <GearPanel view={view} busy={busy} onCharacter={onCharacter} onSell={onSell} figure={figure} />}
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
    return r.wavesCleared >= zoneFor(o.difficulty, o.zone).waves ? "모든 웨이브를 막아 냈어요!" : "시간이 다 됐어요";
  }
  if (r.game === "stars") {
    if (o.aborted) return "중간에 나왔어요";
    const all = r.perfect + r.good + r.miss;
    return all > 0 && r.miss === 0 ? "모든 별을 이었어요!" : "밤이 끝났어요";
  }
  return o.aborted ? "중간에 나왔어요" : "시간 끝!";
}

/** 판 기록 칸 (게임마다) */
function runStats(o: Outcome): [string, string][] {
  const r = o.result;
  const time = mmss(r.durationMs);
  if (r.game === "hunt") {
    const kills = Object.values(r.kills).reduce((a, b) => a + (b ?? 0), 0);
    const potions = Object.values(r.potionsUsed).reduce((a, b) => a + b, 0);
    return [
      ["웨이브", `${r.wavesCleared} / ${zoneFor(o.difficulty, o.zone).waves}`],
      ["처치", `${kills}마리`],
      ["걸린 시간", time],
      ["먹은 포션", `${potions}개`],
    ];
  }
  if (r.game === "stars")
    return [
      ["완벽", String(r.perfect)],
      ["좋음", String(r.good)],
      ["놓침", String(r.miss)],
      ["최대 콤보", String(r.maxCombo)],
    ];
  return [
    ["잡은 벌레", String(r.caught)],
    ["황금 벌레", String(r.golden)],
    ["최대 콤보", String(r.maxCombo)],
    ["시간", time],
  ];
}

function ResultView({ outcome, view }: { outcome: Outcome; view: RpgView | null }) {
  const r = outcome.reward;
  const res = outcome.result;
  const zone = res.game === "hunt" ? zoneFor(outcome.difficulty, outcome.zone) : null;
  const kills = res.game === "hunt" ? (Object.entries(res.kills) as [MonsterId, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [];
  const c = view?.character;
  const tone = res.game === "hunt" && res.died ? "lose" : outcome.aborted ? "quit" : "win";
  return (
    <div className={s.resultMain}>
      <header className={s.resultHead} data-tone={tone}>
        <p className={s.resultBig}>{headline(outcome)}</p>
        <p className={s.meta}>
          {zone ? `${zone.name} · ` : ""}
          {DIFFS[outcome.difficulty].name}
        </p>
      </header>
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
              {res.game === "hunt" ? "처치 점수" : "점수"}
            </div>
          </div>
          {r.capped && (
            <p className={ui.hint}>
              오늘 사냥 포인트 한도(또는 하루 전체 한도)에 닿아서 {r.pointsRaw}P 중 {r.points}P만 받았어요.
            </p>
          )}
          {r.levelsGained > 0 && (
            <p className={s.levelUp} role="status">
              레벨 업! Lv.{r.newLevel} · 능력치·스킬 포인트를 받았어요
              <LevelUpSound level={r.newLevel} />
            </p>
          )}
        </>
      ) : null}

      <dl className={s.runStats}>
        {runStats(outcome).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <div className={s.resultCols}>
        <section className={s.resultBox} aria-label="주운 것">
          <h3 className={s.resultBoxTitle}>주운 것</h3>
          {r && r.drops.length > 0 ? (
            <div className={s.drops}>
              {r.drops.map((d, i) => {
                // 11/12 기간제 코디(꾸미기 하루권): 상점 아이템 이름·아이콘, 꾸미기 가방으로 들어간다
                if (d.kind === "cosmetic")
                  return (
                    <span key={i} className={s.drop}>
                      <ItemIcon itemId={d.id} size={32} />
                      <span>{itemName(d.id)}</span>
                      <span className={s.meta}>기간제 코디 · 꾸미기 가방</span>
                    </span>
                  );
                const def = d.kind === "gear" ? gearById(d.id) : potionById(d.id);
                const gear = d.kind === "gear" ? gearById(d.id) : undefined;
                return (
                  <span key={i} className={s.drop} style={gear ? { borderColor: gearGrade(gear).color } : undefined}>
                    {def ? <RpgIcon art={def.art} size={32} /> : <span className={s.slotEmpty} aria-hidden="true" />}
                    <span>
                      {def?.name ?? d.id}
                      {d.qty > 1 && ` ×${d.qty}`}
                    </span>
                    {gear && (
                      <span className={s.meta} style={{ color: gearGrade(gear).color }}>
                        {gearGrade(gear).label} · Lv.{gear.reqLevel}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className={s.meta}>이번 판엔 주운 게 없어요. 많이 잡을수록, 우두머리까지 잡으면 더 잘 나와요.</p>
          )}
          {r && r.lostDrops > 0 && <p className={s.warn}>가방이 가득 차서 {r.lostDrops}개는 못 챙겼어요.</p>}
        </section>
        {kills.length > 0 && (
          <section className={s.resultBox} aria-label="잡은 몬스터">
            <h3 className={s.resultBoxTitle}>잡은 몬스터</h3>
            <ul className={s.killList}>
              {kills.map(([id, n]) => (
                <li key={id}>
                  <span>
                    {MONSTERS[id]?.name ?? id}
                    {zone?.boss === id && <b className={s.bossTag}>우두머리</b>}
                  </span>
                  <span>×{n}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {view && c && (
        <div className={s.resultProgress}>
          <div className={s.barLabel}>
            <span>Lv.{c.level} 경험치</span>
            <span>
              {c.exp.toLocaleString("ko-KR")} / {view.expToNext ? view.expToNext.toLocaleString("ko-KR") : "MAX"}
            </span>
          </div>
          <div className={s.expBar}>
            <span
              style={{
                width: `${view.expToNext ? Math.min(100, (c.exp / view.expToNext) * 100) : 100}%`,
              }}
            />
          </div>
          <HuntCapMeter today={view.today} where="result" />
        </div>
      )}
    </div>
  );
}
