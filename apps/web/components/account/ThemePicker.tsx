"use client";

import { useId, useState } from "react";
import { THEMES, type ThemeId } from "@/game/bridge";
import { chooseTheme, savedTheme } from "@/lib/hooks/theme";
import ui from "../ui/ui.module.css";
import styles from "./ThemePicker.module.css";

/** 묘지 디자인 고르기. 바로 저장하고 게임에 알린다 (클라이언트에서만 그린다) */
export default function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>(savedTheme);
  const name = useId();
  return (
    <fieldset className={styles.picker}>
      <legend className={ui.label}>묘지 디자인</legend>
      <div className={styles.options}>
        {THEMES.map((t) => (
          <label key={t.id} className={styles.option} data-theme={t.id}>
            <input
              type="radio"
              name={name}
              className="visually-hidden"
              checked={theme === t.id}
              onChange={() => {
                setTheme(t.id);
                chooseTheme(t.id);
              }}
            />
            <span className={styles.swatch} aria-hidden="true" />
            {t.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
