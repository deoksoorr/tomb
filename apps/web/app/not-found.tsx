import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        alignContent: "center",
        gap: 16,
        padding: 16,
        textAlign: "center",
        background: "var(--bg)",
      }}
    >
      <p style={{ color: "var(--bone)", fontSize: 24 }}>여기엔 아무것도 묻혀 있지 않아요.</p>
      <Link href="/">묘지 입구로 돌아가기</Link>
    </main>
  );
}
