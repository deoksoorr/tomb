import type { Metadata } from "next";
import App from "@/components/App";
import { graveIdParam, graveOgImage, shareMetadata } from "./seo";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const graveId = graveIdParam((await searchParams).grave);
  return graveId ? shareMetadata(graveOgImage(graveId)) : {};
}

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  return <App initialGraveId={graveIdParam(params.grave)} debug={params.debug === "1"} />;
}
