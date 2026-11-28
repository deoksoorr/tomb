"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { CAMP_RAFTS, DIR, itemById, RAFT_DAILY_MIN, RAFT_GEAR, RAFT_GEAR_TIER_DAYS, RAFT_GEAR_TIER_NAME, RAFT_SET_IDS, RAFT_PRICE, RAFT_REBUY_WAIT_MS, RAFT_RENEW_MAX, RAFT_RENEW_WINDOW_MS, RAFT_SET_NAME, RAFT_SLOT_NAME, RAFT_TICKET_MIN, raftHm, type RaftGearId, type RaftGearTier } from "@tomb/protocol";
import { avatarColorSpec } from "@/game/sprites/avatar";
import { bridge } from "@/game/bridge";
import { errorMessage, request } from "@/lib/api";
import { useBridgeEvent, useBridgeValue } from "@/lib/hooks/useBridge";
import type { MapConcept } from "@/lib/mapConcept";
import { currentMapConcept } from "@/lib/mapConceptClient";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { meStore, useMe } from "@/lib/hooks/useMe";
import type { RaftDealResponse, RaftSlot, RaftStatusResponse } from "@/lib/raft/types";
import { resolveAvatar } from "../account/wardrobe";
import { fittingLook } from "../shop/fitting";
import { OutfitCanvas, useOutfitView, ViewControls } from "../shop/OutfitPreview";
import shop from "../shop/ShopDialog.module.css";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import { InfoCard } from "../ui/InfoBlocks";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import s from "./RaftBooth.module.css";
import { raftThumbCanvas } from "./raftThumb";

// 11/27 좌대 매표소 창 (부스 창구의 매표소 직원에게 E — game/camp/CampRafts가 camp:raft:open).
// [입장권] 좌대 여섯 (빈 좌대 · 사용 중 · 내 좌대) + 사기 · [좌대 한정 획득 코디] 좌대 전용 코디 일곱 점을 입혀 돌려 보고 염색 색도 미리 본다 (영구 넷은 한 벌로도)
// 11/27 운영자: PC는 가로로 넓은 창 (왼쪽 입장권 · 오른쪽 코디, 탭 없이 한눈에), 폰은 탭으로 나눠 위아래. 확률은 이 창 어디에도 보여 주지 않는다 (서버 값 RAFT_GEAR_ODDS는 그대로)
// 11/27 운영자 「다른 곳 다 차 있는데 구매 불가가 안 뜬다」: 못 사는 좌대 카드는 모두 「구매 불가」 + 짧은 까닭, 여섯이 다 찼으면 목록 위에 한 줄
// 11/28 운영자 「박스 사이즈에 비해서 너무 빈약한데??」: 카드마다 좌대 그림(맵 그림 코드 그대로 — ./raftThumb) · 상태 배지 · 가는 길, 카드는 제 높이만 쓰고
// 남는 높이는 「이용 안내」 칸이 채운다 (PC 두 칸 아래 끝이 맞게)
// 사면 웹이 증서를 주고 → 장면이 실시간 서버에 보내 마루가 열린다 (camp:raft:grant).

