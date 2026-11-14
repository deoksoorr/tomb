"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { animFrames } from "@/game/housing/art";
import { errorMessage } from "@/lib/api";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { meStore } from "@/lib/hooks/useMe";
import { CATEGORY_LABELS, FURNITURE, MAX_OWN_PER_ITEM, sellPrice, type FurnitureCategory, type FurnitureDef } from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import type { MyHouseResponse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";
import { fmt, FurnitureStage, FurnitureThumb } from "./parts";

/** 갈래 탭 순서: 가구·사무실·자연·분위기·생활·바닥·벽지·외관(담장 등) */
const CATS: FurnitureCategory[] = ["furniture", "dev", "nature", "mood", "living", "skin", "exterior"];
const COUNTS = Object.fromEntries(CATS.map((c) => [c, FURNITURE.filter((f) => f.category === c).length])) as Record<FurnitureCategory, number>;

type Props = {
  my: MyHouseResponse;
  /** 지금 놓여 있는 개수 (편집 중이면 저장 전 배치 기준) */
  placed: Record<string, number>;
  onMy: (r: MyHouseResponse) => void;
  onClose: () => void;
  /** 주면 "내 집에 놓아 보기" 단추가 생긴다: 사지 않고 내 집 바닥에 반투명으로 얹어 본다 (꾸미기 중일 때) */
  onTry?: (itemId: string) => void;
};

/** 데스크톱 큰 미리보기 칸 높이 (남은 높이에 맞춰 이 사이에서 고른다) */
const STAGE_MAX_H = 204;
const STAGE_MIN_H = 72;

/** 칸에 놓는 물건인지 (바닥·벽지·외관은 돌리거나 놓아 볼 수 없다) */
const placeable = (f: FurnitureDef) => !f.skin && !f.ext;

/** 물건이 하는 일 (자세히 보기의 "할 수 있는 일" 줄) */
function abilities(f: FurnitureDef): string[] {
  const out: string[] = [];
  if (f.ext) out.push("집 외관에 입혀요 (외관 꾸미기)");
  else if (f.skin) out.push(f.skin === "floor" ? "방 바닥 전체를 바꿔요" : "방 벽 전체를 바꿔요");
  // 칸에 놓는 물건의 크기는 점수 줄의 "3×2칸" 표시로 보여 준다
  if (f.use) out.push(`E 키: ${f.use}`);
  if (f.floor) out.push("밟고 지나갈 수 있고 위에 물건을 올려요");
  if (f.light) out.push("밤에 빛나요");
  return out;
}

/**
 * 가구 상점: 갈래 탭 → 썸네일 격자 → 누르면 자세히 보기(설명·꾸밈 점수·할 수 있는 일·사기/되팔기).
 * 상점과 같은 규칙: 마우스를 올려도 선택은 바뀌지 않고, 눌러야 바뀐다. 창은 표준 크기, 목록만 스크롤한다.
 * 산 물건은 하우징 가방에 들어가고, 놓지 않은 것은 절반 값에 되팔 수 있다.
 */
export default function FurnitureShop({ my, placed, onMy, onClose, onTry }: Props) {
  const [cat, setCat] = useState<FurnitureCategory>("furniture");
  const [picked, setPicked] = useState<Partial<Record<FurnitureCategory, string>>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  // 큰 미리보기: 돌린 방향(고른 물건이 바뀌면 처음 방향)·낮밤·잔물결 장면
  const [turn, setTurn] = useState<{ id: string; r: number }>({ id: "", r: 0 });
  const [night, setNight] = useState(false);
  const [frame, setFrame] = useState(0);
  const phone = useMediaQuery("(max-width: 560px)");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  const items = FURNITURE.filter((f) => f.category === cat);
  const shown = items.find((f) => f.id === picked[cat]) ?? items[0];
  const frames = shown ? animFrames(shown.id) : 1;

  // 움직이는 그림(연못 잔물결)만 천천히 장면을 넘긴다. 동작 줄이기면 멈춘 그림
  // 데스크톱: 왼쪽 자세히 보기가 스크롤 없이 들어가게 미리보기 칸 높이를 남은 높이에 맞춘다
  // (창이 낮은 화면·브라우저 확대에서는 미리보기 배율이 저절로 한 단계씩 줄어든다)
  const detailRef = useRef<HTMLElement>(null);
  const [stageFit, setStageFit] = useState(STAGE_MAX_H);
  const shownId = shown?.id;
  useLayoutEffect(() => {
    const el = detailRef.current;
    if (!el || phone || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const wrap = el.querySelector<HTMLElement>("[data-stage-wrap]");
      const stage = el.querySelector<HTMLElement>("[data-stage]");
      const info = el.querySelector<HTMLElement>("[data-info]");
      if (!wrap || !stage || !info) return;
      const cs = getComputedStyle(el);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const gap = parseFloat(cs.rowGap) || 0;
      const stagePad = stage.offsetHeight - stage.clientHeight + parseFloat(getComputedStyle(stage).paddingTop) + parseFloat(getComputedStyle(stage).paddingBottom);
      const inner = stage.offsetHeight - stagePad;
      // 미리보기 그림 칸을 뺀 나머지 (단추 줄·설명·사기 단추)
      const rest = wrap.offsetHeight - inner + gap + info.offsetHeight;
      const avail = Math.floor(el.clientHeight - pad - rest);
      setStageFit(Math.max(STAGE_MIN_H, Math.min(STAGE_MAX_H, avail)));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const info = el.querySelector("[data-info]");
    if (info) ro.observe(info);
    measure();
    return () => ro.disconnect();
  }, [phone, shownId]);

  useEffect(() => {
    if (frames < 2 || reduced) return;
    const t = setInterval(() => setFrame((n) => (n + 1) % frames), 420);
    return () => clearInterval(t);
  }, [frames, reduced]);

  function switchTab(c: FurnitureCategory) {
    setCat(c);
    listRef.current?.scrollTo({ top: 0 });
  }

  async function act(def: FurnitureDef, sell: boolean) {
    setPending(def.id);
    setMsg(null);
    try {
      if (sell) {
        const r = await housingApi.sellItem(def.id);
        onMy(r);
        setMsg(`${def.name}을(를) ${r.refunded}P에 팔았어요.`);
      } else {
        onMy(await housingApi.buyItem(def.id));
        setMsg(`${def.name}을(를) 가방에 넣었어요.`);
      }
      void meStore.refresh();
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  function detail(f: FurnitureDef) {
    const owned = my.inventory[f.id] ?? 0;
    const free = owned - (placed[f.id] ?? 0);
    const short = my.points < f.price;
    const full = owned >= MAX_OWN_PER_ITEM;
    const once = (!!f.skin || !!f.ext) && owned > 0;
    const r = turn.id === f.id ? turn.r : 0;
    // 돌리면 가로·세로가 바뀌는 물건은 4방향, 아니면 좌우 뒤집기 2방향
    const ways = f.turn ? 4 : 2;
    const sw = phone ? 140 : 216;
    const sh = phone ? 140 : stageFit;
    return (
      <section ref={detailRef} className={styles.fsDetail} aria-label="자세히 보기">
        <div className={styles.fsStageWrap} data-stage-wrap="">
          <div className={styles.fsStage} data-stage="" data-night={night || undefined}>
            <FurnitureStage itemId={f.id} w={sw} h={sh} r={r} night={night} frame={reduced ? 0 : frame} />
          </div>
          <div className={styles.fsStageBar}>
            {placeable(f) && (
              <button
                type="button"
                className={cx(ui.button, styles.fsStageBtn)}
                onClick={() => setTurn({ id: f.id, r: (r + 1) % ways })}
                aria-label={`${f.name} ${f.turn ? "돌려" : "뒤집어"} 보기 (${r + 1}/${ways})`}
              >
                {f.turn ? "↻ 돌려 보기" : "⇆ 뒤집어 보기"}
              </button>
            )}
            <div className={styles.fsDayNight} role="group" aria-label="미리보기 조명">
              <button type="button" className={cx(ui.button, styles.fsStageBtn)} aria-pressed={!night} onClick={() => setNight(false)}>
                낮
              </button>
              <button type="button" className={cx(ui.button, styles.fsStageBtn)} aria-pressed={night} onClick={() => setNight(true)}>
                밤
              </button>
            </div>
          </div>
        </div>
        <div className={styles.fsInfo} data-info="" aria-live="polite">
          <p className={styles.fsName}>{f.name}</p>
          <p className={styles.fsText} title={f.desc}>
            {f.desc}
          </p>
          <p className={styles.fsScore}>
            {placeable(f) && <span className={styles.fsSize}>{f.w}×{f.h}칸</span>}
            꾸밈 점수 <strong>+{f.score}</strong>
            {owned > 0 && <span className={styles.small}> · 가진 것 {owned}{placed[f.id] ? ` (놓은 것 ${placed[f.id]})` : ""}</span>}
          </p>
          {abilities(f).length > 0 && (
            <ul className={styles.fsAbilities} aria-label="할 수 있는 일">
              {abilities(f).map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <div className={styles.fsActions}>
            <button
              type="button"
              className={cx(ui.button, ui.primary)}
              disabled={pending !== null || short || full || once}
              onClick={() => act(f, false)}
              aria-label={`${f.name}, ${f.price}포인트에 사기`}
            >
              {pending === f.id ? "…" : once ? "가짐" : full ? "더 못 가져요" : `${fmt(f.price)}P${short ? " · 모자라요" : " · 사기"}`}
            </button>
            {owned > 0 && (
              <button
                type="button"
                className={ui.button}
                disabled={pending !== null || free < 1}
                onClick={() => act(f, true)}
                aria-label={`${f.name} 하나를 ${sellPrice(f)}포인트에 되팔기`}
                title={free < 1 ? "놓여 있는 물건은 먼저 치운 뒤 저장해야 팔 수 있어요" : undefined}
              >
                되팔기 {sellPrice(f)}P
              </button>
            )}
            {onTry && placeable(f) && (
              <button
                type="button"
                className={ui.button}
                disabled={pending !== null}
                onClick={() => onTry(f.id)}
                title="사지 않고 내 집 바닥에 반투명으로 얹어 봐요. 저장되지 않아요."
                aria-label={`${f.name}, 사지 않고 내 집에 놓아 보기`}
              >
                놓아 보기
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <Dialog title="가구 상점" onClose={onClose}>
      <div className={styles.fsShop}>
        <div className={styles.fsTop}>
          <p className={styles.points}>
            내 포인트 <strong>{fmt(my.points)}P</strong>
          </p>
          <p className={cx(styles.small, styles.fsHint)}>되팔면 절반 · 놓인 물건은 치우고 저장한 뒤 팔 수 있어요</p>
        </div>
        <div className={styles.fsTabs} role="tablist" aria-label="물건 갈래">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              id={`${id}-${c}`}
              aria-selected={cat === c}
              aria-controls={`${id}-panel`}
              className={styles.tab}
              onClick={() => switchTab(c)}
            >
              {CATEGORY_LABELS[c]}
              <span className={styles.fsTabCount}>{COUNTS[c]}</span>
            </button>
          ))}
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${cat}`} className={styles.fsPanel}>
          {shown && detail(shown)}
          <ul ref={listRef} className={styles.fsGrid} aria-label={`${CATEGORY_LABELS[cat]} 목록`}>
            {items.map((f) => {
              const owned = my.inventory[f.id] ?? 0;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className={styles.fsTile}
                    aria-pressed={shown?.id === f.id}
                    title={`${f.name} — ${f.desc}`}
                    aria-label={`${f.name}, ${f.price}포인트, 꾸밈 +${f.score}${owned > 0 ? `, ${owned}개 가짐` : ""}`}
                    onClick={() => setPicked((p) => ({ ...p, [cat]: f.id }))}
                  >
                    <FurnitureThumb itemId={f.id} ext={!!f.ext} />
                    <span className={styles.fsTileName}>{f.name}</span>
                    <span className={styles.fsTilePrice}>
                      {fmt(f.price)}P
                      {owned > 0 && <span className={styles.fsBadge}>{(f.skin || f.ext) ? "가짐" : `×${owned}`}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <p className={styles.notice} role="status">
          {msg}
        </p>
      </div>
    </Dialog>
  );
}
