"use client";

import { useEffect, useMemo, useState } from "react";
import { DRUNK_MAX, type BbqItemId } from "@tomb/protocol";
import { bbqPlateIconArt } from "@/game/camp/campArt";
import { foodGauge, gaugeClock, myFood, onMyFood, type GaugeRow } from "@/game/camp/foodState";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import styles from "./FoodGauge.module.css";

// 11/15 캠핑장 먹거리·마실 거리 효과 게이지 (GameShell이 붙인다).
// 효과마다 메뉴 그림 + 남은 시간 막대, 취기는 술잔 5칸 + 단계 이름 + 한 단계 깨기까지 남은 시간.
// 마을·캠핑장에서만 보이고(사냥터·상점·집·미니게임에서는 숨김) 걸린 효과가 없으면 아무것도 그리지 않는다.
// PC는 왼쪽 위 음악 줄 아래(흐름 배치라 다른 HUD와 겹치지 않는다), 터치는 compact로 오른쪽 지도 아래에 작은 세로 줄.

function useIcon(id: BbqItemId): string {
  return useMemo(() => {
    try {
      return bbqPlateIconArt(id).toCanvas().toDataURL();
    } catch {
      return "";
    }
  }, [id]);
}

function Icon({ id }: { id: BbqItemId }) {
  const src = useIcon(id);
  // 그 자리에서 그린 작은 픽셀 그림(data URL)이라 next/image가 필요 없다
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className={styles.icon} src={src} alt="" aria-hidden="true" /> : <span className={styles.icon} aria-hidden="true" />;
}

/** 술잔 5칸 (채워진 칸 = 취기 단계) */
function Cups({ level }: { level: number }) {
  return (
    <span className={styles.cups} aria-hidden="true">
      {Array.from({ length: DRUNK_MAX }, (_, i) => (
        <span key={i} className={styles.cup} data-on={i < level || undefined} />
      ))}
    </span>
  );
}

function Row({ r, compact }: { r: GaugeRow; compact: boolean }) {
  if (r.kind === "drunk") {
    const label = `취기 ${r.level}단계 ${r.name}, 한 단계 깨기까지 ${gaugeClock(r.next)}`;
    return (
      <li className={styles.row} data-kind="drunk" aria-label={label} title={label}>
        {compact ? (
          <span className={styles.badge} aria-hidden="true">
            {r.level}
          </span>
        ) : (
          <Cups level={r.level} />
        )}
        {!compact && <b className={styles.name}>{r.name}</b>}
        <span className={styles.bar} aria-hidden="true">
          <span className={styles.fill} style={{ width: `${r.frac * 100}%` }} />
        </span>
        <span className={styles.time}>{gaugeClock(r.next)}</span>
      </li>
    );
  }
  const label = `${r.name} ${r.text}${r.trail ? ", 잔상" : ""}, 남은 시간 ${gaugeClock(r.left)}`;
  return (
    <li className={styles.row} data-kind={r.kind} aria-label={label} title={label}>
      <Icon id={r.item} />
      {!compact && (
        <b className={styles.name}>
          {r.text}
          {r.trail && <span className={styles.tag}>잔상</span>}
        </b>
      )}
      <span className={styles.bar} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${r.frac * 100}%` }} />
      </span>
      <span className={styles.time}>{gaugeClock(r.left)}</span>
    </li>
  );
}

export default function FoodGauge({ compact = false }: { compact?: boolean }) {
  const scene = useBridgeValue("scene:changed")?.scene;
  const [now, setNow] = useState(() => Date.now());
  // 1초마다 + 먹고 마시는 순간 바로
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const off = onMyFood(() => setNow(Date.now()));
    return () => {
      clearInterval(t);
      off();
    };
  }, []);
  if (scene !== undefined && scene !== "world") return null;
  const rows = foodGauge(myFood(), now);
  if (!rows.length) return null;
  return (
    <ul className={cx(styles.gauge, compact && styles.compact)} aria-label="먹거리 효과">
      {rows.map((r) => (
        <Row key={r.kind} r={r} compact={compact} />
      ))}
    </ul>
  );
}
