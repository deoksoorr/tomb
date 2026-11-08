"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { bridge, type GameStartOptions } from "@/game/bridge";
import { chooseTheme, savedTheme } from "@/lib/hooks/theme";
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
    chooseTheme(savedTheme());
  }, []);

  useEffect(() => {
    if (!options || ready) return;
    const timer = setTimeout(() => setBootStalled(true), BOOT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [options, ready]);

  const enter = useCallback(
    (choice: EntryChoice) => setOptions({ ...choice, focusGraveId: initialGraveId, debug }),
    [initialGraveId, debug],
  );

  return (
    <>
      {options && <GameShell options={options} ready={ready} />}
      {!ready && <EntryScreen entering={options !== null} stalled={bootStalled} onEnter={enter} />}
    </>
  );
}
