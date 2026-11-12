"use client";

/* eslint-disable @next/next/no-img-element -- QR은 원본 그대로 또렷해야 하고, 폰에서 길게 눌러 저장할 수 있어야 한다 */
import { useState } from "react";
import Dialog from "../ui/Dialog";
import PixelIcon from "../ui/PixelIcon";
import styles from "./DonateButton.module.css";

/** 화면 아래 가운데의 작은 [서버비 보태기] 버튼 + 카카오페이 QR 창 */
export default function DonateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.button} onClick={() => setOpen(true)}>
        <span className={styles.coin} aria-hidden="true">
          <PixelIcon name="heart" size={12} />
        </span>
        <span className={styles.label}>
          <span>서버비</span> <span>보태기</span>
        </span>
      </button>
      {open && (
        <Dialog title="서버비 보태기" onClose={() => setOpen(false)}>
          <div className={styles.body}>
            <p className={styles.lead}>여러분의 도움이 저를 살립니다…</p>
            <p>
              이 묘지 마을은 작은 서버 한 대 위에서 겨우겨우 버티고 있어요.
              <br />
              서버비가 밀리면… 이 마을도 조용히 성불해요.
            </p>
            <p>
              커피 한 잔 값이면 유령들이 한 달 더 버팁니다.
              <br />
              촛불도 안 꺼지고, 묘지기도 라면에 계란을 넣을 수 있어요.
            </p>
            <figure className={styles.qrBox}>
              <img
                className={styles.qr}
                src="/donation.png"
                width={718}
                height={718}
                alt="카카오페이 송금 QR 코드"
              />
              <figcaption className={styles.caption}>카카오페이 송금 QR</figcaption>
            </figure>
            <p className={styles.hint}>
              폰에서는 QR 이미지를 길게 눌러 저장한 뒤, 카카오톡 QR 스캔에서 앨범으로 불러오면 돼요.
            </p>
            <p className={styles.thanks}>
              안 하셔도 정말 괜찮아요. 놀러 와 주는 것만으로도 고마워요.
              <br />
              <span className={styles.sign}>— 묘지기 올림</span>
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
}
