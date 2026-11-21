import { notFound } from "next/navigation";
import SplashPreview from "./SplashPreview";

// 11/20 개발 확인용: 회장님 등장 컷만 띄운다 (?mode=hell&t=1500&reduced=1). 실서버에서는 404.

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SplashPreview />;
}
