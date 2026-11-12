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
          <span>후원하기</span>
        </span>
      </button>
      {open && (
        <Dialog title="후원" onClose={() => setOpen(false)}>
          <div className={styles.body}>
            <p className={styles.payBadge} aria-label="카카오페이로 후원">
              <b>kakao</b>pay
            </p>
            <figure className={styles.qrBox}>
              <img className={styles.qr} src="/donation.png" width={718} height={718} alt="카카오페이 후원 QR 코드" />
            </figure>
          </div>
        </Dialog>
      )}
    </>
  );
}
