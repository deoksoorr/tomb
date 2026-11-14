"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { bridge, type GameStartOptions } from "@/game/bridge";
import { api } from "@/lib/api";
import { useBridgeEvent, useBridgeValue } from "@/lib/hooks/useBridge";
import { useGraves } from "@/lib/hooks/useGraves";
import { useGameKeyboardGuard } from "@/lib/hooks/useKeyBlock";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { useMyGraves } from "@/lib/hooks/useMyGraves";
import { useNotices } from "@/lib/hooks/useNotices";
import { showToast, useToasts } from "@/lib/hooks/useToasts";
import { readItem, UI_KEYS, writeItem } from "@/lib/storage";
import { onBackgroundChange } from "@/lib/background";
import { onVisibleAgain, tabHidden } from "@/lib/hooks/visibleAgain";
import { PRESENCE_HIDDEN_INTERVAL_MS, PRESENCE_INTERVAL_MS, type PublicGrave } from "@/lib/types";
import { emitLook, restoreLook } from "../account/actions";
import ActivityDialog from "../account/ActivityDialog";
import BagDialog from "../account/BagDialog";
import FireworkDialog from "../account/FireworkDialog";
import { bagEntries, pointsText, type MyGraveEntry } from "../account/items";
import MyGraves from "../account/MyGraves";
import MyPanel from "../account/MyPanel";
import ShrineDialog from "../account/ShrineDialog";
import BgmPlayer from "../bgm/BgmPlayer";
import BuryForm, { type BuryMode } from "../grave/BuryForm";
import GraveModal from "../grave/GraveModal";
import PassedDialog from "../grave/PassedDialog";
import Minimap from "./Minimap";
import RestOverlay from "./RestOverlay";
import StayBonus from "./StayBonus";
import NoticesDialog from "../notice/NoticesDialog";
import RankingList from "../grave/RankingList";
import RankingPanel from "../grave/RankingPanel";
import WeeklyRace from "../grave/WeeklyRace";
import ShopDialog from "../shop/ShopDialog";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import CameraControls from "./CameraControls";
import ChannelMenu from "./ChannelMenu";
import FireworkButton from "./FireworkButton";
import GuideDialog from "./GuideDialog";
import Hud, { StatusBanners, ToastList } from "./Hud";
import MenuSheet, { type MenuTarget } from "./MenuSheet";
import MobileControls from "./MobileControls";
import NetHud from "./NetHud";
import ExprRadial, { ExprButton } from "./ExprRadial";
import SayDialog from "./SayDialog";
import { ChatSheet } from "./ChatInput";
import ChatLog, { focusChatLog } from "./ChatLog";
import ReportLayer from "./ReportLayer";
import Tutorial from "./Tutorial";
import UpdateNotice from "./UpdateNotice";
import styles from "./GameShell.module.css";
import HousingOffice from "@/components/housing/HousingOffice";
import { hopChannel } from "@/components/housing/channelHop";
import { graveChannelFor } from "@/game/world/graveChannel";
import type { PublicHouse } from "@/lib/housing/types";
import { isRideablePet, WORLD_LOTS } from "@tomb/protocol";
import HuntLobby from "@/components/rpg/HuntLobby";
import ForageLayer from "@/components/forage/ForageLayer";
import RideButton from "@/components/zoo/RideButton";
import ZooLayer from "@/components/zoo/ZooLayer";
import WishDialog from "@/components/plaza/WishDialog";
import SkyHud from "@/components/sky/SkyHud";
import Telescope from "@/components/rpg/Telescope";
import HauntDialog from "@/components/haunt/HauntDialog";
import GoblinClaim from "./GoblinClaim";
import ChampNotice from "./ChampNotice";
import TitleNotice from "./TitleNotice";
import { useTitleNews } from "@/lib/hooks/useTitleNews";
// 10·11·23번: 출석 달력 · 선물함 · 확성기
import CalendarDialog from "../account/CalendarDialog";
import GiftsDialog from "../account/GiftsDialog";
// 친구 (목록·신청·위치·접속 알림)
import FriendsDialog from "../account/FriendsDialog";
import { useFriendPresence } from "./useFriendPresence";
import FriendNotice from "./FriendNotice";
import MegaphoneLayer from "./MegaphoneDialog";
import MegaphoneFeed from "./MegaphoneFeed";
import { useSocial } from "./useSocial";
// 창 빈자리 채우기: 묘비·랭킹 안내, 채널 기록
import GraveGuide from "../account/GraveGuide";
import RankingGuide from "../grave/RankingGuide";
import GraveyardNow from "../grave/GraveyardNow";
import MySummary from "../account/MySummary";
import { rememberChannel } from "@/lib/channelHistory";

const GameCanvas = dynamic(() => import("@/game/GameCanvas"), { ssr: false });

const KEY_HINTS = ["Space 점프 · E 살펴보기", "T 표현(말풍선·이모티콘) · Y 즐겨찾기 표현 원형", "휠: 확대·축소 · 우클릭 드래그: 둘러보기"];

