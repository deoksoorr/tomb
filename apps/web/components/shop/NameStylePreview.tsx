"use client";

import { useEffect, useRef } from "react";
import { DIR } from "@tomb/protocol";
import { hasNameStyle, nameColorSpec, nameStyleRef } from "@/lib/nameStyle";
import { cx } from "../ui/cx";
import StyledName from "../ui/StyledName";
import { OutfitStage, STAGE_H, STAGE_W } from "./outfitStage";
import styles from "./NameStylePreview.module.css";

// 닉네임 꾸미기 미리보기 (상점 자세히 보기): 낮·밤 두 칸에 내 아바타와 머리 위 이름표를 게임처럼 그린다.
// 이름표는 게임과 같은 Galmuri11 글자 + 어두운 1px 외곽선, 색은 lib/nameStyle (HTML이라 components/ui/StyledName).
// 밤 칸은 게임처럼 몸은 어둠에 잠기고 이름표만 밝다 (이름표 층이 밤 어둠 층 위). 내 이름표: 색이 없으면 촛불빛, 색을 샀으면 그 색 + 아래 작은 표시

type Props = {
  /** 아바타 색 표기 (염색 포함 — resolveAvatar) */
  color: string;
  body: string;
  /** 입혀 볼 착용 목록 (fittingLook) */
  look: readonly string[];
  name: string;
  label: string;
  className?: string;
};

export default function NameStylePreview({ color, body, look, name, label, className }: Props) {
  const ref = nameStyleRef(look);
  const hasColor = nameColorSpec(ref.color) !== null;
  return (
    <div className={cx(styles.preview, className)} role="group" aria-label={label}>
      {(["day", "night"] as const).map((t) => (
        <figure key={t} className={styles.scene} data-time={t}>
          <div className={styles.tag}>
            {hasNameStyle(ref) ? <StyledName name={name} ns={ref} className={styles.name} /> : <span className={styles.name}>{name}</span>}
            {hasColor && <span className={styles.me} aria-hidden="true" />}
          </div>
          <Figure color={color} body={body} look={look} />
          <figcaption className={styles.caption}>{t === "day" ? "낮" : "밤"}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** 서 있는 앞모습 한 장 (한 번만 그린다) */
function Figure({ color, body, look }: { color: string; body: string; look: readonly string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = look.join(",");
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    new OutfitStage().draw(ctx, 0, { dir: DIR.down, walking: false }, { color, body, look: key ? key.split(",") : [] }, true);
  }, [color, body, key]);
  return (
    <span className={styles.crop}>
      <canvas ref={canvas} width={STAGE_W} height={STAGE_H} aria-hidden="true" />
    </span>
  );
}
