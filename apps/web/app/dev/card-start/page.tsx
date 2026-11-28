import { notFound } from "next/navigation";
import CardStartPreview from "./CardStartPreview";

// 11/26 개발 확인용: 야근 빌딩 위층 시작 카드 고르기(직접·자동·요약)를 게임 없이 띄운다 (?start=101&seed=777). 실서버에서는 404.

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CardStartPreview />;
}
