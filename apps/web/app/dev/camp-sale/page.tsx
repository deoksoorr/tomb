import { notFound } from "next/navigation";
import CampSalePreview from "./CampSalePreview";

// 11/26 개발 확인용: 캠핑장 분양 창(분양 사무소 창 OfficeDialog zone "camp" — HousingOffice)·[집] 창(MyHouseDialog). 실서버에서는 404.
// ?kind=caravan|pension|rural (그 NPC에게 말을 건 것처럼) · ?lot=13 (빈 터 문·팻말에서 연 것처럼) · ?view=myhouse ([집] 창). 서버 응답은 시험 스크립트가 route 가로채기로 준다.

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CampSalePreview />;
}