/** 데스크톱에서 처음 입장했을 때 한 번만 키 조작 힌트를 띄운다 */
function useKeyHints(active: boolean) {
  useEffect(() => {
    if (!active || readItem(UI_KEYS.cameraHintSeen)) return;
    const timer = setTimeout(() => {
      writeItem(UI_KEYS.cameraHintSeen, "1");
      KEY_HINTS.forEach((hint) => showToast(hint, 7_000));
    }, 1_500);
    return () => clearTimeout(timer);
  }, [active]);
}

/**
 * 입장: 내 계정을 불러오고(입장 화면에서 이미 받았으면 그대로), 월드가 보이면 입장 기록 (10번: 출석 포인트는 출석 달력에서 받는다 → earned는 0).
 * 착용 증서는 입장 기록 응답에 같이 온다 (옛 서버면 GET /api/me/look으로)
 */
function useAccountOnEnter(ready: boolean, name: string, color: string, body: string | undefined) {
  useEffect(() => {
    if (!meStore.getSnapshot().me) void meStore.refresh();
  }, []);
  useEffect(() => {
    if (!ready) return;
    api
      .attend(name, color, body)
      .then(({ me, earned, look }) => {
        meStore.set(me);
        if (look) emitLook(look);
        else
          restoreLook().catch(() => {
            // 착용 정보가 없으면 기본 모습
          });
        const points = pointsText(earned);
        if (!points) return;
        const streak = me.attendance.streak > 1 ? ` · ${me.attendance.streak}일 연속` : "";
        showToast(`출석했어요 ${points}${streak}`, 5_000);
      })
      .catch(() => {
        // 출석 실패는 조용히 (다음 입장 때 다시)
      });
  }, [ready, name, color, body]);
}

/** 이 화면(페이지)의 머무르기 sid: 같은 화면에서 연달아 온 기록만 서버가 몰아서 센다 (새로고침·다시 열면 바뀐다) */
const PRESENCE_SID = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-6);

/**
 * 머무르기 포인트: 게임 중에는(탭이 숨겨지거나 다른 창을 보는 중에도) 서버에 알린다.
 *  - 앞에 있는 동안 10분마다. 뒤로 간 동안(lib/background: 숨긴 탭·포커스 잃고 5초)은 30분마다 한 번만 보내고
 *    서버가 같은 화면(sid)이면 흐른 시간만큼 몰아서 센다
 *  - 돌아오면 마지막으로 보낸 지 10분이 지났을 때 (흩어서) 바로 한 번 → 뒤로 간 동안의 몫을 한 번에 받는다
 */
function usePresencePoints(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let sentAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      const every = tabHidden() ? PRESENCE_HIDDEN_INTERVAL_MS : PRESENCE_INTERVAL_MS;
      timer = setTimeout(send, Math.max(0, sentAt + every - Date.now()));
    };
    function send() {
      sentAt = Date.now();
      schedule();
      api
        .presence(PRESENCE_SID)
        .then(({ earned, me, tick }) => {
          if (me) meStore.set(me);
          else if (tick) meStore.applyPresence(tick);
          if (earned > 0) showToast(`머무른 덕분에 +${earned} 포인트`);
        })
        .catch(() => {
          // 다음 간격에 다시
        });
    }
    schedule();
    // 뒤로 가면 다음 보내기를 30분 뒤로 미루고, 돌아오면 10분이 지났을 때 바로 (아니면 남은 시간 뒤에)
    const offBg = onBackgroundChange((bg) => {
      if (bg) schedule();
    });
    const offVisible = onVisibleAgain(() => {
      if (Date.now() - sentAt >= PRESENCE_INTERVAL_MS) send();
      else schedule();
    });
    return () => {
      if (timer) clearTimeout(timer);
      offBg();
      offVisible();
    };
  }, [active]);
}

type Panel =
  | "guide"
  | "me"
  | "shop"
  | "channels"
  | "graves"
  | "bag"
  | "notices"
  | "menu"
  | "ranking"
  | "race"
  | "fireworks"
  | "shrine"
  | "hunt"
  | "wish"
  | "telescope"
  | "housing"
  | "activity"
  | "passed"
  | "calendar"
  | "gifts"
  | "friends"
  | "haunt";

/** 다른 담당이 만드는 장소 창 (사냥터·분양 사무소). 컴포넌트가 들어오기 전까지 자리만 */
type Props = {
  options: GameStartOptions;
  ready: boolean;
  /** 접속 종료: App이 게임을 내린다 (실시간 연결은 GameCanvas 정리에서 1000으로 닫힌다) */
  onLeave: () => void;
  /** 로그아웃 뒤: 게임을 내리고 입장 첫 화면으로 */
  onLoggedOut: () => void;
};

