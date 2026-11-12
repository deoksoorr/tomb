import type { Metadata } from "next";
import App from "@/components/App";
import BannedScreen from "@/components/BannedScreen";
import { pageBan } from "@/lib/banPage";
import { graveIdParam, graveOgImage, shareMetadata } from "./seo";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const graveId = graveIdParam((await searchParams).grave);
  return graveId ? shareMetadata(graveOgImage(graveId)) : {};
}

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  // 47번 정지·IP 차단: 첫 화면부터 제한 화면 (이 페이지는 원래 요청마다 서버에서 그린다)
  const ban = await pageBan();
  if (ban) return <BannedScreen ban={ban} />;
  return <App initialGraveId={graveIdParam(params.grave)} debug={params.debug === "1"} />;
}
