"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { walkingAfter } from "@/lib/huntWalk";
import { PHOTO_DEFAULT, PHOTO_TIMES, PHOTO_WEATHERS, photoFiltered, photoFileName, photoModeKey, type PhotoFilters } from "@/lib/photo/photoRules";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./PhotoMode.module.css";

// 11/19 촬영 모드 화면 (GameShell이 촬영 모드일 때만 불러와요 — next/dynamic).
// 다른 화면 위 단추·HUD는 GameShell이 숨기고, 여기엔 구석의 [찍기]·[촬영 모드 끝내기]·늘 펼친 도구 상자만 있어요.
// 사진은 게임 캔버스만 찍어서(game/photo) 이 단추들은 안 찍혀요. 서버에는 아무것도 보내지 않아요.

type Shot = { url: string; blob: Blob; name: string; width: number; height: number };

function editableFocus(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLElement && (el.isContentEditable || el.matches("input, textarea, select"));
}

/** 폰: 공유 시트로 사진 앱·갤러리에 넣어요. 못 쓰면 false */
function shareShot(shot: Shot): Promise<"shared" | "cancelled" | "unsupported"> {
  const file = new File([shot.blob], shot.name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share !== "function" || !nav.canShare?.({ files: [file] })) return Promise.resolve("unsupported");
  return nav
    .share({ files: [file] })
    .then(() => "shared" as const)
    .catch((e: unknown) => (e instanceof DOMException && e.name === "AbortError" ? "cancelled" : "unsupported"));
}

