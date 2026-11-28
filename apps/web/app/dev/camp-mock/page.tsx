import { notFound } from "next/navigation";
import CampMockPreview from "./CampMockPreview";

// 11/21 개발 확인용: 「언젠가 캠핑장」 폭포 계곡 + 카라반 분양 시안 (game/camp/mock). 실서버에서는 404.
// ?time=day|night · &cx=&cy=&zoom= (카메라) · &full=1 (맵 전체) · &annotate=1 (설명판) · &fish=1 (낚시 자리) · &labels=0 · &people=0

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CampMockPreview />;
}
