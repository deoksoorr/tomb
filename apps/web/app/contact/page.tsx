import ContactDesk from "@/components/site/ContactDesk";
import SiteBanner from "@/components/site/SiteBanner";
import SiteShell from "@/components/site/SiteShell";
import styles from "@/components/site/site.module.css";
import { siteMetadata, SITE_VIEWPORT } from "@/lib/devNotes/meta";

export const viewport = SITE_VIEWPORT;
export const metadata = siteMetadata({
  title: "문의하기",
  description: "At one time...에서 겪은 버그나 바라는 점을 개발자에게 바로 보낼 수 있어요. 게임 계정 없이도 보낼 수 있어요.",
  path: "/contact",
});

// 11/20 개발자 노트 문의하기 (게임 안 문의와 같은 관리자 문의함으로 간다)
export default function ContactPage() {
  return (
    <SiteShell current="contact">
      {/* 11/21 머리 배너: 캠핑장 모닥불 (밤) */}
      <SiteBanner title="문의하기" sub="버그나 바라는 점을 적어 주세요. 하나하나 직접 읽어요." video={{ webm: "/devnote/contact-banner.webm", mp4: "/devnote/contact-banner.mp4", poster: "/devnote/contact-banner-poster.webp" }} />
      <div className={styles.wrap}>
        <ContactDesk />
      </div>
    </SiteShell>
  );
}
