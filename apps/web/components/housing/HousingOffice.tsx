"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WORLD_LOTS } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import { lotLabel } from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import type { MyHouseResponse, PublicHouse, VillageResponse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { hopChannel } from "./channelHop";
import ExteriorDialog from "./ExteriorDialog";
import HouseHud from "./HouseHud";
import styles from "./housing.module.css";
import OfficeDialog from "./OfficeDialog";

type Mode = { kind: "office" } | { kind: "pending" } | { kind: "village" } | { kind: "house"; house: PublicHouse; mine: boolean; edit: boolean };
/** 메인 맵 주거 구역에서 열었을 때: 그 집 문(houseId) 또는 빈 필지(lot) */
export type HousingIntent = { houseId?: string; lot?: number } | null;
/**
 * 마을 정보를 게임(메인 맵 집·마을 씬)에 넘긴다. 저장 직후 연달아 받은 응답이 순서가 뒤바뀌어 와도
 * 이미 보낸 것보다 먼저 만든 정보(generatedAt)는 버린다 (업그레이드 뒤 외관 저장이 옛 그림으로 덮이던 문제)
 */
function emitVillage(village: VillageResponse, myHouseId: string | null): void {
  const last = bridge.last("village:data")?.village;
  if (last && last.ch === village.ch && village.generatedAt < last.generatedAt) return;
  bridge.emit("village:data", { village, myHouseId });
}

/** 마을 위에 띄우는 창 */
type Overlay = { kind: "office"; lot: number | null } | { kind: "exterior" } | null;

/**
 * 하우징 입구. 월드의 "분양 사무소"와 상호작용하면 UI가 이 컴포넌트를 연다 (portal:open {kind:"housing"}).
 *  - 분양 사무소 창: 내 집 분양(번지 고르기)·넓히기·외관·들어가기, 분양지 둘러보기·랭킹, 분양 마을로 가기
 *  - 분양 마을: 게임은 village:enter로 마을 씬을 열고, 이 컴포넌트는 위쪽 막대(HUD)만 보여 준다
 *  - 집: 마을의 문이나 사무소 창에서 들어간다. 나오면 들어온 곳(마을 또는 월드)으로
 *  - 월드로 돌아오면 onClose (월드의 분양 사무소 앞). 집 안 "분양 사무소" 버튼은 창으로 돌아온다
 *  - 분양 마을은 메인 맵의 주거 구역(1..WORLD_LOTS번지)이 됐다: 주거 구역의 집 문에서 열면(intent.houseId) 바로 그 집으로,
 *    빈 필지 팻말에서 열면(intent.lot) 그 번지로 분양 창. "주거 구역 보기"는 창을 닫고 월드가 그 번지를 비춘다(world:lot).
 *    WORLD_LOTS보다 큰 번지(예전에 분양된 먼 번지)만 예전 분양 마을 씬(2단지)으로 간다
 *  - 채널마다 주거 구역(1..WORLD_LOTS번지 + 2단지)이 따로다. channel = 지금 화면에 보이는 채널이고, 분양·마을 정보는 이 채널 것만 다룬다.
 *    내 집이 다른 채널에 있으면 "내 집 보러 가기·들어가기·외관 꾸미기"는 먼저 그 채널로 옮긴 뒤 한다 (hopChannel)
 */
