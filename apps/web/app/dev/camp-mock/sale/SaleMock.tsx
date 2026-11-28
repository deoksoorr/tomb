"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RECLAIM_DAYS } from "@/lib/housing/catalog";
import { cx } from "@/components/ui/cx";
import Dialog from "@/components/ui/Dialog";
import ui from "@/components/ui/ui.module.css";
import styles from "@/components/housing/housing.module.css";
import { fmt } from "@/components/housing/parts";
import { npcArt } from "@/game/camp/campArt";
import * as A from "@/game/camp/mock/mockArt";
import * as L from "@/game/camp/mock/mockLayout";

// 11/21 시안: 카라반 분양 창 (분양 사무소·포구 부동산 창과 같은 틀 — Dialog + housing.module.css).
// 값 규칙 = 포구 오두막과 같다: 마을 집이 없으면 마을 집 값의 1.5배, 있으면 별장이라 2배. 물가 앞줄 자리는 +2,000P.

type Kind = "teardrop" | "airstream" | "bus";
const CARAVANS: readonly { id: Kind; name: string; w: number; h: number; items: number; base: number; desc: string }[] = [
  { id: "teardrop", name: "작은 티어드롭", w: 8, h: 4, items: 12, base: 6_000, desc: "둘이 눕기 딱 좋은 물방울 카라반" },
  { id: "airstream", name: "은색 에어스트림", w: 11, h: 5, items: 20, base: 9_000, desc: "반짝이는 알루미늄, 넓은 거실" },
  { id: "bus", name: "버스 개조 캠핑카", w: 14, h: 5, items: 28, base: 15_000, desc: "팝업 지붕 다락까지, 가장 넓다" },
];
const FRONT_FEE = 2_000;
const rate = (villa: boolean) => (villa ? 2 : 1.5);
/** 이 크기를 바로 살 때의 값 (작은 것 + 위 단계 바꾸기 값 누적 × 배수) */
const costOf = (i: number, villa: boolean) => CARAVANS.slice(0, i + 1).reduce((s, c) => s + c.base, 0) * rate(villa);
const SOLD: Record<number, string> = { 1: "콩이네", 2: "달빛캠퍼", 4: "별바라기네", 6: "새벽물소리", 7: "언젠가 씨네", 9: "눈사람클럽", 10: "강태공네", 11: "모닥불러" };
const PICK_SITE = 3;

const noop = () => () => undefined;

function useClient(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

function art(kind: Kind): { url: string; w: number; h: number } {
  const g = kind === "teardrop" ? A.teardropArt(0) : kind === "airstream" ? A.airstreamArt(0) : A.busCamperArt(0);
  const s = 2;
  const c = document.createElement("canvas");
  c.width = g.grid.w * s;
  c.height = g.grid.h * s;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g.grid.toCanvas(), 0, 0, c.width, c.height);
  return { url: c.toDataURL(), w: c.width, h: c.height };
}

function keeperUrl(): string {
  const a = npcArt("keeper", "christmas");
  const s = 3;
  const c = document.createElement("canvas");
  c.width = a.frameW! * s;
  c.height = a.frameH! * s;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(a.grid.toCanvas(), 0, 0, a.frameW!, a.frameH!, 0, 0, c.width, c.height);
  return c.toDataURL();
}

