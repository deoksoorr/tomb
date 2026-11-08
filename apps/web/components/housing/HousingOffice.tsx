"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import { housingApi } from "@/lib/housing/client";
import type { MyHouseResponse, PublicHouse } from "@/lib/housing/types";
import HouseHud from "./HouseHud";
import OfficeDialog from "./OfficeDialog";

type Mode = { kind: "office" } | { kind: "house"; house: PublicHouse; mine: boolean; edit: boolean };

/**
 * 하우징 입구. 월드의 "분양 사무소"와 상호작용하면 UI가 이 컴포넌트를 연다 (portal:open {kind:"housing"}).
 *  - 분양 사무소 창: 내 묘역 분양·넓히기·들어가기, 분양지 둘러보기·랭킹
 *  - 집에 들어가면 창을 닫고 집 안 HUD를 보여 준다 (게임은 house:enter로 집 씬을 연다)
 *  - 문 밖으로 걸어 나가거나 × → onClose (월드의 분양 사무소 앞), "분양 사무소" 버튼 → 창으로 돌아온다
 */
export default function HousingOffice({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>({ kind: "office" });
  const [my, setMy] = useState<MyHouseResponse | null>(null);
  const [myError, setMyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [visitError, setVisitError] = useState<string | null>(null);
  const backToOffice = useRef(false);
  const inHouse = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const refreshMy = useCallback(async () => {
    try {
      setMy(await housingApi.mine());
      setMyError(null);
    } catch (e) {
      setMyError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    housingApi
      .mine()
      .then((r) => alive && setMy(r))
      .catch((e) => alive && setMyError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  const onMy = useCallback((r: MyHouseResponse) => {
    setMy(r);
    void meStore.refresh();
  }, []);

  // 집 안으로: HUD가 먼저 마운트되어 house:state를 구독한 뒤 게임에 알린다 (자식 effect가 먼저 돈다)
  const enterKey = mode.kind === "house" ? `${mode.house.id}:${mode.edit}` : null;
  useEffect(() => {
    if (mode.kind !== "house") return;
    inHouse.current = true;
    bridge.emit("house:enter", { house: mode.house, mine: mode.mine, edit: mode.edit });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 같은 집 안에서 정보만 바뀔 때(좋아요·저장)는 다시 들어가지 않는다
  }, [enterKey]);

  useEffect(() => {
    const off = bridge.on("house:left", () => {
      inHouse.current = false;
      if (backToOffice.current) {
        backToOffice.current = false;
        setMode({ kind: "office" });
        void refreshMy();
      } else onCloseRef.current();
    });
    return () => {
      off();
      // 집 안에서 이 창이 통째로 닫히면 게임도 월드로 돌려놓는다
      if (inHouse.current) bridge.emit("house:exit");
    };
  }, [refreshMy]);

  async function visit(id: string) {
    setVisitError(null);
    if (my?.house?.id === id) {
      setMode({ kind: "house", house: my.house, mine: true, edit: false });
      return;
    }
    setBusy(true);
    try {
      const { house } = await housingApi.detail(id);
      setMode({ kind: "house", house, mine: false, edit: false });
    } catch (e) {
      setVisitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (mode.kind === "house") {
    return (
      <HouseHud
        key={mode.house.id}
        house={mode.house}
        mine={mode.mine}
        my={mode.mine ? my : null}
        onMy={onMy}
        onHouse={(house) => setMode((m) => (m.kind === "house" ? { ...m, house } : m))}
        onLeave={(toOffice) => {
          backToOffice.current = toOffice;
          bridge.emit("house:exit");
        }}
      />
    );
  }

  return (
    <OfficeDialog
      my={my}
      myError={myError}
      onMy={onMy}
      busy={busy}
      visitError={visitError}
      onClose={onClose}
      onEnterMine={(edit) => my?.house && setMode({ kind: "house", house: my.house, mine: true, edit })}
      onVisit={visit}
    />
  );
}
