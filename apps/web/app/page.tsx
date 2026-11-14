import type { Metadata } from "next";
import App from "@/components/App";
import BannedScreen from "@/components/BannedScreen";
import { pageBan } from "@/lib/banPage";
import { googleEnabled } from "@/lib/googleAuth";
import { isGoogleResult } from "@/lib/googleResult";
import HomeJsonLd from "./HomeJsonLd";
import { graveIdParam, graveOgImage, shareMetadata } from "./seo";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const graveId = graveIdParam((await searchParams).grave);
  // ?grave= 같은 매개변수가 붙어도 대표 주소는 홈 하나
  const canonical = { alternates: { canonical: "/" } };
  return graveId ? { ...shareMetadata(graveOgImage(graveId)), ...canonical } : canonical;
}

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  // 47번 정지·IP 차단: 첫 화면부터 제한 화면 (이 페이지는 원래 요청마다 서버에서 그린다)
  const ban = await pageBan();
  if (ban) return <BannedScreen ban={ban} />;
  return (
    <>
      {/* 검색용 구조화 데이터 (화면에는 그리지 않는다) */}
      <HomeJsonLd />
      <App
        initialGraveId={graveIdParam(params.grave)}
        debug={params.debug === "1"}
        // 구글 설정이 없으면 단추를 그리지 않는다. 결과(?google=)는 정해진 값만 받는다
        google={{ enabled: googleEnabled(), result: isGoogleResult(params.google) ? params.google : null }}
      />
    </>
  );
}