/** 자리 지도: 웅덩이·계곡과 열두 자리 (팔린 자리 · 빈 물가 자리 · 빈 숲 자리 · 고른 자리) */
function SiteMap({ pick, onPick }: { pick: number; onPick: (n: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const X0 = 300;
  const Y0 = 190;
  const W = 680;
  const H = 500;
  const K = 0.5;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W * K, H * K);
    for (let y = 0; y < H * K; y++)
      for (let x = 0; x < W * K; x++) {
        const wx = X0 + x / K;
        const wy = Y0 + y / K;
        const k = L.groundKind(wx, wy);
        const col =
          k === "pool" ? 0x2e6476 : k === "water" ? 0x3a7a8e : k === "bank" ? 0xcad6e2 : k === "cliff" ? 0x7c7872 : k === "path" ? 0xa89a86 : k === "foot" ? 0xc8d2dc : k === "plaza" ? 0xb4a688 : 0xe6edf3;
        const i = (y * W * K + x) * 4;
        img.data[i] = col >> 16;
        img.data[i + 1] = (col >> 8) & 255;
        img.data[i + 2] = col & 255;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    // 폭포 (하얀 줄)
    ctx.fillStyle = "#f4fbff";
    ctx.fillRect((622 - X0) * K, (36 - Y0) * K, 18 * K, 1);
    for (const s of L.SITES) {
      const x = (s.x - L.SITE_W / 2 - X0) * K;
      const y = (s.y - L.SITE_H / 2 - Y0) * K;
      const w = L.SITE_W * K;
      const h = L.SITE_H * K;
      const sold = !!SOLD[s.n];
      const front = s.row === "front";
      ctx.fillStyle = sold ? "#8a8478" : front ? "#cfe6f2" : "#dcefd2";
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.strokeStyle = s.n === pick ? "#ffd25a" : sold ? "#5a544a" : front ? "#3a86b8" : "#5a9a5a";
      ctx.lineWidth = s.n === pick ? 3 : 2;
      ctx.setLineDash(sold || s.n === pick ? [] : [3, 2]);
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.setLineDash([]);
      ctx.fillStyle = sold ? "#f2ece0" : "#2c2018";
      ctx.font = "bold 14px Galmuri11, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(s.n), x + w / 2, y + h / 2);
    }
  }, [pick]);
  return (
    <div className={styles.stack} style={{ gap: 6 }}>
      <canvas
        ref={ref}
        width={W * K}
        height={H * K}
        style={{ width: "100%", maxWidth: 380, aspectRatio: `${W} / ${H}`, imageRendering: "pixelated", boxShadow: "var(--px-border)", cursor: "pointer", alignSelf: "center" }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const wx = X0 + ((e.clientX - r.left) / r.width) * W;
          const wy = Y0 + ((e.clientY - r.top) / r.height) * H;
          const s = L.inSite(wx, wy);
          if (s && !SOLD[s.n]) onPick(s.n);
        }}
        aria-label="카라반 자리 지도"
      />
      <p className={styles.small} style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <span><b style={{ color: "#5aaee0" }}>■</b> 물가 앞줄 (+{fmt(FRONT_FEE)}P)</span>
        <span><b style={{ color: "#7ec07e" }}>■</b> 숲 뒷줄</span>
        <span><b style={{ color: "#8a8478" }}>■</b> 분양 끝</span>
        <span><b style={{ color: "#ffd25a" }}>□</b> 고른 자리</span>
      </p>
    </div>
  );
}

