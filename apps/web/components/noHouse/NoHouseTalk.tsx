"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { FURNITURE_CRAFTER_H, FURNITURE_CRAFTER_W, furnitureCrafter } from "@/game/sprites/furnitureStall";
import { MUNGNYANG_SELLER_H, MUNGNYANG_SELLER_W, mungnyangSeller } from "@/game/sprites/mungnyangSeller";
import { OFFICE_CLERK_H, OFFICE_CLERK_W, officeClerk } from "@/game/sprites/officeSeller";
import { currentMapConcept } from "@/lib/mapConceptClient";
import { rideGateAlert } from "@/lib/rideStop";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { NO_HOUSE_BROWSE, NO_HOUSE_GUIDE, NO_HOUSE_OK, NO_HOUSE_WALK, noHouseShakeLabel, noHouseTitle, pickNoHouseLine, type NoHouseWho } from "./noHouseText";
import styles from "./NoHouseTalk.module.css";

// 11/20 집 없는 손님이 가구를 사러 오면: NPC가 고개를 절레절레 저으며 장난스럽게 거절한다 (사용자: 「어딜 무주택자가! 떼잇!」).
//  - 가구 보따리상(목수 유령): 판매 창 대신 작은 거절 창 (NoHouseTalk) — [분양 사무소로 가기]·[그래도 구경만 할게요]·[알겠어요]
//  - 분양사 보리: 펫은 집 없이도 사니 창은 그대로, 「집 가구」 탭 위에 말풍선 (NoHouseBubble), 목록은 구경만
//  - 11/20 총무팀 문대리(사무실 가구 카트): 가구 보따리상과 같은 거절 창 (NoHouseTalk who="clerk")
//  - 집이 있는지는 판매 창 GET 응답(house)으로 안다 (새 요청 없음). 한 번 안 값은 이 탭에서 기억해 다음에 열 때 깜빡임 없이 고른다
//  - 서버는 원래부터 집이 없으면 가구를 안 판다 (409 NO_HOUSE)

let knownHouse: boolean | null = null;
/** 판매 창 응답으로 안 집 유무 (모르면 null) */
export const houseKnown = () => knownHouse;
export function rememberHouse(v: boolean | undefined): void {
  if (typeof v === "boolean") knownHouse = v;
}

const lastLine: Record<NoHouseWho, string | null> = { stall: null, bori: null, clerk: null };
/** 이번에 할 말 (처음엔 대표 대사, 다음부터 방금 한 말과 다른 줄). 고르기만 하고 적어 두기는 useSaid가 화면에 나온 뒤에 */
const nextLine = (who: NoHouseWho) => pickNoHouseLine(who, lastLine[who], Math.random());
/** 화면에 나온 말을 적어 둔다 (개발 모드에서 초기값을 두 번 불러도 대표 대사가 밀리지 않게 그리기 뒤에) */
function useSaid(who: NoHouseWho, line: string): void {
  useEffect(() => {
    lastLine[who] = line;
  }, [who, line]);
}

/** 분양 사무소 문 앞까지 걸어가기. 창을 닫고 걷는다 — 도착하면 분양 사무소 창이 열린다.
 *  11/22 탈것이면 창을 닫고 가운데 알림 (펫이면 [내리고 가기] — 내린 뒤 그대로 걷는다) */
export function walkToHousing(close: () => void): void {
  const walk = () => bridge.emit("portal:walkTo", { kind: "housing" });
  close();
  if (!rideGateAlert("분양 사무소에 갈", { label: "내리고 가기", run: walk })) walk();
}

