"use client";

import { useState } from "react";
import { ITEMS } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/hooks/useMe";
import { readItem, writeItem } from "@/lib/storage";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import { EmptyHero, InfoCard, InfoGrid, TipList } from "../ui/InfoBlocks";
import ItemIcon from "../ui/ItemIcon";
import FireworkPreview from "../shop/FireworkPreview";
import ui from "../ui/ui.module.css";
import { fireFirework } from "./actions";
import { bagEntries } from "./items";
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

const whenText = (at: number) =>
  new Date(at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * 쏠 폭죽 고르기. 하나만 남아도 이름을 보고 고르게 한다 (바로 쏘지 않는다).
 * 아래에 폭죽 종류(값·가진 개수)·최근 쏜 폭죽·팁을 함께 보여 준다
 */
export default function FireworkDialog({ onClose, onOpenShop }: { onClose: () => void; onOpenShop?: () => void }) {
  const { me } = useMe();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history] = useState(readHistory);
  const stock = me ? bagEntries(me.inventory, "firework") : [];
  const owned = (id: string) => me?.inventory[id] ?? 0;
  // 미리보기할 폭죽: 고른 것 → 가방의 첫 폭죽 → 첫 종류
  const [picked, setPicked] = useState<string | null>(null);
  const shown = FIREWORKS.find((f) => f.id === picked) ?? stock[0]?.item ?? FIREWORKS[0];
  const shop = onOpenShop ? [{ label: "상점에서 폭죽 사기", icon: "bag" as const, onClick: onOpenShop, primary: stock.length === 0 }] : [];

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
                    {item.name} <span className={styles.count}>×{count}</span>
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
                      {item.price}P{owned(item.id) > 0 ? ` · 가방에 ${owned(item.id)}개` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </InfoCard>

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
                "같은 채널(집·사냥터 안이면 같은 방) 사람들이 모두 함께 봐요.",
                "글자 폭죽은 내 닉네임이 불꽃 글자로 떠올라요.",
                "데스크톱은 폭죽이 있을 때 왼쪽 아래에 폭죽 버튼이 생겨요.",
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
