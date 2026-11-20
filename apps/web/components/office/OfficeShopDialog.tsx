"use client";

import { useCallback, useEffect, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { meStore, useMe } from "@/lib/hooks/useMe";
import type { NpcFurnRow } from "@/lib/housing/npcFurnShop";
import { officeApi } from "@/lib/office/client";
import type { OfficeStatus } from "@/lib/office/service";
import { houseKnown, NoHouseTalk, rememberHouse } from "../noHouse/NoHouseTalk";
import { NO_HOUSE_BROWSING } from "../noHouse/noHouseText";
import NpcFurniturePanel from "../npcShop/NpcFurniturePanel";
import shop from "../shop/ShopDialog.module.css";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { OFFICE_FOOT, OFFICE_HELLO, OFFICE_LOADING, OFFICE_SHOP_TITLE, officeBoughtText } from "./officeText";

// 11/20 「총무팀 문대리」 창 (야근 빌딩 오른쪽 사무실 가구 카트 앞에서 E). 서버 /api/office (lib/office).
//  - 사무실 가구 15종: NPC 가구 상점 공용 판(components/npcShop — 보리 「집 가구」 탭에서 뗀 틀: 큰 미리보기·돌려 보기 4방향·낮밤)
//  - 집이 없으면 가구 보따리상처럼 판매 창 대신 문대리의 거절 창 (components/noHouse who="clerk") — [그래도 구경만]이면 사기 단추만 흐린 창
//  - 값·할인·가방·한도는 가구점과 같다 (서버 buyFurniture)

export default function OfficeShopDialog({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const [status, setStatus] = useState<OfficeStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [browse, setBrowse] = useState(false);
  /** 응답이 늦을 때 (집 유무를 아직 모르면 잠깐 기다렸다가 창을 연다) */
  const [waited, setWaited] = useState(false);

  const load = useCallback(
    (live: () => boolean = () => true) =>
      officeApi
        .status()
        .then((s) => {
          if (!live()) return;
          setStatus(s);
          rememberHouse(s.house);
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
    const t = window.setTimeout(() => setWaited(true), 600);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [load]);

  async function buy(row: NpcFurnRow) {
    setPending(row.id);
    setNotice(null);
    try {
      const res = await officeApi.buy(row.id);
      setStatus(res);
      meStore.set(res.me);
      bridge.emit("forage:coin");
      setNotice(officeBoughtText(res.got));
    } catch (e) {
      setNotice(errorMessage(e));
      void load();
    } finally {
      setPending(null);
    }
  }

  const points = me?.points ?? status?.points ?? null;
  // 집 유무: 응답 전엔 지난번에 안 값으로 (가구 보따리상과 같은 규칙)
  const house = status ? status.house !== false : houseKnown();
  const noHouse = house === false;
  if (noHouse && !browse) return <NoHouseTalk who="clerk" onBrowse={() => setBrowse(true)} onClose={onClose} />;
  if (house === null && !loadError && !waited) return null;

  return (
    <Dialog title={OFFICE_SHOP_TITLE} onClose={onClose}>
      <div className={shop.shop}>
        <div className={shop.top}>
          <p className={shop.balance}>
            내 포인트 <strong>{points === null ? "–" : points.toLocaleString("ko-KR")}</strong>
          </p>
          <p className={shop.topHint}>{noHouse ? NO_HOUSE_BROWSING : OFFICE_HELLO}</p>
        </div>
        {loadError && !status && <p className={ui.error}>{loadError}</p>}
        <NpcFurniturePanel
          rows={status?.furn ?? (loadError ? [] : null)}
          points={points}
          signedIn={!!me}
          noHouse={noHouse}
          pending={pending}
          onBuy={(r) => void buy(r)}
          onPick={() => setNotice(null)}
          listLabel="파는 사무실 가구"
          loadingText={OFFICE_LOADING}
        />
        <p className={shop.notice} role="status">
          {notice ?? OFFICE_FOOT}
        </p>
      </div>
    </Dialog>
  );
}
