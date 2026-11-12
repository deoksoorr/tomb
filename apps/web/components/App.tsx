"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { bridge, type GameStartOptions } from "@/game/bridge";
import { api } from "@/lib/api";
import { installErrorReporting } from "@/lib/hooks/errorReporting";
import { prefetchGraves } from "@/lib/hooks/useGraves";
import { meStore } from "@/lib/hooks/useMe";
import { bootResume, dropResume, setResumeExtras } from "@/lib/resume";
import { removeItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { bgm } from "./bgm/engine";
import EntryScreen, { type EntryChoice, type EntryStart } from "./entry/EntryScreen";

// 게임과 오버레이는 입장한 뒤에만 필요하다. 첫 화면(입장)은 가볍게 띄운다.
const GameShell = dynamic(() => import("./overlay/GameShell"), { ssr: false });

const noSubscribe = () => () => {};

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
  // 47번 이용 제한(실시간 서버 4012·입장 거절): 새로고침하면 첫 화면이 제한 화면으로 바뀐다 (30초에 한 번만, 되풀이 방지)
  useEffect(
    () =>
      bridge.on("app:banned", () => {
        const KEY = "tomb.banReloadAt";
        let last = 0;
        try {
          last = Number(sessionStorage.getItem(KEY)) || 0;
          sessionStorage.setItem(KEY, String(Date.now()));
        } catch {
          // 저장소를 못 쓰면 그냥 새로고침
        }
        if (Date.now() - last > 30_000) window.location.reload();
      }),
    [],
  );
  // 잡히지 않은 오류를 운영자에게 알린다 (같은 메시지는 한 번, 분당 5건까지)
  useEffect(installErrorReporting, []);
  // 입장 클릭 제스처 안에서 바로 재생하려면 곡 목록이 미리 와 있어야 한다
  useEffect(() => {
    void bgm.load();
  }, []);

  // 공유 링크의 묘비는 처음 들어갈 때만 찾아간다 (접속 종료 후 다시 들어오면 평소처럼)
  const [focusGraveId, setFocusGraveId] = useState(initialGraveId);

  // 새로고침(업데이트·F5) 직전 자리 기록이 있으면 입장 화면을 건너뛰고 그 채널·자리로 바로 들어간다 (lib/resume.ts).
  // 기록은 처음 읽을 때 지운다 — 탭을 복제하면 sessionStorage가 복사돼 두 탭이 같은 자리로 돌아오기 때문.
  // 서버 렌더에는 없고(null) 하이드레이션 뒤에 보인다. 한 번 나가면(접속 종료) 다시 쓰지 않는다.
  const boot = useSyncExternalStore(noSubscribe, bootResume, () => null);
  const [bootUsed, setBootUsed] = useState(false);
  const resume = bootUsed ? null : boot;
  const resumeOptions = useMemo<GameStartOptions | null>(
    () => (resume ? { name: resume.name, color: resume.color, body: resume.body, channel: resume.channel, focusGraveId: null, debug, resume } : null),
    [resume, debug],
  );
  const current = options ?? resumeOptions;

  useEffect(() => {
    if (!current || ready) return;
    const timer = setTimeout(() => setBootStalled(true), BOOT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [current, ready]);

  useEffect(() => {
    setResumeExtras(() => ({ bgm: bgm.getSnapshot().playing }));
    const onShow = (e: PageTransitionEvent) => {
      // bfcache로 되살아남: 나갈 때 남긴 기록은 쓰지 않는다
      if (e.persisted) dropResume();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  useEffect(() => {
    if (!resume) return;
    prefetchGraves(resume.channel);
    // 쿠키는 그대로지만 입장 화면과 같은 순서를 지킨다 (실패해도 실시간 연결이 세션을 다시 받는다)
    void api.startSession().catch(() => {});
    if (!resume.bgm) return;
    // 자동 재생은 막혀 있다 → 첫 입력 때 음악을 다시 튼다
    const resumeBgm = () => {
      stop();
      if (!bgm.getSnapshot().playing) bgm.play();
    };
    const stop = () => {
      window.removeEventListener("pointerdown", resumeBgm, true);
      window.removeEventListener("keydown", resumeBgm, true);
    };
    window.addEventListener("pointerdown", resumeBgm, true);
    window.addEventListener("keydown", resumeBgm, true);
    return stop;
  }, [resume]);

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
    setBootUsed(true);
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
      {current && <GameShell options={current} ready={ready} onLeave={leave} onLoggedOut={loggedOut} />}
      {!ready && (
        <EntryScreen
          start={entryStart}
          focusGraveId={focusGraveId}
          entering={current !== null}
          stalled={bootStalled}
          onEnter={enter}
        />
      )}
    </>
  );
}