type Tab = "ticket" | "gear";
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
/** 남은 시간 「1시간 42분」 */
function leftText(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`;
}
/** 분 → 「2시간」·「1시간 12분」·「40분」 */
const minText = (min: number) => leftText(min * 60_000);

export default function RaftBooth({ avatar }: { avatar?: { color: string; body?: string } }) {
  const [open, setOpen] = useState(false);
  useBridgeEvent("camp:raft:open", () => setOpen(true));
  if (!open) return null;
  return <BoothDialog avatar={avatar} onClose={() => setOpen(false)} />;
}

function BoothDialog({ avatar, onClose }: { avatar?: { color: string; body?: string }; onClose: () => void }) {
  const { me } = useMe();
  const baseId = useId();
  const [tab, setTab] = useState<Tab>("ticket");
  const [st, setSt] = useState<RaftStatusResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const ch = bridge.last("net:status")?.channel ?? null;
  // 맵과 같은 판 (?concept= 시험 값이 먼저 — 캠핑장 장면과 같은 규칙). bridge 값이 바뀌면 다시 그린다
  useBridgeValue("map:concept");
  const concept = currentMapConcept();
  const apply = useCallback((x: RaftStatusResponse) => {
    setSt(x);
    setOffset(x.now - Date.now());
    bridge.emit("camp:raft:status", x);
  }, []);
  useEffect(() => {
    void meStore.refresh();
    if (ch === null) return;
    request<RaftStatusResponse>(`/api/camp/raft?ch=${ch}`, { cache: "no-store" }).then(apply, (e) => setError(errorMessage(e)));
  }, [ch, apply]);
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const now = clock + offset;

  async function buy(n: number) {
    if (ch === null) return;
    setPending(n);
    setError(null);
    setDone(null);
    try {
      const r = await request<RaftDealResponse>("/api/camp/raft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "buy", ch, n }) });
      meStore.set(r.me);
      apply(r.status);
      bridge.emit("camp:raft:grant", { grant: r.grant, status: r.status });
      setDone(`${n}번 좌대 입장권을 샀어요. ${minText(r.min)} 동안 혼자 써요.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const mine = st?.mine ?? null;
  const mineHere = mine && st && mine.ch === st.ch ? mine : null;
  const blocked = !st ? "불러오는 중이에요." : mine ? null : st.dayLeftMin <= 0 ? "오늘 좌대 시간을 다 썼어요. 내일 다시 와요." : st.rebuyAt ? `좌대에서 내려온 지 얼마 안 됐어요. ${hhmm(st.rebuyAt - offset)}부터 다시 살 수 있어요.` : null;
  const short = st && st.buyMin > 0 && st.buyMin < RAFT_TICKET_MIN;
  const slots = st?.slots ?? [1, 2, 3, 4, 5, 6].map((n): RaftSlot => ({ n, state: "free" }));
  /** 빈 좌대를 지금 못 사는 짧은 까닭 (살 수 있으면 null) */
  const cantBuy: string | null = !st
    ? "불러오는 중"
    : mine
      ? "입장권이 이미 있어요"
      : st.dayLeftMin <= 0
        ? "오늘 좌대 시간을 다 썼어요"
        : st.rebuyAt
          ? `${hhmm(st.rebuyAt - offset)}부터 살 수 있어요`
          : me && me.points < st.buyPrice
            ? "포인트가 모자라요"
            : null;
  // 여섯이 다 찼다 (내 것 빼고): 가장 빨리 비는 좌대를 알려 준다
  const taken = st ? slots.filter((x) => x.state === "used") : [];
  const full = !!st && slots.every((x) => x.state !== "free");
  const soonest = taken.reduce<RaftSlot | null>((a, b) => (!a || (b.until ?? 0) < (a.until ?? 0) ? b : a), null);
  // PC(넓은 창): 두 칸을 나란히 · 폰: 탭
  const wide = useMediaQuery("(min-width: 561px)");
  const ticket = (
    <>
      {mine && !mineHere && (
        <p className={s.mine}>
          {mine.ch}채널 {mine.n}번 좌대 입장권이 있어요 · {leftText(mine.until - now)} 남음
        </p>
      )}
      {full && (
        <p className={s.full} role="status">
          {mineHere
            ? "다른 좌대는 모두 사용 중이에요."
            : mine
              ? "이 채널 좌대는 모두 사용 중이에요."
              : `지금 이 채널 좌대 여섯이 모두 사용 중이라 구매할 수 없어요.${soonest?.until ? ` 가장 빨리 비는 건 ${soonest.n}번 (${hhmm(soonest.until - offset)})이에요.` : ""}`}
          {/* 다 찼는데 다시 살 수 있는 때 전·오늘 시간 다 씀이면 같은 칸에 짧은 까닭 한 줄 (PC 1280×800 스크롤 없이) */}
          {blocked && cantBuy && <span className={s.fullWhy}>{cantBuy}</span>}
        </p>
      )}
      {blocked && !full && <p className={s.notice}>{blocked}</p>}
      {done && (
        <p className={s.done} role="status">
          {done}
        </p>
      )}
      <ul className={s.grid}>
        {slots.map((x) => {
          const walk = CAMP_RAFTS.find((r) => r.n === x.n)?.link ?? x.n <= 3;
          return (
            <li key={x.n} className={cx(s.card, x.state === "mine" && s.cardMine, x.state === "used" && s.cardUsed)} aria-label={`${x.n}번 좌대`}>
              <RaftThumb n={x.n} concept={concept} />
              <span className={s.cardHead}>
                <span className={s.num}>{x.n}번</span>
                <span className={s.badge} data-state={x.state}>
                  <span className={s.dot} aria-hidden="true" />
                  {x.state === "free" ? "빈 좌대" : x.state === "mine" ? "내 좌대" : "사용 중"}
                </span>
              </span>
              <span className={s.sub}>
                {x.state === "free" ? (
                  cantBuy ? "비어 있어요" : "바로 쓸 수 있어요"
                ) : x.state === "mine" ? (
                  `${leftText((x.until ?? 0) - now)} 남음`
                ) : (
                  <>
                    {hhmm((x.until ?? 0) - offset)}까지
                    {x.name && <span className={s.who}>{x.name}</span>}
                  </>
                )}
              </span>
              <span className={s.where}>
                <AccessIcon walk={walk} />
                {walk ? "잔교 다리로 걸어서" : "헤엄쳐 가서 사다리"}
              </span>
              <span className={s.act}>
                {x.state === "free" ? (
                  cantBuy ? (
                    <>
                      <button type="button" className={cx(ui.button, s.buy, s.noBuy)} disabled aria-describedby={`${baseId}-why-${x.n}`}>
                        구매 불가
                      </button>
                      <span id={`${baseId}-why-${x.n}`} className={s.why}>
                        {cantBuy}
                      </span>
                    </>
                  ) : (
                    <button type="button" className={cx(ui.button, ui.primary, s.buy)} disabled={pending !== null} onClick={() => void buy(x.n)}>
                      {pending === x.n ? "사는 중…" : `${st!.buyPrice}P 구매`}
                    </button>
                  )
                ) : x.state === "mine" ? (
                  <span className={s.using}>{mineHere && mineHere.n === x.n ? `이용 중 · 연장 ${mineHere.renewLeft}번` : "이용 중"}</span>
                ) : (
                  <button type="button" className={cx(ui.button, s.buy, s.noBuy)} disabled>
                    구매 불가
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <InfoCard title="이용 안내" icon="info" className={s.guide}>
        {short && (
          <p className={s.short}>
            오늘 남은 좌대 시간이 짧아 지금 사면 {minText(st!.buyMin)}만 써요 ({st!.buyPrice}P).
          </p>
        )}
        <ul className={s.tips}>
          <li>
            입장권 <b>{minText(RAFT_TICKET_MIN)}</b> · <b>{RAFT_PRICE}P</b>
          </li>
          <li>
            내 좌대 자동 낚시 <b>속도 2배</b>
          </li>
          <li>
            좌대는 <b>자동 낚시만</b>
          </li>
          <li>
            하루 <b>{minText(RAFT_DAILY_MIN)}</b>까지
          </li>
          <li>
            끝나기 {RAFT_RENEW_WINDOW_MS / 60_000}분 전 <b>{RAFT_RENEW_MAX === 1 ? "한 번" : `${RAFT_RENEW_MAX}번까지`} 연장</b>
          </li>
          <li>
            연장 없이 끝나면 <b>{RAFT_REBUY_WAIT_MS / 60_000}분 뒤</b> 다시 구매
          </li>
          <li>잔교·둑은 입장권 없이 낚시</li>
        </ul>
      </InfoCard>
      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}
    </>
  );

  return (
    <Dialog title="좌대 매표소" onClose={onClose} fitHeight className={s.dialog}>
      <div className={s.wrap}>
        <div className={s.top}>
          <p className={s.balance}>
            내 포인트 <strong>{me ? me.points.toLocaleString("ko-KR") : "–"}P</strong>
          </p>
          <p className={s.balance}>
            오늘 남은 좌대 시간 <strong>{st ? raftHm(st.dayLeftMin) : "–"}</strong>
          </p>
        </div>
        {wide ? (
          <div className={s.cols}>
            <section className={s.col} aria-labelledby={`${baseId}-h-ticket`}>
              <h3 id={`${baseId}-h-ticket`} className={s.colHead}>
                입장권
              </h3>
              {ticket}
            </section>
            <section className={cx(s.col, s.colGear)} aria-labelledby={`${baseId}-h-gear`}>
              <h3 id={`${baseId}-h-gear`} className={s.colHead}>
                좌대 한정 획득 코디
              </h3>
              <GearPreview avatar={avatar} wide />
            </section>
          </div>
        ) : (
          <>
            <div className={shop.tabs} role="tablist" aria-label="매표소 칸">
              {(
                [
                  ["ticket", "입장권"],
                  ["gear", "좌대 한정 획득 코디"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" role="tab" id={`${baseId}-${id}`} aria-selected={tab === id} aria-controls={`${baseId}-panel`} className={shop.tab} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={s.panel}>
              {tab === "ticket" ? ticket : <GearPreview avatar={avatar} />}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * 좌대 그림 (맵이 쓰는 그림 코드 그대로 — ./raftThumb). 1배로 구운 캔버스를 CSS로 정수 배율만 키운다 (PC 1배 · 폰 2배, 이웃 픽셀 그대로).
 * 크기는 그림을 따라간다 (그림이 넓어지거나 줄어도 카드가 맞춰진다)
 */
function RaftThumb({ n, concept }: { n: number; concept: MapConcept }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<[number, number] | null>(null);
  useEffect(() => {
    const el = ref.current;
    const src = raftThumbCanvas(n, concept);
    if (!el || !src) return;
    el.width = src.width;
    el.height = src.height;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(src, 0, 0);
    setSize([src.width, src.height]);
  }, [n, concept]);
  return (
    <span className={s.thumb}>
      <canvas ref={ref} className={s.thumbCanvas} style={size ? ({ "--w": `${size[0]}px`, "--h": `${size[1]}px` } as CSSProperties) : undefined} aria-hidden="true" />
    </span>
  );
}

/** 가는 길 아이콘 (7×7 픽셀): 잔교 판자 다리 · 물결 */
const ACCESS_PIX = {
  walk: ["#.....#", "#######", "#.....#", "#######", "#.....#", "#######", "#.....#"],
  swim: [".......", ".##..##", "#..##..", ".......", ".##..##", "#..##..", "......."],
} as const;
function AccessIcon({ walk }: { walk: boolean }) {
  const rows = ACCESS_PIX[walk ? "walk" : "swim"];
  const d = rows.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? `M${x} ${y}h1v1h-1z` : ""))).join("");
  return (
    <svg className={s.accessIcon} data-kind={walk ? "walk" : "swim"} width={14} height={14} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

/** 염색 미리보기 색 (null = 원래 색) — 바탕 천만 바뀌고 금테·찌·눈 같은 장식은 그대로 */
const DYE_SWATCHES: readonly (readonly [string, string | null])[] = [
  ["원래 색", null],
  ["빨강", "#d83a3a"],
  ["파랑", "#3a6ad8"],
  ["검정", "#2a2a30"],
  ["민트", "#5ad8b8"],
  ["분홍", "#f08ab8"],
];
/** 「영구 한 벌」 입어 보기 칸 */
const SET_PICK = "set" as const;
/** 기간 배지 색 = 상점 외형 등급 색 (7일 고급 · 30일 희귀 · 영구 전설 — ShopDialog .tierTag) */
const TIER_LOOK: Record<RaftGearTier, "fine" | "rare" | "legend"> = { d7: "fine", d30: "rare", perm: "legend" };
const TIERS: readonly RaftGearTier[] = ["d7", "d30", "perm"];

/** 기간 배지 (상점 등급 배지 모양) */
function TierBadge({ tier, className }: { tier: RaftGearTier; className?: string }) {
  return (
    <span className={cx(shop.tierTag, s.tierBadge, className)} data-tier={TIER_LOOK[tier]}>
      {RAFT_GEAR_TIER_NAME[tier]}
    </span>
  );
}

/**
 * 좌대 한정 획득 코디 (단계마다 나오는 것이 다르다 — protocol RAFT_GEAR): 고른 것을 내 아바타에 입혀 돌려 보고 염색 색도 미리 본다. 영구 넷은 한 벌로도.
 * 확률은 보여 주지 않는다 (운영자 11/27). wide = PC 가로 창.
 * 11/27 운영자 「레이아웃이 이상하다」: 위 = 아바타를 크게(무대를 몸 둘레로 잘라 6배) + 옆에 이름·부위·기간·설명·염색,
 * 아래 = 같은 폭 카드 4칸 격자 (줄마다 앞에 기간 배지 — 7일 1 · 30일 2 · 영구 4 한 줄), 영구 줄 아래 한 벌 상자 (폰은 2칸)
 */
function GearPreview({ avatar, wide = false }: { avatar?: { color: string; body?: string }; wide?: boolean }) {
  const { me } = useMe();
  const [pick, setPick] = useState<RaftGearId | typeof SET_PICK>(RAFT_GEAR[0].id);
  const [dye, setDye] = useState<string | null>(null);
  const look = me?.equipped?.map((e) => e.itemId) ?? [];
  const av = resolveAvatar(avatar, me ? { color: me.color ?? null, body: me.body ?? null, dye: me.dye } : null, null);
  const ids: readonly RaftGearId[] = pick === SET_PICK ? RAFT_SET_IDS : [pick];
  const fit = ids.reduce<readonly string[]>((l, id) => fittingLook(l, id).look, look);
  // 고른 꾸미기만 미리보기 색으로 (내 다른 염색은 그대로)
  const base = av.color.split("|")[0];
  const color = dye ? avatarColorSpec(base, { ...me?.dye, items: { ...me?.dye?.items, ...Object.fromEntries(ids.map((id) => [id, dye])) } }) : av.color;
  const one = pick === SET_PICK ? null : itemById(pick);
  const def = pick === SET_PICK ? null : RAFT_GEAR.find((g) => g.id === pick)!;
  const name = one?.name ?? `영구 한 벌 「${RAFT_SET_NAME}」`;
  const view = useOutfitView(true, def?.slot === "pack" ? DIR.up : DIR.down);
  const card = (id: RaftGearId) => {
    const g = RAFT_GEAR.find((x) => x.id === id)!;
    const label = itemById(id)?.name ?? g.name;
    const slot = RAFT_SLOT_NAME[g.slot] ?? g.slot;
    return (
      <button
        key={id}
        type="button"
        aria-pressed={pick === id}
        aria-label={`${label} · ${slot} · ${RAFT_GEAR_TIER_NAME[g.tier]}`}
        className={cx(shop.tile, s.gearCard)}
        data-tier={TIER_LOOK[g.tier]}
        onClick={() => setPick(id)}
      >
        <span className={cx(shop.thumb, s.gearThumb)}>
          <ItemIcon itemId={id} size={32} dye={pick === id ? dye : null} />
        </span>
        <span className={s.gearText}>
          <span className={s.gearName}>{label}</span>
          <span className={s.slot}>{slot}</span>
        </span>
      </button>
    );
  };
  return (
    <div className={s.gear} data-wide={wide || undefined}>
      <p className={s.lead}>내 좌대에서 자동 낚시로 물고기가 걸릴 때 가끔 얻을 수 있어요.</p>
      <div className={s.fitRow}>
        <div className={s.fitCol}>
          <div className={s.fitBox}>
            <OutfitCanvas className={s.fitCanvas} color={color} body={av.body} look={fit} label={`내 아바타가 ${name}을(를) 입어 본 모습`} dir={view.dir} walking={view.walking} onRotate={view.rotate} />
          </div>
          <ViewControls className={s.fitControls} dir={view.dir} walking={view.walking} onDir={view.setDir} onWalking={view.setWalking} />
        </div>
        <div className={s.fitSide}>
          <p className={s.pickName}>{name}</p>
          <p className={s.pickMeta}>
            <TierBadge tier={def?.tier ?? "perm"} />
            <span className={s.slot}>{def ? (RAFT_SLOT_NAME[def.slot] ?? def.slot) : "머리 · 목 · 옷 · 등"}</span>
          </p>
          <p className={s.desc}>{one ? one.desc : "넷을 함께 입으면 발밑에 금빛 윤슬이 반짝이고 작은 금 잉어가 발 둘레를 헤엄쳐요."}</p>
          <dl className={s.facts}>
            <div>
              <dt>얻는 곳</dt>
              <dd>내 좌대 자동 낚시</dd>
            </div>
            <div>
              <dt>기간</dt>
              <dd>{!def ? "영구 넷 · 칭호 「좌대의 전설」" : def.tier === "perm" ? "영구" : `${RAFT_GEAR_TIER_DAYS[def.tier]}일 · 이미 있으면 그만큼 늘어나요`}</dd>
            </div>
          </dl>
          <p className={s.dyeHead}>염색 미리보기</p>
          <div className={s.swatches} role="group" aria-label="염색 미리보기">
            {DYE_SWATCHES.map(([label, hex]) => (
              <button key={label} type="button" className={s.swatch} aria-pressed={dye === hex} aria-label={hex ? `염색해 보기: ${label}` : label} title={label} onClick={() => setDye(hex)}>
                <span className={s.chip} style={hex ? { background: hex } : undefined} data-none={hex ? undefined : ""} />
              </button>
            ))}
          </div>
          {wide && <p className={s.hint}>무대를 누르고 ← → 키로 돌려 볼 수 있어요.</p>}
        </div>
      </div>
      <div className={s.cards} role="group" aria-label="좌대 한정 획득 코디 목록">
        {TIERS.map((tier) => [
          <span key={`h-${tier}`} className={s.cardsHead}>
            <TierBadge tier={tier} />
          </span>,
          ...RAFT_GEAR.filter((g) => g.tier === tier).map((g) => card(g.id)),
        ])}
        <div className={s.setBox} data-on={pick === SET_PICK || undefined}>
          <button type="button" aria-pressed={pick === SET_PICK} className={cx(ui.button, s.setBtn)} onClick={() => setPick(SET_PICK)}>
            네 가지 함께 입어 보기
          </button>
          <p className={s.setText}>
            영구 넷을 함께 입으면 세트 효과 「{RAFT_SET_NAME}」 · 칭호 「좌대의 전설」
          </p>
        </div>
      </div>
    </div>
  );
}
