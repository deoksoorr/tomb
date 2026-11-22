"use client";

import { itemName } from "@tomb/protocol";
import { useEffect, useId, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { dexGainText } from "../forage/autoToast";
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
import { rememberRpgView, rpgApi, type CharacterAction } from "@/lib/rpg/client";
import { starLabel } from "@/lib/rpg/endgame";
import type { RpgView, RunReward, RunResult } from "@/lib/rpg/types";
import type { HotAuto } from "@/lib/rpg/hotbar";
import { readItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { equippedPerk } from "@/lib/titles";
import { chairChestChance } from "@/lib/chairPerks";
import { currentLook } from "../account/items";
import { resolveAvatar } from "../account/wardrobe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { mmss, pts } from "./format";
import { gearGrade } from "./gear";
import HuntCapMeter from "./HuntCap";
import HuntGuide from "./HuntGuide";
import { EndgameResult, TranscendBar } from "./Endgame";
import { CharacterPanel, GearPanel, LOBBY_HIDDEN, ShopPanel, SkillPanel, StartPanel } from "./Panels";
import LevelUpSound from "./LevelUpSound";
import RpgIcon from "./RpgIcon";
import { SetDropChip } from "./SetGearBag";
import ItemIcon from "../ui/ItemIcon";
import RunHud from "./RunHud";
import TowerEntrance, { towerBoostAllowed } from "./TowerEntrance";
import s from "./rpg.module.css";
import OverLevelSpot, { OVER_LEVEL_SPOT_MS } from "./OverLevelSpot";
import { HUNT_POINT_T_STOP, huntPointBlock } from "@/lib/rpg/formulas";
import { towerFitFloor, towerPointFrom } from "@/lib/rpg/tower";
import { useRideStopGate } from "../overlay/RideStopDialog";
import { usePageZoomLock } from "@/lib/hooks/usePageZoomLock";

// 사냥터 입구 창 (월드의 사냥터 입구에서 portal:open {kind:"hunt"} → UI가 이 컴포넌트를 띄운다).
// 11/15 mode="tower": 마을의 야근 빌딩 (portal:open {kind:"tower"}) — 첫 탭이 엘리베이터 버튼판(TowerEntrance), 판·결과 흐름은 같다.
// 사냥 레벨 50 전(슈퍼 계정 제외)이면 창을 띄우지 않고 onTaunt(경비원 한마디)만.
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
  /** 11/15 야근 빌딩 시작 층 */
  tower?: number;
};
type Outcome = {
  result: RunResult;
  aborted: boolean;
  difficulty: Difficulty;
  zone?: ZoneId;
  reward?: RunReward;
  error?: string;
  /** 11/15 야근 빌딩 시작 층 ("한 번 더"는 같은 층부터) */
  tower?: number;
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

export default function HuntLobby({
  onClose,
  avatar,
  mode = "hunt",
  onTaunt,
}: {
  onClose: () => void;
  avatar?: { color: string; body?: string };
  mode?: "hunt" | "tower";
  /** 야근 빌딩: 레벨이 모자라 못 들어갈 때 (경비원 한마디) */
  onTaunt?: () => void;
}) {
  const tower = mode === "tower";
  // 11/22 사냥터 창이 떠 있는 동안(판·결과 포함) 연타·두 손가락으로 페이지가 확대되지 않게
  usePageZoomLock();
  const [view, setView] = useState<RpgView | null>(null);
  // 장비창 가운데 내 아바타 (게임 속 색·몸 + 지금 입은 꾸미기)
  const { me } = useMe();
  // 11/16 야근 빌딩 갈래 칭호: 층마다 더하는 제한 시간 (초)
  const towerSec = equippedPerk(me?.equipped).towerSec;
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
  const [overLevel, setOverLevel] = useState<{ until: number; title: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 11/22 탈것에 탄 채 [출발]을 누름 → 사냥 창 대신 가운데 알림 ([내리고 들어가기]는 내린 뒤 같은 값으로 다시 출발)
  const { rideStop, gate } = useRideStopGate(onClose);
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

  // 11/15 야근 빌딩: 사냥 레벨 50 전이면 들어가지 못한다 (경비원 한마디 — 슈퍼 계정은 레벨 50 취급이라 들어간다)
  const turnedAway = tower && !!view && !view.endgame;
  useEffect(() => {
    if (!turnedAway) return;
    onTaunt?.();
    onClose();
  }, [turnedAway]); // eslint-disable-line react-hooks/exhaustive-deps

  // 판이 진행되는 동안(대화상자가 없을 때)도 월드 키 입력을 막아 둔다 → 월드의 내 아바타는 입구에 멈춰 있다
  useBlockingLayer(phase === "playing" || phase === "submitting");

  // 11/20 [내 정보] 사냥 칸이 다시 묻지 않게 마지막 값을 적어 둔다
  const acct = me?.accountId;
  useEffect(() => {
    if (view && acct) rememberRpgView(acct, view);
  }, [view, acct]);

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
      // 11/17 채팅 입력칸의 Esc는 입력칸 닫기 몫 (판을 멈추지 않는다)
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
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
            ? `오늘 받을 포인트를 다 채워서 ${name}을(를) 못 팔았어요. 가방에 그대로 있어요.`
            : v.sold?.capped
              ? `${what}을(를) ${pts(v.sold.value)}에 팔았어요. 오늘 받을 포인트를 다 채워서 일부만 받았어요.${left > 0 ? ` ${left}개는 가방에 남겨 뒀어요.` : ""}`
              : `${what}을(를) ${pts(v.sold?.value ?? 0)}에 팔았어요.`,
        );
      })
      .catch((e) => setNotice(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  async function start(game = cur.game, difficulty = cur.diff, towerFloor?: number, boost = false) {
    // 11/16 오리배·조각배 같은 탈것에 탄 채로는 못 간다 (끝나고 돌아오면 다시 배 위였다). 의자·벤치면 일어나서 간다
    // 11/22 운영자: 창 아래 작은 글씨로는 손님이 잘 몰랐다 → 사냥 창을 닫고 가운데에 알린다 (펫이면 [내리고 들어가기])
    if (gate(tower ? "야근 빌딩에 들어갈" : "사냥터에 들어갈", { label: "내리고 들어가기", run: () => void start(game, difficulty, towerFloor, boost) })) {
      setNotice(null);
      return;
    }
    setPhase("starting");
    setNotice(null);
    try {
      const res = await rpgApi.start(game, difficulty, cur.zone, undefined, towerFloor);
      const tw = res.view.endgame?.tower;
      const c = res.view.character;
      setView(res.view);
      run.current = {
        ticket: res.ticket,
        game,
        difficulty,
        ...(res.zone ? { zone: res.zone } : {}),
        hotbar: c.hotbar,
        seed: res.seed,
        ...(res.tower ? { tower: res.tower } : {}),
      };
      setOutcome(null);
      setPhase("playing");
      // 11/19 적정 레벨을 넘은 사냥터: 판 처음에 확성기처럼 경고 (포인트 없음)
      // 야근 빌딩은 초월 레벨마다 적정 층보다 낮은 곳에서 시작하면
      const runZone = zoneFor(difficulty, res.zone ?? cur.zone);
      const until = Date.now() + OVER_LEVEL_SPOT_MS;
      const from = towerPointFrom(c.tLevel);
      setOverLevel(
        res.tower
          ? res.tower < from
            ? { until, title: `${from}층부터 포인트를 받아요`, text: `${starLabel(c.tLevel)}의 적정 층은 ${towerFitFloor(c.tLevel)}층이에요. ${from - 1}층까지는 초월 경험치와 상자만 받아요.` }
            : null
          : game !== "hunt"
            ? null
            : huntPointBlock(c.level, c.tLevel, difficulty, runZone) === "star"
              ? { until, title: "사냥터에서는 포인트를 받을 수 없어요", text: `${starLabel(HUNT_POINT_T_STOP)}부터는 일반 사냥터에서 포인트를 받지 않고 랭킹과 레이스에도 들어가지 않아요. 야근 빌딩에서 이어 가요.` }
              : huntPointBlock(c.level, c.tLevel, difficulty, runZone) === "level"
                ? { until, title: "이 사냥터에서는 포인트를 받을 수 없어요", text: `내 레벨이 이 사냥터(Lv.${runZone.unlockLevel})보다 10 넘게 높아요. EXP도 조금만 받고 랭킹에도 들어가지 않아요.` }
                : null,
      );
      bridge.emit("rpg:play", {
        game,
        difficulty,
        ...(res.zone ? { zone: res.zone } : {}),
        seed: res.seed,
        timeLimitSec: res.timeLimitSec,
        level: c.level,
        derived: res.view.derived,
        skills: c.skills,
        ...(c.tSkills && Object.keys(c.tSkills).length ? { tSkills: c.tSkills } : {}),
        hotbar: c.hotbar,
        ...(c.hotAuto ? { hotAuto: c.hotAuto } : {}),
        potions: c.potions,
        equip: c.equip,
        // 11/19 이미 발견한 숨겨진 5세트 효과 (처음 켜질 때만 「발견!」)
        ...(c.sgEgg ? { sgEgg: c.sgEgg } : {}),
        // 테스트 서버 운영자 시험 드롭 (판 끝에 우두머리 자리에서 떨어진다)
        ...(res.testDrops?.length ? { testDrops: res.testDrops } : {}),
        // 11/15 야근 빌딩 (층마다 배율·저주 — 오늘 남은 우두머리 상자만큼 상자를 떨군다), 연습 판(드롭 없음)
        ...(res.tower
          ? {
              tower: {
                start: res.tower,
                chestsLeft: !tw ? 0 : tw.chestsMax > 0 ? Math.max(0, tw.chestsMax - tw.chests) : Infinity,
                // 11/15 세트 장비 못 받은 수 (11/19 천장은 없앴다 — 굴림에는 쓰지 않는다)
                pity: res.view.character.sgPity ?? 0,
                // 11/15 테스트 서버 슈퍼 계정만 (서버가 준 superHunter — 운영 서버에서는 늘 없다)
                ...(boost && res.view.superHunter && towerBoostAllowed() ? { boost: true } : {}),
                // 11/16 야근 빌딩 갈래 칭호: 층마다 제한 시간 + (lib/titles towerSec)
                ...(towerSec > 0 ? { bonusSec: towerSec } : {}),
                // 11/24 회장님 독대 헬 1위·2관왕: 상자 세트 장비 20% (서버 정산과 같은 굴림으로 미리 보여 준다)
                ...(res.view.chair ? { sgChance: chairChestChance(res.view.chair) } : {}),
              },
            }
          : {}),
        ...(res.tier === "practice" ? { noDrops: true } : {}),
        // 11/15 테스트 서버 슈퍼 계정 시험 드롭 (서버가 계정으로 정한 값 — 운영 빌드에서는 켜지 않는다)
        ...(res.superDrops && towerBoostAllowed() ? { superDrops: true } : {}),
        // 11/18 드롭 시드는 첫 우두머리가 나올 때쯤 따로 받는다 (판 시작 응답에 없다 — 미리 계산해 다시 시작하지 못하게)
        ...(game === "hunt"
          ? {
              reveal: () =>
                rpgApi
                  .reveal(res.ticket)
                  .then((r) => r.dropSeed)
                  .catch(() => null),
            }
          : {}),
      });
    } catch (e) {
      setNotice(errorMessage(e));
      setPhase(outcome ? "result" : "lobby");
    }
  }

  // 11/15 사냥 중 자동 스킬 바꿈(Shift+숫자·X): 화면 캐릭터는 바로 고치고, 저장은 잠깐 모아서 한 번 (단축 칸 저장과 같은 요청)
  const autoSave = useRef<{ t: ReturnType<typeof setTimeout>; auto: HotAuto } | null>(null);
  const flushAuto = () => {
    const p = autoSave.current;
    if (!p) return;
    clearTimeout(p.t);
    autoSave.current = null;
    rpgApi.character({ type: "hotbar", auto: p.auto }).catch(() => {});
  };
  useBridgeEvent("rpg:auto", (auto) => {
    setView((v) => (v ? { ...v, character: { ...v.character, hotAuto: auto } } : v));
    if (autoSave.current) clearTimeout(autoSave.current.t);
    autoSave.current = { t: setTimeout(flushAuto, 1500), auto };
  });

  // 11/19 숨겨진 5세트 효과 발견: 서버에 저장 (낀 장비로 서버가 확인). 장비 창은 비트만 바로 고친다 — 못 해도 판에는 영향 없다
  useBridgeEvent("rpg:egg", ({ set }) => {
    rpgApi
      .gear({ type: "egg", set })
      .then((res) => setView((v) => (v ? { ...v, character: { ...v.character, sgEgg: res.character.sgEgg } } : v)))
      .catch(() => {});
  });

  useBridgeEvent("rpg:ended", ({ result, aborted }) => {
    flushAuto();
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
          tower: r.tower,
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
          tower: r.tower,
        }),
      )
      .finally(() => setPhase("result"));
  });

  // ── 그리기 ──

  if (phase === "playing" || phase === "paused" || phase === "submitting") {
    const r = run.current;
    return (
      <>
        {r && (
          <RunHud
            game={r.game}
            hotbar={r.hotbar}
            onPause={pause}
            {...(r.tower ? { title: "야근 빌딩" } : r.game === "hunt" ? { place: zoneFor(r.difficulty, r.zone).name } : {})}
          />
        )}
        {overLevel && phase === "playing" && <OverLevelSpot until={overLevel.until} title={overLevel.title} text={overLevel.text} />}
        {phase === "submitting" && (
          <div className={s.submitting} role="status">
            결과를 정리하는 중…
          </div>
        )}
        {phase === "paused" && guide && <HuntGuide onClose={() => setGuide(false)} />}
        {phase === "paused" && !guide && (
          <Dialog kind="confirm" title="잠깐 멈춤" onClose={resume}>
            <div className={s.result}>
              <p>
                {run.current?.tower
                  ? "멈춘 동안은 시간이 흐르지 않아요. 지금 나가면 깬 층까지 기록돼요."
                  : "멈춘 동안은 시간이 흐르지 않아요. 2분 넘게 멈춰 있으면 보상을 못 받아요."}
              </p>
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

  if (rideStop) return rideStop;

  if (phase === "result" && outcome) {
    return (
      // 11/21 운영자: 결과 창은 내용만큼만 (주운 게 적으면 짧게) — 데스크톱·폰 모두 fitHeight + huntResult
      <Dialog className={s.huntResult} fitHeight title={outcome.tower ? "야근 빌딩 결과" : `${GAMES[outcome.result.game].name} 결과`} onClose={() => setPhase("lobby")}>
        <div className={s.resultFill}>
          <ResultView outcome={outcome} view={view} />
          {notice && <p className={s.notice}>{notice}</p>}
          <div className={cx(s.buttons, s.resultDock)}>
            <button
              type="button"
              className={cx(ui.button, ui.primary, s.start)}
              onClick={() => void (outcome.tower ? start("hunt", "hell", outcome.tower) : start(outcome.result.game, cur.diff))}
            >
              {outcome.tower ? `${outcome.tower}층부터 다시 오르기` : "한 판 더"}
            </button>
            <button type="button" className={ui.button} onClick={() => setPhase("lobby")}>
              {tower ? "엘리베이터로" : "로비로"}
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
  // 야근 빌딩: 캐릭터를 읽기 전엔 창을 띄우지 않는다 (레벨이 모자라면 경비원 한마디만 — 아래 효과)
  if (tower && !loadError && !view?.endgame) return null;
  return (
    <Dialog className={s.huntDialog} title={tower ? "야근 빌딩" : "사냥터"} onClose={onClose}>
      <div className={cx(s.lobby, s.lobbyFill)}>
        {view && c ? (
          <>
            <div className={s.summary}>
              <span>
                Lv.<strong>{c.level}</strong>
                {view.endgame && c.tLevel > 0 && <strong className={s.points}> {starLabel(c.tLevel)}</strong>}
              </span>
              {view.endgame ? (
                <span>
                  초월 EXP <strong>{c.tExp.toLocaleString("ko-KR")}</strong>
                  {view.endgame.tExpToNext > 0 && ` / ${view.endgame.tExpToNext.toLocaleString("ko-KR")}`}
                </span>
              ) : (
                <span>
                  EXP <strong>{c.exp.toLocaleString("ko-KR")}</strong>
                  {view.expToNext > 0 && ` / ${view.expToNext.toLocaleString("ko-KR")}`}
                </span>
              )}
              <span>
                포인트 <strong className={s.points}>{pts(view.points)}</strong>
              </span>
              {/* 11/19 사냥 포인트 하루 한도가 없어져(cap = NO_LIMIT) 한도가 있을 때만 보인다 */}
              {view.today.cap < 1_000_000_000 && (
                <span>
                  오늘 사냥 <strong>{view.today.huntPoints}</strong> / {view.today.cap}P
                </span>
              )}
              <button type="button" className={cx(ui.button, s.small, s.guideOpen)} onClick={() => setGuide(true)}>
                사냥 안내서
              </button>
            </div>
            {view.endgame ? (
              <div className={cx(s.expBar, s.tBar)} role="meter" aria-label="초월 경험치" aria-valuenow={c.tExp} aria-valuemin={0} aria-valuemax={view.endgame.tExpToNext || 1}>
                <span style={{ width: `${view.endgame.tExpToNext ? Math.min(100, (c.tExp / view.endgame.tExpToNext) * 100) : 100}%` }} />
              </div>
            ) : (
              <div className={s.expBar} role="meter" aria-label="경험치" aria-valuenow={c.exp} aria-valuemin={0} aria-valuemax={view.expToNext || 1}>
                <span
                  style={{
                    width: `${view.expToNext ? Math.min(100, (c.exp / view.expToNext) * 100) : 100}%`,
                  }}
                />
              </div>
            )}
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
                  {tower && k === "start" ? "엘리베이터" : label}
                  {k === "character" && c.statPoints > 0 && <span className={s.dot}>{c.statPoints}</span>}
                  {k === "skills" && c.skillPoints > 0 && <span className={s.dot}>{c.skillPoints}</span>}
                </button>
              ))}
            </div>
            <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={s.tabPanel} data-tab={tab}>
              {tab === "start" && tower && view.endgame && <TowerEntrance view={view} busy={phase === "starting"} onStart={(f, boost) => void start("hunt", "hell", f, boost)} />}
              {tab === "start" && !tower && (
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
              {tab === "gear" && <GearPanel view={view} busy={busy} onCharacter={onCharacter} onSell={onSell} onView={setView} figure={figure} />}
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
  if (r.game === "hunt" && o.tower) {
    const fl = r.floors ?? 0;
    const at = o.tower + fl;
    if (r.died) return `${at}층에서 쓰러졌어요…`;
    if (o.aborted || r.quit) return fl > 0 ? `${at - 1}층까지 오르고 퇴근했어요` : "엘리베이터에서 내렸어요";
    return `${at}층에서 시간이 다 됐어요`;
  }
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
  if (r.game === "hunt" && o.tower) {
    const kills = Object.values(r.kills).reduce((a, b) => a + (b ?? 0), 0);
    const fl = r.floors ?? 0;
    return [
      ["깬 층", `${fl}층 (${o.tower}층부터)`],
      ["처치", `${kills}마리`],
      ["걸린 시간", time],
      ["최고 층", fl > 0 ? `${o.tower + fl - 1}층` : "-"],
    ];
  }
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
  const zone = res.game === "hunt" && !outcome.tower ? zoneFor(outcome.difficulty, outcome.zone) : null;
  const kills = res.game === "hunt" ? (Object.entries(res.kills) as [MonsterId, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [];
  const c = view?.character;
  const tone = res.game === "hunt" && res.died ? "lose" : outcome.aborted ? "quit" : "win";
  return (
    <div className={s.resultMain}>
      <header className={s.resultHead} data-tone={tone}>
        <p className={s.resultBig}>{headline(outcome)}</p>
        <p className={s.meta}>
          {outcome.tower ? `야근 빌딩 · ${outcome.tower}층부터` : `${zone ? `${zone.name} · ` : ""}${DIFFS[outcome.difficulty].name}`}
        </p>
      </header>
      {outcome.error ? (
        <p className={ui.error} role="alert">
          {/* 11/15 야근 빌딩: 쓰러짐 제목에 묻혀 거절을 못 알아챘다 → 기록이 안 남았다는 걸 먼저 분명히 */}
          {outcome.tower && <strong>이번 판은 기록이 저장되지 않았어요 (최고 층·초월 EXP·상자 없음). </strong>}
          {outcome.error}
        </p>
      ) : r ? (
        <>
          <div className={s.rewards}>
            {/* 11/15 레벨 50 지옥·야근 빌딩: 판 EXP 대신 받은 초월 EXP */}
            <div>
              <strong>+{(r.transcend ? r.transcend.exp : r.exp).toLocaleString("ko-KR")}</strong>
              {r.transcend ? "초월 EXP" : "EXP"}
              {/* 11/16 사냥 갈래 칭호로 더 받은 몫 */}
              {!r.transcend && r.titleExp ? <small> (칭호 +{r.titleExp.toLocaleString("ko-KR")})</small> : null}
              {/* 11/17 사냥왕(지난주 1위) 혜택으로 더 받은 몫 (초월 판·야근 빌딩은 초월 EXP 몫) */}
              {/* 11/24 회장님 독대 헬 1위·2관왕 몫이면 그 칭호 이름 (사냥왕과 겹치면 큰 쪽 하나 — 서버 champBy) */}
              {r.champExp ? (
                <small>
                  {" "}
                  ({r.champBy ?? "사냥왕"} +{r.champExp.toLocaleString("ko-KR")})
                </small>
              ) : null}
            </div>
            <div>
              <strong>+{r.points}</strong>포인트
            </div>
            <div>
              <strong>{r.score.toLocaleString("ko-KR")}</strong>
              {res.game === "hunt" ? "처치 점수" : "점수"}
            </div>
          </div>
          {r.overLevel && (
            <p className={s.warn}>
              {r.overLevel === "star"
                ? `${starLabel(HUNT_POINT_T_STOP)}부터는 사냥터에서 포인트를 받지 않아요. 포인트는 야근 빌딩에서 받아요.`
                : "적정 레벨보다 낮은 사냥터라 포인트는 받지 않았어요. 내 레벨에 맞는 사냥터에서 포인트를 받아요."}
            </p>
          )}
          {r.lowFloors && (
            <p className={s.warn}>
              적정 층보다 낮은 {r.lowFloors.floors}층은 포인트 없이 초월 경험치와 상자만 받았어요. {r.lowFloors.from}층부터 포인트를 받아요.
            </p>
          )}
          {r.capped && !r.overLevel && (
            <p className={ui.hint}>
              오늘 받을 포인트를 다 채워서 {r.pointsRaw}P 중 {r.points}P만 받았어요.
            </p>
          )}
          <EndgameResult reward={r} />
          {r.levelsGained > 0 && (
            <p className={s.levelUp} role="status">
              레벨 업! Lv.{r.newLevel}. 능력치 포인트와 스킬 포인트를 받았어요.
              <LevelUpSound level={r.newLevel} />
            </p>
          )}
          {/* 11/16 몬스터 도감에 처음 등록한 몬스터 (받아들인 판만) */}
          {r.newMobs && r.newMobs.length > 0 && (
            <p className={ui.hint} role="status">
              새 몬스터 {r.newMobs.length}종을 도감에 올렸어요 ({r.newMobs.map((id) => MONSTERS[id as MonsterId]?.name ?? id).join(", ")}).{" "}
              {dexGainText(r.dexReward)}
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
                // 11/15 세트 장비·강화 재료
                if (d.kind === "set" || d.kind === "mat") return <SetDropChip key={i} d={d} />;
                // 11/12 기간제 코디(꾸미기 하루권): 상점 아이템 이름·아이콘, 꾸미기 가방으로 들어간다
                if (d.kind === "cosmetic")
                  return (
                    <span key={i} className={s.drop}>
                      <ItemIcon itemId={d.id} size={32} />
                      <span>
                        {itemName(d.id)}
                        {d.days ? ` · ${d.days}일` : ""}
                      </span>
                      <span className={s.meta}>{d.days ? "꾸미기 이용권 (꾸미기 가방)" : "기간제 코디 (꾸미기 가방)"}</span>
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
            <p className={s.meta}>{outcome.tower ? "주운 것이 없어요. 5층마다 우두머리를 잡으면 상자가 열려요." : "주운 것이 없어요"}</p>
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

      {view && c && view.endgame && (
        <div className={s.resultProgress}>
          <TranscendBar tLevel={c.tLevel} tExp={c.tExp} eg={view.endgame} />
          <HuntCapMeter today={view.today} where="result" />
        </div>
      )}
      {view && c && !view.endgame && (
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
