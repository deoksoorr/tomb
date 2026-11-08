"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { bridge, type GameStartOptions } from "@/game/bridge";
import { prefetchGraves } from "@/lib/hooks/useGraves";
import { bgm } from "./bgm/engine";
import EntryScreen, { type EntryChoice } from "./entry/EntryScreen";

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

  // ready는 값 없는 sticky 이벤트라 last()로는 도착 여부를 알 수 없어서, 게임을 띄우기 전부터 구독해 둔다
  useEffect(() => bridge.on("ready", () => setReady(true)), []);
  // 입장 화면이 떠 있는 동안 미리 받아 둔다: 곡 목록(클릭 제스처 안에서 바로 재생하려면 필요), 묘비 목록(입장 직후 바로 그리기)
  useEffect(() => {
    void bgm.load();
    prefetchGraves();
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

  /** 접속 종료: 게임을 내려 실시간 연결을 정상 종료(1000)하고 입장 화면으로 */
  const leave = useCallback(() => {
    bgm.pause();
    setOptions(null);
    setReady(false);
    setBootStalled(false);
  }, []);

  return (
    <>
      {options && <GameShell options={options} ready={ready} onLeave={leave} />}
      {!ready && <EntryScreen entering={options !== null} stalled={bootStalled} onEnter={enter} />}
    </>
  );
}
