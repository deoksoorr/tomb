"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useEffect, useId, useState } from "react";
import { SEAT_MOODS } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { EMO_BOARD, EMO_HOTKEYS, type EmoSlot } from "@/game/logic/emoBoard";
import { emoteDataUrl } from "@/game/sprites/emotes";
import { moodIconDataUrl } from "@/game/sprites/moodArt";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import { InfoCard, TipList } from "../ui/InfoBlocks";
import ui from "../ui/ui.module.css";
import FavStar from "./FavStar";
import ChatInput from "./ChatInput";
import SayBoard from "./SayBoard";
import styles from "./SayDialog.module.css";
import { FAV_MAX, slotKey, useFavs } from "./sayFavorites";

type Tab = "emo" | "say" | "mood";
const TABS: readonly [Tab, string][] = [
  ["emo", "이모티콘"],
  ["say", "말풍선"],
  ["mood", "벤치 상태"],
];

/** 마지막으로 연 탭 (창을 다시 열면 그대로). 렌더 밖(클릭 처리)에서만 바꾼다 */
let lastTab: Tab = "emo";
const rememberTab = (t: Tab) => {
  lastTab = t;
};

/**
 * 표현 창: 말풍선·이모티콘·벤치 상태 고르기 (데스크톱 T 키 · 바로 가기 [표현] · 메뉴).
 * - 말풍선·이모티콘마다 별(즐겨찾기, 최대 8개) → Y 키(폰은 [표현] 길게 누르기)로 내 캐릭터 둘레에 펼친다
 * - 이모티콘(5번): 손 흔들기·환호 + 이모티콘 14종. 창 안에서도 숫자 1~9로 바로 고른다 (게임 화면에서도 같은 숫자 키)
 * - 맨 위: 말풍선 자유 채팅 입력칸 (40자, 기록 안 남음 — 데스크톱은 게임 화면에서 Enter로도 연다)
 * - 말풍선: 정해진 문장
 * - 벤치 상태(24번): 의자·벤치에 앉아 있을 때만 — 머리 위 아이콘과 손 소품이 같은 채널 모두에게 보이고, 일어나면 풀린다
 */
