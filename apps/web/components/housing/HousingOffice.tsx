"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import { housingApi } from "@/lib/housing/client";
import type { MyHouseResponse, PublicHouse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import ExteriorDialog from "./ExteriorDialog";
import HouseHud from "./HouseHud";
import styles from "./housing.module.css";
import OfficeDialog from "./OfficeDialog";

type Mode = { kind: "office" } | { kind: "village" } | { kind: "house"; house: PublicHouse; mine: boolean; edit: boolean };
/** 마을 위에 띄우는 창 */
type Overlay = { kind: "office"; lot: number | null } | { kind: "exterior" } | null;

/**
 * 하우징 입구. 월드의 "분양 사무소"와 상호작용하면 UI가 이 컴포넌트를 연다 (portal:open {kind:"housing"}).
 *  - 분양 사무소 창: 내 묘역 분양(번지 고르기)·넓히기·외관·들어가기, 분양지 둘러보기·랭킹, 분양 마을로 가기
 *  - 분양 마을: 게임은 village:enter로 마을 씬을 열고, 이 컴포넌트는 위쪽 막대(HUD)만 보여 준다
 *  - 집: 마을의 문이나 사무소 창에서 들어간다. 나오면 들어온 곳(마을 또는 월드)으로
 *  - 월드로 돌아오면 onClose (월드의 분양 사무소 앞). 집 안 "분양 사무소" 버튼은 창으로 돌아온다
 */
export default function HousingOffice({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>({ kind: "office" });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [my, setMy] = useState<MyHouseResponse | null>(null);
  const [myError, setMyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [visitError, setVisitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [villageCount, setVillageCount] = useState<number | null>(null);
  const backToOffice = useRef(false);
  /** 게임이 하우징 씬(마을·집)에 있는지 */
  const inScene = useRef(false);
  const myRef = useRef<MyHouseResponse | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
    myRef.current = my;
  }, [onClose, my]);

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

  /** 마을 정보를 받아 게임에 넘긴다. fresh=true면 CDN 캐시를 건너뛴다 (분양·외관 저장 직후) */
  const goVillage = useCallback(async (spawnLot: number | null, fresh = false) => {
    setBusy(true);
    setVisitError(null);
    try {
      const village = fresh ? await housingApi.village(true) : await housingApi.village();
      const myHouseId = myRef.current?.house?.id ?? null;
      if (inScene.current && !spawnLot && fresh) bridge.emit("village:data", { village, myHouseId });
      else bridge.emit("village:enter", { village, myHouseId, spawnLot });
      inScene.current = true;
      setOverlay(null);
      setMode({ kind: "village" });
    } catch (e) {
      setVisitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const onMy = useCallback(
    (r: MyHouseResponse) => {
      const hadHouse = !!myRef.current?.house;
      const extChanged = JSON.stringify(myRef.current?.house?.exterior) !== JSON.stringify(r.house?.exterior);
      myRef.current = r;
      setMy(r);
      void meStore.refresh();
      // 마을에 있는 동안 분양·외관이 바뀌면 마을을 다시 그린다
      if (inScene.current && mode.kind === "village" && (!hadHouse || extChanged) && r.house) void goVillage(null, true);
    },
    [goVillage, mode.kind],
  );

  // 집 안으로: HUD가 먼저 마운트되어 house:state를 구독한 뒤 게임에 알린다 (자식 effect가 먼저 돈다)
  const enterKey = mode.kind === "house" ? `${mode.house.id}:${mode.edit}` : null;
  useEffect(() => {
    if (mode.kind !== "house") return;
    inScene.current = true;
    bridge.emit("house:enter", { house: mode.house, mine: mode.mine, edit: mode.edit });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 같은 집 안에서 정보만 바뀔 때(좋아요·저장)는 다시 들어가지 않는다
  }, [enterKey]);

  const visit = useCallback(async (id: string) => {
    setVisitError(null);
    const mine = myRef.current?.house;
    if (mine?.id === id) {
      setOverlay(null);
      setMode({ kind: "house", house: mine, mine: true, edit: false });
      return;
    }
    setBusy(true);
    try {
      const { house } = await housingApi.detail(id);
      setOverlay(null);
      setMode({ kind: "house", house, mine: false, edit: false });
    } catch (e) {
      setVisitError(errorMessage(e));
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const offs = [
      bridge.on("house:left", ({ to }) => {
        if (to === "village") {
          setMode({ kind: "village" });
          return;
        }
        inScene.current = false;
        if (backToOffice.current) {
          backToOffice.current = false;
          setMode({ kind: "office" });
        } else onCloseRef.current();
      }),
      bridge.on("village:left", () => {
        inScene.current = false;
        onCloseRef.current();
      }),
      bridge.on("village:door", ({ houseId }) => void visit(houseId)),
      bridge.on("house:presence", (p) => p.where === "village" && setVillageCount(p.online ? p.count : null)),
      bridge.on("village:lot", ({ lot }) => {
        if (myRef.current?.house) setNotice(`이미 ${myRef.current.house.lot}번지에 내 집이 있어요. 한 계정에 한 채만 분양받을 수 있어요.`);
        else setOverlay({ kind: "office", lot });
      }),
    ];
    return () => {
      offs.forEach((o) => o());
      // 하우징 씬 안에서 이 창이 통째로 닫히면 게임도 월드로 돌려놓는다
      if (inScene.current) {
        bridge.emit("house:exit");
        bridge.emit("village:exit");
      }
    };
  }, [visit]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const exterior = overlay?.kind === "exterior" && my?.house && (
    <ExteriorDialog my={my} onMy={onMy} onSaved={() => mode.kind === "village" && void goVillage(null, true)} onClose={() => setOverlay(null)} />
  );

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

  const office = (inVillage: boolean, lot: number | null) => (
    <OfficeDialog
      my={my}
      myError={myError}
      onMy={onMy}
      busy={busy}
      visitError={visitError}
      presetLot={lot}
      inVillage={inVillage}
      onClose={inVillage ? () => setOverlay(null) : onClose}
      onEnterMine={(edit) => {
        if (!my?.house) return;
        setOverlay(null);
        setMode({ kind: "house", house: my.house, mine: true, edit });
      }}
      onVisit={visit}
      onVillage={(spawnLot) => void goVillage(spawnLot)}
      onExterior={() => setOverlay({ kind: "exterior" })}
    />
  );

  if (mode.kind === "village") {
    const h = my?.house;
    return (
      <>
        <div className={cx(ui.panel, styles.hudTop)} role="region" aria-label="분양 마을">
          <div className={styles.hudInfo}>
            <span className={styles.hudName}>
              분양 마을{villageCount ? <span className={styles.tag}> · 지금 {villageCount}명</span> : null}
            </span>
            <span className={styles.small}>{h ? `내 집 ${h.lot}번지 · ${h.name}` : "빈 필지의 팻말에서 분양받을 수 있어요"} · 문 앞에서 E 또는 집을 눌러 들어가기</span>
          </div>
          <div className={styles.hudButtons}>
            {h && (
              <button type="button" className={cx(ui.button, ui.primary)} onClick={() => setMode({ kind: "house", house: h, mine: true, edit: false })}>
                내 집으로
              </button>
            )}
            {h && (
              <button type="button" className={ui.button} onClick={() => setOverlay({ kind: "exterior" })}>
                외관 꾸미기
              </button>
            )}
            <button type="button" className={ui.button} onClick={() => setOverlay({ kind: "office", lot: null })}>
              분양 사무소
            </button>
            <button type="button" className={cx(ui.button, ui.quiet, ui.icon)} onClick={() => bridge.emit("village:exit")} aria-label="마을에서 나가기">
              <PixelIcon name="close" />
            </button>
          </div>
          <p className={styles.hudNotice} role="status">
            {notice}
          </p>
        </div>
        {overlay?.kind === "office" && office(true, overlay.lot)}
        {exterior}
      </>
    );
  }

  return (
    <>
      {overlay?.kind !== "exterior" && office(false, null)}
      {exterior}
    </>
  );
}
