import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import type { ReactNode } from "react";
import { lifespanLabel } from "@/lib/epitaph";
import { findVisible, getStore, type GraveRecord } from "@/lib/store";

// 공유 카드 1200×630. /api/og?grave={id} → 묘비 카드, 그 밖에는 사이트 카드.
// satori는 woff2를 못 읽으므로 TTF를 쓴다. 폰트는 요청과 무관하니 한 번만 읽는다.

const C = {
  bg: "#1e1f1b",
  ink: "#ece6d3",
  muted: "#9b968a",
  stone: "#3b3c36",
  stoneEdge: "#5a5b52",
  moon: "#efe6c4",
};

let font: Promise<Buffer> | undefined;
const loadFont = () => (font ??= readFile(join(process.cwd(), "assets/fonts/Galmuri11-Bold.ttf")));

/** 없거나 숨겨졌거나 저장소 오류면 사이트 카드로 대신한다 (크롤러에는 에러보다 카드가 낫다) */
async function findGrave(id: string | null): Promise<GraveRecord | null> {
  if (!id) return null;
  try {
    return await findVisible(getStore(), id);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const grave = await findGrave(req.nextUrl.searchParams.get("grave"));
  return new ImageResponse(grave ? <GraveCard grave={grave} /> : <SiteCard />, {
    width: 1200,
    height: 630,
    fonts: [{ name: "Galmuri11", data: await loadFont(), weight: 700, style: "normal" }],
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" },
  });
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: C.bg,
        color: C.ink,
        fontFamily: "Galmuri11",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 60,
          right: 110,
          width: 96,
          height: 96,
          borderRadius: 48,
          background: C.moon,
          boxShadow: "0 0 90px rgba(239,230,196,0.35)",
        }}
      />
      {children}
    </div>
  );
}

function Stone({ width, height, children }: { width: number; height: number; children?: ReactNode }) {
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: C.stone,
        border: `6px solid ${C.stoneEdge}`,
        borderBottomWidth: 0,
        borderTopLeftRadius: width / 2,
        borderTopRightRadius: width / 2,
      }}
    >
      {children}
    </div>
  );
}

function SiteCard() {
  return (
    <Frame>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 170 }}>
        <div style={{ fontSize: 120 }}>한때는...</div>
        <div style={{ fontSize: 40, color: C.muted, marginTop: 28 }}>수많은 시작이 여기 잠들어 있습니다.</div>
      </div>
      <div
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", gap: 70, alignItems: "flex-end" }}
      >
        {[90, 130, 70, 150, 100, 120, 80].map((h, i) => (
          <Stone key={i} width={Math.round(h * 0.7)} height={h} />
        ))}
      </div>
    </Frame>
  );
}

function GraveCard({ grave }: { grave: GraveRecord }) {
  const len = [...grave.name].length;
  const nameSize = len > 28 ? 42 : len > 16 ? 52 : 66;
  return (
    <Frame>
      <div style={{ display: "flex", alignItems: "flex-end", padding: "0 0 0 90px", height: "100%" }}>
        <Stone width={280} height={400}>
          <div style={{ fontSize: 30, color: C.muted }}>향년</div>
          <div style={{ fontSize: 64, marginTop: 8 }}>{`${grave.ageDays}일`}</div>
        </Stone>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "110px 90px 70px 70px" }}>
        <div style={{ fontSize: 28, color: C.muted }}>한때는...</div>
        <div style={{ fontSize: nameSize, marginTop: 26, lineHeight: 1.2 }}>{grave.name}</div>
        <div style={{ fontSize: 38, color: C.muted, marginTop: 22 }}>{grave.epitaph}</div>
        <div style={{ fontSize: 28, marginTop: 22 }}>{lifespanLabel(grave.bornAt, grave.diedAt, grave.ageDays)}</div>
        <div style={{ display: "flex", gap: 40, fontSize: 30, marginTop: "auto" }}>
          <div>{`🌼 헌화 ${grave.flowers}`}</div>
          <div>{`🙏 살려주세요 ${grave.revives}`}</div>
          <div style={{ color: C.muted }}>{`상주 ${grave.mourner}`}</div>
        </div>
      </div>
    </Frame>
  );
}
