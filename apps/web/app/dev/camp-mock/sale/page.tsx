import { notFound } from "next/navigation";
import SaleMock from "./SaleMock";

// 11/21 개발 확인용: 캠핑장 관리소 「카라반 분양」 창 시안 (정적 화면 — 서버·포인트와 연결 없음). 실서버에서는 404.
// ?house=1 → 마을 집이 있는 사람(별장 값 2배) 기준으로 보여 준다

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SaleMock />;
}