export default function SaleMock() {
  const client = useClient();
  const bg = useRef<HTMLDivElement>(null);
  const [villa, setVilla] = useState(false);
  const [pick, setPick] = useState<Kind>("teardrop");
  const [site, setSite] = useState(PICK_SITE);
  const points = 23_400;
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const id = setTimeout(() => setVilla(q.get("house") === "1"), 0);
    // 뒤에 캠핑장 관리소 앞 화면 (시안 장면 그대로)
    const el = bg.current;
    let game: { destroy(b: boolean): void } | null = null;
    let dead = false;
    void import("@/game/camp/mock/bootCampMock").then(({ bootCampMock }) => {
      if (dead || !el) return;
      game = bootCampMock(el, { cx: 420, cy: 660, zoom: el.clientWidth < 500 ? 2.5 : 3, labels: true, annotate: false, people: true, fish: false, concept: "christmas" });
    });
    return () => {
      dead = true;
      clearTimeout(id);
      game?.destroy(true);
    };
  }, []);
  const s = L.SITES.find((x) => x.n === site)!;
  const front = s.row === "front";
  const idx = CARAVANS.findIndex((c) => c.id === pick);
  const car = CARAVANS[idx];
  const carCost = costOf(idx, villa);
  const total = carCost + (front ? FRONT_FEE : 0);
  return (
    <>
      <div ref={bg} style={{ position: "fixed", inset: 0, background: "#141519" }} />
      <Dialog title="관리소 · 카라반 분양" onClose={() => undefined}>
        <div className={styles.stack}>
          <div className={styles.spread} style={{ alignItems: "center", gap: 10 }}>
            {client && <img src={keeperUrl()} width={60} height={90} alt="" style={{ imageRendering: "pixelated", flex: "none" }} />}
            <p className={styles.small} style={{ flex: 1 }}>
              <strong>언젠가 씨</strong> · 관리소 사장
              <br />
              「계곡 옆 자리가 열두 곳이에요. 물가 앞줄은 물소리가 바로 들려서 조금 더 받아요. 카라반은 세 가지, 작은 걸로 시작해서 나중에 바꿔도 돼요.」
            </p>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="카라반 분양">
            <button type="button" role="tab" aria-selected className={styles.tab}>
              내 카라반
            </button>
            <button type="button" role="tab" aria-selected={false} className={styles.tab}>
              둘러보기 · 랭킹
            </button>
          </div>
          <div className={styles.card}>
            <p className={styles.houseName}>계곡 옆 카라반을 분양받아 보세요</p>
            <p className={styles.muted}>아스라 폭포 아래 옛길 계곡을 따라 자리가 있어요. 채널마다 자리가 따로 있어요. 지도에서 빈 자리를 골라요.</p>
            <SiteMap pick={site} onPick={setSite} />
            <p className={styles.tag}>
              고른 자리: {site}번 · {front ? `물가 앞줄 (자리값 +${fmt(FRONT_FEE)}P)` : "숲 뒷줄 (자리값 없음)"}
            </p>
            <div className={styles.tierRow} role="radiogroup" aria-label="카라반 종류">
              {CARAVANS.map((c, i) => {
                const img = client ? art(c.id) : null;
                const mine = costOf(i, villa);
                const other = costOf(i, !villa);
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={c.id === pick} className={styles.tierCard} data-current={c.id === pick} data-pick="true" onClick={() => setPick(c.id)}>
                    <span style={{ height: 116, display: "grid", placeItems: "end center" }}>{img && <img src={img.url} width={img.w} height={img.h} alt="" style={{ imageRendering: "pixelated" }} />}</span>
                    <strong>{c.name}</strong>
                    <span className={styles.small}>
                      방 {c.w}×{c.h}칸 · 가구 {c.items}개
                    </span>
                    <span className={styles.points}>
                      <strong style={{ fontSize: "1.25em" }}>{fmt(mine)}P</strong>
                    </span>
                    <span className={styles.small}>{villa ? `마을 집이 없으면 ${fmt(other)}P` : `별장이면 ${fmt(other)}P`}</span>
                    <span className={styles.small}>
                      {i === 0 ? `나중에 에어스트림으로 바꾸기 +${fmt(CARAVANS[1].base * rate(villa))}P` : `${CARAVANS[i - 1].name.split(" ").pop()}에서 바꾸면 +${fmt(c.base * rate(villa))}P`}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className={styles.tag}>{villa ? "마을에 집이 있어서 별장 값이에요 (마을 집 값의 2배)." : "마을 집 값의 1.5배예요. 마을에 집이 있으면 별장 값(2배)이에요."}</p>
            <p className={styles.points}>
              {car.name} {fmt(carCost)}P{front ? ` + 물가 자리 ${fmt(FRONT_FEE)}P` : ""} = <strong>{fmt(total)}P</strong> · 내 포인트 <strong>{fmt(points)}P</strong>
            </p>
          </div>
          <form className={styles.stack} onSubmit={(e) => e.preventDefault()}>
            <label className={ui.field}>
              <span className={cx(ui.label, ui.required)}>
                카라반 이름 <span className={ui.counter}>6/12</span>
              </span>
              <input className={ui.input} defaultValue="물소리 카라반" />
            </label>
            <button type="submit" className={cx(ui.button, ui.primary)} disabled={points < total}>
              {site}번 {front ? "물가" : "숲"} 자리에 {car.name} 분양받기 ({fmt(total)}P)
            </button>
          </form>
          <div className={styles.warn} role="note">
            <strong>
              <span className={styles.warnTag}>주의</span>
              {RECLAIM_DAYS}일 동안 접속하지 않으면 카라반이 철거돼요
            </strong>
            <p>카라반 값은 100% 선물함으로 돌려드리고, 가구는 그대로 저장돼요. 철거된 자리는 다른 사람이 분양받을 수 있어요.</p>
          </div>
        </div>
      </Dialog>
    </>
  );
}
