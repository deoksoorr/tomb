"use client";

import { useEffect, useState } from "react";
import { bridge } from "@/game/bridge";
import type { HouseEditState, HouseTool } from "@/game/housing/events";
import { errorMessage } from "@/lib/api";
import { DEFAULT_FLOOR, DEFAULT_FLOOR_NAME, DEFAULT_WALL, DEFAULT_WALL_NAME, FURNITURE, furnitureById, LIKE_WEIGHT, tierById } from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import { layoutCounts, placedScore, styleTag, totalScore } from "@/lib/housing/layout";
import type { MyHouseResponse, PublicHouse } from "@/lib/housing/types";
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
  const layout = editing && edit ? { items: edit.items, floor: edit.floor, wall: edit.wall } : house.layout;
  const score = editing ? totalScore(placedScore(layout), house.likes) : house.score;
  const tag = styleTag(layout);
  const tier = tierById(house.tier)!;

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
      const r = await housingApi.saveLayout(channel, house.tier, { items: edit.items, floor: edit.floor, wall: edit.wall });
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
          <span className={styles.hudName}>{house.name}</span>
          <span className={styles.row} style={{ gap: 6 }}>
            <TitleBadge score={score} />
            <span className={styles.small}>
              {house.ownerName}의 {tier.name} · 꾸밈 {fmt(score)}점 · 좋아요 {house.likes}
              {tag ? ` · ${tag}` : ""}
            </span>
            {here?.online && (
              <span className={styles.tag}>
                함께 {here.count}명{!mine && here.ownerHere ? " · 집주인이 집에 있어요" : ""}
              </span>
            )}
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
            분양 사무소
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
        <EditToolbar edit={edit} my={my} saving={saving} maxItems={tier.maxItems} onSave={save} onShop={() => setModal("shop")} />
      )}

      {modal === "guestbook" && <GuestbookDialog houseId={house.id} houseName={house.name} mine={mine} onClose={() => setModal(null)} />}
      {modal === "shop" && my && (
        <FurnitureShop my={my} placed={edit ? layoutCounts({ items: edit.items, floor: edit.floor, wall: edit.wall }) : layoutCounts(house.layout)} onMy={onMy} onClose={() => setModal(null)} />
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
  maxItems,
  onSave,
  onShop,
}: {
  edit: HouseEditState;
  my: MyHouseResponse;
  saving: boolean;
  maxItems: number;
  onSave: (close: boolean) => void;
  onShop: () => void;
}) {
  const counts = layoutCounts({ items: edit.items, floor: edit.floor, wall: edit.wall });
  const sel = edit.selected ? edit.items.find((p) => p.u === edit.selected) : undefined;
  const selDef = sel && furnitureById(sel.i);
  const owned = FURNITURE.filter((f) => !f.skin && !f.ext && (my.inventory[f.id] ?? 0) > 0);
  const floors = [DEFAULT_FLOOR, ...FURNITURE.filter((f) => f.skin === "floor" && (my.inventory[f.id] ?? 0) > 0).map((f) => f.id)];
  const walls = [DEFAULT_WALL, ...FURNITURE.filter((f) => f.skin === "wall" && (my.inventory[f.id] ?? 0) > 0).map((f) => f.id)];
  const tool = (t: HouseTool) => bridge.emit("house:tool", t);
  const skinName = (id: string) => (id === DEFAULT_FLOOR ? DEFAULT_FLOOR_NAME : id === DEFAULT_WALL ? DEFAULT_WALL_NAME : (furnitureById(id)?.name ?? id));

  return (
    <section className={cx(ui.panel, styles.toolbar)} aria-label="꾸미기 도구">
      <div className={styles.spread}>
        <p className={styles.small}>
          끌어서 옮기기 · 방향키 한 칸 · R 돌리기 · Del 치우기 · Q/E 차례로 고르기 · 빈 곳을 끌면 화면 이동 (물건 {edit.items.length}/{maxItems})
        </p>
        <div className={styles.row}>
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
      </div>

      {sel && selDef && (
        <div className={styles.selBar} aria-live="polite">
          <FurnitureIcon itemId={sel.i} size={32} />
          <span className={ui.label}>{selDef.name}</span>
          <button type="button" className={ui.button} onClick={() => tool({ action: "rotate" })}>
            돌리기
          </button>
          <button type="button" className={cx(ui.button, ui.danger)} onClick={() => tool({ action: "remove" })}>
            치우기
          </button>
          <div className={styles.row} style={{ gap: 2 }} role="group" aria-label="한 칸씩 옮기기">
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
          <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => tool({ action: "deselect" })}>
            선택 해제
          </button>
        </div>
      )}

      {owned.length === 0 ? (
        <p className={styles.muted}>가방이 비어 있어요. 가구 상점에서 물건을 사 오세요.</p>
      ) : (
        <div className={styles.palette} role="group" aria-label="가방: 눌러서 놓기">
          {owned.map((f) => {
            const left = (my.inventory[f.id] ?? 0) - (counts[f.id] ?? 0);
            return (
              <button
                key={f.id}
                type="button"
                className={styles.paletteItem}
                disabled={left < 1}
                onClick={() => tool({ action: "place", itemId: f.id })}
                aria-label={`${f.name} 놓기, 남은 개수 ${left}`}
              >
                <span className={styles.count}>{left}</span>
                <FurnitureIcon itemId={f.id} size={36} />
                <span className={styles.paletteLabel}>{f.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.row}>
        <span className={styles.small}>바닥</span>
        {floors.map((id) => (
          <button key={id} type="button" className={styles.paletteItem} aria-pressed={edit.floor === id} onClick={() => tool({ action: "skin", floor: id })} style={{ width: 56, minHeight: 56 }}>
            <FurnitureIcon itemId={id} size={28} />
            <span className={styles.paletteLabel}>{skinName(id)}</span>
          </button>
        ))}
        <span className={styles.small}>벽지</span>
        {walls.map((id) => (
          <button key={id} type="button" className={styles.paletteItem} aria-pressed={edit.wall === id} onClick={() => tool({ action: "skin", wall: id })} style={{ width: 56, minHeight: 56 }}>
            <FurnitureIcon itemId={id} size={28} />
            <span className={styles.paletteLabel}>{skinName(id)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
