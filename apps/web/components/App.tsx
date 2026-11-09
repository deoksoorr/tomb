"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { bridge, type GameStartOptions } from "@/game/bridge";
import { installErrorReporting } from "@/lib/hooks/errorReporting";
import { meStore } from "@/lib/hooks/useMe";
import { removeItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { bgm } from "./bgm/engine";
import EntryScreen, { type EntryChoice, type EntryStart } from "./entry/EntryScreen";

// 게임과 오버레이는 입장한 뒤에만 필요하다. 첫 화면(입장)은 가볍게 띄운다.
const GameShell = dynamic(() => import("./overlay/GameShell"), { ssr: false });

/** 입장 후 이 시간 안에 게임이 ready를 보내지 않으면 새로고침을 권한다 */
const BOOT_TIMEOUT_MS = 20_000;

type Props = {
  /** 공유 링크 /?grave={id} */
  initialGraveId: string | null;
  /** ?debug=1 → 네트워크 HUD */
  debug: boolean;
};

export default function App({ initialGraveId, debug }: Props) {
  const [options, setOptions] = useState<GameStartOptions | null>(null);
  const [ready, setReady] = useState(false);
  const [bootStalled, setBootStalled] = useState(false);
  /** 입장 화면을 어디서 시작할지: 처음 고르기 / (접속 종료 뒤) 이어서 들어가기 */
  const [entryStart, setEntryStart] = useState<EntryStart>("choose");

  // ready는 값 없는 sticky 이벤트라 last()로는 도착 여부를 알 수 없어서, 게임을 띄우기 전부터 구독해 둔다
  useEffect(() => bridge.on("ready", () => setReady(true)), []);
  // 잡히지 않은 오류를 운영자에게 알린다 (같은 메시지는 한 번, 분당 5건까지)
  useEffect(installErrorReporting, []);
  // 입장 클릭 제스처 안에서 바로 재생하려면 곡 목록이 미리 와 있어야 한다
  useEffect(() => {
    void bgm.load();
  }, []);

  useEffect(() => {
    if (!options || ready) return;
    const timer = setTimeout(() => setBootStalled(true), BOOT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [options, ready]);

  // 공유 링크의 묘비는 처음 들어갈 때만 찾아간다 (접속 종료 후 다시 들어오면 평소처럼)
  const [focusGraveId, setFocusGraveId] = useState(initialGraveId);
  const enter = useCallback(
    (choice: EntryChoice) => {
      setOptions({ ...choice, focusGraveId, debug });
      setFocusGraveId(null);
    },
    [focusGraveId, debug],
  );

  /** 게임을 내린다: 실시간 연결은 GameCanvas 정리에서 1000으로 닫혀 자리가 바로 빈다 */
  const closeGame = useCallback((start: EntryStart) => {
    bgm.pause();
    setOptions(null);
    setReady(false);
    setBootStalled(false);
    setEntryStart(start);
  }, []);

  const leave = useCallback(() => closeGame("continue"), [closeGame]);

  /** 로그아웃: 이 기기에 남은 이전 계정 흔적(이름)을 지우고 처음 고르기로 */
  const loggedOut = useCallback(() => {
    removeItem(LS.name);
    meStore.reset();
    closeGame("choose");
  }, [closeGame]);

  return (
    <>
      {options && <GameShell options={options} ready={ready} onLeave={leave} onLoggedOut={loggedOut} />}
      {!ready && (
        <EntryScreen
          start={entryStart}
          focusGraveId={focusGraveId}
          entering={options !== null}
          stalled={bootStalled}
          onEnter={enter}
        />
      )}
    </>
  );
}
