import type { Metadata } from "next";
import AdminApp from "@/components/admin/AdminApp";

// 허용 IP 밖에서는 proxy.ts가 이 경로를 일반 404로 숨긴다. 들어와도 ADMIN_KEY 로그인이 필요하다.
export const metadata: Metadata = {
  title: "관리 · 한때는...",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminApp />;
}
