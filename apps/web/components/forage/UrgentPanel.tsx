"use client";

import { useEffect, useMemo, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { RARITY_LABEL, speciesBag, speciesById } from "@/lib/forage/catalog";
import {
  clockText,
  prizeText,
  URGENT_DEF,
  URGENT_LAST_MS,
  URGENT_NEXT_HINT,
  URGENT_PICK_MAX,
  URGENT_STAMPS,
  urgentAnnounce,
  urgentCapLine,
  urgentFilled,
  URGENT_KING_LINE,
  URGENT_REGROW_LINE,
  urgentRewardLine,
  urgentStage,
  URGENT_CLAIM_MS,
  URGENT_COS_DAYS,
  urgentClaimLeft,
  URGENT_SHOW_MS,
  type UrgentKind,
} from "@/lib/forage/quests/urgent";
import { itemById } from "@tomb/protocol";
import { urgentApi } from "@/lib/forage/quests/urgentClient";
import type { UrgentClaimed, UrgentLive, UrgentMineRow } from "@/lib/forage/quests/urgentTypes";
import { meStore } from "@/lib/hooks/useMe";
import { cx } from "../ui/cx";
import ItemIcon from "../ui/ItemIcon";
import { watchMoreBelow } from "../ui/moreBelow";
import ui from "../ui/ui.module.css";
import { forageStore, useForage } from "./forageStore";
import { questStore } from "./questStore";
import { urgentStore, useUrgent } from "./urgentStore";
import q from "./quest.module.css";
import u from "./urgent.module.css";

// 11/15: 버스 정류장 마당 의뢰 게시판의 [긴급] 칸. 진행 중이면 남은 시간·서버 전체 막대·단계·내가 낸 수·순위 3명·납품,
// 끝났으면 결과와 [보상 받기]. 테스트 서버 운영자에게는 시험 버튼(지금 시작·막대 더하기·지금 끝내기)이 보인다.

/** 받침에 맞춘 "이/가" */
const KIND_SUBJ: Record<UrgentKind, string> = { fish: "생선이", herb: "약초가", ore: "광석이", dig: "발굴품이" };
const fill = (n: number, goal: number) => `${Math.min(100, goal > 0 ? (n / (goal * 1.5)) * 100 : 0)}%`;
const pctOf = (n: number, goal: number) => (goal > 0 ? Math.floor((n * 100) / goal) : 0);

export default function UrgentPanel() {
  const { pub, mine, error } = useUrgent();
  const { state } = useForage();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Record<string, UrgentClaimed>>({});

  useEffect(() => {
    void urgentStore.refresh();
    void urgentStore.refreshMine();
    if (!forageStore.getSnapshot().state) void forageStore.refresh();
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const ev = pub?.ev ?? null;
  const live = !!ev && now < ev.end && now >= ev.start;
  // 진행 중인 의뢰가 끝나면 내 보상을 다시 본다
  const liveId = live ? ev.id : null;
  useEffect(() => {
    if (!liveId) return;
    return () => void urgentStore.refreshMine();
  }, [liveId]);

  // 11/22 긴급 의뢰도 등급을 가리지 않는다 → 대물·월척 칸도 그 종으로 합쳐 본다 (납품은 서버가 보통부터 낸다)
  const bag = useMemo(() => speciesBag(state?.bag ?? {}), [state]);
  // 11/19 끝난 의뢰: 받은 것은 목록에서 뺀다 (방금 받은 것은 무엇을 받았는지 보이게 창을 닫을 때까지만), 받을 것이 없는 것은 끝나고 1시간까지만.
  // 안 받은 것은 받기 기한(끝나고 3일) 안에 남는다 (사용자)
  const done = (mine?.rows ?? []).filter((r) => r.done && r.mine > 0 && (r.claimed ? !!fresh[r.id] : r.reward ? true : now < r.end + URGENT_SHOW_MS));
  const liveRow = live ? mine?.rows.find((r) => r.id === ev.id) : undefined;
  const myLive = liveRow?.mine ?? 0;
  // 11/16 한 사람 상한 (0 = 없음 — 그 전 의뢰). 내 줄에 있으면 그 값, 아직 못 받았으면 서버 전체 상태 값
  const myCap = liveRow?.cap ?? ev?.cap ?? 0;

  async function claim(row: UrgentMineRow) {
    setBusy(true);
    setNotice(null);
    try {
      const r = await urgentApi.claim(row.id);
      setFresh((f) => ({ ...f, [row.id]: r.claimed }));
      void urgentStore.refreshMine();
      void questStore.refresh(true);
      // 무작위 꾸미기·칭호·가방에 넣은 상자가 바로 보이게
      if (r.claimed.cos || r.claimed.king || r.claimed.pocket) void meStore.refresh();
      bridge.emit("forage:coin");
    } catch (e) {
      setNotice(errorMessage(e));
      void urgentStore.refreshMine();
    } finally {
      setBusy(false);
    }
  }

  async function test(body: Parameters<typeof urgentApi.test>[0]) {
    setBusy(true);
    setNotice(null);
    try {
      urgentStore.setPublic(await urgentApi.test(body));
      await urgentStore.refreshMine();
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!pub) return <p className={error ? ui.error : ui.hint}>{error ?? "긴급 의뢰를 확인하는 중…"}</p>;

  return (
    <div ref={watchMoreBelow} className={cx(u.panel, "more-fade")}>
      {live && ev && <LiveCard ev={ev} now={now} mine={myLive} cap={myCap} bag={bag} />}
      {ev && !live && now >= ev.end && !done.some((r) => r.id === ev.id) && <EndedSummary ev={ev} now={now} />}
      {done.map((row) => (
        <ResultCard key={row.id} row={row} pub={ev && ev.id === row.id ? ev : null} now={now} fresh={fresh[row.id]} busy={busy} onClaim={() => void claim(row)} />
      ))}
      {!ev && !done.length && (
        <div className={u.card} data-done>
          <span className={u.cardTitle}>지금은 긴급 의뢰가 없어요</span>
          <p className={ui.hint}>낮 12시부터 밤 12시 사이 언젠가 갑자기 열려요. 열리면 화면 위에 알림이 뜨고, 20분 안에 이 게시판에 내면 돼요.</p>
        </div>
      )}
      {notice && (
        <p className={ui.error} role="alert">
          {notice}
        </p>
      )}
      {mine?.sup && (
        <div className={u.testBox}>
          <span>시험 (테스트 서버 운영자만)</span>
          <button type="button" className={ui.button} disabled={busy} onClick={() => void test({ action: "start" })}>
            지금 시작
          </button>
          {(["fish", "herb", "ore", "dig"] as const).map((k) => (
            <button key={k} type="button" className={ui.button} disabled={busy} onClick={() => void test({ action: "start", kind: k })}>
              {URGENT_DEF[k].noun}
            </button>
          ))}
          <button type="button" className={ui.button} disabled={busy || !live} onClick={() => void test({ action: "add", pct: 50 })}>
            막대 +50%
          </button>
          <button type="button" className={ui.button} disabled={busy || !live} onClick={() => void test({ action: "end" })}>
            지금 끝내기
          </button>
          <button type="button" className={ui.button} disabled={busy} onClick={() => void test({ action: "clear" })}>
            시험 지우기
          </button>
        </div>
      )}
    </div>
  );
}

function Stages({ n, goal }: { n: number; goal: number }) {
  const stage = urgentStage(n, goal);
  return (
    <ul className={u.stages} aria-label="단계 보상">
      <li className={u.stage} data-on={stage >= 50 || undefined}>
        <b>50%</b>
        <span>도장 {URGENT_STAMPS[50]}개</span>
      </li>
      <li className={u.stage} data-on={stage >= 100 || undefined}>
        <b>100%</b>
        <span>도장 {URGENT_STAMPS[100]}개 더</span>
        <span>수집가의 뒷주머니</span>
      </li>
      <li className={u.stage} data-on={stage >= 150 || undefined}>
        <b>150%</b>
        <span>불꽃축제</span>
      </li>
    </ul>
  );
}

function Bar({ ev, now }: { ev: UrgentLive; now: number }) {
  const d = URGENT_DEF[ev.kind];
  const stage = urgentStage(ev.n, ev.goal);
  return (
    <>
      <div className={u.panelBar} data-fest={ev.festUntil > now || undefined} aria-hidden="true">
        <span className={u.fill} style={{ width: fill(ev.n, ev.goal) }} />
        <i className={u.mark} style={{ left: "33.333%" }} data-on={stage >= 50 || undefined} />
        <i className={u.mark} style={{ left: "66.667%" }} data-on={stage >= 100 || undefined} />
      </div>
      <div className={u.barNums}>
        <span>
          서버 전체{" "}
          <strong>
            {ev.n} / {ev.goal}
          </strong>
          {d.unit}
        </span>
        <span>
          <strong>{pctOf(ev.n, ev.goal)}%</strong>
        </span>
      </div>
    </>
  );
}

function Top3({ ev, ended = false }: { ev: UrgentLive; ended?: boolean }) {
  // 끝난 뒤에는 "첫 납품의 주인공" 같은 진행 중 문구를 쓰지 않는다
  if (!ev.top.length) return ended ? null : <p className={u.subhead}>아직 낸 사람이 없어요. 첫 납품의 주인공이 되어 보세요.</p>;
  const unit = URGENT_DEF[ev.kind].unit;
  return (
    <>
      <p className={u.subhead}>가장 많이 낸 사람</p>
      <p className={ui.hint}>{URGENT_KING_LINE}</p>
      <ol className={u.top3}>
        {ev.top.map((t, i) => (
          <li key={`${t.name}-${i}`}>
            <span className={u.rankNo}>{i + 1}</span>
            <span className={u.who}>{t.name}</span>
            <span>
              {t.n}
              {unit}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** 진행 중: 남은 시간·막대·단계·내 수·순위·납품. cap = 11/16 한 사람 상한 (0 = 없음) */
function LiveCard({ ev, now, mine, cap, bag }: { ev: UrgentLive; now: number; mine: number; cap: number; bag: Record<string, number> }) {
  const d = URGENT_DEF[ev.kind];
  const left = ev.end - now;
  // 11/16 내가 앞으로 더 낼 수 있는 수 → 한 번에 고를 수 있는 수도 이만큼까지
  const room = cap > 0 ? Math.max(0, cap - mine) : URGENT_PICK_MAX;
  const limit = Math.min(URGENT_PICK_MAX, room);
  const rows = useMemo(
    () =>
      Object.entries(bag)
        .filter(([id, n]) => {
          const s = speciesById(id);
          return n > 0 && !!s && !s.junk && s.cat === d.cat;
        })
        .map(([id, n]) => ({ id, n, s: speciesById(id)! }))
        .sort((a, b) => a.s.price - b.s.price || a.s.rarity - b.s.rarity || a.id.localeCompare(b.id)),
    [bag, d.cat],
  );
  const [pick, setPick] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 가방이 바뀌면 고른 수를 가진 만큼으로, 11/16 낸 수가 바뀌면 더 낼 수 있는 만큼으로 줄인다
  const picked: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const k = Math.min(r.n, pick[r.id] ?? 0, limit - total);
    if (k > 0) picked[r.id] = k;
    total += Math.max(0, k);
  }
  const pickAll = (common: boolean) => {
    const out: Record<string, number> = {};
    let rest = limit;
    for (const r of rows) {
      if (common && r.s.rarity > 2) continue;
      const k = Math.min(r.n, rest);
      if (k > 0) out[r.id] = k;
      rest -= k;
    }
    setPick(out);
  };

  async function deliver() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await urgentApi.deliver(ev.id, picked);
      forageStore.takeFromBag(r.used);
      urgentStore.applyDeliver(ev.id, r);
      bridge.emit("forage:coin");
      setPick({});
      setMsg(`${total}${d.unit}를 냈어요. 지금 ${pctOf(r.n, r.goal)}%예요.`);
      void urgentStore.refresh();
      void urgentStore.refreshMine();
    } catch (e) {
      setMsg(errorMessage(e));
      void forageStore.refresh();
      // 그 사이 다른 사람이 150%를 채워 끝났을 수 있다 → 끝난 화면으로
      void urgentStore.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={u.card} data-fest={ev.festUntil > now || undefined} aria-label="진행 중인 긴급 의뢰">
      <div className={u.cardHead}>
        <span className={u.cardTitle}>{urgentAnnounce(ev.kind, ev.goal)}</span>
        <span className={u.bigClock} data-hurry={left <= URGENT_LAST_MS || undefined} aria-label={`남은 시간 ${clockText(left)}`}>
          {clockText(left)}
        </span>
      </div>
      <Bar ev={ev} now={now} />
      <div className={u.liveGrid}>
        <div className={u.liveCol}>
          <Stages n={ev.n} goal={ev.goal} />
          <div className={u.mineLine}>
            <span>
              내가 낸 수 <strong>{mine}</strong>
              {d.unit}
            </span>
            <span className={ui.hint}>1개만 내도 보상을 받아요</span>
          </div>
          <Top3 ev={ev} />
        </div>
        <div className={u.liveCol}>
          <p className={u.subhead}>
            가방의 {URGENT_DEF[ev.kind].noun} {rows.reduce((a, r) => a + r.n, 0)}
            {d.unit}
          </p>
          {rows.length ? (
            <div className={q.pickList} role="list">
              {rows.map(({ id, n, s }) => {
                const v = picked[id] ?? 0;
                const most = Math.min(n, v + limit - total);
                const set = (x: number) => setPick({ ...picked, [id]: Math.max(0, Math.min(most, x)) });
                return (
                  <div key={id} className={q.pickRow} role="listitem" data-on={v > 0 || undefined}>
                    <ItemIcon itemId={id} size={24} />
                    <span className={q.pickName}>
                      {s.name}
                      <small>
                        {RARITY_LABEL[s.rarity]} {s.price}P, {n}개 있음
                      </small>
                    </span>
                    <span className={q.pickQty}>
                      <button type="button" className={ui.button} disabled={busy || v <= 0} onClick={() => set(v - 1)} aria-label={`${s.name} 하나 덜`}>
                        −
                      </button>
                      <span aria-live="polite">{v}</span>
                      <button type="button" className={ui.button} disabled={busy || v >= most} onClick={() => set(v + 1)} aria-label={`${s.name} 하나 더`}>
                        +
                      </button>
                      <button type="button" className={ui.button} disabled={busy || v >= most} onClick={() => set(most)} aria-label={`${s.name} 모두`}>
                        모두
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={ui.hint}>
              가방에 낼 {KIND_SUBJ[ev.kind]} 없어요. {d.cat === "fish" ? "낚시로" : "채집으로"} 모아 와요.
            </p>
          )}
          {cap > 0 && <p className={ui.hint}>{urgentCapLine(ev.kind, cap, room)}</p>}
          {/* 11/22 약초·광석·발굴품 의뢰 동안 그 지점이 5분마다 모두 다시 핀다 (lib/forage/rules nodeBloomRule) */}
          {URGENT_REGROW_LINE[ev.kind] && <p className={ui.hint}>{URGENT_REGROW_LINE[ev.kind]}</p>}
          <div className={u.deliverRow}>
            <span className={u.quick}>
              <button type="button" className={ui.button} disabled={busy || !rows.length || room <= 0} onClick={() => pickAll(true)}>
                흔한 것만 고르기
              </button>
              <button type="button" className={ui.button} disabled={busy || !rows.length || room <= 0} onClick={() => pickAll(false)}>
                전부 고르기
              </button>
            </span>
            <button type="button" className={cx(ui.button, ui.primary)} disabled={busy || total <= 0 || room <= 0} onClick={() => void deliver()}>
              {busy ? "내는 중…" : `${total}${d.unit} 납품`}
            </button>
          </div>
        </div>
      </div>
      <p className={ui.hint} role="status">
        {msg ?? "낸 것은 가방에서 사라져요. 남은 시간이 끝나면 더는 낼 수 없어요."}
      </p>
    </section>
  );
}

/** 끝났지만 내가 내지 않은 의뢰 (결과만). 아무도 안 냈으면 종류별 한 줄 */
function EndedSummary({ ev, now }: { ev: UrgentLive; now: number }) {
  const d = URGENT_DEF[ev.kind];
  if (ev.n <= 0)
    return (
      <section className={u.card} data-done aria-label="끝난 긴급 의뢰">
        <span className={u.cardTitle}>{d.label} 긴급 의뢰가 끝났어요</span>
        <p className={u.subhead}>{d.nobody}</p>
        <p className={ui.hint}>{URGENT_NEXT_HINT}</p>
      </section>
    );
  return (
    <section className={u.card} data-done data-fest={ev.festUntil > now || undefined} aria-label="끝난 긴급 의뢰">
      <span className={u.cardTitle}>{d.label} 긴급 의뢰가 끝났어요</span>
      <Bar ev={ev} now={now} />
      <p className={u.subhead}>
        {urgentFilled(ev.kind, ev.n, ev.goal, !!ev.early)}. {urgentRewardLine({ n: ev.n, goal: ev.goal, mine: false })}
      </p>
      <Stages n={ev.n} goal={ev.goal} />
      <Top3 ev={ev} ended />
      <p className={ui.hint}>{urgentStage(ev.n, ev.goal) >= 50 ? `이번엔 낸 게 없어서 받을 보상이 없어요. ${URGENT_NEXT_HINT}` : URGENT_NEXT_HINT}</p>
    </section>
  );
}

/** 받을 것·받은 것 한 줄씩 */
function Prizes({ c, isNew, boxPending }: { c: UrgentClaimed; isNew: boolean; boxPending?: boolean }) {
  const items: { key: string; icon: React.ReactNode; title: string; sub?: string }[] = [];
  if (c.stamps > 0) items.push({ key: "st", icon: "印", title: `의뢰 도장 ${c.stamps}개`, sub: c.stage >= 100 ? "50%와 100% 단계 도장" : "50% 단계 도장" });
  if (c.box) {
    const b = c.box;
    const icon = b.kind === "stamps" ? "印" : <ItemIcon itemId={b.kind === "fish" ? b.id : b.kind === "dye_pick" ? "q_dye_pick" : "q_dye_special"} size={24} />;
    const sub = b.kind === "fish" ? (c.fishKept === false ? "가방 칸이 가득해서 도장 3개로 바꿨어요" : `${RARITY_LABEL[speciesById(b.id)?.rarity ?? 3]} 물고기, 가방에 넣었어요`) : b.kind === "stamps" ? "상자에서 나온 도장" : "가방에 넣었어요";
    items.push({ key: "box", icon, title: `수집가의 뒷주머니에서 ${prizeText(b)}`, sub });
  } else if (c.pocket) items.push({ key: "box", icon: <ItemIcon itemId="u_box_pocket" size={24} />, title: "수집가의 뒷주머니를 가방에 넣었어요", sub: "가방의 소모품 칸에서 열어 보세요" });
  else if (boxPending) items.push({ key: "box", icon: <ItemIcon itemId="u_box_pocket" size={24} />, title: "수집가의 뒷주머니", sub: "가방에 들어가요. 열면 도장이나 염색권, 희귀 물고기가 나와요" });
  if (c.king) items.push({ key: "king", icon: "👑", title: "칭호 「긴급 배달왕」", sub: "가장 많이 낸 1등. 하루 동안 가방의 칭호 칸에서 달아요" });
  if (c.lucky) items.push({ key: "lucky", icon: "🍀", title: "행운의 배달부로 뽑혔어요!", sub: "낸 사람 중 한 명을 뽑아 무작위 꾸미기를 드려요" });
  // 11/19 무작위 꾸미기 (배달왕·행운의 배달부): 받으면 무엇인지, 받기 전엔 무작위
  if (c.cos) {
    const it = itemById(c.cos.id);
    items.push({ key: "cos", icon: <ItemIcon itemId={c.cos.id} size={24} />, title: `${it?.name ?? "꾸미기"} ${c.cos.days}일`, sub: "가방의 꾸미기에서 입어요" });
  } else if (!c.at && (c.king || c.lucky))
    items.push({ key: "cos", icon: "🎁", title: "무작위 꾸미기 하나", sub: `상점 꾸미기 중 하나가 ${URGENT_COS_DAYS.map(([d]) => d).join("·")}일 기간제로 들어가요. 아주 드물게 사이렌 모자가 나와요` });
  if (c.last) items.push({ key: "last", icon: "⏱", title: "칭호 「아슬아슬 마감」", sub: "하루 동안. 가방의 칭호 칸에서 달아요" });
  return (
    <ul className={u.prizes}>
      {items.map((it, i) => (
        <li key={it.key} className={u.prize} data-new={isNew || undefined} style={isNew ? { animationDelay: `${i * 180}ms` } : undefined}>
          <span className={u.prizeIcon}>{it.icon}</span>
          <span>
            <b>{it.title}</b>
            {it.sub && <small>{it.sub}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 끝난 의뢰 (내가 낸 것): 결과 + 보상 받기 */
function ResultCard({ row, pub, now, fresh, busy, onClaim }: { row: UrgentMineRow; pub: UrgentLive | null; now: number; fresh?: UrgentClaimed; busy: boolean; onClaim: () => void }) {
  const d = URGENT_DEF[row.kind];
  const pct = pctOf(row.n, row.goal);
  const claimed = fresh ?? row.claimed;
  const ev: UrgentLive = pub ?? { id: row.id, kind: row.kind, goal: row.goal, n: row.n, start: row.start, end: row.end, festUntil: 0, goalAt: 0, top: [], lastName: null };
  return (
    <section className={u.card} data-done data-fest={ev.festUntil > now || undefined} aria-label="끝난 긴급 의뢰 결과">
      <div className={u.cardHead}>
        <span className={u.cardTitle}>
          {d.label} 긴급 의뢰가 {pub?.early ? "일찍 " : ""}끝났어요
        </span>
        <span className={u.bigClock}>{pct}%</span>
      </div>
      <Bar ev={ev} now={now} />
      <div className={u.liveGrid}>
        <div className={u.liveCol}>
          <Stages n={row.n} goal={row.goal} />
          <div className={u.mineLine}>
            <span>
              내가 낸 수 <strong>{row.mine}</strong>
              {d.unit}
            </span>
            {pub?.lastName && (
              <span className={ui.hint}>
                {pub.lastFest ? "150%를 채워 끝낸" : "마지막 1분에 채운"} 사람은 {pub.lastName}님
              </span>
            )}
          </div>
          {pub && <Top3 ev={pub} ended />}
        </div>
        <div className={u.liveCol}>
          {claimed ? (
            <>
              <p className={u.subhead}>{fresh ? "보상을 받았어요!" : "이미 받은 보상"}</p>
              <Prizes c={claimed} isNew={!!fresh} />
            </>
          ) : row.reward ? (
            <>
              <p className={u.subhead}>
                받을 보상 <span className={ui.hint}>· {urgentClaimLeft(row.end + URGENT_CLAIM_MS - now)} 안에 받아 가세요</span>
              </p>
              <Prizes c={{ ...row.reward, box: null, at: 0 }} isNew={false} boxPending={row.reward.box} />
              <button type="button" className={cx(ui.button, ui.primary)} disabled={busy} onClick={onClaim}>
                {busy ? "받는 중…" : "보상 받기"}
              </button>
            </>
          ) : (
            <p className={ui.hint}>{urgentRewardLine({ n: row.n, goal: row.goal, mine: true })} 다음 긴급 의뢰 때 다시 모아 봐요.</p>
          )}
        </div>
      </div>
    </section>
  );
}
