"use client";

import { resellBuyNote } from "@/lib/resell";
import { useCallback, useEffect, useId, useState } from "react";
import { DIR, isNameSlot, isPermanentUntil, itemById } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { previewTurnLabel, rotateMode } from "@/lib/housing/layout";
import { furnitureById, houseUseNote } from "@/lib/housing/catalog";
import { batchim, endText, soonText } from "@/lib/seasonShop/rules";
import { seasonApi } from "@/lib/seasonShop/client";
import type { SeasonKind } from "@/lib/seasonShop/schedule";
import type { SeasonCosRow, SeasonFurnRow, SeasonGroupView, SeasonStatus } from "@/lib/seasonShop/service";
import { readItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { applyStyle } from "../account/actions";
import { cosmeticBlock, currentLook } from "../account/items";
import { resolveAvatar, SLOT_NAMES } from "../account/wardrobe";
import { FurnitureStage, FurnitureThumb } from "../housing/parts";
import { fittingLook } from "../shop/fitting";
import NameStylePreview from "../shop/NameStylePreview";
import OutfitPreview from "../shop/OutfitPreview";
import shop from "../shop/ShopDialog.module.css";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import LookScoreBadge from "../ui/LookScoreBadge";
import { watchMoreBelow } from "../ui/moreBelow";
import ui from "../ui/ui.module.css";
import { houseKnown, NoHouseTalk, rememberHouse } from "../noHouse/NoHouseTalk";
import { NO_HOUSE_BROWSING } from "../noHouse/noHouseText";
import { boughtText, emptyText, SEASON_SHOP_TITLE, SEASON_TABS, seasonHint, soonNote, type SeasonTab } from "./seasonText";
import styles from "./SeasonShopDialog.module.css";

// 11/19 기간 한정 노점 창 (계절 보따리상 = 코디 · 가구 보따리상 = 가구). 서버 /api/season-shop (lib/seasonShop).
//  - 탭 「판매 중」·「판매 예정」, 세트별로 묶어 보여 준다 (묶음 제목 옆에 「판매 종료까지 N일」·「N일 뒤 가격 공개와 판매」)
//  - 코디는 잡화점과 같은 입어 보기 무대(OutfitPreview·이름표 미리보기), 가구는 가구점과 같은 큰 미리보기(돌려 보기·낮밤)
//  - 판매 예정은 미리보기만 (사기 단추 대신 「N일 뒤 가격 공개와 판매」, 값은 서버가 감춰 보낸다 — 사기도 서버가 거절한다)
//  - 11/20 가구 보따리상에 집 없는 손님이 오면 판매 창 대신 목수 유령의 거절 창 (components/noHouse) → [그래도 구경만 할게요]면 이 창을 구경 모드로

type Row = SeasonCosRow | SeasonFurnRow;
type Props = {
  kind: SeasonKind;
  onClose: () => void;
  avatar?: { color: string; body?: string };
};

const isCos = (r: Row): r is SeasonCosRow => "slot" in r;

export default function SeasonShopDialog({ kind, onClose, avatar }: Props) {
  const { me } = useMe();
  const baseId = useId();
  const [status, setStatus] = useState<SeasonStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<SeasonTab>("on");
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const [savedColor] = useState(() => readItem(LS.color));
  const [turn, setTurn] = useState(0);
  const [night, setNight] = useState(false);
  const phone = useMediaQuery("(max-width: 560px)");
  // 11/20 집 없는 손님: 거절 창을 넘기고 구경만 (furn). 집 유무를 처음 알아내는 동안은 잠깐 아무것도 띄우지 않는다 (큰 창이 떴다 작은 창으로 바뀌지 않게)
  const [browse, setBrowse] = useState(false);
  const [waited, setWaited] = useState(false);

  const load = useCallback(
    (live: () => boolean = () => true) =>
      seasonApi
        .status(kind)
        .then((s) => {
          if (!live()) return;
          setStatus(s);
          rememberHouse(s.house);
          setLoadError(null);
          // 판매 중이 비어 있고 판매 예정만 있으면 그 칸으로 연다
          setTab((t) => (t === "on" && !s.on.length && s.soon.length ? "soon" : t));
        })
        .catch((e: unknown) => {
          if (live()) setLoadError(errorMessage(e));
        }),
    [kind],
  );

  useEffect(() => {
    if (kind !== "furn") return;
    const t = window.setTimeout(() => setWaited(true), 600);
    return () => window.clearTimeout(t);
  }, [kind]);

  useEffect(() => {
    let live = true;
    void load(() => live);
    void meStore.refresh();
    return () => {
      live = false;
    };
  }, [load]);

  const groups: SeasonGroupView<Row>[] = status ? status[tab] : [];
  const rows = groups.flatMap((g) => g.items);
  const shown = rows.find((r) => r.id === picked) ?? rows[0] ?? null;
  const now = status?.now ?? openedAt;
  const { color, body } = resolveAvatar(avatar, me, savedColor);
  const fitting = fittingLook(me ? currentLook(me.equipped, openedAt) : [], shown && isCos(shown) ? shown.id : null);
  const fitNote = fitting.wearing ? "지금 착용 중이에요." : fitting.replaced ? `입으면 지금 입은 ${fitting.replaced.name}${batchim(fitting.replaced.name) ? "은" : "는"} 벗어 둬요.` : null;

  function switchTab(t: SeasonTab) {
    setTab(t);
    setPicked(null);
    setTurn(0);
  }

  async function buy(row: Row, mode: "day" | "perm") {
    const key = `${row.id}:${mode}`;
    setPending(key);
    setNotice(null);
    try {
      const res = await seasonApi.buy(kind, row.id, mode);
      setStatus(res);
      if (res.lookGrant) applyStyle({ me: res.me, lookGrant: res.lookGrant });
      else meStore.set(res.me);
      setNotice(boughtText(res.got, kind === "furn" ? "furn" : mode));
    } catch (e) {
      setNotice(errorMessage(e));
      void load();
    } finally {
      setPending(null);
    }
  }

  const points = me?.points ?? status?.points ?? null;
  const forever = (id: string) => !!me && [...me.equipped, ...(me.stash ?? [])].some((e) => e.itemId === id && isPermanentUntil(e.until));

  function priceText(p: { base: number; cost: number }) {
    if (p.cost >= p.base) return <>{p.base.toLocaleString("ko-KR")}P</>;
    return (
      <>
        <s className={shop.oldPrice}>{p.base.toLocaleString("ko-KR")}P</s> {p.cost.toLocaleString("ko-KR")}P
      </>
    );
  }

  function buyButtons(row: Row) {
    if (tab === "soon")
      return (
        <button type="button" className={cx(ui.button, shop.buy)} disabled>
          {soonText(row.start, now)}
        </button>
      );
    if (!isCos(row)) {
      const short = points !== null && points < row.cost;
      const noHouse = status?.house === false;
      return (
        <button type="button" className={cx(ui.button, ui.primary, shop.buy)} disabled={pending !== null || short || noHouse} onClick={() => buy(row, "perm")}>
          {pending ? "사는 중…" : noHouse ? "집이 있어야 살 수 있어요" : <span>사기 ({priceText(row)}){short ? " 모자라요" : ""}</span>}
        </button>
      );
    }
    const item = itemById(row.id);
    const has = forever(row.id);
    const block = item && me ? cosmeticBlock(item, me.inventory, me.equipped, openedAt, me.stash) : null;
    const day = row.day;
    return (
      <>
        {day && !has && (
          <button type="button" className={cx(ui.button, ui.primary, shop.buy)} disabled={!me || block !== null || pending !== null || (points !== null && points < day.cost)} onClick={() => buy(row, "day")}>
            {pending === `${row.id}:day` ? "사는 중…" : block ?? <span>24시간 이용권 사기 ({priceText(day)})</span>}
          </button>
        )}
        <button
          type="button"
          className={cx(ui.button, shop.buy, shop.buyForever)}
          disabled={!me || has || pending !== null || (points !== null && points < row.perm.cost)}
          onClick={() => buy(row, "perm")}
        >
          {pending === `${row.id}:perm` ? "사는 중…" : has ? "영구 소유 중" : <span>영구로 사기 ({priceText(row.perm)})</span>}
        </button>
      </>
    );
  }

  function detail(row: Row) {
    const when = tab === "soon" ? soonNote(kind, row.start, now) : endText(row.saleEnd, now);
    if (isCos(row)) {
      const name = isNameSlot(row.slot);
      return (
        <section ref={watchMoreBelow} className={cx(shop.detail, name && shop.detailName, "more-fade")} aria-label="자세히 보기" aria-live="polite">
          {/* 11/24 그림 칸은 고정 크기 (잡화점과 같은 칸 — 물건을 바꿔도 글·사기 버튼 자리가 그대로) */}
          <div className={shop.stageBox} data-preview-box="">
            {name ? (
              <NameStylePreview className={shop.namePreview} color={color} body={body} look={fitting.look} name={me?.name ?? "내 이름"} label={`내 이름표에 ${row.name}${batchim(row.name) ? "을" : "를"} 달아 본 모습 (낮·밤)`} />
            ) : (
              <OutfitPreview className={shop.fitPreview} color={color} body={body} look={fitting.look} label={`내 아바타가 ${row.name}${batchim(row.name) ? "을" : "를"} 입어 본 모습`} facing={row.slot === "pack" ? DIR.up : DIR.down} />
            )}
          </div>
          <div className={shop.info}>
            <p className={shop.name}>
              <span className={shop.slotTag}>{SLOT_NAMES[row.slot]}</span>
              {row.name}
            </p>
            <p className={shop.desc}>{row.desc}</p>
            <LookScoreBadge itemId={row.id} className={shop.lookScore} />
            <p className={cx(styles.when, tab === "soon" && styles.whenSoon)}>{when}</p>
            {/* 11/22 기간 한정 판매는 되팔 수 없다 (lib/resell) */}
            <p className={shop.meta}>{resellBuyNote(row.id)}</p>
            {fitNote && <p className={shop.fitNote}>{fitNote}</p>}
            {buyButtons(row)}
          </div>
        </section>
      );
    }
    const def = furnitureById(row.id);
    const ways = def && rotateMode(def) === "turn" ? 4 : 2;
    return (
      <section ref={watchMoreBelow} className={cx(shop.detail, "more-fade")} aria-label="자세히 보기" aria-live="polite">
        {/* 11/24 그림 칸 고정 (데스크톱은 넓어진 자세히 보기 칸 폭에 맞춰 크게, 폰은 가구점과 같은 140 — 옆 글 칸이 좁지 않게) */}
        <div className={styles.furnWrap} data-preview-box="">
        <div className={styles.furnStage} data-night={night || undefined}>
          <FurnitureStage itemId={row.id} w={phone ? 140 : 300} h={phone ? 140 : 190} r={turn % ways} night={night} />
        </div>
        <div className={styles.stageBar}>
          <button type="button" className={cx(ui.button, styles.stageBtn)} onClick={() => setTurn((t) => (t + 1) % ways)}>
            {def ? previewTurnLabel(def, turn % ways) : "뒤집어 보기"}
          </button>
          <button type="button" className={cx(ui.button, styles.stageBtn)} aria-pressed={night} onClick={() => setNight((n) => !n)}>
            {night ? "낮으로" : "밤으로"}
          </button>
        </div>
        </div>
        <div className={shop.info}>
          <p className={shop.name}>{row.name}</p>
          <p className={shop.desc}>{row.desc}</p>
          {furnitureById(row.id) && houseUseNote(furnitureById(row.id)) && <p className={shop.meta}>{houseUseNote(furnitureById(row.id))}</p>}
          <p className={cx(styles.when, tab === "soon" && styles.whenSoon)}>{when}</p>
          {row.have > 0 && <p className={shop.meta}>가방에 {row.have}개 있어요</p>}
          {buyButtons(row)}
        </div>
      </section>
    );
  }

  // 11/20 가구 보따리상 + 집 없음 → 거절 창 (응답 전엔 지난번에 안 값으로)
  const house = kind !== "furn" ? true : status ? status.house !== false : houseKnown();
  const noHouse = house === false;
  if (noHouse && !browse) return <NoHouseTalk onBrowse={() => setBrowse(true)} onClose={onClose} />;
  if (house === null && !loadError && !waited) return null;

  return (
    <Dialog title={SEASON_SHOP_TITLE[kind]} onClose={onClose} className={shop.window}>
      <div className={shop.shop}>
        <div className={shop.top}>
          <p className={shop.balance}>
            내 포인트 <strong>{points === null ? "–" : points.toLocaleString("ko-KR")}</strong>
          </p>
          <p className={cx(shop.topHint, noHouse && styles.browseHint)}>{noHouse ? NO_HOUSE_BROWSING : seasonHint(kind)}</p>
        </div>
        {loadError && !status && <p className={ui.error}>{loadError}</p>}

        <div className={shop.tabs} role="tablist" aria-label="판매 칸">
          {SEASON_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${baseId}-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`${baseId}-panel`}
              className={shop.tab}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
              <span className={shop.tabCount}>{status ? status[t.id].reduce((n, g) => n + g.items.length, 0) : ""}</span>
            </button>
          ))}
        </div>

        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={shop.panel}>
          {status && !rows.length ? (
            <p className={styles.empty}>{emptyText(tab, status.next, now)}</p>
          ) : (
            <>
              {shown ? detail(shown) : <section className={shop.detail} aria-hidden="true" />}
              <div ref={watchMoreBelow} className={cx(shop.listCol, styles.groups, "more-fade")} aria-label={tab === "on" ? "판매 중인 물건" : "판매 예정인 물건"}>
                {groups.map((g) => (
                  <section key={`${g.set}-${g.start}`} className={styles.group} aria-label={g.setName}>
                    <header className={styles.groupHead}>
                      <h3 className={styles.setName}>{g.setName}</h3>
                      <span className={cx(styles.groupWhen, tab === "soon" && styles.whenSoon)}>{tab === "soon" ? soonText(g.start, now) : endText(g.saleEnd, now)}</span>
                    </header>
                    {g.bonus && <p className={styles.bonus}>{g.bonus}</p>}
                    <ul className={styles.setGrid}>
                      {g.items.map((r) => {
                        const cos = isCos(r);
                        const grade = cos ? r.grade : undefined;
                        const price = cos ? (r.day ?? r.perm) : r;
                        const has = cos && forever(r.id);
                        return (
                          <li key={r.id}>
                            <button
                              type="button"
                              className={shop.tile}
                              data-tier={grade}
                              aria-pressed={shown?.id === r.id}
                              title={`${r.name} — ${r.desc}`}
                              aria-label={`${r.name}, ${r.hidden ? "값 비공개" : `${price.cost}포인트`}${cos ? ", 눌러서 입어 보기" : ", 눌러서 둘러보기"}`}
                              onClick={() => {
                                setPicked(r.id);
                                setTurn(0);
                              }}
                            >
                              <span className={shop.thumb}>{cos ? <ItemIcon itemId={r.id} size={48} /> : <FurnitureThumb itemId={r.id} w={56} h={48} />}</span>
                              <span className={shop.tileName}>{r.name}</span>
                              {cos && <LookScoreBadge itemId={r.id} />}
                              {/* 11/20 판매 예정은 값 비공개 (판매 시작 때 공개) */}
                              {r.hidden ? (
                                <span className={cx(shop.tilePrice, styles.tileHidden)}>값 비공개</span>
                              ) : (
                                <span className={shop.tilePrice}>
                                  {priceText(price)}
                                  {has ? <span className={shop.badge}>영구</span> : null}
                                </span>
                              )}
                              {/* 11/20 코디는 영구 값도 같이 (하루권만 보여 오해하지 않게) */}
                              {cos && r.day && !r.hidden && <span className={styles.tilePerm}>영구 {priceText(r.perm)}</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
                {!status && !loadError && <p className={styles.empty}>물건을 펼치는 중이에요…</p>}
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
