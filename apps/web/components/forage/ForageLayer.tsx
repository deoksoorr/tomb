"use client";

import { useEffect, useRef, useState } from "react";
import { bridge, type ForageUse } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { gatherNodeById, NODE_LABEL, RARITY_LABEL, speciesById, type NpcId } from "@/lib/forage/catalog";
import { forageApi, type DexPeer } from "@/lib/forage/client";
import { BUG_DIFFICULTY } from "@/lib/forage/rules";
import type { CatchResult } from "@/lib/forage/types";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { showToast } from "@/lib/hooks/useToasts";
import { derive } from "@/lib/rpg/formulas";
import type { RpgPlay, RunResult } from "@/lib/rpg/types";
import RunHud from "../rpg/RunHud";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import DexDialog from "./DexDialog";
import FishingPanel from "./FishingPanel";
import { forageStore } from "./forageStore";
import NpcShop from "./NpcShop";
import s from "./forage.module.css";

// 4·32·51번 낚시·채집·판매·도감 UI의 뿌리 (GameShell이 게임이 뜨면 붙인다).
// 게임(game/world/forage)이 forage:use로 "낚시 자리에 앉음 / NPC 앞 / 채집 지점"을 알려 주면 해당 창을 연다.
//  - 낚시: FishingPanel (서버 티켓으로 던지고 감는다)
//  - 채집: 게이지 (머리 위 막대는 게임이 그린다) → 서버가 시간을 확인하고 가방·도감에 넣는다
//  - 곤충 수풀: 옛 사냥터 "벌레 잡기"를 마을 수풀 그림으로 (rpg:play theme meadow) → 결과를 서버가 시드로 검사
//  - NPC: 판매 창 / 도감: forage:dex (HUD 버튼·메뉴·가방)

type Gather = { ticket: string; node: string; kind: string; endsAt: number; ms: number };
type Insect = { ticket: string; node: string; seed: number };
type Card = { item: CatchResult; more: number };

const NEUTRAL = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
const NO_EQUIP = { weapon: null, armor: null, head: null, acc1: null, acc2: null };

/** 곤충 미니게임 판 (능력치 영향 없음 — 서버 BUG_STATS와 같다) */
function insectPlay(seed: number, timeLimitSec: number, night: boolean): RpgPlay {
  return {
    game: "bugs",
    difficulty: BUG_DIFFICULTY,
    seed,
    timeLimitSec,
    level: 1,
    derived: derive(1, NEUTRAL, NO_EQUIP),
    skills: {},
    hotbar: [],
    potions: {},
    equip: NO_EQUIP,
    theme: "meadow",
    night,
  };
}

