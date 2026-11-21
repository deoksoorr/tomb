"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import styles from "./site.module.css";

// 11/21 사이트 머리 배너 (개발자 노트·가이드·FAQ·만든 이야기·문의하기): 마을 화면 무음 반복 영상 또는 그림 한 장 위에 제목.
// 움직임 줄이기·데이터 절약이면 첫 장면 그림만. 첫 그림은 서버와 같게 그림만 → 그린 뒤 영상으로. 화면 밖이면 멈춘다

export type BannerVideo = { webm: string; mp4: string; poster: string };
/** focus: 영상 자르기 기준 (object-position, 넓은 화면에서 위아래가 잘릴 때) */
type Props = { title: string; sub: string; video?: BannerVideo; still?: string; focus?: string };

/** 개발자 노트 (/news) 영상 */
export const NEWS_BANNER: BannerVideo = { webm: "/devnote/banner.webm", mp4: "/devnote/banner.mp4", poster: "/devnote/banner-poster.webp" };

const noSubscribe = () => () => {};
function canPlay(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !c?.saveData;
}

export default function SiteBanner({ title, sub, video, still, focus }: Props) {
  const play = useSyncExternalStore(noSubscribe, canPlay, () => false) && !!video;
  const ref = useRef<HTMLVideoElement>(null);
  // 화면 밖이면 멈춤 (CPU 아끼기)
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, [play]);
  const pic = video?.poster ?? still;
  const pos = focus ? { objectPosition: focus } : undefined;
  return (
    <header className={styles.banner}>
      {play && video ? (
        <video ref={ref} className={styles.bannerMedia} style={pos} autoPlay muted loop playsInline preload="auto" poster={video.poster} aria-hidden="true">
          <source src={video.webm} type="video/webm" />
          <source src={video.mp4} type="video/mp4" />
        </video>
      ) : (
        pic && (
          // eslint-disable-next-line @next/next/no-img-element -- 게임 화면 그대로
          <img className={styles.bannerMedia} style={pos} src={pic} alt="" width={1280} height={360} />
        )
      )}
      <div className={styles.bannerShade} aria-hidden="true" />
      <div className={styles.wrap}>
        <div className={styles.bannerTxt}>
          <h1 className={styles.display}>{title}</h1>
          <p>{sub}</p>
        </div>
      </div>
    </header>
  );
}
