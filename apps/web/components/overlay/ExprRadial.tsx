"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { bridge } from "@/game/bridge";
import { emoteDataUrl } from "@/game/sprites/emotes";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import styles from "./ExprRadial.module.css";
import { favLabel, sendFav, slotOf, useFavs, type FavKey } from "./sayFavorites";

/** 원형 반지름 (px). 칸이 많으면 조금 넓힌다 */
const radiusFor = (n: number) => (n <= 4 ? 62 : n <= 6 ? 72 : 82);
/** 칸 크기의 절반 + 여유 (화면 밖으로 안 나가게 가운데를 당긴다) */
const EDGE = 40;
/** 말풍선 칸에 보이는 글자 수 (전체 문장은 title·읽기 도구로) */
const SHORT = 5;

const short = (text: string) => (text.length > SHORT ? `${text.slice(0, SHORT)}…` : text);

/**
 * 즐겨찾기 표현 원형 목록 (U 키 · 폰은 표현 버튼 길게 누르기).
 * 내 캐릭터 둘레에 펼쳐지고 캐릭터를 따라다닌다 (게임이 me:screen으로 화면 위치를 알린다).
 * 하나를 누르면(또는 숫자 1~8) 바로 닫히고 그 표현을 보낸다. U·Esc·바깥 누르기면 닫힌다. 도배 제한은 게임·서버가 그대로.
 */
export default function ExprRadial({ onClose }: { onClose: () => void }) {
  const favs = useFavs();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // 열려 있는 동안만 게임이 내 화면 위치를 보낸다
  useEffect(() => {
    bridge.emit("ui:radial", { open: true });
    return () => bridge.emit("ui:radial", { open: false });
  }, []);
  useBridgeEvent("me:screen", (p) => setPos(p));

  // 키: 1~8 고르기, U·Esc 닫기 (게임 키보드보다 먼저 받아 숫자 키 이모티콘이 따로 나가지 않게)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const m = /^(?:Digit|Numpad)([1-8])$/.exec(e.code);
      if (m) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        const key = favs[Number(m[1]) - 1];
        if (!key) return;
        closeRef.current();
        sendFav(key);
        return;
      }
      if (e.code === "KeyU" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [favs]);

  // 바깥을 누르면 닫는다 (연 그 누르기는 건너뛰게 한 박자 뒤에 건다)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeRef.current();
    };
    const t = setTimeout(() => window.addEventListener("pointerdown", onDown, true), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, []);

  if (!pos) return null;
  const n = favs.length;
  const R = radiusFor(n);
  const pad = R + EDGE;
  const vw = typeof window === "undefined" ? 0 : window.innerWidth;
  const vh = typeof window === "undefined" ? 0 : window.innerHeight;
  const cxp = Math.max(pad, Math.min(pos.x, vw - pad));
  const cyp = Math.max(pad, Math.min(pos.y, vh - pad));

  function pick(key: FavKey) {
    closeRef.current();
    sendFav(key);
  }

  return (
    <div ref={rootRef} className={styles.root} style={{ left: cxp, top: cyp }} role="menu" aria-label="즐겨찾기 표현 (숫자 1~8로 고르기, U·Esc로 닫기)">
      <span className={styles.ring} style={{ width: R * 2, height: R * 2 }} aria-hidden="true" />
      {n === 0 ? (
        <p className={styles.empty}>즐겨찾기가 없어요. T(표현 창)에서 별을 눌러 넣어 보세요.</p>
      ) : (
        favs.map((key, i) => {
          // 12시 방향부터 시계 방향
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          const label = favLabel(key);
          const slot = key.startsWith("p:") ? undefined : slotOf(key.slice(2));
          let face: ReactNode;
          if (slot) face = <img src={emoteDataUrl(slot.icon, 2)} width={26} height={26} alt="" aria-hidden="true" />;
          else face = <span className={styles.text}>{short(label)}</span>;
          return (
            <button
              key={key}
              type="button"
              role="menuitem"
              className={cx(styles.item, !slot && styles.phrase)}
              style={{ transform: `translate(-50%, -50%) translate(${Math.cos(a) * R}px, ${Math.sin(a) * R}px)` }}
              title={label}
              aria-label={`${i + 1}. ${label}`}
              onClick={() => pick(key)}
            >
              <span className={styles.num} aria-hidden="true">
                {i + 1}
              </span>
              {face}
            </button>
          );
        })
      )}
    </div>
  );
}

/**
 * 바로 가기 줄의 [표현] 버튼: 누르면 표현 창(T), 길게 누르면(폰) 즐겨찾기 원형 목록(U).
 * 마우스 오른쪽 클릭도 원형 목록을 연다.
 */
export function ExprButton({ className, onOpen, onRadial, children }: { className?: string; onOpen: () => void; onRadial: () => void; children: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  return (
    <button
      type="button"
      className={cx(styles.exprButton, className)}
      title="표현 (T) · 길게 누르면 즐겨찾기 (U)"
      aria-label="표현: 말풍선·이모티콘 (T). 길게 누르면 즐겨찾기 원형 목록 (U)"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        longFired.current = false;
        clear();
        timer.current = setTimeout(() => {
          timer.current = null;
          longFired.current = true;
          onRadial();
        }, 450);
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => {
        // 터치 길게 누르기의 기본 메뉴는 막고, 마우스 오른쪽 클릭이면 원형 목록 (뒤따르는 click이 없어 longFired는 건드리지 않는다)
        e.preventDefault();
        clear();
        if (!longFired.current) onRadial();
      }}
      onClick={() => {
        if (longFired.current) {
          longFired.current = false;
          return;
        }
        onOpen();
      }}
    >
      {children}
    </button>
  );
}