/** 다운로드 (데스크톱 = 다운로드 폴더, 안드로이드 = Download 폴더 → 갤러리에도 보여요) */
function downloadShot(shot: Shot): void {
  const a = document.createElement("a");
  a.href = shot.url;
  a.download = shot.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function PhotoMode({ touch, onExit }: { touch: boolean; onExit: () => void }) {
  const [filters, setFilters] = useState<PhotoFilters>(PHOTO_DEFAULT);
  const [shooting, setShooting] = useState(false);
  const [flash, setFlash] = useState(0);
  const [shot, setShot] = useState<Shot | null>(null);
  const [saved, setSaved] = useState<"saved" | "hold" | null>(null);
  const [failed, setFailed] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const exitRef = useRef(onExit);
  useEffect(() => {
    exitRef.current = onExit;
  }, [onExit]);

  // 11/19 사용자: 촬영 중엔 내 캐릭터는 그 자리에 멈춰 있어요. 게임 입력을 막으면(ui:blockKeys) 누르고 있던 키·조이스틱이 풀려
  // 평소처럼 멈춤이 한 번 가요 (새 요청 없음). 다른 사람·NPC는 그대로 움직여요
  useBlockingLayer();

  // 들어가고 나오기 (나올 때 게임이 필터·카메라를 모두 되돌려요)
  useEffect(() => {
    // 입구·잡화점까지 걸어가던 중이면 멈춰요
    if (walkingAfter(bridge.last("portal:walk")?.status)) bridge.emit("portal:walkTo", { kind: null });
    bridge.emit("photo:mode", { on: true });
    return () => bridge.emit("photo:mode", { on: false });
  }, []);

  // 필터 → 게임 (내 화면에서만)
  useEffect(() => {
    const hour = filters.time ? (PHOTO_TIMES.find((t) => t.id === filters.time)?.hour ?? null) : null;
    bridge.emit("photo:set", { names: filters.names, me: filters.me, hour, weather: filters.weather });
  }, [filters]);

  // 촬영 모드 중 키: Esc·K는 끝내기, 걷기를 포함한 게임 키는 모두 막아요 (창 맨 앞 capture)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const act = photoModeKey(e, editableFocus());
      if (act === "pass") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (act === "exit") exitRef.current();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  useBridgeEvent("photo:shot", ({ blob, width, height }) => {
    setShooting(false);
    if (!blob) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setSaved(null);
    dropShot();
    const next = { url: URL.createObjectURL(blob), blob, name: photoFileName(Date.now()), width, height };
    shotRef.current = next;
    setShot(next);
  });

  // 미리보기를 닫으면(다시 찍기·끝내기·창이 내려감) 큰 그림(Blob URL)을 바로 놓아요
  const shotRef = useRef<Shot | null>(null);
  function dropShot() {
    if (shotRef.current) URL.revokeObjectURL(shotRef.current.url);
    shotRef.current = null;
  }
  function closePreview() {
    dropShot();
    setShot(null);
  }
  useEffect(() => () => dropShot(), []);
  const shotUrl = shot?.url;
  useEffect(() => {
    if (!shotUrl) return;
    const t = setTimeout(() => saveRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [shotUrl]);

  function shoot() {
    if (shooting) return;
    setShooting(true);
    setFlash((n) => n + 1);
    bridge.emit("photo:shoot");
  }

  function save() {
    if (!shot) return;
    if (!touch) {
      downloadShot(shot);
      setSaved("saved");
      return;
    }
    // 폰: 공유 시트(iOS 「이미지 저장」 → 사진 앱, 안드로이드 갤러리) → 못 쓰면 다운로드 + 길게 눌러 저장 안내
    void shareShot(shot).then((r) => {
      if (r === "shared") setSaved("saved");
      else if (r === "unsupported") {
        downloadShot(shot);
        setSaved("hold");
      }
    });
  }

  const set = (patch: Partial<PhotoFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className={styles.layer} data-photo-keep="">
      {flash > 0 && <div key={flash} className={styles.flash} aria-hidden="true" />}
      {!shot && (
        <div className={cx(styles.corner, touch && styles.touch)}>
          {/* 11/19 도구 상자는 늘 펼쳐 둔다 (사용자 결정) */}
          <section className={cx(ui.panel, styles.tools)} aria-label="촬영 도구">
            <div className={styles.row}>
              <button type="button" className={cx(ui.button, styles.chip)} aria-pressed={!filters.names} onClick={() => set({ names: !filters.names })}>
                {filters.names ? "이름표 끄기" : "이름표 켜기"}
              </button>
              <button type="button" className={cx(ui.button, styles.chip)} aria-pressed={!filters.me} onClick={() => set({ me: !filters.me })}>
                {filters.me ? "내 캐릭터 숨기기" : "내 캐릭터 보이기"}
              </button>
            </div>
            <h3 className={styles.head}>시간대</h3>
            <div className={styles.row} role="group" aria-label="시간대">
              <button type="button" className={cx(ui.button, styles.chip)} aria-pressed={filters.time === null} onClick={() => set({ time: null })}>
                지금
              </button>
              {PHOTO_TIMES.map((t) => (
                <button key={t.id} type="button" className={cx(ui.button, styles.chip)} aria-pressed={filters.time === t.id} onClick={() => set({ time: t.id })}>
                  {t.label}
                </button>
              ))}
            </div>
            <h3 className={styles.head}>날씨</h3>
            <div className={styles.row} role="group" aria-label="날씨">
              <button type="button" className={cx(ui.button, styles.chip)} aria-pressed={filters.weather === null} onClick={() => set({ weather: null })}>
                지금
              </button>
              {PHOTO_WEATHERS.map((w) => (
                <button key={w.id} type="button" className={cx(ui.button, styles.chip)} aria-pressed={filters.weather === w.id} onClick={() => set({ weather: w.id })}>
                  {w.label}
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              {touch ? "두 손가락으로 확대하고, 끌어서 둘러봐요." : "휠로 확대하고, 끌어서 둘러봐요."} 촬영 중엔 내 캐릭터가 멈춰 있어요. 필터는 내 화면에만 보여요.
            </p>
            {photoFiltered(filters) && (
              <button type="button" className={cx(ui.button, ui.quiet, styles.reset)} onClick={() => setFilters(PHOTO_DEFAULT)}>
                모두 되돌리기
              </button>
            )}
          </section>
          {failed && <p className={cx(ui.panel, styles.fail)}>사진을 못 찍었어요. 다시 눌러 주세요.</p>}
          <div className={styles.bar}>
            <button type="button" className={cx(ui.button, ui.primary, styles.small)} onClick={shoot} disabled={shooting}>
              <PixelIcon name="camera" />
              찍기
            </button>
            <button type="button" className={cx(ui.button, styles.small)} onClick={onExit} title={touch ? undefined : "촬영 모드 끝내기 (Esc)"}>
              촬영 모드 끝내기
            </button>
          </div>
        </div>
      )}
      {shot && (
        <div className={styles.dim}>
          <div className={cx(ui.panel, styles.preview)} role="dialog" aria-modal="true" aria-label="찍은 사진">
            {/* eslint-disable-next-line @next/next/no-img-element -- 방금 찍은 Blob 그림 (최적화할 것이 없어요) */}
            <img className={styles.photo} src={shot.url} alt="찍은 사진" width={shot.width} height={shot.height} draggable={touch} />
            <p className={styles.hint}>
              {touch
                ? saved === "hold"
                  ? "저장이 안 되면 사진을 길게 눌러 저장해요."
                  : "[사진에 저장하기]를 누르면 사진 앱이나 갤러리에 넣을 수 있어요. 안 되면 사진을 길게 눌러 저장해요."
                : "다운로드 폴더에 저장돼요. 바탕화면에 바로 저장하려면 크롬 설정에서 다운로드 위치를 바탕화면으로 바꿔요."}
            </p>
            {saved === "saved" && (
              <p className={styles.done} role="status">
                {touch ? "저장했어요." : `${shot.name}로 저장했어요.`}
              </p>
            )}
            <div className={styles.actions}>
              <button ref={saveRef} type="button" className={cx(ui.button, ui.primary)} onClick={save}>
                {touch ? "사진에 저장하기" : "저장하기"}
              </button>
              <button type="button" className={ui.button} onClick={closePreview}>
                다시 찍기
              </button>
              <button type="button" className={ui.button} onClick={onExit}>
                촬영 모드 끝내기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
