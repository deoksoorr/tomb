"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { DIR, itemById, RAFT_GEAR, RAFT_GEAR_ODDS, RAFT_GEAR_ON, RAFT_GEAR_TIER_NAME, RAFT_RENEW_MAX, RAFT_SET_IDS, RAFT_SET_NAME, RAFT_SLOT_NAME, RAFT_TICKET_MIN, raftHm, type RaftGearId, type RaftGearTier } from "@tomb/protocol";
import { avatarColorSpec } from "@/game/sprites/avatar";
import { bridge } from "@/game/bridge";
import { errorMessage, request } from "@/lib/api";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { meStore, useMe } from "@/lib/hooks/useMe";
import type { RaftDealResponse, RaftSlot, RaftStatusResponse } from "@/lib/raft/types";
import { resolveAvatar } from "../account/wardrobe";
import { fittingLook } from "../shop/fitting";
import OutfitPreview from "../shop/OutfitPreview";
import shop from "../shop/ShopDialog.module.css";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import s from "./RaftBooth.module.css";

// 11/27 좌대 매표소 창 (부스 창구의 매표소 직원에게 E — game/camp/CampRafts가 camp:raft:open).
// [입장권] 좌대 여섯 (빈 좌대 · 사용 중 · 내 좌대) + 사기 · [좌대 코디 미리보기] 좌대 전용 코디 일곱 점을 입혀 돌려 보고 염색 색도 미리 본다 (영구 넷은 한 벌로도)
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
const pct = (p: number) => `${(p * 100).toFixed(p < 0.0001 ? 4 : 3).replace(/0+$/, "")}%`;

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

  return (
    <Dialog title="좌대 매표소" onClose={onClose} kind="confirm">
      <div className={s.wrap}>
        <div className={s.top}>
          <p className={s.balance}>
            내 포인트 <strong>{me ? me.points.toLocaleString("ko-KR") : "–"}P</strong>
          </p>
          <p className={s.balance}>
            오늘 남은 좌대 시간 <strong>{st ? raftHm(st.dayLeftMin) : "–"}</strong>
          </p>
        </div>
        <div className={shop.tabs} role="tablist" aria-label="매표소 칸">
          {(
            [
              ["ticket", "입장권"],
              ["gear", "좌대 코디 미리보기"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" id={`${baseId}-${id}`} aria-selected={tab === id} aria-controls={`${baseId}-panel`} className={shop.tab} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={s.panel}>
          {tab === "ticket" ? (
            <>
              <p className={s.lead}>
                좌대 하나를 {minText(RAFT_TICKET_MIN)} 동안 혼자 써요. 나갔다 와도 돼요. 내 좌대에서 켠 자동 낚시는 15초마다 찌를 올려요.
              </p>
              {mineHere && (
                <p className={s.mine}>
                  내 좌대 <b>{mineHere.n}번</b> · {leftText(mineHere.until - now)} 남았어요. 끝나기 1분 전 좌대 위에 있으면 연장할 수 있어요 (남은 연장 {mineHere.renewLeft}번).
                </p>
              )}
              {mine && !mineHere && (
                <p className={s.mine}>
                  {mine.ch}채널 {mine.n}번 좌대 입장권이 있어요 · {leftText(mine.until - now)} 남음
                </p>
              )}
              {blocked && <p className={s.notice}>{blocked}</p>}
              {done && (
                <p className={s.done} role="status">
                  {done}
                </p>
              )}
              <ul className={s.grid}>
                {(st?.slots ?? [1, 2, 3, 4, 5, 6].map((n): RaftSlot => ({ n, state: "free" }))).map((x) => (
                  <li key={x.n} className={cx(s.card, x.state === "mine" && s.cardMine, x.state === "used" && s.cardUsed)}>
                    <span className={s.num}>{x.n}번</span>
                    <span className={s.where}>{x.n <= 3 ? "잔교 다리" : "헤엄·사다리"}</span>
                    {x.state === "free" ? (
                      <>
                        <span className={s.state}>빈 좌대</span>
                        <button type="button" className={cx(ui.button, ui.primary, s.buy)} disabled={!st || !!blocked || !!mine || pending !== null || (me ? me.points < st.buyPrice : false)} onClick={() => void buy(x.n)}>
                          {pending === x.n ? "사는 중…" : st && st.buyPrice > 0 ? `${st.buyPrice}P` : "–"}
                        </button>
                      </>
                    ) : x.state === "mine" ? (
                      <span className={s.state}>내 좌대 · {leftText((x.until ?? 0) - now)} 남음</span>
                    ) : (
                      <span className={s.state}>
                        사용 중 · {hhmm((x.until ?? 0) - offset)}까지
                        {x.name && <span className={s.who}>{x.name}</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className={s.foot}>
                {short ? `오늘 남은 좌대 시간이 짧아 ${minText(st!.buyMin)}만 써요 (${st!.buyPrice}P). ` : ""}
                좌대 시간은 하루 4시간까지예요. 연장은 한 장에 {RAFT_RENEW_MAX}번까지, 끝나면 10분 뒤에 다시 살 수 있어요.
              </p>
              {error && (
                <p className={ui.error} role="alert">
                  {error}
                </p>
              )}
            </>
          ) : (
            <GearPreview avatar={avatar} />
          )}
        </div>
      </div>
    </Dialog>
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

/** 좌대 전용 코디 (단계마다 나오는 것이 다르다 — protocol RAFT_GEAR): 고른 것을 내 아바타에 입혀 돌려 보고 염색 색도 미리 본다. 영구 넷은 한 벌로도 */
function GearPreview({ avatar }: { avatar?: { color: string; body?: string } }) {
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
  const tiers: readonly (readonly [RaftGearTier, number])[] = [
    ["d7", RAFT_GEAR_ODDS.d7],
    ["d30", RAFT_GEAR_ODDS.d30],
    ["perm", RAFT_GEAR_ODDS.perm],
  ];
  return (
    <div className={s.gear}>
      <div className={s.fitCol}>
        <OutfitPreview className={s.fit} color={color} body={av.body} look={fit} label={`내 아바타가 ${name}을(를) 입어 본 모습`} facing={def?.slot === "pack" ? DIR.up : DIR.down} compact />
        <div className={s.swatches} role="group" aria-label="염색 미리보기">
          {DYE_SWATCHES.map(([label, hex]) => (
            <button key={label} type="button" className={s.swatch} aria-pressed={dye === hex} aria-label={`${label}${hex ? "으로 염색해 보기" : ""}`} title={label} onClick={() => setDye(hex)}>
              <span className={s.chip} style={hex ? { background: hex } : undefined} data-none={hex ? undefined : ""} />
            </button>
          ))}
        </div>
        <p className={s.desc}>{one ? one.desc : "넷을 함께 입으면 발밑에 금빛 윤슬이 반짝이고 작은 금 잉어가 발 둘레를 헤엄쳐요."}</p>
      </div>
      <div className={s.gearInfo}>
        {tiers.map(([tier, p]) => (
          <section key={tier} className={s.tier} aria-label={`${RAFT_GEAR_TIER_NAME[tier]} 코디`}>
            <h3 className={s.tierHead}>
              {RAFT_GEAR_TIER_NAME[tier]}
              <span className={s.odds}>{RAFT_GEAR_ON ? `한 마리마다 ${pct(p)} (1/${Math.round(1 / p).toLocaleString("ko-KR")})` : "확률 준비 중"}</span>
            </h3>
            <ul className={s.gearList}>
              {RAFT_GEAR.filter((g) => g.tier === tier).map((g) => (
                <li key={g.id}>
                  <button type="button" aria-pressed={pick === g.id} className={cx(ui.button, s.gearBtn)} onClick={() => setPick(g.id)}>
                    {itemById(g.id)?.name ?? g.name}
                    <span className={s.slot}>{RAFT_SLOT_NAME[g.slot] ?? g.slot}</span>
                  </button>
                </li>
              ))}
              {tier === "perm" && (
                <li className={s.setRow}>
                  <button type="button" aria-pressed={pick === SET_PICK} className={cx(ui.button, s.gearBtn)} onClick={() => setPick(SET_PICK)}>
                    영구 네 가지 함께 입어 보기
                    <span className={s.slot}>세트</span>
                  </button>
                </li>
              )}
            </ul>
          </section>
        ))}
        <p className={s.foot}>
          내 좌대 자동 낚시로 한 마리 걸릴 때마다 굴려요. 7일·30일은 이미 있으면 기간이 늘어나요. 영구 네 가지를 함께 입으면 「{RAFT_SET_NAME}」 연출과 칭호 「좌대의 전설」이 생겨요.
        </p>
      </div>
    </div>
  );
}
