"use client";

import { useEffect, useState } from "react";
import { houseChannelFullMsg, lobbyChannelFull } from "@/game/net/switchPolicy";
import { errorMessage } from "@/lib/api";
import { DEFAULT_FLOOR, DEFAULT_WALL, DEFAULT_WINDOW, houseLabel, skinName, tierById } from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import type { PublicHouse } from "@/lib/housing/types";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { useLobby } from "@/lib/hooks/useLobby";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";
import { TitleBadge } from "./parts";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 11/24 아래 줄·메뉴의 [집]: 내 집 한눈에 보기 + [내 집 가기]·[오두막 가기]·[분양 사무소].
 * 집이 하나도 없으면 창을 띄우지 않고 분양 사무소로 (onOffice). 가기는 onGo가 채널을 옮긴 뒤 집 안으로 바로 들어간다
 * (나오면 들어가기 전 자리 — game/housing/housePlace)
 */
export default function MyHouseDialog({ channel, onGo, onOffice, onClose }: { channel: number; onGo: (house: PublicHouse) => void; onOffice: () => void; onClose: () => void }) {
  const [house, setHouse] = useState<PublicHouse | null | undefined>(undefined);
  const [sea, setSea] = useState<PublicHouse | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const lobby = useLobby().lobby;
  // 운영자는 정원 밖: 꽉 찬 채널이어도 막지 않는다 (MyHouseLine과 같다)
  const staff = useBridgeValue("me:staff")?.on === true;

  useEffect(() => {
    let alive = true;
    housingApi
      .mine()
      .then((r) => alive && setHouse(r.house))
      .catch((e) => {
        if (!alive) return;
        setHouse(null);
        setError(errorMessage(e));
      });
    housingApi
      .mine("sea")
      .then((r) => alive && setSea(r.house))
      .catch(() => alive && setSea(null));
    return () => {
      alive = false;
    };
  }, []);

  // 둘 다 없으면 분양 사무소로 (불러오지 못했으면 창에 이유를 보여 준다)
  const none = house === null && sea === null && !error;
  useEffect(() => {
    if (none) onOffice();
  }, [none, onOffice]);
  if (none) return null;

  const loading = house === undefined || sea === undefined;
  const card = (h: PublicHouse) => {
    const isSea = h.zone === "sea";
    const tier = tierById(h.tier);
    const here = h.ch === channel;
    const full = !here && lobbyChannelFull(lobby, h.ch, staff) ? houseChannelFullMsg(h.ch) : null;
    const label = isSea ? "오두막 가기" : "내 집 가기";
    // 11/19 2단지를 닫으며 메인 맵 빈 번지가 없어 기다리는 집 (번지 0)
    const where = !isSea && h.lot === 0 ? `${h.ch}채널 · 집터 기다리는 중` : houseLabel(h);
    return (
      <div className={styles.card} key={h.id}>
        <div className={styles.spread}>
          <p className={styles.houseName}>{h.name}</p>
          <TitleBadge score={h.score} />
        </div>
        <p className={styles.small}>
          {where}
          {tier ? ` · ${tier.name}` : ""}
          {here ? " (지금 채널)" : ""}
        </p>
        <p className={styles.small}>
          꾸밈 점수 <strong>{fmt(h.score)}</strong> · 좋아요 {fmt(h.likes)} · 물건 {h.layout.items.length}개
        </p>
        <p className={styles.small}>
          바닥 {skinName(h.layout.floor || DEFAULT_FLOOR)} · 벽 {skinName(h.layout.wall || DEFAULT_WALL)} · 창문 {skinName(h.layout.window ?? DEFAULT_WINDOW)}
        </p>
        {full && <p className={styles.tag}>{full}</p>}
        <div className={styles.row}>
          <button type="button" className={cx(ui.button, ui.primary)} disabled={!!full} title={full ?? undefined} onClick={() => onGo(h)}>
            {here ? label : `${h.ch}채널로 옮겨 ${label}`}
          </button>
        </div>
      </div>
    );
  };

  return (
    <Dialog title="내 집" fitHeight onClose={onClose}>
      <div className={styles.stack}>
        {loading ? (
          <p className={styles.muted}>불러오는 중…</p>
        ) : (
          <>
            {house && card(house)}
            {sea && card(sea)}
            {error && !house && !sea && <p className={styles.notice}>{error}</p>}
          </>
        )}
        <div className={styles.row}>
          <button type="button" className={ui.button} onClick={onOffice}>
            분양 사무소
          </button>
        </div>
      </div>
    </Dialog>
  );
}
