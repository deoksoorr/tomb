import type { CSSProperties } from "react";
import { cssGradient, hex, nameColorSpec, namePlateSpec, nameStyleRef, type NameStyleRef } from "@/lib/nameStyle";
import { cx } from "./cx";
import styles from "./StyledName.module.css";

// 화면(HTML)의 닉네임 꾸미기: 채팅 기록창·친구 목록·랭킹·레이스 시상대·상점 미리보기의 이름.
// 게임 이름표(game/entities/NameStyleView)와 같은 색(lib/nameStyle)을 CSS로 그린다:
//  - 단색 = 글자 색, 그라데이션·무지개·별가루·불꽃 = 글자 모양으로 자른 배경, 빛 테두리 = 글자 빛 그림자
//  - 움직임은 CSS 애니메이션 (prefers-reduced-motion이면 멈춘 그림)
//  - 바탕판은 작은 배경 판으로만 (판 위 글자는 게임처럼 어두운 외곽선을 둘러 어느 판에서도 읽힌다)
// 꾸미기가 없거나 이 화면이 모르는 id면 이름 글자만 그대로 낸다 (기존 모양 그대로).

type Props = {
  name: string;
  /** 착용 목록 (여기서 닉네임 꾸미기만 고른다) */
  look?: readonly string[] | null;
  /** 이미 고른 닉네임 꾸미기 (서버가 준 ns 등) */
  ns?: NameStyleRef | null;
  /** 바탕판은 빼고 글자 색만 (좁은 줄) */
  noPlate?: boolean;
  className?: string;
};

/** 서버 응답의 ns(["nc_sky","np_wood"] 처럼 id 목록)도 착용 목록과 같은 방법으로 읽는다 */
export default function StyledName({ name, look, ns, noPlate, className }: Props) {
  const ref = ns ?? nameStyleRef(look);
  const color = nameColorSpec(ref.color);
  const plate = noPlate ? null : namePlateSpec(ref.plate);
  if (!color && !plate) return className ? <span className={className}>{name}</span> : <>{name}</>;

  const vars: Record<string, string> = {};
  let kind: string | undefined;
  if (color?.kind === "solid") {
    kind = "solid";
    vars["--ns-color"] = hex(color.color);
  } else if (color?.kind === "gradient") {
    kind = "grad";
    vars["--ns-grad"] = cssGradient(color.stops);
  } else if (color?.kind === "fx") {
    kind = color.fx;
    vars["--ns-color"] = hex(color.stops[0]);
    vars["--ns-grad"] = cssGradient(color.stops, color.fx === "rainbow");
    if (color.halo !== undefined) vars["--ns-halo"] = hex(color.halo);
  }
  if (plate) {
    vars["--np-fill"] = hex(plate.fill);
    vars["--np-light"] = hex(plate.light);
    vars["--np-edge"] = hex(plate.edge);
    vars["--np-dot"] = hex(plate.dots[0] ?? plate.light);
  }
  return (
    <span className={cx(styles.wrap, className)} data-plate={plate?.kind} data-fx={kind} style={vars as CSSProperties}>
      <span className={styles.text} data-kind={kind}>
        {name}
      </span>
    </span>
  );
}