/** NPC 얼굴 (게임과 같은 그림을 정수 배율로). shake가 바뀔 때마다 고개를 젓는다 */
function NpcFace({ who, scale, shake, onPoke }: { who: NoHouseWho; scale: number; shake: number; onPoke?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const w = who === "stall" ? FURNITURE_CRAFTER_W : who === "clerk" ? OFFICE_CLERK_W : MUNGNYANG_SELLER_W;
  const h = who === "stall" ? FURNITURE_CRAFTER_H : who === "clerk" ? OFFICE_CLERK_H : MUNGNYANG_SELLER_H;

  // 숨쉬기 두 장 (게임과 같은 650ms). 움직임 줄이기면 CSS가 흔들기를 끄고, 숨쉬기는 그대로 둬도 한 칸이라 거슬리지 않는다
  useEffect(() => {
    const t = window.setInterval(() => setFrame((f) => (f + 1) % 2), 650);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const concept = currentMapConcept();
    const src = who === "stall" ? furnitureCrafter(frame, concept) : who === "clerk" ? officeClerk(frame, concept) : mungnyangSeller(frame, concept);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, w * scale, h * scale);
    // shake가 바뀌면 그림 칸을 새로 붙여 흔들기를 다시 튼다 (새 칸에 다시 그린다)
  }, [who, frame, scale, w, h, shake]);

  const art = <canvas ref={ref} width={w * scale} height={h * scale} className={styles.face} />;
  const label = noHouseShakeLabel(who);
  return (
    <span key={shake} className={cx(styles.faceWrap, shake > 0 && styles.shake)} style={{ width: w * scale, height: h * scale }}>
      {onPoke ? (
        <button type="button" className={styles.poke} onClick={onPoke} aria-label={`${label}. 눌러서 한 번 더 말 걸기`} title="한 번 더 말 걸기">
          {art}
        </button>
      ) : (
        <span role="img" aria-label={label}>
          {art}
        </span>
      )}
    </span>
  );
}

/** 가구 보따리상(기본)·총무팀 문대리(who="clerk"): 판매 창 대신 뜨는 작은 거절 창 */
export function NoHouseTalk({ onBrowse, onClose, who = "stall" }: { onBrowse: () => void; onClose: () => void; who?: Exclude<NoHouseWho, "bori"> }) {
  const [talk, setTalk] = useState(() => ({ line: nextLine(who), shake: 1 }));
  const poke = () => setTalk((t) => ({ line: pickNoHouseLine(who, t.line, Math.random()), shake: t.shake + 1 }));
  useSaid(who, talk.line);
  return (
    <Dialog title={noHouseTitle(who)} kind="confirm" onClose={onClose}>
      <div className={styles.talk}>
        <div className={styles.scene}>
          <NpcFace who={who} scale={3} shake={talk.shake} onPoke={poke} />
          <p key={talk.shake} className={styles.bubble} aria-live="polite">
            {talk.line}
          </p>
        </div>
        <p className={styles.guide}>{NO_HOUSE_GUIDE}</p>
        <div className={styles.actions}>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => walkToHousing(onClose)}>
            {NO_HOUSE_WALK}
          </button>
          <div className={styles.row}>
            <button type="button" className={cx(ui.button, styles.small)} onClick={onBrowse}>
              {NO_HOUSE_BROWSE}
            </button>
            <button type="button" className={cx(ui.button, styles.small)} onClick={onClose}>
              {NO_HOUSE_OK}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** 분양사 보리 「집 가구」 탭 위 말풍선 (탭을 누를 때마다 부모가 key를 바꿔 새 대사·고개 젓기) */
export function NoHouseBubble({ onWalk }: { onWalk: () => void }) {
  const [talk, setTalk] = useState(() => ({ line: nextLine("bori"), shake: 1 }));
  const poke = () => setTalk((t) => ({ line: pickNoHouseLine("bori", t.line, Math.random()), shake: t.shake + 1 }));
  useSaid("bori", talk.line);
  return (
    <div className={cx(styles.scene, styles.inline)}>
      <NpcFace who="bori" scale={2} shake={talk.shake} onPoke={poke} />
      <div className={styles.inlineText}>
        <p key={talk.shake} className={styles.bubble} aria-live="polite">
          {talk.line}
        </p>
        <button type="button" className={cx(ui.button, styles.small, styles.walkLink)} onClick={onWalk}>
          {NO_HOUSE_WALK}
        </button>
      </div>
    </div>
  );
}
