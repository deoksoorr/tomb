"use client";

import { useEffect, useRef } from "react";

export default function CampMockPreview() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let game: { destroy(b: boolean): void } | null = null;
    let dead = false;
    const q = new URLSearchParams(location.search);
    const full = q.get("full") === "1";
    const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
    void (async () => {
      await Promise.race([document.fonts.load('12px "Galmuri11"'), new Promise((r) => setTimeout(r, 2500))]).catch(() => undefined);
      const { bootCampMock } = await import("@/game/camp/mock/bootCampMock");
      if (dead) return;
      const zoom = full ? Math.min(el.clientWidth / 1280, el.clientHeight / 800) : num("zoom", 3);
      game = bootCampMock(el, {
        cx: num("cx", 640),
        cy: num("cy", 400),
        zoom,
        labels: q.get("labels") !== "0",
        annotate: q.get("annotate") === "1",
        changes: q.get("changes") === "1",
        people: q.get("people") !== "0",
        fish: q.get("fish") === "1",
        levels: q.get("levels") === "pension" ? "pension" : q.get("levels") === "rural" ? "rural" : "",
        concept: q.get("concept") === "default" ? "default" : q.get("concept") === "winter" ? "winter" : "christmas",
      });
    })();
    return () => {
      dead = true;
      game?.destroy(true);
    };
  }, []);
  return <div ref={ref} style={{ position: "fixed", inset: 0, background: "#141519" }} />;
}
