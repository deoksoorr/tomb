"use client";

import { resellBuyNote } from "@/lib/resell";
import { useCallback, useEffect, useState } from "react";
import { ALLEY_BODIES, DIR, ALLEY_SETS, bodyLabel, isPermanentUntil, itemById } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { BUNGEO_TITLE } from "@/lib/bungeo/cart";
import { bungeoApi } from "@/lib/bungeo/client";
import type { BungeoAt, BungeoRow, BungeoStatus } from "@/lib/bungeo/service";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { batchim, setBonusText } from "@/lib/seasonShop/rules";
import { readItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { applyStyle } from "../account/actions";
import { currentLook } from "../account/items";
import { resolveAvatar, SLOT_NAMES } from "../account/wardrobe";
import AvatarSprite from "../entry/AvatarSprite";
import { fittingLook } from "../shop/fitting";
import OutfitPreview from "../shop/OutfitPreview";
import shop from "../shop/ShopDialog.module.css";
import season from "../seasonShop/SeasonShopDialog.module.css";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import LookScoreBadge from "../ui/LookScoreBadge";
import { watchMoreBelow } from "../ui/moreBelow";
import ui from "../ui/ui.module.css";

// 11/22 「골목 붕어빵 수레」 창 (이스터에그 한정 상점 — 밤에 가끔 나오는 수레 앞에서 E). 서버 /api/bungeo (lib/bungeo/service).
//  - 영구 소장만 · 값 고정. 묶음: 외형 · 캠퍼스 후드핏 · 겨울 데이트룩 · 낱개 겉옷 (세트는 다 입으면 칭호 덤)
//  - 입어 보기는 계절 보따리상과 같은 무대 (OutfitPreview). 외형은 그 몸으로 바꿔 본 모습
//  - 수레가 떠난 뒤에 열면 「떠났어요」만 (언제 오는지는 말하지 않는다)

/** at = 수레에 말을 건 맵·자리 (11/23 서버가 그 회차 수레 가까이인지 본다 — 멀면 「수레 가까이에서 살 수 있어요」) */
type Props = { onClose: () => void; at?: BungeoAt | null; avatar?: { color: string; body?: string } };

const HELLO = "어서 와요, 갓 구운 붕어빵 냄새 맡고 왔죠? 여기 물건은 이 수레에서만 팔아요. 모두 영구 소장이에요.";
const SET_OF: Record<string, string> = { "캠퍼스 후드핏": "campus-hoodie", "겨울 데이트룩": "winter-date" };

function descOf(r: BungeoRow): string {
  return r.kind === "body" ? (ALLEY_BODIES.find((b) => b.id === r.id)?.desc ?? "") : (itemById(r.id)?.desc ?? "");
}

export default function BungeoCartDialog({ onClose, at = null, avatar }: Props) {
  const { me } = useMe();
  const [status, setStatus] = useState<BungeoStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const [savedColor] = useState(() => readItem(LS.color));

  const load = useCallback(
    (live: () => boolean = () => true) =>
      bungeoApi
        .status()
        .then((s) => {
          if (!live()) return;
          setStatus(s);
          setLoadError(null);
        })
        .catch((e: unknown) => {
          if (live()) setLoadError(errorMessage(e));
        }),
    [],
  );
  useEffect(() => {
    let live = true;
    void load(() => live);
    void meStore.refresh();
    return () => {
      live = false;
    };
  }, [load]);

  // 이름은 이 빌드의 카탈로그에서 (서버 이름은 예비)
  const rows = (status?.items ?? []).map((r) => ({ ...r, name: r.kind === "body" ? bodyLabel(r.id) : (itemById(r.id)?.name ?? r.name) }));
  const shown = rows.find((r) => r.id === picked) ?? rows[0] ?? null;
  const { color, body } = resolveAvatar(avatar, me, savedColor);
  const wearing = me ? currentLook(me.equipped, openedAt) : [];
  const fitting = fittingLook(wearing, shown && shown.kind === "cosmetic" ? shown.id : null);
  const points = me?.points ?? status?.points ?? null;
  const has = (r: BungeoRow) =>
    r.owned || (r.kind === "body" ? me?.body === r.id || !!me?.bodies?.includes(r.id) : !!me && [...me.equipped, ...(me.stash ?? [])].some((e) => e.itemId === r.id && isPermanentUntil(e.until)));
  const groups = [...new Set(rows.map((r) => r.group))].map((g) => ({ name: g, items: rows.filter((r) => r.group === g) }));

  async function buy(r: BungeoRow) {
    setPending(r.id);
    setNotice(null);
    try {
      const res = await bungeoApi.buy(r.id, at);
      setStatus(res);
      applyStyle({ me: res.me, lookGrant: res.lookGrant });
      setNotice(
        r.kind === "body"
          ? `${res.got}${batchim(res.got) ? "을" : "를"} 소장했어요. 바로 그 모습으로 바꿨어요. 꾸미기 창 「외형」에서 언제든 돌아올 수 있어요.`
          : `${res.got}${batchim(res.got) ? "을" : "를"} 영구로 샀어요. 가방에서 입을 수 있어요.`,
      );
    } catch (e) {
      setNotice(errorMessage(e));
      void load();
    } finally {
      setPending(null);
    }
  }

  function detail(r: BungeoRow) {
    const owned = has(r);
    const short = points !== null && points < r.price;
    const isBody = r.kind === "body";
    const slot = isBody ? null : itemById(r.id)?.slot;
    return (
      <section ref={watchMoreBelow} className={cx(shop.detail, "more-fade")} aria-label="자세히 보기" aria-live="polite">
        <OutfitPreview
          className={shop.fitPreview}
          color={color}
          body={isBody ? r.id : body}
          look={isBody ? wearing : fitting.look}
          label={isBody ? `내 아바타가 ${r.name}${batchim(r.name) ? "으로" : "로"} 바뀐 모습` : `내 아바타가 ${r.name}${batchim(r.name) ? "을" : "를"} 입어 본 모습`}
          facing={!isBody && itemById(r.id)?.slot === "pack" ? DIR.up : DIR.down}
        />
        <div className={shop.info}>
          <p className={shop.name}>
            <span className={shop.slotTag}>{isBody ? "외형" : slot ? SLOT_NAMES[slot] : ""}</span>
            {r.name}
          </p>
          <p className={shop.desc}>{descOf(r)}</p>
          {!isBody && <LookScoreBadge itemId={r.id} className={shop.lookScore} />}
          {/* 11/22 수레 한정 판매는 되팔 수 없다 (lib/resell) */}
          {!isBody && <p className={shop.meta}>{resellBuyNote(r.id)}</p>}
          {!isBody && fitting.replaced && !fitting.wearing && (
            <p className={shop.fitNote}>
              입으면 지금 입은 {fitting.replaced.name}
              {batchim(fitting.replaced.name) ? "은" : "는"} 벗어 둬요.
            </p>
          )}
          <button type="button" className={cx(ui.button, shop.buy, shop.buyForever)} disabled={!me || owned || pending !== null || short} onClick={() => buy(r)}>
            {pending === r.id ? "사는 중…" : owned ? "영구 소유 중" : <span>영구로 사기 ({r.price.toLocaleString("ko-KR")}P){short ? " 모자라요" : ""}</span>}
          </button>
        </div>
      </section>
    );
  }

  return (
    <Dialog title={BUNGEO_TITLE} onClose={onClose}>
      <div className={shop.shop}>
        <div className={shop.top}>
          <p className={shop.balance}>
            내 포인트 <strong>{points === null ? "–" : points.toLocaleString("ko-KR")}</strong>
          </p>
          <p className={shop.topHint}>{HELLO}</p>
        </div>
        {loadError && !status && <p className={ui.error}>{loadError}</p>}
        <div className={shop.panel}>
          {status && !status.open ? (
            <p className={season.empty}>수레가 떠나고 빈자리엔 김만 조금 남았어요. 언젠가 밤에 또 올지도 몰라요.</p>
          ) : (
            <>
              {shown ? detail(shown) : <section className={shop.detail} aria-hidden="true" />}
              <div ref={watchMoreBelow} className={cx(shop.listCol, season.groups, "more-fade")} aria-label="수레 물건">
                {groups.map((g) => {
                  const set = SET_OF[g.name];
                  const bonus = set && ALLEY_SETS.some((s) => s.id === set) ? setBonusText(set) : "";
                  return (
                    <section key={g.name} className={season.group} aria-label={g.name}>
                      <header className={season.groupHead}>
                        <h3 className={season.setName}>{g.name}</h3>
                      </header>
                      {bonus && <p className={season.bonus}>{bonus}</p>}
                      <ul className={season.setGrid}>
                        {g.items.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              className={shop.tile}
                              data-tier={r.kind === "body" ? "legend" : itemById(r.id)?.grade}
                              aria-pressed={shown?.id === r.id}
                              title={`${r.name} — ${descOf(r)}`}
                              aria-label={`${r.name}, ${r.price}포인트, 눌러서 입어 보기`}
                              onClick={() => setPicked(r.id)}
                            >
                              <span className={shop.thumb}>{r.kind === "body" ? <AvatarSprite color={color} body={r.id} scale={2} /> : <ItemIcon itemId={r.id} size={48} />}</span>
                              <span className={shop.tileName}>{r.name}</span>
                              {r.kind === "cosmetic" && <LookScoreBadge itemId={r.id} />}
                              <span className={shop.tilePrice}>
                                {r.price.toLocaleString("ko-KR")}P{has(r) ? <span className={shop.badge}>영구</span> : null}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
                {!status && !loadError && <p className={season.empty}>붕어빵 굽는 중이에요…</p>}
              </div>
            </>
          )}
        </div>
        <p className={shop.notice} role="status">
          {notice}
        </p>
      </div>
    </Dialog>
  );
}
