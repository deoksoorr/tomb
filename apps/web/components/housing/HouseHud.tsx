"use client";

import { useEffect, useState } from "react";
import { bridge } from "@/game/bridge";
import { CAMP_HOME_KIND_NAME } from "@tomb/protocol";
import { FIXTURE_LOCKED, type HouseEditState, type HouseTool } from "@/game/housing/events";
import { errorMessage } from "@/lib/api";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { meStore, useMe } from "@/lib/hooks/useMe";
import {
  AWAY_MSG,
  CAMP_FLOOR,
  CAMP_WALL,
  SKIN_AWAY_MSG,
  DEFAULT_FLOOR,
  DEFAULT_WALL,
  DEFAULT_WINDOW,
  FURNITURE,
  furnitureById,
  houseShape,
  houseSizeBonus,
  isFixtureId,
  LIKE_WEIGHT,
  skinName,
  WINDOW_SKINS,
  type CampHomeKind,
  type HouseZone,
} from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import { designScore, layoutCounts, ROTATE_LABEL, rotateMode, styleTag, totalScore, WINDOW_LOCKED_MSG } from "@/lib/housing/layout";
import type { MyHouseResponse, PublicHouse } from "@/lib/housing/types";
import { CAMP_WINDOW_STYLE } from "@/game/housing/campFurnitureArt";
import { furnitureDiscount } from "@/lib/champPerks";
import { chairShopDiscount } from "@/lib/chairPerks";
import { discountedPrice, equippedPerk } from "@/lib/titles";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import FurnitureShop from "./FurnitureShop";
import GuestbookDialog from "./GuestbookDialog";
import styles from "./housing.module.css";
import { fmt, FurnitureIcon, TitleBadge } from "./parts";

type Props = {
  house: PublicHouse;
  mine: boolean;
  my: MyHouseResponse | null;
  /** 지금 채널 (배치 저장은 내 집이 이 채널에 있을 때만) */
  channel: number;
  onMy: (r: MyHouseResponse) => void;
  onHouse: (h: PublicHouse) => void;
  /** toOffice=true면 분양 사무소 창으로 돌아간다 */
  onLeave: (toOffice: boolean) => void;
};

type Modal = "guestbook" | "shop" | "leave" | null;