export default function SayDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTabState] = useState<Tab>(() => lastTab);
  const baseId = useId();
  const moodState = useBridgeValue("mood:state");
  const seated = moodState?.seated ?? false;
  const current = moodState?.mood ?? "";
  const favCount = useFavs().length;

  const setTab = (t: Tab) => {
    rememberTab(t);
    setTabState(t);
  };

  function pick(slot: EmoSlot) {
    onClose();
    if (slot.kind === "act") bridge.emit("input:act", { kind: slot.id });
    else bridge.emit("input:emo", { id: slot.id });
  }

  function mood(id: string) {
    bridge.emit("input:mood", { mood: id === current ? "" : id });
  }

  // 이모티콘 탭: 숫자 1~9로 바로 고른다 (입력칸이 없는 창이라 게임 키와 같은 숫자)
  useEffect(() => {
    if (tab !== "emo") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      // 위쪽 채팅 입력칸에 숫자를 치는 중이면 입력 몫
      if (e.target instanceof HTMLElement && e.target.matches("input, textarea, [contenteditable]")) return;
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (!m) return;
      const slot = EMO_BOARD[Number(m[1]) - 1];
      if (!slot) return;
      e.preventDefault();
      onClose();
      if (slot.kind === "act") bridge.emit("input:act", { kind: slot.id });
      else bridge.emit("input:emo", { id: slot.id });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, onClose]);

  return (
    <Dialog title="표현 (말풍선·이모티콘)" onClose={onClose}>
      {/* 말풍선 자유 채팅 (폰은 여기서, 데스크톱은 게임 화면에서 Enter) */}
      <ChatInput onSent={onClose} className={styles.chat} />
      <div className={styles.tabs} role="tablist" aria-label="고르기">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`${baseId}-${k}`}
            aria-selected={tab === k}
            aria-controls={`${baseId}-panel`}
            className={styles.tab}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "mood" && (
        <p className={styles.favLine}>
          <span className={styles.favStar} aria-hidden="true" />
          즐겨찾기 {favCount}/{FAV_MAX} · 별을 누르면 Y 키(폰은 [표현] 길게 누르기)로 내 캐릭터 둘레에 펼쳐져요
        </p>
      )}

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-${tab}`}
        className={tab === "mood" && seated ? styles.panelFill : undefined}
      >
        {tab === "emo" && (
          <>
            <div className={styles.board}>
              {EMO_BOARD.map((slot, i) => (
                <div key={`${slot.kind}-${slot.id}`} className={styles.cell}>
                  <button type="button" className={styles.emo} onClick={() => pick(slot)} data-emo={slot.id}>
                    {i < EMO_HOTKEYS && (
                      <span className={styles.key} aria-hidden="true">
                        {i + 1}
                      </span>
                    )}
                    <img src={emoteDataUrl(slot.icon, 3)} width={39} height={39} alt="" aria-hidden="true" />
                    <span>{slot.label}</span>
                    {i < EMO_HOTKEYS && <span className="visually-hidden"> (단축키 {i + 1})</span>}
                  </button>
                  <FavStar favKey={slotKey(slot)} label={slot.label} className={styles.cellStar} />
                </div>
              ))}
            </div>
            <p className={styles.hint}>머리 위에 3~4초 떠요. 게임 화면에서도 숫자 1~9로 바로 보낼 수 있어요.</p>
            <InfoCard title="이렇게 써 보세요" icon="info" className={styles.tips}>
              <TipList
                tips={[
                  "1 손 흔들기·2 환호는 캐릭터가 직접 몸짓을 해요. 3번부터는 머리 위에 그림이 떠요.",
                  "데스크톱은 T 키로 이 창을 열고, 숫자 키로 창을 거치지 않고 바로 보낼 수 있어요.",
                  "자주 쓰는 건 별을 눌러 즐겨찾기 — Y 키(폰은 [표현] 길게 누르기)로 내 둘레에 펼쳐 한 번에 보내요.",
                  "정해진 문장이 필요하면 [말풍선] 탭, 벤치에 앉아 있다면 [벤치 상태] 탭을 써 보세요.",
                  "너무 빨리 연달아 누르면 1초 동안은 다시 뜨지 않아요.",
                ]}
              />
            </InfoCard>
          </>
        )}

        {tab === "say" && <SayBoard onSent={onClose} />}

        {tab === "mood" &&
          (seated ? (
            <>
              <div className={styles.moods} role="group" aria-label="지금 하는 일">
                {SEAT_MOODS.map((m) => (
                  <button key={m.id} type="button" className={styles.mood} aria-pressed={current === m.id} onClick={() => mood(m.id)} data-mood={m.id}>
                    <img src={moodIconDataUrl(m.id, 3)} width={27} height={27} alt="" aria-hidden="true" />
                    {m.label}
                  </button>
                ))}
              </div>
              <p className={styles.hint}>머리 위 작은 아이콘과 손에 든 소품이 모두에게 보여요. 일어나면 저절로 풀려요.</p>
              {current && (
                <button type="button" className={cx(ui.button, styles.clear)} onClick={() => mood(current)}>
                  상태 풀기
                </button>
              )}
            </>
          ) : (
            <>
              <p className={styles.empty}>벤치나 의자에 앉으면 지금 하는 일을 고를 수 있어요. 앉으면 아래 상태들이 켜져요.</p>
              <div className={styles.moods} role="group" aria-label="고를 수 있는 상태 (앉으면 켜져요)">
                {SEAT_MOODS.map((m) => (
                  <span key={m.id} className={cx(styles.mood, styles.moodOff)}>
                    <img src={moodIconDataUrl(m.id, 3)} width={27} height={27} alt="" aria-hidden="true" />
                    {m.label}
                  </span>
                ))}
              </div>
              <InfoCard title="벤치 상태란?" icon="info" className={styles.tips}>
                <TipList
                  tips={[
                    "광장·모닥불 둘레의 벤치나 의자 앞에서 E(폰은 앉기 버튼)를 누르면 앉아요.",
                    "고른 상태는 머리 위 작은 아이콘과 손에 든 소품으로 같은 채널 모두에게 보여요.",
                    "일어나면 저절로 풀려요. 앉은 채로 다시 누르면 바로 풀 수 있어요.",
                  ]}
                />
              </InfoCard>
            </>
          ))}
      </div>
    </Dialog>
  );
}
