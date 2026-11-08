import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { graveIdParam, graveOgImage, shareMetadata } from "../../seo";

type Props = { params: Promise<{ id: string }> };

// 예전 형태의 공유 주소. 크롤러용 카드 메타데이터는 남기고 실제 방문은 /?grave={id}로 보낸다.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = graveIdParam((await params).id);
  return id ? shareMetadata(graveOgImage(id)) : {};
}

export default async function GraveRedirect({ params }: Props) {
  const id = graveIdParam((await params).id);
  redirect(id ? `/?grave=${id}` : "/");
}