/** 집 안 HUD: 위쪽 정보 막대(이름·호칭·점수·버튼) + 주인의 편집 도구. 게임 키 입력은 막지 않는다 */
export default function HouseHud({ house, mine, my, channel, onMy, onHouse, onLeave }: Props) {
  const [edit, setEdit] = useState<HouseEditState | null>(null);
  const [liked, setLiked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [saving, setSaving] = useState(false);
  const [leaveTo, setLeaveTo] = useState(false);
  const [buying, setBuying] = useState(false);
  const [here, setHere] = useState<{ count: number; online: boolean; ownerHere: boolean } | null>(null);

  useEffect(() => {
    const offs = [
      bridge.on("house:state", (s) => setEdit(s)),
      bridge.on("house:notice", ({ message }) => setNotice(message)),
      bridge.on("house:guestbook", () => setModal("guestbook")),
      bridge.on("house:presence", (p) => p.where === "house" && setHere(p)),
    ];
    return () => offs.forEach((o) => o());
  }, []);

  useEffect(() => {
    if (mine) return;
    let alive = true;
    housingApi
      .viewer(house.id)
      .then((v) => alive && setLiked(v.likedToday))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [house.id, mine]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const editing = !!edit?.editing;
  const layout = editing && edit ? { items: edit.items, floor: edit.floor, wall: edit.wall, window: edit.window } : house.layout;
  // 11/22 편집 미리보기도 서버 점수와 같은 식 (외관 + 터 크기 점수까지)
  const score = editing ? totalScore(designScore(layout, house.exterior), house.likes, house.tier, houseSizeBonus(house)) : house.score;
  const tag = styleTag(layout);
  // 11/26 방 이름·가구 수: 캠핑장 집은 종류·앞마당 단계로 (방이 앞마당 단계로 커진다 — 카라반 · 펜션 · 촌캉스)
  const tier = houseShape(house);
  const zone: HouseZone = house.zone ?? "village";
  const campKind = zone === "camp" ? (tier.camp ?? null) : null;
  const where = zone === "sea" ? `오두막 · ${tier.name}` : campKind ? `${tier.name} · 앞마당 ${house.camp?.yard ?? 1}단계` : tier.name;

  async function like() {
    try {
      const r = await housingApi.like(house.id);
      setLiked(true);
      onHouse({ ...house, likes: r.likes, score: r.score });
      setNotice(`좋아요를 남겼어요. 꾸밈 점수 +${LIKE_WEIGHT}`);
    } catch (e) {
      setNotice(errorMessage(e));
      if (/이미/.test(errorMessage(e))) setLiked(true);
    }
  }

  async function save(thenClose: boolean) {
    if (!edit) return;
    setSaving(true);
    try {
      const r = await housingApi.saveLayout(channel, house.tier, { items: edit.items, floor: edit.floor, wall: edit.wall, window: edit.window }, zone);
      onMy(r);
      if (r.house) {
        onHouse(r.house);
        bridge.emit("house:data", { house: r.house });
      }
      if (thenClose) bridge.emit("house:edit", { on: false });
      setNotice("저장했어요.");
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  /** 놓아 보던 물건을 사서 그 자리에 그대로 놓는다 */
  async function buyTrial(itemId: string) {
    const def = furnitureById(itemId);
    if (!def) return;
    setBuying(true);
    try {
      onMy(await housingApi.buyItem(itemId, zone));
      void meStore.refresh();
      bridge.emit("house:tool", { action: "tryEnd", keep: true });
      setNotice(`${def.name} 사서 놓았어요. 저장하면 꾸밈 점수에 들어가요.`);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBuying(false);
    }
  }

  function leave(toOffice: boolean) {
    if (editing && edit?.dirty) {
      setLeaveTo(toOffice);
      setModal("leave");
      return;
    }
    onLeave(toOffice);
  }

  return (
    <>
      <div className={cx(ui.panel, styles.hudTop)} role="region" aria-label="집 안">
        <div className={styles.hudInfo}>
          <span className={styles.hudName} title={house.name}>
            {house.name}
          </span>
          {/* 11/16 닉네임 12자: 호칭·점수가 먼저, 주인 · 터는 맨 뒤에서 자리가 모자라면 다음 줄로 내려가 "…" (전체는 title) */}
          <span className={styles.row} style={{ gap: 6 }}>
            <TitleBadge score={score} />
            <span className={styles.hudScore}>
              꾸밈 {fmt(score)}점 · 좋아요 {house.likes}
            </span>
            {here?.online && (
              <span className={styles.tag}>
                함께 {here.count}명{!mine && here.ownerHere ? " · 집주인이 집에 있어요" : ""}
              </span>
            )}
            <span className={styles.hudOwner} title={`${house.ownerName}의 ${where}${tag ? ` · ${tag}` : ""}`}>
              {house.ownerName}의 {where}
              {tag ? ` · ${tag}` : ""}
            </span>
          </span>
        </div>
        <div className={styles.hudButtons}>
          {!mine && (
            <button type="button" className={cx(ui.button, liked && styles.liked)} onClick={like} disabled={liked} aria-pressed={liked}>
              {liked ? "좋아요 함" : "좋아요"}
            </button>
          )}
          <button type="button" className={ui.button} onClick={() => setModal("guestbook")}>
            방명록
          </button>
          {mine && !editing && (
            <button type="button" className={cx(ui.button, ui.primary)} onClick={() => bridge.emit("house:edit", { on: true })}>
              꾸미기
            </button>
          )}
          <button type="button" className={ui.button} onClick={() => leave(true)}>
            {/* 11/26 캠핑장 집이면 그 종류를 파는 NPC의 분양 창으로 (HousingOffice가 집 종류로 연다) */}
            {zone === "sea" ? "포구 부동산" : zone === "camp" ? `${CAMP_HOME_KIND_NAME[campKind ?? "caravan"]} 분양` : "분양 사무소"}
          </button>
          <button type="button" className={cx(ui.button, ui.quiet, ui.icon)} onClick={() => leave(false)} aria-label="집에서 나가기">
            <PixelIcon name="close" />
          </button>
        </div>
        <p className={styles.hudNotice} role="status">
          {notice}
        </p>
      </div>

      {mine && editing && edit && my && (
        <EditToolbar edit={edit} my={my} saving={saving} buying={buying} maxItems={tier.maxItems} campKind={campKind} onSave={save} onShop={() => setModal("shop")} onBuyTrial={buyTrial} />
      )}

      {modal === "guestbook" && <GuestbookDialog houseId={house.id} houseName={house.name} mine={mine} onClose={() => setModal(null)} />}
      {modal === "shop" && my && (
        <FurnitureShop
          my={my}
          placed={edit ? layoutCounts({ items: edit.items, floor: edit.floor, wall: edit.wall, window: edit.window }) : layoutCounts(house.layout)}
          onMy={onMy}
          onClose={() => setModal(null)}
          onTry={
            editing
              ? (itemId) => {
                  // 상점을 닫고 집 바닥에 반투명으로 얹는다 (사지 않음·저장 안 됨)
                  setModal(null);
                  // 11/24 창문 모양(눈꽃 창가)은 바닥에 놓지 않는다
                  if (furnitureById(itemId)?.skin === "window") return setNotice("눈꽃 창가는 바닥에 놓지 않고 꾸미기 「창문」 칸에서 골라요.");
                  bridge.emit("house:tool", { action: "try", itemId });
                }
              : undefined
          }
        />
      )}
      {modal === "leave" && (
        <Dialog kind="confirm" title="저장하지 않은 변경" onClose={() => setModal(null)}>
          <div className={styles.stack}>
            <p>꾸민 내용을 저장하지 않았어요. 어떻게 할까요?</p>
            <div className={styles.row}>
              <button
                type="button"
                className={cx(ui.button, ui.primary)}
                onClick={async () => {
                  setModal(null);
                  await save(true);
                  onLeave(leaveTo);
                }}
              >
                저장하고 나가기
              </button>
              <button
                type="button"
                className={cx(ui.button, ui.danger)}
                onClick={() => {
                  setModal(null);
                  bridge.emit("house:edit", { on: false, revert: true });
                  onLeave(leaveTo);
                }}
              >
                버리고 나가기
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

function EditToolbar({
  edit,
  my,
  saving,
  buying,
  maxItems,
  campKind,
  onSave,
  onShop,
  onBuyTrial,
}: {
  edit: HouseEditState;
  my: MyHouseResponse;
  saving: boolean;
  buying: boolean;
  maxItems: number;
  /** 11/26 캠핑장 집 종류 (기본 바닥·벽·창문이 종류별 전용 그림). 캠핑장 집이 아니면 null */
  campKind: CampHomeKind | null;
  onSave: (close: boolean) => void;
  onShop: () => void;
  onBuyTrial: (itemId: string) => void;
}) {
  const counts = layoutCounts({ items: edit.items, floor: edit.floor, wall: edit.wall, window: edit.window });
  const sel = edit.selected ? edit.items.find((p) => p.u === edit.selected) : undefined;
  const selDef = sel && furnitureById(sel.i);
  // 11/26 캠핑장 집 기본 가구: 옮기고 돌리기만 (치우기·팔기 없음, 가구 수에 안 셈)
  const selFixture = !!sel && isFixtureId(sel.i);
  const placedN = edit.items.filter((p) => !isFixtureId(p.i)).length;
  // 11/16 가구는 두 집 공용 가방: 다른 집에 다 놓인 것도 보여 주고, 누르면 거기서 치우라고 알려 준다
  const away = (id: string) => my.away?.[id] ?? 0;
  const owned = FURNITURE.filter((f) => !f.skin && !f.ext && ((my.inventory[f.id] ?? 0) > 0 || away(f.id) > 0));
  // 11/24 바닥·벽지도 두 집 공용 가방: 다른 집에 쓰고 있는 것도 잠금으로 보여 준다
  // 11/26 캠핑장 집은 맨 앞이 그 종류 전용 바닥·벽 (무료 — 기본 장판·판자 벽 대신)
  const baseFloor = campKind ? CAMP_FLOOR[campKind] : DEFAULT_FLOOR;
  const baseWall = campKind ? CAMP_WALL[campKind] : DEFAULT_WALL;
  const floors = [baseFloor, ...FURNITURE.filter((f) => f.skin === "floor" && ((my.inventory[f.id] ?? 0) > 0 || away(f.id) > 0)).map((f) => f.id)];
  const walls = [baseWall, ...FURNITURE.filter((f) => f.skin === "wall" && ((my.inventory[f.id] ?? 0) > 0 || away(f.id) > 0)).map((f) => f.id)];
  const tool = (t: HouseTool) => bridge.emit("house:tool", t);
  const trial = edit.trial;
  const trialDef = trial ? furnitureById(trial.itemId) : undefined;
  // 11/16 집 갈래 칭호의 가구 할인 (서버가 같은 규칙으로 깎는다)
  const { me } = useMe();
  // 11/17 포인트왕 할인과 겹치면 큰 것 하나 (lib/champPerks)
  const trialCost = trialDef ? discountedPrice(trialDef.price, furnitureDiscount(equippedPerk(me?.equipped).houseDiscount, me?.champ, chairShopDiscount(me?.chair, "furniture"))) : 0;
  // 가방에 남은 게 있으면 사지 않고 바로 놓을 수 있다
  const trialLeft = trial ? (my.inventory[trial.itemId] ?? 0) - (counts[trial.itemId] ?? 0) : 0;
  // R·단추가 하는 일은 고른 가구에 따라: 네 방향으로 돌리기 / 좌우 뒤집기 (상점 미리보기와 같은 구분)
  const focus = selDef ?? trialDef;
  const mode = focus ? rotateMode(focus) : null;
  const rKey = mode === "turn" ? "R 돌리기" : mode === "flip" ? "R 뒤집기" : "R 돌리기·뒤집기";
  // 터치 기기(화면 버튼을 쓰는 기기)는 키 안내 대신 손가락으로 하는 것만
  const coarse = useMediaQuery("(pointer: coarse)");
  // 11/24 창문 모양: 기본 + 눈꽃 창가 (가구 보따리상 눈꽃 창가가 이 집 가방에 있어야 고른다. 없으면 잠금으로 보여 준다)
  const windowLock = (id: string): string | null =>
    id === DEFAULT_WINDOW || (my.inventory[id] ?? 0) > 0 ? null : away(id) > 0 ? `${skinName(id)}는 다른 집 창문에 쓰고 있어요. 하나로 집 한 채에 쓸 수 있어요.` : WINDOW_LOCKED_MSG;
  const skinLock = (id: string): string | null =>
    id === DEFAULT_FLOOR || id === DEFAULT_WALL || id === baseFloor || id === baseWall || (my.inventory[id] ?? 0) > 0 || away(id) < 1 ? null : `${skinName(id)}, ${SKIN_AWAY_MSG}`;

  // 11/22 아래쪽 시트 정리: 가방 한 줄만 보이고 [가구 | 바닥 | 벽지] 칸으로 바꿔 본다 (시트 안 세로 스크롤 없이 방이 더 보이게)
  const [tab, setTab] = useState<"items" | "floor" | "wall" | "window">("items");
  const TABS = [
    { id: "items", label: "가구", n: owned.length },
    { id: "floor", label: "바닥", n: floors.filter((id) => !skinLock(id)).length },
    { id: "wall", label: "벽지", n: walls.filter((id) => !skinLock(id)).length },
    { id: "window", label: "창문", n: WINDOW_SKINS.filter((id) => !windowLock(id)).length },
  ] as const;
  const skins = tab === "floor" ? floors : tab === "wall" ? walls : WINDOW_SKINS;
  // 캠핑장 집의 기본 바닥·벽(옛 값 DEFAULT_FLOOR·DEFAULT_WALL)은 전용 바닥·벽으로 본다
  const picked =
    tab === "floor"
      ? edit.floor === DEFAULT_FLOOR || !edit.floor
        ? baseFloor
        : edit.floor
      : tab === "wall"
        ? edit.wall === DEFAULT_WALL || !edit.wall
          ? baseWall
          : edit.wall
        : edit.window;
  /** 창문 칸 아이콘: 캠핑장 집의 「기본」 창문은 종류별 창 그림 */
  const skinIcon = (id: string) => (campKind && tab === "window" && id === DEFAULT_WINDOW ? CAMP_WINDOW_STYLE[campKind] : id);
  const lockOf = tab === "window" ? windowLock : skinLock;
  const locked = tab === "items" ? undefined : (skins.map(lockOf).find((m) => m) ?? undefined);
  const hint =
    locked ??
    (coarse ? "끌어서 옮기기 · 빈 곳을 끌면 화면 이동" : `끌어서 옮기기 · 방향키 한 칸 · ${rKey} · Del 치우기 · Q/E 차례로 고르기 · 빈 곳을 끌면 화면 이동`);

  return (
    <section className={cx(ui.panel, styles.toolbar)} aria-label="꾸미기 도구">
      {/* 지금 손에 든 것: 놓아 보는 물건 / 고른 물건 (맨 위, 한 줄 — 폰은 두 줄) */}
      {((trial && trialDef) || (sel && selDef)) && (
        <div className={styles.selStack}>
          {trial && trialDef && (
            <div className={cx(styles.selBar, styles.trialBar)} aria-live="polite" role="group" aria-label="놓아 보는 중">
              <span className={styles.selHead}>
                <FurnitureIcon itemId={trial.itemId} size={32} />
                <span className={styles.selText}>
                  <span className={styles.selName}>{trialDef.name} 놓아 보는 중</span>
                  <span className={styles.small}>
                    끌어서 옮기고 {coarse ? "" : "R로 "}
                    {rotateMode(trialDef) === "turn" ? "돌려" : "뒤집어"} 보세요. 저장은 안 돼요.
                  </span>
                </span>
              </span>
              <button
                type="button"
                className={cx(ui.button, styles.selRot)}
                onClick={() => tool({ action: "rotate" })}
                aria-label={`${trialDef.name} ${rotateMode(trialDef) === "turn" ? "돌리기" : "좌우 뒤집기"}`}
              >
                {ROTATE_LABEL[rotateMode(trialDef)]}
              </button>
              {trialLeft > 0 ? (
                <button type="button" className={cx(ui.button, ui.primary, styles.selMain)} onClick={() => tool({ action: "tryEnd", keep: true })}>
                  가방에서 놓기
                </button>
              ) : (
                <button
                  type="button"
                  className={cx(ui.button, ui.primary, styles.selMain)}
                  disabled={buying || saving || my.points < trialCost}
                  onClick={() => onBuyTrial(trialDef.id)}
                  aria-label={`${trialDef.name}, ${trialCost}포인트에 사서 이 자리에 놓기`}
                >
                  {buying ? "…" : `${fmt(trialCost)}P${my.points < trialCost ? ` · ${fmt(trialCost - my.points)}P 부족해요` : " · 사서 놓기"}`}
                </button>
              )}
              <button type="button" className={cx(ui.button, ui.quiet, styles.selOff)} onClick={() => tool({ action: "tryEnd", keep: false })}>
                그만 보기
              </button>
            </div>
          )}

          {sel && selDef && (
            <div className={styles.selBar} aria-live="polite">
              <span className={styles.selHead}>
                <FurnitureIcon itemId={sel.i} size={32} />
                <span className={styles.selName}>{selDef.name}</span>
              </span>
              <button
                type="button"
                className={cx(ui.button, styles.selRot)}
                onClick={() => tool({ action: "rotate" })}
                aria-label={`${selDef.name} ${rotateMode(selDef) === "turn" ? "돌리기" : "좌우 뒤집기"}`}
              >
                {ROTATE_LABEL[rotateMode(selDef)]}
              </button>
              {selFixture ? (
                <span className={cx(styles.small, styles.selMain)} title={FIXTURE_LOCKED}>
                  집에 딸린 가구
                </span>
              ) : (
                <button type="button" className={cx(ui.button, ui.danger, styles.selMain)} onClick={() => tool({ action: "remove" })}>
                  치우기
                </button>
              )}
              <div className={styles.nudge} role="group" aria-label="한 칸씩 옮기기">
                <button type="button" className={cx(ui.button, ui.icon)} onClick={() => tool({ action: "nudge", dx: -1, dy: 0 })} aria-label="왼쪽으로">
                  ←
                </button>
                <button type="button" className={cx(ui.button, ui.icon)} onClick={() => tool({ action: "nudge", dx: 0, dy: -1 })} aria-label="위로">
                  ↑
                </button>
                <button type="button" className={cx(ui.button, ui.icon)} onClick={() => tool({ action: "nudge", dx: 0, dy: 1 })} aria-label="아래로">
                  ↓
                </button>
                <button type="button" className={cx(ui.button, ui.icon)} onClick={() => tool({ action: "nudge", dx: 1, dy: 0 })} aria-label="오른쪽으로">
                  →
                </button>
              </div>
              <button type="button" className={cx(ui.button, ui.quiet, styles.selOff)} onClick={() => tool({ action: "deselect" })}>
                선택 해제
              </button>
            </div>
          )}
        </div>
      )}

      <div className={styles.editTabs} role="tablist" aria-label="가방 칸">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" className={styles.editTab} aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            <span className={styles.editTabN}>{t.n}</span>
          </button>
        ))}
      </div>
      <span className={styles.editCount}>
        물건 {placedN}/{maxItems}
      </span>

      <div className={styles.editActions}>
        <button type="button" className={ui.button} onClick={onShop}>
          가구 상점
        </button>
        <button type="button" className={ui.button} onClick={() => bridge.emit("house:edit", { on: false, revert: true })} disabled={saving}>
          {edit.dirty ? "되돌리기" : "닫기"}
        </button>
        <button type="button" className={cx(ui.button, ui.primary)} onClick={() => onSave(true)} disabled={saving || !edit.dirty}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>

      {/* 가방 한 줄 (가로로만 넘긴다 — 마우스 휠도 가로로) */}
      {tab === "items" && owned.length === 0 ? (
        <p className={cx(styles.muted, styles.paletteEmpty)}>가방이 비어 있어요. 가구 상점에서 물건을 사 오세요.</p>
      ) : (
        <div
          className={styles.palette}
          role="group"
          aria-label={tab === "items" ? "가방: 눌러서 놓기" : tab === "floor" ? "바닥 고르기" : tab === "wall" ? "벽지 고르기" : "창문 고르기"}
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
          }}
        >
          {tab === "items"
            ? owned.map((f) => {
                const left = (my.inventory[f.id] ?? 0) - (counts[f.id] ?? 0);
                const elsewhere = left < 1 && away(f.id) > 0;
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={styles.paletteItem}
                    disabled={left < 1 && !elsewhere}
                    aria-disabled={elsewhere || undefined}
                    style={elsewhere ? { opacity: 0.55 } : undefined}
                    title={elsewhere ? AWAY_MSG : f.name}
                    onClick={() => (elsewhere ? bridge.emit("house:notice", { message: `${f.name}, ${AWAY_MSG}` }) : tool({ action: "place", itemId: f.id }))}
                    aria-label={elsewhere ? `${f.name}, ${AWAY_MSG}` : `${f.name} 놓기, 남은 개수 ${left}`}
                  >
                    <span className={styles.count}>{Math.max(0, left)}</span>
                    <FurnitureIcon itemId={f.id} size={36} />
                    <span className={styles.paletteLabel}>{f.name}</span>
                  </button>
                );
              })
            : skins.map((id) => {
                const lock = lockOf(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={styles.paletteItem}
                    aria-pressed={picked === id}
                    aria-disabled={lock ? true : undefined}
                    style={lock ? { opacity: 0.55 } : undefined}
                    title={lock ?? skinName(id)}
                    aria-label={lock ? `${skinName(id)}, ${lock}` : undefined}
                    onClick={() =>
                      lock
                        ? bridge.emit("house:notice", { message: lock })
                        : tool(tab === "floor" ? { action: "skin", floor: id } : tab === "wall" ? { action: "skin", wall: id } : { action: "skin", window: id })
                    }
                  >
                    {lock && (
                      <span className={styles.count} aria-hidden="true">
                        <PixelIcon name="lock" />
                      </span>
                    )}
                    <FurnitureIcon itemId={skinIcon(id)} size={36} />
                    <span className={styles.paletteLabel}>{skinName(id)}</span>
                  </button>
                );
              })}
        </div>
      )}

      <p className={styles.editHint} title={hint}>
        {hint}
      </p>
    </section>
  );
}
