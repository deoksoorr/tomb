import type { ReactNode } from "react";
import { cx } from "./cx";
import PixelIcon, { type IconName } from "./PixelIcon";
import styles from "./InfoBlocks.module.css";
import ui from "./ui.module.css";

// 표준 창(760×660 · 폰 전체 화면)에서 내용이 적을 때 빈 공간을 채우는 공용 조각들.
// 장식이 아니라 그 기능과 관련된 설명·기록·팁·바로 가기를 같은 모양으로 보여 준다.

/** 제목이 붙은 작은 칸 (설명·기록·팁 묶음) */
export function InfoCard({
  title,
  icon,
  children,
  className,
  aside,
}: {
  title: string;
  icon?: IconName;
  children: ReactNode;
  className?: string;
  /** 제목 오른쪽 작은 글 (예: "오늘 2/3") */
  aside?: ReactNode;
}) {
  return (
    <section className={cx(styles.card, className)}>
      <h3 className={styles.cardTitle}>
        {icon && <PixelIcon name={icon} />}
        <span className={styles.cardTitleText}>{title}</span>
        {aside !== undefined && <span className={styles.aside}>{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

/** 짧은 도움말 목록 */
export function TipList({ tips }: { tips: readonly ReactNode[] }) {
  return (
    <ul className={styles.tips}>
      {tips.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

/** 숫자·상태 칸 여러 개 (이름 + 값 + 작은 설명) */
export function FactGrid({ facts }: { facts: readonly { label: string; value: ReactNode; note?: ReactNode; tone?: "good" | "warn" }[] }) {
  return (
    <dl className={styles.facts}>
      {facts.map((f) => (
        <div key={f.label} className={styles.fact} data-tone={f.tone}>
          <dt>{f.label}</dt>
          <dd>
            <span className={styles.factValue}>{f.value}</span>
            {f.note && <span className={styles.factNote}>{f.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export type Shortcut = { label: string; icon?: IconName; onClick: () => void; primary?: boolean };

/** 관련 창 바로 가기 버튼 줄 */
export function Shortcuts({ items, label = "바로 가기" }: { items: readonly Shortcut[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.shortcuts} role="group" aria-label={label}>
      {items.map((s) => (
        <button key={s.label} type="button" className={cx(ui.button, s.primary && ui.primary)} onClick={s.onClick}>
          {s.icon && <PixelIcon name={s.icon} />}
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** 비어 있을 때: 큰 아이콘 + 한 줄 제목 + 설명 + 할 수 있는 일 */
export function EmptyHero({ icon, title, children, actions }: { icon: IconName; title: string; children?: ReactNode; actions?: readonly Shortcut[] }) {
  return (
    <div className={styles.hero}>
      <span className={styles.heroIcon} aria-hidden="true">
        <PixelIcon name={icon} size={35} />
      </span>
      <p className={styles.heroTitle}>{title}</p>
      {children && <div className={styles.heroText}>{children}</div>}
      {actions && <Shortcuts items={actions} />}
    </div>
  );
}

/** 칸 여러 개를 데스크톱 두 줄 · 폰 한 줄로. spaced = 위 내용과 띄운다 (본문 바로 아래에 붙일 때) */
export function InfoGrid({ children, className, spaced = false }: { children: ReactNode; className?: string; spaced?: boolean }) {
  return <div className={cx(styles.grid, spaced && styles.spaced, className)}>{children}</div>;
}
