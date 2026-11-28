import { notFound } from "next/navigation";
import CampHomesPreview from "./CampHomesPreview";

// 11/26 개발 확인용: 캠핑장 집 16채 겉모습 시트 (game/camp/campHousingSheet). 실서버에서는 404.
// ?stage=1|2|3 · &wide=1 (넓힌 펜션·촌캉스) · &owned=all|none|mix · &concept=default|winter|christmas · &night=1 · &marks=1 (앉을 자리·문·막는 상자) · &cx=&cy=&zoom=

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CampHomesPreview />;
}
