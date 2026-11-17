"use client";

import { useState } from "react";
import { ITEMS, type ItemDef } from "@tomb/protocol";
import { fireworkPlan } from "@/game/world/fxMath";
import { fireworkShots, fireworkSpecial } from "@/game/world/fwShapes";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/hooks/useMe";
import { readItem, writeItem } from "@/lib/storage";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import { EmptyHero, InfoCard, InfoGrid, TipList } from "../ui/InfoBlocks";
import ItemIcon from "../ui/ItemIcon";
import FireworkPreview from "../shop/FireworkPreview";
import FireworkStill from "./FireworkStill";
import ui from "../ui/ui.module.css";
import { fireFirework } from "./actions";
import { countLabel, fireworkEntries } from "./items";
import styles from "./BagDialog.module.css";
import fw from "./FireworkDialog.module.css";

const FIREWORKS = ITEMS.filter((i) => i.kind === "firework");
/** 최근 쏜 폭죽 (이 기기에 기억) */
const HISTORY_KEY = "tomb.ui.fireworkHistory";
const HISTORY_MAX = 5;
type Shot = { itemId: string; at: number };

function readHistory(): Shot[] {
  try {
    const v: unknown = JSON.parse(readItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(v)
      ? v.filter((x): x is Shot => !!x && typeof x.itemId === "string" && typeof x.at === "number").slice(0, HISTORY_MAX)
      : [];
  } catch {
    return [];
  }
}

/** 방금 쏜 폭죽을 최근 기록 맨 앞에 */
function recordShot(itemId: string): void {
  writeItem(HISTORY_KEY, JSON.stringify([{ itemId, at: Date.now() }, ...readHistory()].slice(0, HISTORY_MAX)));
}

/** 운영자 격자 위쪽 거르기: 작은 것(세기 1~2) · 큰 것(3~4) · 특수(땅에서 뿜기·여러 발·하늘 연출) */
type Group = "all" | "small" | "big" | "special";
const GROUPS: readonly { id: Group; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "small", label: "작은 것" },
  { id: "big", label: "큰 것" },
  { id: "special", label: "특수" },
];

export function fireworkGroup(item: ItemDef): Exclude<Group, "all"> {
  const plan = fireworkPlan(item.power);
  if (fireworkSpecial(item.id, plan)) return "special";
  const shots = fireworkShots(item.id, plan);
  if (shots.length > 1 || shots.some((s) => s.ground)) return "special";
  return plan.power <= 2 ? "small" : "big";
}

