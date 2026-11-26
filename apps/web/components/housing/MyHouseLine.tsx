"use client";

import { useEffect, useState } from "react";
import { campLotName } from "@tomb/protocol";
import { campHousingApi, isCampHouse } from "@/game/camp/campSaleApi";
import { houseChannelFullMsg, lobbyChannelFull } from "@/game/net/switchPolicy";
import { houseLabel } from "@/lib/housing/catalog";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { useLobby } from "@/lib/hooks/useLobby";
import { housingApi } from "@/lib/housing/client";
import type { PublicHouse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";

/**
 * 내 정보 창의 "내 집" 한 줄: 내 집이 있는 채널·번지와 [내 집 가기].
 * 채널마다 주거 구역이 따로라, 다른 채널에 있으면 그 채널로 옮긴 뒤 간다 (onGo가 처리). 그 채널이 꽉 찼으면 버튼을 막고 이유를 보여 준다.
 * 11/16 포구 오두막도 있으면 두 집을 한 줄씩 보여 주고 어느 집으로 갈지 고른다 (11/26 캠핑장 집도)
 */
export default function MyHouseLine({ channel, onGo, onOffice }: { channel: number; onGo: (house: PublicHouse) => void; onOffice: () => void }) {
  const [house, setHouse] = useState<PublicHouse | null | undefined>(undefined);
  const [sea, setSea] = useState<PublicHouse | null>(null);
  const [camp, setCamp] = useState<PublicHouse | null>(null);
  const lobby = useLobby().lobby;
  // 11/20 운영자는 정원 밖: 꽉 찬 채널이어도 막지 않는다
  const staff = useBridgeValue("me:staff")?.on === true;
  useEffect(() => {
    let alive = true;
    housingApi
      .mine()
      .then((r) => alive && setHouse(r.house))
      .catch(() => alive && setHouse(null));
    housingApi
      .mine("sea")
      .then((r) => alive && setSea(r.house))
      .catch(() => undefined);
    campHousingApi
      .mine()
      .then((r) => alive && setCamp(r.house))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (house === undefined) return <p className={styles.muted}>불러오는 중…</p>;
  const line = (h: PublicHouse, label: string) => {
    const here = h.ch === channel;
    const full = !here && lobbyChannelFull(lobby, h.ch, staff) ? houseChannelFullMsg(h.ch) : null;
    return (
      <div className={styles.spread} key={h.id}>
        <p className={styles.small}>
          <strong>{h.name}</strong> · {isCampHouse(h) ? `${h.ch}채널 캠핑장 ${campLotName(h.lot)}` : houseLabel(h)}
          {here ? " (지금 채널)" : ` (지금 ${channel}채널)`}
          {full && (
            <>
              <br />
              {full}
            </>
          )}
        </p>
        <button type="button" className={cx(ui.button, ui.primary)} disabled={!!full} title={full ?? undefined} onClick={() => onGo(h)}>
          {here ? label : `${h.ch}채널로 옮겨 ${label}`}
        </button>
      </div>
    );
  };
  // 여러 채를 가졌으면 어느 집으로 갈지 고른다
  const others = [sea && line(sea, "오두막 가기"), camp && line(camp, "캠핑장 집 가기")].filter(Boolean);
  if (others.length > 0 && (house || others.length > 1))
    return (
      <div className={styles.stack}>
        {house && line(house, "마을 집 가기")}
        {others}
      </div>
    );
  if (others.length > 0) return others[0];
  if (!house)
    return (
      <div className={styles.spread}>
        <p className={styles.muted}>아직 내 집이 없어요.</p>
        <button type="button" className={ui.button} onClick={onOffice}>
          분양 사무소
        </button>
      </div>
    );
  return line(house, "내 집 가기");
}
