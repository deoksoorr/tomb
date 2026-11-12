"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DIFFICULTIES, DIFFS, gearById, MONSTERS, zonesOf, type ZoneDef, type ZoneId } from "@/lib/rpg/catalog";
import { fetchHuntCrowd, type HuntCrowd } from "@/lib/rpg/client";
import { cx } from "../ui/cx";
import s from "./rpg.module.css";

// 40번 사냥터 고르기: 난이도마다 두세 곳, 카드마다 지도 미리보기(게임과 같은 그림)·이름·입장 레벨·지형 기믹.
// 난이도 줄은 창 너비를 다 쓰고, 그 난이도의 사냥터 카드가 한 줄에 모두 보인다 (카드 수만큼 균등 분할).
// 카드를 누르면 그 줄 바로 아래에 설명(detail — ZoneInfo + 출발 버튼)이 펼쳐진다 → 고르고·읽고·출발이 한 시선 안에서 끝난다.
// 레벨이 모자라면 잠겨 있다 (로컬 개발 서버에서 localStorage["tomb.rpg.unlockAll"]="1"이면 모두 열림 — 검수용).

const previews = new Map<string, string>();

/** 지도 미리보기 (처음 볼 때 한 번 그리고 모듈에 담아 둔다). 그림 코드는 사냥 씬과 같다 */
function useZonePreview(z: ZoneDef): string | null {
  const [url, setUrl] = useState<string | null>(() => previews.get(z.id) ?? null);
  useEffect(() => {
    if (url) return;
    let alive = true;
    // 카드가 한꺼번에 그리지 않게 조금씩 미룬다 (사냥터 순서대로)
    const t = window.setTimeout(
      async () => {
        const [{ arenaPreview }, { buildLayout }] = await Promise.all([import("@/game/rpg/arena/art"), import("@/game/rpg/arena/layout")]);
        if (!alive) return;
        try {
          const c = arenaPreview(buildLayout(z.id, 0), [z.boss, ...z.pool], 0.5);
          const u = c.toDataURL();
          previews.set(z.id, u);
          setUrl(u);
        } catch {
          /* 캔버스를 못 쓰면 색 상자로 */
        }
      },
      30 + DIFFICULTIES.indexOf(z.difficulty) * 60,
    );
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [z, url]);
  return url;
}

export const zoneUnlockAll = (): boolean => {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    return localStorage.getItem("tomb.rpg.unlockAll") === "1";
  } catch {
    return false;
  }
};

export const zoneOpen = (z: ZoneDef, level: number, all = false) => all || level >= z.unlockLevel;

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

function ZoneCard({ z, level, selected, all, crowd, onPick }: { z: ZoneDef; level: number; selected: boolean; all: boolean; crowd: number; onPick: () => void }) {
  const url = useZonePreview(z);
  const open = zoneOpen(z, level, all);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={!open}
      aria-label={`${z.name}${open ? "" : ` (Lv.${z.unlockLevel}부터)`}`}
      className={cx(s.card, s.zoneCard, !open && s.zoneLocked)}
      onClick={() => open && onPick()}
    >
      <span
        className={s.zonePreview}
        style={{
          background: `linear-gradient(135deg, ${hex(z.floor[0])}, ${hex(z.floor[1])})`,
        }}
      >
        {url && <img src={url} alt="" width={224} height={144} />}
        <span className={s.zoneTag}>{z.gimmick.name}</span>
        {!open && <span className={s.zoneLock}>Lv.{z.unlockLevel}부터</span>}
      </span>
      <span className={cx(s.cardName, s.zoneName)}>{z.name}</span>
      <span className={s.meta}>
        Lv.{z.unlockLevel}+{crowd > 0 && ` · ${crowd}명 사냥 중`}
      </span>
    </button>
  );
}

export default function ZonePicker({ level, zone, onZone, detail }: { level: number; zone: ZoneId; onZone: (z: ZoneDef) => void; detail?: ReactNode }) {
  const [all] = useState(zoneUnlockAll);
  // 사냥터별 지금 사냥 중인 인원 (실시간 서버, 15초마다)
  const [crowd, setCrowd] = useState<HuntCrowd>({});
  useEffect(() => {
    let alive = true;
    const load = () => void fetchHuntCrowd().then((c) => alive && setCrowd(c));
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const detailRef = useRef<HTMLDivElement>(null);
  const picked = useRef(false);
  // 카드를 누른 뒤에만 펼친 설명이 보이게 살짝 스크롤 (처음 열 때는 그대로)
  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [zone]);
  return (
    <div className={s.zoneTiers} role="radiogroup" aria-label="사냥터">
      {DIFFICULTIES.map((d) => {
        const zs = zonesOf(d);
        const at = zs.findIndex((z) => z.id === zone);
        return (
          <div key={d} className={s.zoneTier}>
            <p className={s.zoneTierHead}>
              <b>{DIFFS[d].name}</b> · 권장 Lv.{DIFFS[d].recLevel}+ · 최대 {DIFFS[d].huntPoints}P~
            </p>
            <div className={s.zoneGrid}>
              {zs.map((z) => (
                <ZoneCard
                  key={z.id}
                  z={z}
                  level={level}
                  all={all}
                  crowd={crowd[z.id] ?? 0}
                  selected={zone === z.id}
                  onPick={() => {
                    picked.current = true;
                    onZone(z);
                  }}
                />
              ))}
            </div>
            {at >= 0 && detail && (
              // 고른 카드 아래를 가리키는 꼭지 (카드 칸 가운데)
              <div
                ref={detailRef}
                className={s.zoneDetail}
                style={
                  {
                    "--caret": `${((at + 0.5) / zs.length) * 100}%`,
                  } as CSSProperties
                }
              >
                {detail}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 고른 사냥터 자세히: 설명·기믹·몬스터·드롭 */
export function ZoneInfo({ z }: { z: ZoneDef }) {
  const D = DIFFS[z.difficulty];
  const favor = z.favor.map((id) => gearById(id)?.name).filter(Boolean);
  return (
    <div className={s.zoneInfo}>
      <p className={s.zoneInfoHead}>
        <b>{z.name}</b> — {z.desc}
      </p>
      <p className={s.meta}>
        <b className={s.zoneGimmick}>{z.gimmick.name}</b> {z.gimmick.desc}
      </p>
      <p className={s.meta}>
        나오는 것: {[...new Set(z.pool)].map((id) => MONSTERS[id].name).join(", ")}
        <br />
        우두머리: <b>{MONSTERS[z.boss].name}</b> — 화나면 {MONSTERS[z.summon.id].name}을(를) 불러요
        <br />
        웨이브 {z.waves}개 · {z.timeLimitSec}초 · 장비 드롭 Lv.
        {Math.max(1, D.dropMaxLevel - 20)}~{D.dropMaxLevel}
        {favor.length > 0 && ` · 잘 나오는 것: ${favor.join(", ")}`}
      </p>
    </div>
  );
}
