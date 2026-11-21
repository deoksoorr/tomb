"use client";

import { useEffect, useState } from "react";
import ChairIntro from "@/components/chairman/ChairIntro";
import ChairSplash from "@/components/chairman/ChairSplash";

// ?mode=hell · ?t=ms (그 시각에 멈춤) · ?reduced · ?intro (걷기 → 섬광 → 등장 컷 전체, &t=ms면 걷기 그 시각 한 장). 클릭하면 처음부터.
type Q = { mode: "normal" | "hell"; t?: number; reduced: boolean; intro: boolean; key: number };

export default function SplashPreview() {
  const [q, setQ] = useState<Q | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const t = p.get("t");
    const read = () => setQ({ mode: p.get("mode") === "hell" ? "hell" : "normal", t: t == null ? undefined : Number(t), reduced: p.has("reduced"), intro: p.has("intro"), key: Date.now() });
    const id = setTimeout(read, 0);
    if (!p.has("intro")) addEventListener("click", read);
    return () => {
      clearTimeout(id);
      removeEventListener("click", read);
    };
  }, []);
  if (!q) return null;
  if (q.intro)
    return (
      <ChairIntro
        key={q.key}
        me={{ body: "hood", color: "#e8d9b0", look: [] }}
        mode={q.mode}
        freezeAt={q.t}
        onEnter={() => new Promise((r) => setTimeout(r, 300))}
        onEnd={() => setQ({ ...q, key: Date.now() })}
      />
    );
  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff" }}>
      <ChairSplash key={q.key} mode={q.mode} reduced={q.reduced} freezeAt={q.t} />
    </div>
  );
}
