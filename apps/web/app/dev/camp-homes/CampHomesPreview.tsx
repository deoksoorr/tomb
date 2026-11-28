"use client";

import { useEffect, useRef } from "react";

export default function CampHomesPreview() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let game: { destroy(b: boolean): void } | null = null;
    let dead = false;
    const q = new URLSearchParams(location.search);
    const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
    void (async () => {
      await Promise.race([document.fonts.load('12px "Galmuri11"'), new Promise((r) => setTimeout(r, 2500))]).catch(() => undefined);
      const { bootCampHomesSheet } = await import("@/game/camp/campHousingSheet");
      if (dead) return;
      const st = num("stage", 1);
      const c = q.get("concept");
      const o = q.get("owned");
      game = bootCampHomesSheet(el, {
        cx: num("cx", 640),
        cy: num("cy", 400),
        zoom: num("zoom", 1),
        stage: st === 3 ? 3 : st === 2 ? 2 : 1,
        wide: q.get("wide") === "1",
        owned: o === "none" ? "none" : o === "mix" ? "mix" : "all",
        concept: c === "winter" ? "winter" : c === "christmas" ? "christmas" : "default",
        night: q.get("night") === "1",
        marks: q.get("marks") === "1",
        ...(["airstream", "teardrop", "bus"].includes(q.get("model") ?? "") ? { model: q.get("model") as "airstream" | "teardrop" | "bus" } : {}),
      });
    })();
    return () => {
      dead = true;
      game?.destroy(true);
    };
  }, []);
  return <div ref={ref} style={{ position: "fixed", inset: 0, background: "#141519" }} />;
}
