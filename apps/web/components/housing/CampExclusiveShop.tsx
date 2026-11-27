"use client";

import { useCallback, useEffect, useState } from "react";
import type { CampHomeKind } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { campOnlyOwnerMsg } from "@/lib/housing/catalog";
import { campShopApi } from "@/lib/housing/campExclusive/client";
import type { CampShopStatus } from "@/lib/housing/campExclusive/service";
import type { NpcFurnRow } from "@/lib/housing/npcFurnShop";
import type { MyHouseResponse } from "@/lib/housing/types";
import NpcFurniturePanel from "../npcShop/NpcFurniturePanel";
import shop from "../shop/ShopDialog.module.css";
import ui from "../ui/ui.module.css";
import { CAMP_SHOP_FOOT, CAMP_SHOP_LOADING, campShopBoughtText } from "./campOfficeText";

// 11/27 캠핑장 분양 NPC 창의 「전용 가구」 탭 (OfficeDialog zone "camp"): 그 종류 전용 가구 8 · 바닥 3 · 벽지 3.
// 판(큰 미리보기·돌려 보기·낮밤·값·가진 개수)은 총무팀 문대리와 같은 NPC 가구 상점 공용 판 (components/npcShop).
// 목록은 누구나 보고, 그 종류 집 주인이 아니면 사기 단추가 「○○ 주인만 살 수 있어요」로 막힌다 (서버도 409 NOT_OWNER).

/** onMy = 산 뒤 내 캠핑장 집 (분양 창·집 화면이 들고 있는 가방을 바로 고친다 — 안 고치면 꾸미기 가방에 산 물건이 안 보였다) */
export default function CampExclusiveShop({ kind, onMy }: { kind: CampHomeKind; onMy?: (r: MyHouseResponse) => void }) {
  const { me } = useMe();
  const [status, setStatus] = useState<CampShopStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    (live: () => boolean = () => true) =>
      campShopApi
        .status(kind)
        .then((s) => {
          if (!live()) return;
          setStatus(s);
          setLoadError(null);
        })
        .catch((e: unknown) => {
          if (live()) setLoadError(errorMessage(e));
        }),
    [kind],
  );

  useEffect(() => {
    let live = true;
    void load(() => live);
    return () => {
      live = false;
    };
  }, [load]);

  async function buy(row: NpcFurnRow) {
    setPending(row.id);
    setNotice(null);
    try {
      const res = await campShopApi.buy(kind, row.id);
      setStatus(res);
      meStore.set(res.me);
      onMy?.(res.house);
      bridge.emit("forage:coin");
      setNotice(campShopBoughtText(res.got));
    } catch (e) {
      setNotice(errorMessage(e));
      void load();
    } finally {
      setPending(null);
    }
  }

  const points = me?.points ?? status?.points ?? null;
  const lock = status && !status.owner ? campOnlyOwnerMsg(kind) : null;
  return (
    <div className={shop.shop}>
      <p className={shop.balance}>
        내 포인트 <strong>{points === null ? "–" : points.toLocaleString("ko-KR")}</strong>
      </p>
      {loadError && !status && <p className={ui.error}>{loadError}</p>}
      <NpcFurniturePanel
        rows={status?.furn ?? (loadError ? [] : null)}
        points={points}
        signedIn={!!me}
        noHouse={false}
        lockText={lock}
        pending={pending}
        onBuy={(r) => void buy(r)}
        onPick={() => setNotice(null)}
        listLabel="파는 전용 가구"
        loadingText={CAMP_SHOP_LOADING}
      />
      <p className={shop.notice} role="status">
        {notice ?? (lock ? `${lock} 목록은 구경할 수 있어요.` : CAMP_SHOP_FOOT[kind])}
      </p>
    </div>
  );
}
