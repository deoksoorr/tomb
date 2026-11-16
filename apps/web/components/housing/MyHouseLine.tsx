"use client";

import { useEffect, useState } from "react";
import { houseChannelFullMsg, lobbyChannelFull } from "@/game/net/switchPolicy";
import { lotLabel } from "@/lib/housing/catalog";
import { useLobby } from "@/lib/hooks/useLobby";
import { housingApi } from "@/lib/housing/client";
import type { PublicHouse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";

/**
 * 내 정보 창의 "내 집" 한 줄: 내 집이 있는 채널·번지와 [내 집 가기].
 * 채널마다 주거 구역이 따로라, 다른 채널에 있으면 그 채널로 옮긴 뒤 간다 (onGo가 처리). 그 채널이 꽉 찼으면 버튼을 막고 이유를 보여 준다
 */
export default function MyHouseLine({ channel, onGo, onOffice }: { channel: number; onGo: (house: PublicHouse) => void; onOffice: () => void }) {
  const [house, setHouse] = useState<PublicHouse | null | undefined>(undefined);
  const lobby = useLobby().lobby;
  useEffect(() => {
    let alive = true;
    housingApi
      .mine()
      .then((r) => alive && setHouse(r.house))
      .catch(() => alive && setHouse(null));
    return () => {
      alive = false;
    };
  }, []);

  if (house === undefined) return <p className={styles.muted}>불러오는 중…</p>;
  if (!house)
    return (
      <div className={styles.spread}>
        <p className={styles.muted}>아직 내 집이 없어요. 분양 사무소에서 지금 채널({channel}채널)의 빈 자리를 분양받을 수 있어요.</p>
        <button type="button" className={ui.button} onClick={onOffice}>
          분양 사무소
        </button>
      </div>
    );
  const here = house.ch === channel;
  const full = !here && lobbyChannelFull(lobby, house.ch) ? houseChannelFullMsg(house.ch) : null;
  return (
    <div className={styles.spread}>
      <p className={styles.small}>
        <strong>{house.name}</strong> · {lotLabel(house.ch, house.lot)}
        {here ? " (지금 채널)" : ` (지금 ${channel}채널)`}
        {full && (
          <>
            <br />
            {full}
          </>
        )}
      </p>
      <button type="button" className={cx(ui.button, ui.primary)} disabled={!!full} title={full ?? undefined} onClick={() => onGo(house)}>
        {here ? "내 집 가기" : `${house.ch}채널로 옮겨 내 집 가기`}
      </button>
    </div>
  );
}
