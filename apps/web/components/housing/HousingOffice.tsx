"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { campLotByNo, HOUSE_LOTS, WORLD_LOTS, type CampHomeKind } from "@tomb/protocol";
import { campKindOf } from "./campOfficeText";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { meStore } from "@/lib/hooks/useMe";
import { lotLabel } from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import type { MyHouseResponse, PublicHouse, VillageResponse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { hopChannel } from "./channelHop";
import { houseChannelFullMsg } from "@/game/net/switchPolicy";
import ExteriorDialog from "./ExteriorDialog";
import HouseHud from "./HouseHud";
import styles from "./housing.module.css";
import OfficeDialog from "./OfficeDialog";
import { campOf, isCampHouse } from "@/game/camp/campSaleApi";
import { useRideStopGate } from "../overlay/RideStopDialog";

type Mode = { kind: "office" } | { kind: "pending" } | { kind: "village" } | { kind: "house"; house: PublicHouse; mine: boolean; edit: boolean };
/** 메인 맵 주거 구역에서 열었을 때: 그 집 문(houseId) 또는 빈 필지(lot) */
/** stay: [집] → [내 집 가기]로 바로 들어감 (11/26부터 나올 자리는 같다 — 늘 그 집 맵의 문 앞. game/housing/housePlace) */
/**
 * 11/26 zone "camp" = 캠핑장 분양 창 (분양 사무소 창 그대로 — OfficeDialog zone "camp"). camp = 창을 연 분양 NPC가 파는 종류 하나
 * (언젠가 씨 카라반 · 소슬댁 펜션 · 순이 할머니 촌캉스 — 종류를 바꾸는 탭은 없다). camp가 없으면 lot의 종류 (빈 터 문·팻말)
 */
export type HousingIntent = { houseId?: string; lot?: number; zone?: "sea" | "camp"; camp?: CampHomeKind; stay?: boolean } | null;

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
 *  - 집: 마을의 문이나 사무소 창에서 들어간다. 11/26 나오면 그 집 맵의 문 앞으로 (분양 마을에서 들어갔으면 분양 마을)
 *  - 월드로 돌아오면 onClose (월드의 분양 사무소 앞). 집 안 "분양 사무소" 버튼은 창으로 돌아온다
 *  - 분양 마을은 메인 맵의 주거 구역(1..WORLD_LOTS번지)이 됐다: 주거 구역의 집 문에서 열면(intent.houseId) 바로 그 집으로,
 *    빈 필지 팻말에서 열면(intent.lot) 그 번지로 분양 창. "주거 구역 보기"는 창을 닫고 월드가 그 번지를 비춘다(world:lot).
 *    WORLD_LOTS보다 큰 번지(예전에 분양된 먼 번지)만 예전 분양 마을 씬(2단지)으로 간다
 *  - 채널마다 주거 구역(1..WORLD_LOTS번지 + 2단지)이 따로다. channel = 지금 화면에 보이는 채널이고, 분양·마을 정보는 이 채널 것만 다룬다.
 *    내 집이 다른 채널에 있으면 "내 집 보러 가기·들어가기·외관 꾸미기"는 먼저 그 채널로 옮긴 뒤 한다 (hopChannel)
 */
export default function HousingOffice({ onClose, intent = null, channel }: { onClose: () => void; intent?: HousingIntent; channel: number }) {
  const [mode, setMode] = useState<Mode>(intent?.houseId ? { kind: "pending" } : { kind: "office" });
  // 11/22 탈것에 탄 채 집·마을로 가려다 막힘 → 이 창 대신 가운데 알림 (펫이면 [내리고 ○○] — 내린 뒤 이어서). enterTry = 집 들어가기 다시 해 보기
  const { rideStop, gate } = useRideStopGate(onClose);
  const [enterTry, setEnterTry] = useState(0);
  /** 11/22 [내리고 가기] 뒤 분양 마을 다시 가기 (showVillage 자기 자신) */
  const showVillageRef = useRef<((ch: number, spawnLot: number | null, fresh?: boolean) => Promise<void>) | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [my, setMy] = useState<MyHouseResponse | null>(null);
  const [myError, setMyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [visitError, setVisitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [villageCount, setVillageCount] = useState<number | null>(null);
  // 11/16 포구 오두막 (포구 부동산에서 열었거나 오두막에 들어갈 때만 받는다)
  const [seaMy, setSeaMy] = useState<MyHouseResponse | null>(null);
  const [seaError, setSeaError] = useState<string | null>(null);
  const seaRef = useRef<MyHouseResponse | null>(null);
  /** 사무소 창이 포구 부동산인지 (포구에서 열었거나 오두막에서 「포구 부동산」으로 나왔을 때) */
  const [seaOffice, setSeaOffice] = useState(intent?.zone === "sea");
  // 11/26 캠핑장 집 (캠핑장 분양 창에서 열었거나 캠핑장 집에 들어갈 때만 받는다)
  const [campMy, setCampMy] = useState<MyHouseResponse | null>(null);
  const [campError, setCampError] = useState<string | null>(null);
  const campRef = useRef<MyHouseResponse | null>(null);
  /** 사무소 창이 캠핑장 분양 창인지 */
  const [campOffice, setCampOffice] = useState(intent?.zone === "camp");
  /** 캠핑장 분양 창이 파는 종류 (그 NPC의 것 하나. 캠핑장 집 안에서 [○○ 분양]으로 나오면 그 집 종류) */
  const [campKind, setCampKind] = useState<CampHomeKind>(() => campKindOf(intent));
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
    if (!campOffice || campRef.current) return;
    let alive = true;
    housingApi
      .mine("camp")
      .then((r) => {
        if (!alive || campRef.current) return;
        campRef.current = r;
        setCampMy(r);
      })
      .catch((e) => alive && setCampError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [campOffice]);

  const onCampMy = useCallback((r: MyHouseResponse) => {
    campRef.current = r;
    setCampMy(r);
    void meStore.refresh();
    bridge.emit("camp:homes", { myHouseId: r.house?.id ?? null });
  }, []);

  /** 내 캠핑장 집 들어가기 (꾸미기는 그 집이 있는 채널에서만 — 창의 단추가 막는다) */
  const enterCamp = useCallback((edit: boolean) => {
    const h = campRef.current?.house;
    if (!h) return;
    setOverlay(null);
    setMode({ kind: "house", house: h, mine: true, edit });
  }, []);

  useEffect(() => {
    // 11/26 캠핑장 분양 창도 포구 오두막을 받는다 (별장 값 — 서버가 prices.villa를 안 줄 때)
    if (!(seaOffice || campOffice) || seaRef.current) return;
    let alive = true;
    housingApi
      .mine("sea")
      .then((r) => {
        if (!alive || seaRef.current) return;
        seaRef.current = r;
        setSeaMy(r);
      })
      .catch((e) => alive && setSeaError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [seaOffice, campOffice]);

  const onSeaMy = useCallback((r: MyHouseResponse) => {
    seaRef.current = r;
    setSeaMy(r);
    void meStore.refresh();
    bridge.emit("sea:cottages", { myHouseId: r.house?.id ?? null });
  }, []);

  /** 내 오두막 들어가기 (꾸미기는 오두막이 있는 채널에서만 — 창의 단추가 막는다) */
  const enterSea = useCallback((edit: boolean) => {
    const h = seaRef.current?.house;
    if (!h) return;
    setOverlay(null);
    setMode({ kind: "house", house: h, mine: true, edit });
  }, []);

  // 11/26 창을 열 때 내 집 정보 요청은 한 번만 (아래 첫 받기와 집 문으로 열었을 때가 같은 요청을 함께 쓴다 — 예전엔 같은 요청이 두 번 나갔다)
  const firstMine = useRef<Promise<MyHouseResponse> | null>(null);
  const loadMine = useCallback(() => (firstMine.current ??= housingApi.mine()), []);

  useEffect(() => {
    let alive = true;
    loadMine()
      // 늦게 온 첫 응답이 그 사이 저장(분양·업그레이드·외관) 결과를 덮지 않게: 아직 없을 때만
      .then((r) => alive && setMy((prev) => prev ?? r))
      .catch((e) => alive && setMyError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [loadMine]);

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
      // 11/19 2단지는 닫았다: 메인 맵에 없는 내 집(필지 대기·옮기기 전 2단지 번지)은 마을 대신 집 안으로 바로
      if (!inScene.current && mine && lot !== null && (lot === 0 || lot > WORLD_LOTS)) {
        setOverlay(null);
        setMode({ kind: "house", house: mine, mine: true, edit: false });
        return;
      }
      if (!inScene.current && (lot === null || lot <= WORLD_LOTS)) {
        emitVillage(village, myHouseId);
        if (lot !== null) bridge.emit("world:lot", { lot, label: mine?.ch === ch && mine.lot === lot ? "내 집" : `${lot}번지` });
        else bridge.emit("world:lot", { lot: HOUSE_LOTS[0].lot, label: "주거 구역" }); // 11/15 1번지는 없앴다 — 맨 앞 필지
        onCloseRef.current();
        return;
      }
      if (inScene.current && !spawnLot && fresh) emitVillage(village, myHouseId);
      else {
        // 11/16 마을에서 분양 마을로 갈 때: 탈것에 탄 채로는 못 간다 (lib/rideGate)
        if (!inScene.current && gate("분양 마을에 갈", { label: "내리고 가기", run: () => void showVillageRef.current?.(ch, spawnLot, fresh) })) return;
        bridge.emit("village:enter", { village, myHouseId, spawnLot });
      }
      inScene.current = true;
      setOverlay(null);
      setMode({ kind: "village" });
    } catch (e) {
      setVisitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [gate]);
  useEffect(() => {
    showVillageRef.current = showVillage;
  }, [showVillage]);

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
      (full) => {
        hopOff.current = null;
        setBusy(false);
        setNotice(null);
        // 꽉 찬 채널이면 게임이 옮기지 않고(지금 채널 그대로) 이미 토스트로 안내했다
        const msg = full ?? `${h.ch}채널로 옮기지 못했어요. 잠시 뒤 다시 해 주세요.`;
        setVisitError(msg);
        if (!full) bridge.emit("toast", { message: msg });
      },
      { fullMsg: houseChannelFullMsg(h.ch) },
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
    // 11/16 마을에서 바로 들어갈 때: 탈것에 탄 채로는 못 들어간다. 의자·벤치면 일어나서
    // 11/22 아래 토스트 대신 가운데 알림 ([확인]이면 창을 닫고, [내리고 들어가기]면 내린 뒤 다시 — enterTry)
    if (!inScene.current && gate("집에 들어갈", { label: "내리고 들어가기", run: () => setEnterTry((n) => n + 1) })) return;
    inScene.current = true;
    const stay = !!intent?.stay && mode.house.id === intent.houseId;
    bridge.emit("house:enter", { house: mode.house, mine: mode.mine, edit: mode.edit, ...(stay ? { stay } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 같은 집 안에서 정보만 바뀔 때(좋아요·저장)는 다시 들어가지 않는다
  }, [enterKey, enterTry]);

  /**
   * 11/26 집 안으로: 다른 채널의 집이면 그 채널로 옮긴 뒤 (나오면 그 채널 그 집 맵의 문 앞 — game/housing/housePlace).
   * 그 채널이 꽉 찼거나 못 옮겼으면 들어가지 않고 창을 닫는다 (지금 자리 그대로 — 꽉 찬 안내는 게임이 토스트로). 집 안에서 다른 집으로 갈 때는 옮기지 않는다
   */
  const enterOn = useCallback((house: PublicHouse, mine: boolean) => {
    const go = () => {
      setOverlay(null);
      setMode({ kind: "house", house, mine, edit: false });
    };
    hopOff.current?.();
    hopOff.current = null;
    if (inScene.current || house.ch === chRef.current) return go();
    setBusy(true);
    setNotice(`${house.ch}채널로 옮기는 중…`);
    hopOff.current = hopChannel(
      house.ch,
      chRef.current,
      () => {
        hopOff.current = null;
        chRef.current = house.ch;
        setBusy(false);
        setNotice(null);
        go();
      },
      (full) => {
        hopOff.current = null;
        setBusy(false);
        setNotice(null);
        // 꽉 찬 채널이면 게임이 옮기지 않고(지금 채널 그대로) 이미 토스트로 안내했다
        if (!full) bridge.emit("toast", { message: `${house.ch}채널로 옮기지 못했어요. 잠시 뒤 다시 해 주세요.` });
        onCloseRef.current();
      },
      { fullMsg: houseChannelFullMsg(house.ch) },
    );
  }, []);

  const visit = useCallback(async (id: string) => {
    setVisitError(null);
    const mine = myRef.current?.house;
    if (mine?.id === id) return enterOn(mine, true);
    const sea = seaRef.current?.house;
    if (sea?.id === id) return enterOn(sea, true);
    const camp = campRef.current?.house;
    if (camp?.id === id) return enterOn(camp, true);
    setBusy(true);
    try {
      const { house } = await housingApi.detail(id);
      setBusy(false);
      enterOn(house, false);
    } catch (e) {
      setVisitError(errorMessage(e));
      setNotice(errorMessage(e));
      setBusy(false);
    }
  }, [enterOn]);

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
      // 내 집 문이면 주인으로 들어간다 (내 정보가 아직 없으면 한 번 받아 본다).
      // 11/26 내 정보를 아직 모르면 그 집 정보도 함께 받기 시작한다 (예전엔 내 정보를 받은 뒤에야 집을 받았다 — 남의 집이 요청 한 번만큼 늦게 열렸다)
      const known = myRef.current;
      const early = known ? null : housingApi.detail(intentHouse);
      early?.catch(() => undefined);
      const me = known ?? (await loadMine().catch(() => null));
      if (!alive) return;
      const mine = me?.house;
      if (mine?.id === intentHouse) return enterOn(mine, true);
      try {
        const { house } = await (early ?? housingApi.detail(intentHouse));
        if (!alive) return;
        // 11/16 오두막이면 내 오두막인지 한 번 더 본다 (주인이면 꾸미기·가방이 열린다)
        // 11/26 캠핑장 집도 내 집인지 한 번 더 본다
        if (isCampHouse(house)) {
          const camp = campRef.current ?? (await housingApi.mine("camp").catch(() => null));
          if (!alive) return;
          if (camp?.house?.id === intentHouse) {
            campRef.current = camp;
            setCampMy(camp);
            return enterOn(camp.house, true);
          }
        }
        if (house.zone === "sea") {
          const sea = seaRef.current ?? (await housingApi.mine("sea").catch(() => null));
          if (!alive) return;
          if (sea?.house?.id === intentHouse) {
            seaRef.current = sea;
            setSeaMy(sea);
            return enterOn(sea.house, true);
          }
        }
        enterOn(house, false);
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
  }, [intentHouse, loadMine, enterOn]);

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

  // 터치 기기는 E 키 대신 [상호작용] 버튼
  const coarse = useMediaQuery("(pointer: coarse)");
  if (rideStop) return rideStop;
  if (mode.kind === "pending") return null;

  if (mode.kind === "house") {
    const sea = mode.house.zone === "sea";
    const camp = isCampHouse(mode.house);
    return (
      <HouseHud
        key={mode.house.id}
        house={mode.house}
        mine={mode.mine}
        my={mode.mine ? (camp ? campMy : sea ? seaMy : my) : null}
        channel={channel}
        onMy={camp ? onCampMy : sea ? onSeaMy : onMy}
        onHouse={(house) => setMode((m) => (m.kind === "house" ? { ...m, house } : m))}
        onLeave={(toOffice) => {
          backToOffice.current = toOffice;
          setSeaOffice(sea);
          setCampOffice(camp);
          if (camp) setCampKind(campOf(mode.house).kind);
          bridge.emit("house:exit");
        }}
      />
    );
  }

  // 11/26 캠핑장 분양 창: 분양 사무소 창 그대로 (zone="camp" — 그 NPC가 파는 종류 하나만: 언젠가 씨 카라반·소슬댁 펜션·순이 할머니 촌캉스)
  if (campOffice && mode.kind === "office")
    return (
      <OfficeDialog
        zone="camp"
        campKind={campKind}
        villa={my && (seaMy || seaError) ? !!my.house || !!seaMy?.house : myError ? !!seaMy?.house : null}
        my={campMy}
        myError={campError}
        onMy={onCampMy}
        busy={busy}
        visitError={visitError}
        presetLot={intent?.zone === "camp" && intent.lot && campLotByNo(intent.lot)?.kind === campKind ? intent.lot : null}
        channel={channel}
        onClose={onClose}
        onEnterMine={enterCamp}
        onVisit={(id) => void visit(id)}
        onVillage={(lot) => {
          // 내 캠핑장 집 앞으로 (캠핑장에 있을 때만 단추가 보인다 — 창을 닫는다)
          if (lot !== null) bridge.emit("camp:lot", { lot });
          onClose();
        }}
        onExterior={() => undefined}
      />
    );

  // 11/16 포구 부동산: 분양 사무소 창 그대로 (zone="sea" — 번지 이름·값·겉모습만 다르다)
  if (seaOffice && mode.kind === "office")
    return (
      <OfficeDialog
        zone="sea"
        villa={my ? !!my.house : myError ? false : null}
        my={seaMy}
        myError={seaError}
        onMy={onSeaMy}
        busy={busy}
        visitError={visitError}
        presetLot={intent?.zone === "sea" ? (intent.lot ?? null) : null}
        channel={channel}
        onClose={onClose}
        onEnterMine={enterSea}
        onVisit={(id) => void visit(id)}
        onVillage={(lot) => {
          // 내 오두막 보러 가기: 바닷가면 그 터 앞으로 (창을 닫는다)
          if (lot !== null) bridge.emit("sea:lot", { lot });
          onClose();
        }}
        onExterior={() => undefined}
      />
    );

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
              {channel}채널 · {h ? `내 집 ${lotLabel(h.ch, h.lot)} · ${h.name}` : "빈 자리 팻말에서 분양받을 수 있어요"} · {coarse ? "문 앞에서 [상호작용] 버튼을 누르거나 집을 눌러 들어가요" : "문 앞에서 E를 누르거나 집을 눌러 들어가요"}
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