export default function GameShell({ options, ready, onLeave, onLoggedOut }: Props) {
  const status = useBridgeValue("net:status");
  // 채널마다 묘지가 따로다. 채널을 아직 모르면 고른 채널, 자동 배정이면 1채널
  const channel = status?.channel ?? (typeof options.channel === "number" ? options.channel : 1);
  // 채널마다 주거 구역도 따로다. 게임이 지금 보여 주는 채널과 같게 (관람·오프라인이면 1채널)
  const houseChannel = graveChannelFor(status, options.channel);
  const graves = useGraves(channel);
  const { me } = useMe();
  // 탈 수 있는 펫을 데리고 다니기 시작하면 R 키 탑승을 알려 준다
  const ridePet = me?.equipped.find((e) => isRideablePet(e.itemId))?.itemId ?? null;
  useEffect(() => {
    if (ridePet) showToast("R 키를 누르면 펫에 탑승해요 (다시 R을 누르면 내려요)", 7_000);
  }, [ridePet]);
  const myGraves = useMyGraves(me?.graves ?? [], graves);
  const [openGraveId, setOpenGraveId] = useState<string | null>(null);
  const [bury, setBury] = useState<BuryMode | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  /** 표현 창(T: 말풍선·이모티콘·벤치 상태)과 즐겨찾기 원형 목록(Y). 집·마을 HUD(panel "housing") 위에서도 열리게 panel과 따로 둔다 */
  const [sayOpen, setSayOpen] = useState(false);
  const [radial, setRadial] = useState(false);
  /** 말풍선 채팅 입력: 데스크톱 Enter 막대 · 터치 [채팅] 버튼 한 줄 입력칸 */
  const [chatOpen, setChatOpen] = useState(false);
  /** 주거 구역의 집 문·빈 필지에서 하우징 창을 열었으면 그 집/번지 */
  const [housingIntent, setHousingIntent] = useState<{ houseId?: string; lot?: number } | null>(null);
  const coarse = useMediaQuery("(pointer: coarse)");
  // 데스크톱인데 창이 좁으면 윗줄에 채널 표시 자리가 없다 → 아래 안내 줄로
  const narrow = useMediaQuery("(max-width: 700px)");
  const scene = useBridgeValue("scene:changed")?.scene;
  const inShop = scene === "shop";
  // 집·사냥터·미니게임 안에서는 그 화면이 자기 HUD를 그린다. 월드 HUD는 숨기기만 한다(BGM 플레이어는 계속 살아 있게)
  const away = scene === "house" || scene === "hunt" || scene === "minigame";
  /** 내 집 꾸미기 중 (터치 조작 줄 대신 꾸미기 도구 줄). house:state는 마지막 값을 기억하지 않아 받을 때마다 적어 둔다 */
  const [editingHouse, setEditingHouse] = useState(false);
  useBridgeEvent("house:state", (st) => setEditingHouse(st.editing));
  const houseEditing = editingHouse && scene === "house";
  // 게임이 준비되기 전(접속 중)에 온 토스트도 놓치지 않게 오버레이보다 먼저 구독한다
  const toasts = useToasts();

  useGameKeyboardGuard();
  useKeyHints(ready && !coarse);
  const { unread: unreadNotice } = useNotices();
  useAccountOnEnter(ready, options.name, options.color, options.body);
  usePresencePoints(ready);
  const { calendarReady, giftCount } = useSocial(ready);
  /** 가방 [칭호]에서 아직 안 본 새 칭호 (가방 단추·메뉴 점) */
  const titleNew = useTitleNews().length > 0;
  const { friendIncoming } = useFriendPresence(ready);
  // 운영자 계정은 친구를 맺을 수 없다 → 친구 버튼·메뉴를 숨긴다 (서버도 막는다)
  const iAmStaff = useBridgeValue("me:staff")?.on === true;
  // 채널 이동 창의 "마지막에 있던 채널" 표시용
  const onlineChannel = status?.mode === "online" ? status.channel : null;
  useEffect(() => {
    if (onlineChannel) rememberChannel(onlineChannel);
  }, [onlineChannel]);
  useBridgeEvent("portal:open", ({ kind, houseId, lot }) => {
    setHousingIntent(kind === "housing" && (houseId || lot) ? { houseId, lot } : null);
    setPanel(kind);
    // 집으로 바로 들어갈 때(친구 창 [집 놀러 가기]·[친구한테 가기]·집 문): 떠 있던 다른 창·목록은 닫는다
    if (kind === "housing" && houseId) {
      setOpenGraveId(null);
      setSayOpen(false);
      setRadial(false);
      setChatOpen(false);
    }
  });
  useBridgeEvent("grave:open", ({ graveId }) => setOpenGraveId(graveId));
  useBridgeEvent("shop:open", () => setPanel("shop"));
  // 내 묘비로 걸어가다 길이 막혔을 때 (41번)
  useBridgeEvent("grave:walk", ({ status }) => {
    if (status === "unreachable") showToast("길을 찾지 못했어요. 조금 움직인 뒤 다시 눌러 주세요.");
  });
  // 불멍(모닥불) 중에는 HUD를 은은하게
  // 불멍·놀이기구 하늘 시점(관람차·열기구)에서는 HUD를 은은하게 줄인다
  const viewMode = useBridgeValue("view:mode")?.mode;
  const campfire = viewMode === "campfire" || viewMode === "sky";
  // 첫 방문 안내: 계정이 아직 안 봤으면 저절로, 안내(ⓘ)에서 다시 보기
  const [tutorialOn, setTutorialOn] = useState<boolean | null>(null);
  const showTutorial = ready && !away && (tutorialOn ?? (me ? !me.tutorialDone : false));

  // 즐겨찾기 원형 목록은 내 캐릭터가 보이는 월드·마을·집에서만 (상점·사냥터·미니게임 제외)
  const canRadial = !scene || scene === "world" || scene === "house";
  /** 터치 메뉴·마을/집 버튼에서 원형 목록 열기 */
  const openRadial = () => {
    if (!canRadial) return;
    setPanel((p) => (p === "housing" ? p : null));
    setSayOpen(false);
    setRadial(true);
  };

  // 데스크톱 T 키: 표현 창, Y 키: 즐겨찾기 원형 목록, I 키: 가방 (입력칸·열린 창이 없을 때만)
  // 마을·집 안(panel "housing" — 위쪽 HUD만 떠 있다)에서도 T·U는 된다
  const quiet = panel === null && openGraveId === null && bury === null && !sayOpen;
  const roomQuiet = panel === "housing" && scene === "house" && openGraveId === null && bury === null && !sayOpen;
  useEffect(() => {
    if (!ready || (!quiet && !roomQuiet)) return;
    const onKey = (e: KeyboardEvent) => {
      const enter = e.code === "Enter" || e.code === "NumpadEnter";
      if ((e.code !== "KeyT" && e.code !== "KeyI" && e.code !== "KeyY" && !enter) || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (roomQuiet && e.code === "KeyI") return;
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches("input, textarea, select, [contenteditable]")) return;
      // 하우징 안의 방명록·분양 사무소 같은 창이 떠 있으면 그 창 몫
      if (document.querySelector("dialog[open]")) return;
      // Enter: 말풍선 채팅 입력칸 (버튼에 포커스가 있으면 그 버튼 몫, 낚시처럼 게임 키를 막은 창이 있으면 그 창 몫)
      if (enter) {
        if (!canRadial || chatOpen || bridge.last("ui:blockKeys")?.blocked || (el instanceof HTMLElement && el.matches("button, a[href], [role=button]"))) return;
        e.preventDefault();
        setRadial(false);
        // 데스크톱은 왼쪽 아래 채팅창 입력칸으로, 터치(키보드 달린 태블릿 등)는 한 줄 입력칸
        if (coarse || !focusChatLog()) setChatOpen(true);
        return;
      }
      if (e.code === "KeyY") {
        if (!canRadial) return;
        e.preventDefault();
        setRadial(true);
        return;
      }
      e.preventDefault();
      setRadial(false);
      if (e.code === "KeyI") setPanel("bag");
      else setSayOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, quiet, roomQuiet, canRadial, chatOpen, coarse]);

  // 게임이 맵에 내 묘비를 표시한다 (sticky)
  const myGraveIds = me?.graves;
  useEffect(() => {
    if (myGraveIds) bridge.emit("graves:mine", { ids: myGraveIds });
  }, [myGraveIds]);

  // ?debug=1 QA용: 콘솔·자동화 스크립트에서 브리지 이벤트를 흉내 낼 수 있게
  useEffect(() => {
    if (!options.debug) return;
    const w = window as unknown as { __tombBridge?: typeof bridge };
    w.__tombBridge = bridge;
    return () => {
      delete w.__tombBridge;
    };
  }, [options.debug]);

  /** 내 캐릭터가 그 묘비 앞까지 걸어간다 (41번: 순간이동 없음, 방향키·클릭·점프로 멈춘다) */
  function goToGrave(graveId: string) {
    bridge.emit("grave:focus", { graveId, walk: true });
    setPanel(null);
  }

  /** 랭킹(헌화) 클릭: 카메라만 그 묘비로 + 상세 */
  function lookAtGrave(graveId: string) {
    bridge.emit("grave:focus", { graveId, walk: false });
    setPanel(null);
    setOpenGraveId(graveId);
  }

  /** 다른 채널 묘비: 그 채널로 옮기고(입구에서 시작), 그 채널 목록이 깔리면 묘비 앞까지 걸어간다 */
  function goToMyGrave({ grave, here }: MyGraveEntry) {
    if (here) return goToGrave(grave.id);
    setPanel(null);
    const { cache } = graves;
    const off = cache.subscribe(() => {
      const snap = cache.getSnapshot();
      if (snap.channel !== grave.channel || !snap.byId.has(grave.id)) return;
      off();
      clearTimeout(giveUp);
      bridge.emit("grave:focus", { graveId: grave.id, walk: true });
    });
    // 채널을 못 옮기면(가득 참 등) 기다리지 않는다
    const giveUp = setTimeout(off, 20_000);
    bridge.emit("channel:switch", { channel: grave.channel });
  }

  /** 내 집: 다른 채널에 있으면 그 채널로 옮긴 뒤 주거 구역의 그 번지를 비춘다 (2단지 번지는 분양 사무소로) */
  function goToMyHouse(house: PublicHouse) {
    setPanel(null);
    hopChannel(
      house.ch,
      houseChannel,
      () => {
        if (house.lot >= 1 && house.lot <= WORLD_LOTS) bridge.emit("world:lot", { lot: house.lot, label: "내 집" });
        else {
          setHousingIntent(null);
          setPanel("housing");
        }
      },
      () => showToast(`${house.ch}채널로 옮기지 못했어요. 채널이 가득 찼을 수 있어요. 잠시 뒤 다시 해 주세요.`),
    );
  }

  /** 내 묘비가 하나뿐이면 바로 그 앞으로, 아니면 목록 */
  function openMyGraves() {
    const { entries, pending } = myGraves;
    if (entries.length === 1 && pending === 0) goToMyGrave(entries[0]);
    else setPanel("graves");
  }

  function startBury() {
    setPanel(null);
    setBury({ kind: "create" });
  }

  /** 1인 1묘비 안내의 [내 묘비 가기] */
  function goToActiveGrave(grave: PublicGrave) {
    setBury(null);
    goToMyGrave({ grave, plot: null, here: grave.channel === graves.channel });
  }

  function closePanel() {
    if (panel === "shop") bridge.emit("shop:closed");
    setPanel(null);
  }

  /** 소식의 묘비: 지금 채널에 있으면 바로, 아니면 상세로 채널을 알아내 옮긴다 */
  function goToGraveById(graveId: string) {
    if (graves.byId.has(graveId)) return goToGrave(graveId);
    setPanel(null);
    api
      .graveDetail(graveId)
      .then(({ grave }) => goToMyGrave({ grave, plot: null, here: grave.channel === graves.channel }))
      .catch(() => showToast("그 묘비를 찾지 못했어요. 성불했거나 이장되었을 수 있어요."));
  }

  /** 터치 메뉴 시트에서 고른 것 열기 */
  function pickFromMenu(target: MenuTarget) {
    if (target === "bury") startBury();
    else if (target === "graves") openMyGraves();
    else if (target === "dex") {
      setPanel(null);
      bridge.emit("forage:dex", {});
    } else if (target === "say") {
      setPanel(null);
      setSayOpen(true);
    } else if (target === "favs") {
      setPanel(null);
      openRadial();
    } else setPanel(target);
  }

  const disconnected = status?.mode === "replaced" || status?.mode === "offline";
  const bagCount = me ? Object.values(me.inventory).reduce((n, c) => n + Math.max(0, c), 0) : 0;
  const fireworkCount = me ? bagEntries(me.inventory, "firework").reduce((n, e) => n + e.count, 0) : 0;

  return (
    <div className={styles.shell}>
      <GameCanvas {...options} />
      {ready && disconnected && <div className={styles.dim} aria-hidden="true" />}
      {ready && <UpdateNotice />}
      {/* 47번 다른 사람 캐릭터 메뉴(신고하기)·신고 창 */}
      {ready && <ReportLayer />}
      {/* 친구 안내 띠 (접속·퇴장·친구 옆으로): 화면 가운데, 집·사냥터 안에서도 보이게 월드 HUD 밖에 */}
      {ready && <FriendNotice />}
      {/* 4·32·51번 낚시·채집·판매·도감 (자기 창·HUD를 스스로 연다) */}
      {ready && <ForageLayer />}
      {ready && <ZooLayer />}
      {/* 놀이기구 2: 관람차·열기구 안내 (지나가는 곳·남은 시간) */}
      {ready && <SkyHud />}

      {ready && (
        <div className={cx(styles.overlay, away && styles.away, campfire && styles.campfire)}>
          {coarse ? (
            // 터치: 위 가장자리 바(메뉴 · 음악 · 채널·날씨) + 아래 조이스틱(그 위 확성기)·행동 버튼. 바로 가기 줄은 없고 모두 메뉴 시트에
            <div className={styles.touchBar}>
              {/* 맨 왼쪽 [메뉴], 그 오른쪽에 노래 버튼 */}
              <div className={styles.touchLeft}>
                <button type="button" className={cx(ui.button, ui.top, styles.topButton)} onClick={() => setPanel("menu")}>
                  <PixelIcon name="menu" />
                  메뉴
                  {(calendarReady || giftCount > 0 || friendIncoming > 0) && (
                    <>
                      <span className={cx(styles.dot, styles.redDot, styles.dotSecond)} aria-hidden="true" />
                      <span className="visually-hidden"> (받을 출석 도장·선물·친구 신청 있음)</span>
                    </>
                  )}
                  {(unreadNotice || (me?.activityUnread ?? 0) > 0 || titleNew) && (
                    <>
                      <span className={styles.dot} aria-hidden="true" />
                      <span className="visually-hidden"> (새 소식 있음)</span>
                    </>
                  )}
                </button>
                <BgmPlayer compact />
                {/* 불멍·놀이기구 중: 폭죽이 있으면 위쪽 줄에서 바로 쏘기 (메뉴 시트를 안 거쳐도) */}
                {campfire && <FireworkButton variant="top" onOpen={() => setPanel("fireworks")} />}
              </div>
              <Hud compact onOpenChannels={() => setPanel("channels")} />
            </div>
          ) : (
            <>
              <div className={styles.topLeft}>
                <BgmPlayer />
                {options.debug && <NetHud />}
                <MegaphoneFeed channel={channel} />
              </div>
              {!narrow && (
                <div className={styles.topCenter}>
                  <Hud onOpenChannels={() => setPanel("channels")} />
                </div>
              )}
              <div className={styles.topRight}>
                {/* 불멍·놀이기구 중엔 아래 바로 가기 줄(폭죽 포함)이 숨으니 폭죽만 위쪽 줄 맨 앞에 */}
                {campfire && <FireworkButton variant="top" onOpen={() => setPanel("fireworks")} />}
                <button
                  type="button"
                  className={cx(ui.button, ui.icon, ui.top, styles.topButton)}
                  onClick={() => setPanel("calendar")}
                  aria-label={calendarReady ? "출석 달력 (오늘 출석 도장을 찍을 수 있어요)" : "출석 달력"}
                  title="출석 달력"
                >
                  <PixelIcon name="calendar" />
                  {calendarReady && <span className={cx(styles.dot, styles.redDot)} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className={cx(ui.button, ui.icon, ui.top, styles.topButton)}
                  onClick={() => setPanel("gifts")}
                  aria-label={giftCount ? `선물함 (안 받은 선물 ${giftCount}개)` : "선물함"}
                  title="선물함"
                >
                  <PixelIcon name="gift" />
                  {giftCount > 0 && <span className={cx(styles.dot, styles.redDot)} aria-hidden="true" />}
                </button>
                {/* 친구: 위쪽 버튼 줄에 글자와 함께 바로 (받은 신청이 있으면 빨간 점). 운영자 계정은 친구 기능이 없다 */}
                {!iAmStaff && (
                  <button
                    type="button"
                    className={cx(ui.button, ui.top, styles.topButton)}
                    onClick={() => setPanel("friends")}
                    aria-label={friendIncoming ? `친구 (받은 신청 ${friendIncoming}개)` : "친구"}
                    title="친구"
                  >
                    <PixelIcon name="heart" />
                    친구
                    {friendIncoming > 0 && <span className={cx(styles.dot, styles.redDot)} aria-hidden="true" />}
                  </button>
                )}
                <button
                  type="button"
                  className={cx(ui.button, ui.icon, ui.top, styles.topButton)}
                  onClick={() => setPanel("guide")}
                  aria-label="안내"
                >
                  <PixelIcon name="info" />
                </button>
                <button type="button" className={cx(ui.button, ui.top, styles.topButton)} onClick={() => setPanel("me")}>
                  <PixelIcon name="user" />
                  {/* 포인트는 내 정보 창 안에서 보여 준다 (위쪽 단추는 이름만) */}
                  <span className={styles.meLabel}>내 정보</span>
                </button>
                {/* 주간 랭킹 1위 레이스 (시상대·마감·내 순위·명예의 전당): 랭킹 옆 따로.
                    위쪽 줄이 가운데 채널 칸과 겹칠 만큼 좁은 화면에선 숨기고 [메뉴] 시트의 「이번 주 레이스」로 연다 */}
                <button type="button" className={cx(ui.button, ui.top, styles.topButton, styles.raceTop)} onClick={() => setPanel("race")} title="이번 주 레이스">
                  <PixelIcon name="trophy" />
                  레이스
                </button>
                <RankingPanel graves={graves.graves} onPick={lookAtGrave} />
              </div>
            </>
          )}
          {/* 23번 확성기 창: 터치는 왼쪽 아래 조이스틱 위에 따로 (데스크톱은 왼쪽 위 음악 아래) */}
          {coarse && <MegaphoneFeed channel={channel} floating />}
          {/* 바로 가기 줄: 데스크톱만 왼쪽 아래 모서리. 터치는 위쪽 [메뉴] 시트에 모두 있고 [표현]만 행동 버튼 옆(MobileControls) */}
          {!coarse && (
            <nav className={styles.dock} aria-label="바로 가기">
              <button type="button" className={cx(ui.button, styles.dockButton)} onClick={() => setPanel("menu")}>
                <PixelIcon name="menu" />
                메뉴
              </button>
              <ExprButton className={cx(ui.button, styles.dockButton)} onOpen={() => setSayOpen(true)} onRadial={openRadial}>
                <PixelIcon name="chat" />
                표현
                <span className={styles.dockKey}>T</span>
              </ExprButton>
              <button type="button" className={cx(ui.button, styles.dockButton)} onClick={() => setPanel("bag")}>
                <PixelIcon name="bag" />
                가방
                {bagCount > 0 && <span className={styles.badge}>{bagCount}</span>}
                {titleNew && (
                  <>
                    <span className={styles.dot} aria-hidden="true" />
                    <span className="visually-hidden"> (새 칭호 있음)</span>
                  </>
                )}
              </button>
              <button type="button" className={cx(ui.button, styles.dockButton)} onClick={() => setPanel("hunt")}>
                <PixelIcon name="sword" />
                사냥
              </button>
              <button type="button" className={cx(ui.button, styles.dockButton)} onClick={() => bridge.emit("forage:dex", {})}>
                <PixelIcon name="book" />
                도감
              </button>
              <button type="button" className={cx(ui.button, styles.dockButton)} onClick={() => setPanel("housing")}>
                <PixelIcon name="house" />집
              </button>
              <button type="button" className={cx(ui.button, styles.dockButton)} onClick={() => setPanel("activity")}>
                <PixelIcon name="heart" />
                소식
                {(me?.activityUnread ?? 0) > 0 && <span className={styles.badge}>{me?.activityUnread}</span>}
              </button>
              <button type="button" className={cx(ui.button, styles.dockButton)} onClick={() => setPanel("notices")}>
                <PixelIcon name="bell" />
                공지
                {unreadNotice && (
                  <>
                    <span className={styles.dot} aria-hidden="true" />
                    <span className="visually-hidden"> (새 공지 있음)</span>
                  </>
                )}
              </button>
              <FireworkButton onOpen={() => setPanel("fireworks")} />
            </nav>
          )}
          <div className={styles.bottomCenter}>
            {showTutorial && <Tutorial touch={coarse} onDone={() => setTutorialOn(false)} />}
            <ToastList toasts={toasts} />
            <StatusBanners />
            {narrow && !coarse && <Hud onOpenChannels={() => setPanel("channels")} />}
          </div>
          <Minimap />
          <CameraControls showZoom={!coarse} />
          {/* 타는 펫 타기·내리기: 데스크톱은 오른쪽 아래 확대·축소 버튼 왼쪽, 터치는 행동 버튼 묶음 안(MobileControls) */}
          {!coarse && <RideButton variant="desktop" className={ui.button} />}
          {coarse && (
            <MobileControls
              onSay={() => setSayOpen(true)}
              onRadial={openRadial}
              onChat={canRadial ? () => setChatOpen(true) : undefined}
              chatOpen={chatOpen && canRadial && !sayOpen}
            />
          )}
          {/* 접속 시간 보너스: 사냥·귀신의 집·실내에서도 서버 기록은 쌓이고, 창은 마을에서만 띄운다 */}
          {(!scene || scene === "world") && <StayBonus />}
        </div>
      )}

      {openGraveId && (
        <GraveModal
          key={openGraveId}
          graveId={openGraveId}
          graves={graves}
          onClose={() => setOpenGraveId(null)}
          onEdit={(grave, ownerToken) => setBury({ kind: "edit", grave, ownerToken })}
        />
      )}
      {bury && (
        <BuryForm
          mode={bury}
          mourner={options.name}
          cache={graves.cache}
          channel={graves.channel}
          graveCount={graves.loaded ? graves.graves.length : null}
          onClose={() => setBury(null)}
          onGoToGrave={goToActiveGrave}
        />
      )}
      {panel === "channels" && <ChannelMenu onClose={closePanel} graveChannels={myGraves.entries.map((e) => e.grave.channel)} />}
      {panel === "guide" && (
        <GuideDialog
          onClose={closePanel}
          onReplayTutorial={() => {
            setPanel(null);
            setTutorialOn(true);
          }}
        />
      )}
      {panel === "me" && (
        <MyPanel
          myGraves={myGraves}
          onGoToMyGrave={goToMyGrave}
          onBury={startBury}
          onLeave={onLeave}
          onLoggedOut={onLoggedOut}
          onOpenShrine={() => setPanel("shrine")}
          onOpenFriends={iAmStaff ? undefined : () => setPanel("friends")}
          houseChannel={houseChannel}
          onGoToMyHouse={goToMyHouse}
          onOpenHousing={() => {
            setHousingIntent(null);
            setPanel("housing");
          }}
          onClose={closePanel}
        />
      )}
      {panel === "graves" && (
        <Dialog title="내 묘비 가기" onClose={closePanel}>
          <MyGraves entries={myGraves.entries} pending={myGraves.pending} onGo={goToMyGrave} onBury={startBury} />
          <GraveyardNow graves={graves.graves} channel={graves.channel} onPick={lookAtGrave} />
          <GraveGuide onBury={myGraves.entries.length > 0 ? startBury : undefined} onShrine={() => setPanel("shrine")} onPassed={() => setPanel("passed")} />
        </Dialog>
      )}
      {panel === "bag" && (
        <BagDialog cache={graves.cache} myGraves={myGraves.entries} onClose={closePanel} avatar={{ color: options.color, body: options.body }} onOpenRace={() => setPanel("race")} />
      )}
      {panel === "notices" && <NoticesDialog onClose={closePanel} />}
      {panel === "activity" && (
        <ActivityDialog
          onGoToGrave={goToGraveById}
          onOpenHousing={() => setPanel("housing")}
          onBury={startBury}
          footer={<MySummary graves={myGraves.entries} onGraves={myGraves.entries.length ? openMyGraves : undefined} onHousing={() => setPanel("housing")} />}
          onClose={closePanel}
        />
      )}
      {sayOpen && <SayDialog onClose={() => setSayOpen(false)} />}
      {chatOpen && canRadial && !sayOpen && <ChatSheet onClose={() => setChatOpen(false)} />}
      {/* 채팅 기록창: 데스크톱은 바로 가기 줄 위 상자(입력칸 포함), 터치는 확성기 위에 글씨만. 채널·집 드나들면 비운다 */}
      {ready && <ChatLog mobile={coarse} room={`${scene === "house" ? "house" : "world"}:${channel}`} hidden={!canRadial} />}
      {/* 다른 탭·다른 창을 보는 동안: 게임을 재우고 어두운 "휴식 중" 막 (음악은 계속) */}
      <RestOverlay />
      {radial && canRadial && <ExprRadial onClose={() => setRadial(false)} />}
      {/* 마을·집 안: 월드 바로 가기 줄이 숨으니 [표현] 버튼만 왼쪽 아래에 따로 */}
      {ready && scene === "house" && !coarse && (
        <div className={styles.roomExpr}>
          <ExprButton className={cx(ui.button, styles.dockButton)} onOpen={() => setSayOpen(true)} onRadial={openRadial}>
            <PixelIcon name="chat" />
            표현
          </ExprButton>
        </div>
      )}
      {/* 집 안(내 집·남의 집) 터치: 월드 HUD는 숨지만 조이스틱·상호작용·점프·앉기·달리기·[표현]·[채팅]은 그대로 (꾸미기 중에는 도구 줄 자리라 숨긴다) */}
      {ready && scene === "house" && coarse && !houseEditing && (
        <div className={styles.roomTouch}>
          <MobileControls
            onSay={() => setSayOpen(true)}
            onRadial={openRadial}
            onChat={() => setChatOpen(true)}
            chatOpen={chatOpen && !sayOpen}
          />
        </div>
      )}
      {panel === "menu" && (
        <MenuSheet
          canBury={!inShop}
          myGraveCount={me ? me.graves.length : null}
          bagCount={bagCount}
          fireworkCount={fireworkCount}
          unreadNotice={unreadNotice}
          activityUnread={me?.activityUnread ?? 0}
          calendarReady={calendarReady}
          giftCount={giftCount}
          friendIncoming={friendIncoming}
          titleNew={titleNew}
          noFriends={iAmStaff}
          points={me ? me.points : null}
          onPick={pickFromMenu}
          onClose={closePanel}
        />
      )}
      {panel === "ranking" && (
        <Dialog title="랭킹" onClose={closePanel}>
          <RankingList graves={graves.graves} onPick={lookAtGrave} />
          <RankingGuide />
        </Dialog>
      )}
      {panel === "race" && (
        <Dialog title="이번 주 레이스" onClose={closePanel} fitHeight>
          <WeeklyRace />
        </Dialog>
      )}
      {panel === "fireworks" && <FireworkDialog onClose={closePanel} onOpenShop={() => setPanel("shop")} />}
      {panel === "passed" && <PassedDialog onClose={closePanel} footer={<GraveyardNow graves={graves.graves} channel={graves.channel} onPick={lookAtGrave} />} />}
      {panel === "shrine" && (
        <ShrineDialog
          cache={graves.cache}
          onGo={goToMyGrave}
          onClose={closePanel}
          onOpenPassed={() => setPanel("passed")}
          footer={<GraveyardNow graves={graves.graves} channel={graves.channel} onPick={lookAtGrave} />}
        />
      )}
      {panel === "housing" && (
        <HousingOffice key={housingIntent?.houseId ?? housingIntent?.lot ?? "office"} intent={housingIntent} channel={houseChannel} onClose={closePanel} />
      )}
      {panel === "hunt" && <HuntLobby onClose={closePanel} avatar={{ color: options.color, body: options.body }} />}
      {panel === "wish" && <WishDialog onClose={closePanel} />}
      {panel === "telescope" && <Telescope onClose={closePanel} />}
      {panel === "haunt" && <HauntDialog onClose={closePanel} />}
      <GoblinClaim />
      {/* 주간 랭킹 1위 알림 창 (본인에게 한 번) */}
      {ready && <ChampNotice />}
      {ready && <TitleNotice />}
      {panel === "calendar" && <CalendarDialog onClose={closePanel} />}
      {panel === "gifts" && <GiftsDialog onClose={closePanel} onOpenCalendar={() => setPanel("calendar")} />}
      {panel === "friends" && <FriendsDialog onClose={closePanel} />}
      <MegaphoneLayer channel={channel} onOpenShop={() => setPanel("shop")} />
      {panel === "shop" && <ShopDialog onClose={closePanel} avatar={{ color: options.color, body: options.body }} />}
    </div>
  );
}