export default function ForageLayer() {
  const [fishing, setFishing] = useState<{ spot: string; water: "lake" | "river" } | null>(null);
  const [npc, setNpc] = useState<NpcId | null>(null);
  const [dex, setDex] = useState<{ accountId?: string; peer?: DexPeer; name?: string | null } | null>(null);
  const [gather, setGather] = useState<Gather | null>(null);
  const [insect, setInsect] = useState<Insect | null>(null);
  const [paused, setPaused] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  // 처음: 내 가방·도감·피어 있는 지점
  useEffect(() => {
    void forageStore.refresh();
    return () => forageStore.stop();
  }, []);

  function showCard(items: CatchResult[]) {
    if (!items.length) return;
    // 새로 등록·기록 경신을 앞에
    const sorted = [...items].sort((a, b) => Number(b.isNew) - Number(a.isNew) || Number(b.record) - Number(a.record));
    if (cardTimer.current) clearTimeout(cardTimer.current);
    setCard({ item: sorted[0], more: items.length - 1 });
    cardTimer.current = setTimeout(() => setCard(null), 3_200);
  }

  async function startGather(node: string) {
    if (busy.current || gather || insect) return;
    busy.current = true;
    try {
      const r = await forageApi.gatherStart(node);
      if (r.mode === "gauge") {
        setGather({ ticket: r.ticket, node, kind: r.kind, ms: r.durationMs, endsAt: performance.now() + r.durationMs + 80 });
        bridge.emit("forage:gauge", { phase: "start", ms: r.durationMs, kind: r.kind, node });
      } else {
        setInsect({ ticket: r.ticket, node, seed: r.seed });
        setPaused(false);
        bridge.emit("rpg:play", insectPlay(r.seed, r.timeLimitSec, r.night));
      }
    } catch (e) {
      showToast(errorMessage(e));
      // 이미 캤거나 비어 있으면 지점 목록을 새로
      void forageStore.refresh();
    } finally {
      busy.current = false;
    }
  }

  useBridgeEvent("forage:use", (u: ForageUse) => {
    if (u.kind === "fish") {
      setNpc(null);
      setFishing({ spot: u.spot, water: u.water });
    } else if (u.kind === "npc") setNpc(u.npc);
    else void startGather(u.node);
  });
  useBridgeEvent("forage:left", () => setFishing(null));
  useBridgeEvent("forage:dex", (d) => setDex(d));

  // 게이지가 다 차면 서버에 낸다
  useEffect(() => {
    if (!gather) return;
    const t = setTimeout(() => {
      forageApi
        .gatherFinish(gather.ticket)
        .then((r) => {
          forageStore.set(r.state);
          bridge.emit("forage:gauge", { phase: "end", ok: true, node: gather.node });
          for (const it of r.items.slice(0, 3)) bridge.emit("forage:pop", { itemId: it.id });
          showCard(r.items);
        })
        .catch((e) => {
          bridge.emit("forage:gauge", { phase: "end", ok: false, node: gather.node });
          showToast(errorMessage(e));
        })
        .finally(() => setGather(null));
    }, Math.max(0, gather.endsAt - performance.now()));
    return () => clearTimeout(t);
  }, [gather]);

  function cancelGather() {
    if (!gather) return;
    bridge.emit("forage:gauge", { phase: "end", ok: false, node: gather.node });
    setGather(null);
  }

  // 곤충 미니게임이 끝나면 결과를 낸다
  useBridgeEvent("rpg:ended", ({ result }: { result: RunResult; aborted: boolean }) => {
    const run = insect;
    if (!run || result.game !== "bugs") return;
    setInsect(null);
    setPaused(false);
    forageApi
      .gatherFinish(run.ticket, result)
      .then((r) => {
        forageStore.set(r.state);
        for (const it of r.items.slice(0, 3)) bridge.emit("forage:pop", { itemId: it.id });
        if (r.items.length) showCard(r.items);
        else showToast(r.message ?? "곤충이 모두 날아갔어요.");
      })
      .catch((e) => {
        showToast(errorMessage(e));
        void forageStore.refresh();
      });
  });

  return (
    <>
      {fishing && (
        <FishingPanel
          key={fishing.spot}
          spot={fishing.spot}
          water={fishing.water}
          onCatch={(r) => showCard([r])}
          onLeave={() => bridge.emit("forage:leave")}
        />
      )}
      {gather && <GatherDock gather={gather} onCancel={cancelGather} />}
      {insect && (
        <>
          <RunHud
            game="bugs"
            hotbar={[]}
            title="곤충 채집"
            onPause={() => {
              bridge.emit("rpg:pause", { paused: true });
              setPaused(true);
            }}
          />
          {paused && (
            <Dialog kind="confirm"
              title="잠깐 멈춤"
              onClose={() => {
                bridge.emit("rpg:pause", { paused: false });
                setPaused(false);
              }}
            >
              <p className={ui.hint}>다섯 마리를 잡을 때마다 한 마리씩 가방에 챙겨요(최대 3), 금빛 곤충은 희귀종이에요. 벌과 낙엽은 건드리지 마세요.</p>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className={cx(ui.button, ui.primary)}
                  onClick={() => {
                    bridge.emit("rpg:pause", { paused: false });
                    setPaused(false);
                  }}
                >
                  계속하기
                </button>
                <button
                  type="button"
                  className={cx(ui.button, ui.danger)}
                  onClick={() => {
                    bridge.emit("rpg:pause", { paused: false });
                    setPaused(false);
                    bridge.emit("rpg:quit");
                  }}
                >
                  그만하기
                </button>
              </div>
            </Dialog>
          )}
        </>
      )}
      {card && <CatchCard card={card} />}
      {npc && <NpcShop npcId={npc} onClose={() => setNpc(null)} />}
      {dex && <DexDialog accountId={dex.accountId} peer={dex.peer} name={dex.name} onClose={() => setDex(null)} />}
    </>
  );
}

function GatherDock({ gather, onCancel }: { gather: Gather; onCancel: () => void }) {
  useBlockingLayer(true);
  const [k, setK] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = gather.endsAt - gather.ms - 80;
    const tick = () => {
      setK(Math.min(1, (performance.now() - start) / gather.ms));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [gather, onCancel]);
  const n = gatherNodeById(gather.node);
  const verb = n?.kind === "ore" ? "광석 캐는 중…" : n?.kind === "dig" ? "땅 파는 중…" : "약초 캐는 중…";
  return (
    <div className={s.dock} role="region" aria-label={n ? NODE_LABEL[n.kind] : "채집"}>
      <p className={s.status} role="status">
        {verb}
      </p>
      <div className={s.track} data-kind="gauge" role="meter" aria-label="채집 진행" aria-valuenow={Math.round(k * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${k * 100}%` }} />
      </div>
      <div className={s.actions}>
        <button type="button" className={cx(ui.button, ui.quiet)} style={{ flex: 1 }} onClick={onCancel}>
          그만두기 (Esc)
        </button>
      </div>
    </div>
  );
}

function CatchCard({ card }: { card: Card }) {
  const { item, more } = card;
  const sp = speciesById(item.id);
  if (!sp) return null;
  return (
    <div className={s.catchCard} role="status" aria-live="polite">
      <ItemIcon itemId={sp.id} size={48} />
      <div className={s.catchMeta}>
        <strong>
          {sp.name}
          {item.size > 0 && ` ${(item.size / 10).toFixed(1)}cm`}
        </strong>
        <span className={s.stars}>
          {"★".repeat(sp.rarity)}
          {"☆".repeat(5 - sp.rarity)} {RARITY_LABEL[sp.rarity]} · {sp.price}P
        </span>
        {item.isNew && <span className={s.badgeNew}>도감에 새로 등록!</span>}
        {item.record && <span className={s.badgeNew}>가장 큰 기록을 새로 세웠어요!</span>}
        {!item.kept && <span>가방 칸이 가득 차서 놓아줬어요 (도감에는 남아요)</span>}
        {more > 0 && <span>외 {more}개</span>}
      </div>
    </div>
  );
}