export default function HousingOffice({ onClose, intent = null, channel }: { onClose: () => void; intent?: HousingIntent; channel: number }) {
  const [mode, setMode] = useState<Mode>(intent?.houseId ? { kind: "pending" } : { kind: "office" });
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
  const chRef = useRef(channel);
  const hopOff = useRef<(() => void) | null>(null);
  useEffect(() => {
    onCloseRef.current = onClose;
    myRef.current = my;
    chRef.current = channel;
  }, [onClose, my, channel]);

  useEffect(() => {
    let alive = true;
    housingApi
      .mine()
      // 늦게 온 첫 응답이 그 사이 저장(분양·업그레이드·외관) 결과를 덮지 않게: 아직 없을 때만
      .then((r) => alive && setMy((prev) => prev ?? r))
      .catch((e) => alive && setMyError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  /** ch 채널의 마을 정보를 받아 게임에 넘긴다. fresh=true면 CDN 캐시를 건너뛴다 (분양·외관 저장 직후) */
  const showVillage = useCallback(async (ch: number, spawnLot: number | null, fresh = false) => {
    setBusy(true);
    setVisitError(null);
    try {
      const village = await housingApi.village(ch, fresh);
      const mine = myRef.current?.house;
      const myHouseId = mine?.id ?? null;
      // 메인 맵 주거 구역의 번지면: 창을 닫고 월드가 그 번지를 비춘다 (분양 마을 씬으로 가지 않는다)
      const lot = spawnLot ?? (mine?.ch === ch ? mine.lot : null);
      if (!inScene.current && (lot === null || lot <= WORLD_LOTS)) {
        emitVillage(village, myHouseId);
        if (lot !== null) bridge.emit("world:lot", { lot, label: mine?.ch === ch && mine.lot === lot ? "내 집" : `${lot}번지` });
        else bridge.emit("world:lot", { lot: 1, label: "주거 구역" });
        onCloseRef.current();
        return;
      }
      if (inScene.current && !spawnLot && fresh) emitVillage(village, myHouseId);
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

  /** 내 집이 다른 채널에 있으면 그 채널로 옮긴 뒤 run (이미 그 채널이면 바로) */
  const inMyChannel = useCallback((run: () => void) => {
    const h = myRef.current?.house;
    hopOff.current?.();
    hopOff.current = null;
    if (!h || h.ch === chRef.current) return run();
    setBusy(true);
    setNotice(`내 집이 있는 ${h.ch}채널로 옮기는 중…`);
    setVisitError(null);
    hopOff.current = hopChannel(
      h.ch,
      chRef.current,
      () => {
        hopOff.current = null;
        chRef.current = h.ch;
        setBusy(false);
        setNotice(null);
        run();
      },
      () => {
        hopOff.current = null;
        setBusy(false);
        setNotice(null);
        const msg = `${h.ch}채널로 옮기지 못했어요. 채널이 가득 찼을 수 있어요. 잠시 뒤 다시 해 주세요.`;
        setVisitError(msg);
        bridge.emit("toast", { message: msg });
      },
    );
  }, []);

  /** 주거 구역 보기(spawnLot = null) 또는 그 번지로. mine=true면 내 집 번지 (내 집 채널로 옮긴 뒤) */
  const goVillage = useCallback(
    (spawnLot: number | null, fresh = false, mine = false) => {
      if (!mine) return void showVillage(chRef.current, spawnLot, fresh);
      inMyChannel(() => void showVillage(chRef.current, spawnLot, fresh));
    },
    [showVillage, inMyChannel],
  );

  /** 내 집 들어가기 (edit=true면 꾸미기 모드로). 내 집이 다른 채널이면 그 채널로 옮긴 뒤 */
  const enterMine = useCallback(
    (edit: boolean) =>
      inMyChannel(() => {
        const h = myRef.current?.house;
        if (!h) return;
        setOverlay(null);
        setMode({ kind: "house", house: h, mine: true, edit });
      }),
    [inMyChannel],
  );
  const openExterior = useCallback(() => inMyChannel(() => setOverlay({ kind: "exterior" })), [inMyChannel]);

  const onMy = useCallback(
    (r: MyHouseResponse) => {
      const hadHouse = !!myRef.current?.house;
      const extChanged = JSON.stringify(myRef.current?.house?.exterior) !== JSON.stringify(r.house?.exterior);
      const nameChanged = myRef.current?.house?.name !== r.house?.name;
      // F2: 터를 넓히면 주거 구역의 집 그림도 바로 커져야 한다 (예전엔 다음 주기까지 그대로였다)
      const tierChanged = !!myRef.current?.house && myRef.current.house.tier !== r.house?.tier;
      myRef.current = r;
      setMy(r);
      void meStore.refresh();
      // 메인 맵 주거 구역도 바로 다시 세운다 (분양·외관·이름·터 크기가 바뀌었을 때)
      if (r.house && (!hadHouse || extChanged || nameChanged || tierChanged) && r.house.ch === chRef.current)
        void housingApi
          .village(r.house.ch, true)
          .then((village) => emitVillage(village, r.house?.id ?? null))
          .catch(() => undefined);
      // 마을에 있는 동안 분양·외관이 바뀌면 마을을 다시 그린다
      if (inScene.current && mode.kind === "village" && (!hadHouse || extChanged || tierChanged) && r.house) void goVillage(null, true);
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
        const h = myRef.current?.house;
        if (h) setNotice(`이미 ${lotLabel(h.ch, h.lot)}에 내 집이 있어요. 한 계정에 한 채만 분양받을 수 있어요.`);
        else setOverlay({ kind: "office", lot });
      }),
    ];
    return () => {
      offs.forEach((o) => o());
      // 채널을 옮기는 중에 창을 닫았으면 옮긴 뒤 할 일(번지 안내·들어가기)은 그만둔다 (채널 이동 자체는 이어진다)
      hopOff.current?.();
      // 하우징 씬 안에서 이 창이 통째로 닫히면 게임도 월드로 돌려놓는다
      if (inScene.current) {
        bridge.emit("house:exit");
        bridge.emit("village:exit");
      }
    };
  }, [visit]);

  // 주거 구역에서 열린 창: 집 문이면 바로 그 집으로 (못 들어가면 안내 후 닫기)
  const intentHouse = intent?.houseId ?? null;
  useEffect(() => {
    if (!intentHouse) return;
    let alive = true;
    const go = async () => {
      // 내 집 문이면 주인으로 들어간다 (내 정보가 아직 없으면 한 번 받아 본다)
      const me = myRef.current ?? (await housingApi.mine().catch(() => null));
      if (!alive) return;
      const mine = me?.house;
      if (mine?.id === intentHouse) return setMode({ kind: "house", house: mine, mine: true, edit: false });
      try {
        const { house } = await housingApi.detail(intentHouse);
        if (!alive) return;
        setMode({ kind: "house", house, mine: false, edit: false });
      } catch (e) {
        if (!alive) return;
        bridge.emit("toast", { message: errorMessage(e) });
        onCloseRef.current();
      }
    };
    void go();
    return () => {
      alive = false;
    };
  }, [intentHouse]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const exterior = overlay?.kind === "exterior" && my?.house && (
    <ExteriorDialog
      my={my}
      channel={channel}
      onMy={onMy}
      onSaved={() => mode.kind === "village" && void goVillage(null, true)}
      onClose={() => setOverlay(null)}
    />
  );

  if (mode.kind === "pending") return null;

  if (mode.kind === "house") {
    return (
      <HouseHud
        key={mode.house.id}
        house={mode.house}
        mine={mode.mine}
        my={mode.mine ? my : null}
        channel={channel}
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
      channel={channel}
      onClose={inVillage ? () => setOverlay(null) : onClose}
      onEnterMine={enterMine}
      onVisit={visit}
      onVillage={(spawnLot, mine) => goVillage(spawnLot, false, mine)}
      onExterior={openExterior}
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
            <span className={styles.small}>
              {channel}채널 · {h ? `내 집 ${lotLabel(h.ch, h.lot)} · ${h.name}` : "빈 필지의 팻말에서 분양받을 수 있어요"} · 문 앞에서 E 또는 집을 눌러 들어가기
            </span>
          </div>
          <div className={styles.hudButtons}>
            {h && (
              <button
                type="button"
                className={cx(ui.button, ui.primary)}
                onClick={() => enterMine(false)}
              >
                내 집으로
              </button>
            )}
            {h && (
              <button type="button" className={ui.button} onClick={openExterior}>
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
      {overlay?.kind !== "exterior" && office(false, intent?.lot ?? null)}
      {exterior}
    </>
  );
}