const whenText = (at: number) =>
  new Date(at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * 쏠 폭죽 고르기. 하나만 남아도 이름을 보고 고르게 한다 (바로 쏘지 않는다).
 * 아래에 폭죽 종류(값·가진 개수)·최근 쏜 폭죽·팁을 함께 보여 준다.
 * 운영자 계정은 가진 것과 상관없이 모든 폭죽을 「∞」로 보여 준다 (쏘아도 줄지 않는다 — 서버가 가방에서 빼지 않는다)
 */
export default function FireworkDialog({ onClose, onOpenShop }: { onClose: () => void; onOpenShop?: () => void }) {
  const { me } = useMe();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history] = useState(readHistory);
  const staff = !!me?.staff;
  const stock = me ? fireworkEntries(me) : [];
  const owned = (id: string) => (staff ? Infinity : (me?.inventory[id] ?? 0));
  // 미리보기할 폭죽: 고른 것 → 가방의 첫 폭죽 → 첫 종류
  const [picked, setPicked] = useState<string | null>(null);
  const shown = FIREWORKS.find((f) => f.id === picked) ?? stock[0]?.item ?? FIREWORKS[0];
  const shop = onOpenShop && !staff ? [{ label: "상점에서 폭죽 사기", icon: "bag" as const, onClick: onOpenShop, primary: stock.length === 0 }] : [];

  async function fire(itemId: string) {
    setPending(true);
    setError(null);
    try {
      await fireFirework(itemId);
      recordShot(itemId);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <Dialog title="폭죽 쏘기" onClose={onClose}>
      <div className={fw.wrap}>
        {staff ? (
          <StaffGrid label={me?.name ?? ""} last={history[0]?.itemId ?? null} pending={pending} onFire={fire} />
        ) : (
          <>
            <section className={fw.preview} aria-label="폭죽 미리보기">
              <FireworkPreview className={fw.previewStage} itemId={shown.id} label={me?.name ?? ""} />
              <p className={fw.previewText}>
                <span className={fw.kindName}>{shown.name}</span>
                <span className={fw.kindDesc}>{shown.desc}</span>
                <span className={fw.kindMeta}>아래에서 폭죽을 고르면 여기서 터지는 모습을 미리 볼 수 있어요.</span>
              </p>
            </section>
            {stock.length === 0 ? (
              <EmptyHero icon="spark" title="가방에 폭죽이 없어요" actions={shop}>
                상점 [폭죽] 칸에서 살 수 있어요. 쏘면 지금 채널 하늘에 터지고, 같은 채널 사람들이 모두 함께 봐요.
              </EmptyHero>
            ) : (
              <ul className={styles.list} aria-label="가방의 폭죽">
                {stock.map(({ item, count }) => (
                  <li key={item.id} className={styles.row} onClick={() => setPicked(item.id)}>
                    <ItemIcon itemId={item.id} size={32} />
                    <span className={styles.main}>
                      <span className={styles.name}>
                        {item.name} <span className={styles.count}>×{countLabel(count)}</span>
                      </span>
                      <span className={styles.meta}>{item.desc}</span>
                    </span>
                    <button type="button" className={cx(ui.button, ui.primary)} onClick={() => fire(item.id)} disabled={pending}>
                      쏘기
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {error && (
              <p className={ui.error} role="alert">
                {error}
              </p>
            )}

            <InfoCard title="폭죽 종류" icon="spark" aside={`${FIREWORKS.length}가지`}>
              <ul className={fw.kinds}>
                {FIREWORKS.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={fw.kind}
                      data-owned={owned(item.id) > 0 || undefined}
                      aria-pressed={item.id === shown.id}
                      onClick={() => setPicked(item.id)}
                    >
                      <ItemIcon itemId={item.id} size={32} />
                      <span className={fw.kindText}>
                        <span className={fw.kindName}>{item.name}</span>
                        <span className={fw.kindDesc}>{item.desc}</span>
                        <span className={fw.kindMeta}>
                          {item.price}P{staff ? " · 운영자 무제한" : owned(item.id) > 0 ? ` · 가방에 ${owned(item.id)}개` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </InfoCard>
          </>
        )}

        <InfoGrid>
          <InfoCard title="최근 쏜 폭죽" icon="list">
            {history.length === 0 ? (
              <p className={fw.muted}>아직 이 기기에서 쏜 폭죽이 없어요.</p>
            ) : (
              <ul className={fw.history}>
                {history.map((h) => (
                  <li key={`${h.itemId}-${h.at}`}>
                    <ItemIcon itemId={h.itemId} size={16} />
                    <span>{FIREWORKS.find((f) => f.id === h.itemId)?.name ?? "폭죽"}</span>
                    <span className={fw.muted}>{whenText(h.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </InfoCard>
          <InfoCard title="더 예쁘게 쏘려면" icon="info">
            <TipList
              tips={[
                "밤(한국 시간 저녁)이나 맑은 날에 쏘면 불꽃이 또렷하게 보여요.",
                "같은 채널 사람들이 모두 함께 봐요. 집이나 사냥터 안이면 같은 방 사람들이 봐요.",
                "글자 폭죽은 내 닉네임이 불꽃 글자로 떠올라요.",
                "컴퓨터에서는 폭죽이 있으면 왼쪽 아래에 폭죽 버튼이 생겨요.",
              ]}
            />
          </InfoCard>
        </InfoGrid>
        {stock.length > 0 && shop.length > 0 && (
          <div>
            <button type="button" className={ui.button} onClick={onOpenShop}>
              상점에서 폭죽 더 사기
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/**
 * 운영자 무제한 폭죽: 카드 격자에서 누르면 바로 쏜다. 카드는 정지 그림(미리보기와 같은 계산으로 가장 활짝 핀 순간),
 * 마우스를 올리거나 키보드로 고르면 그 자리에서 실제처럼 터지는 모습을 반복 재생한다. 마지막에 쏜 폭죽은 위에 따로 보여 준다.
 */
function StaffGrid({ label, last, pending, onFire }: { label: string; last: string | null; pending: boolean; onFire: (itemId: string) => void }) {
  const [group, setGroup] = useState<Group>("all");
  const [live, setLive] = useState<string | null>(null);
  const lastItem = FIREWORKS.find((f) => f.id === last) ?? null;
  const counts = new Map<Group, number>([["all", FIREWORKS.length]]);
  for (const f of FIREWORKS) counts.set(fireworkGroup(f), (counts.get(fireworkGroup(f)) ?? 0) + 1);
  const shown = group === "all" ? FIREWORKS : FIREWORKS.filter((f) => fireworkGroup(f) === group);
  return (
    <section className={fw.staff} aria-label="운영자 폭죽">
      {lastItem && (
        <div className={fw.last}>
          <ItemIcon itemId={lastItem.id} size={24} />
          <span className={fw.lastText}>
            <span className={fw.kindMeta}>마지막에 쏜 폭죽</span>
            <span className={fw.kindName}>{lastItem.name}</span>
          </span>
          <button type="button" className={cx(ui.button, ui.primary)} disabled={pending} onClick={() => onFire(lastItem.id)}>
            한 번 더
          </button>
        </div>
      )}
      <div className={fw.groups} role="group" aria-label="폭죽 크기">
        {GROUPS.map((g) => (
          <button key={g.id} type="button" className={fw.group} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
            {g.label}
            <span className={fw.groupCount}>{counts.get(g.id) ?? 0}</span>
          </button>
        ))}
      </div>
      <ul className={fw.grid} aria-label="누르면 바로 쏴요">
        {shown.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={fw.card}
              data-last={item.id === last || undefined}
              disabled={pending}
              title={item.desc}
              aria-label={`${item.name} 쏘기`}
              onClick={() => onFire(item.id)}
              onPointerEnter={(e) => e.pointerType === "mouse" && setLive(item.id)}
              onPointerLeave={() => setLive((v) => (v === item.id ? null : v))}
              onFocus={(e) => e.currentTarget.matches(":focus-visible") && setLive(item.id)}
              onBlur={() => setLive((v) => (v === item.id ? null : v))}
            >
              {live === item.id ? (
                <FireworkPreview className={fw.cardStage} itemId={item.id} label={label} />
              ) : (
                <FireworkStill className={fw.cardStage} itemId={item.id} label={label} />
              )}
              <span className={fw.cardName}>{item.name}</span>
              {item.id === last && <span className={fw.cardTag}>마지막</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
