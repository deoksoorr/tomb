import type { Metadata } from "next";
import Link from "next/link";
import { SHRINE_KEEP_DAYS } from "@/lib/types";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "개인정보처리방침 · 한때는..." };

const EFFECTIVE = "2026년 11월 9일";

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <Link href="/" className={styles.home}>
          ← 묘지로 돌아가기
        </Link>
        <h1 className={styles.title}>개인정보처리방침</h1>
        <p className={styles.date}>시행일 {EFFECTIVE}</p>

        <h2>1. 이렇게 운영해요</h2>
        <p>
          「한때는...」은 회원가입 없이 쓰는 서비스예요. 이름·이메일 같은 신원 정보를 요구하지 않고, 서비스를 돌리는 데 꼭
          필요한 것만 다뤄요.
        </p>

        <h2>2. 처리하는 정보</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">정보</th>
              <th scope="col">왜 쓰나요</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>계정 식별자 쿠키 (무작위 id, 서명됨)</td>
              <td>같은 사람을 알아보고 포인트·가방·내 묘비를 이어 주기 위해</td>
            </tr>
            <tr>
              <td>닉네임, 아바타 색·몸 모양</td>
              <td>묘지 안에서 다른 방문자에게 보이기 위해</td>
            </tr>
            <tr>
              <td>묘비·집·방명록에 쓴 내용</td>
              <td>모두에게 공개되는 내용이에요. 개인정보는 쓰지 말아 주세요</td>
            </tr>
            <tr>
              <td>IP 주소</td>
              <td>원문은 저장하지 않고, 되돌릴 수 없는 해시로만 바꿔 과도한 요청 제한과 신고 집계에 써요</td>
            </tr>
            <tr>
              <td>문의할 때 남긴 연락처 (선택)</td>
              <td>답장을 위해서만. 운영자의 비공개 GitHub 저장소에 보관해요</td>
            </tr>
            <tr>
              <td>오류 보고 (오류 메시지, 페이지 주소, 브라우저 정보)</td>
              <td>고장 난 곳을 찾아 고치기 위해</td>
            </tr>
          </tbody>
        </table>

        <h2>3. 보관 기간</h2>
        <ul>
          <li>이장한 묘비: 성황당에서 {SHRINE_KEEP_DAYS}일 동안 보관한 뒤 지워요.</li>
          <li>오류 보고: 14일 뒤 지워요.</li>
          <li>계정과 그 계정의 기록: 삭제를 요청하면 지워요.</li>
        </ul>

        <h2>4. 처리를 맡기는 곳</h2>
        <ul>
          <li>Vercel: 웹사이트와 서버 실행</li>
          <li>Upstash: 묘비·포인트 등 데이터 저장</li>
          <li>Cloudflare: 실시간 접속(같은 채널 사람들이 서로 보이게)</li>
          <li>GitHub: 문의 보관</li>
        </ul>

        <h2>5. 이용자의 권리</h2>
        <p>
          내 정보를 보거나 고치거나 지워 달라고 요청할 수 있어요. 게임 안 ⓘ 안내나 내 정보의 [문의하기]로 알려 주세요.
          닉네임은 내 정보에서 직접 바꿀 수 있고, 내 묘비는 이장(삭제)할 수 있어요.
        </p>

        <h2>6. 쿠키</h2>
        <p>
          계정 식별자 쿠키 하나만 써요. 광고·추적용 쿠키는 쓰지 않아요. 쿠키를 지우면 개인 코드 없이는 이전 계정으로 돌아올 수
          없어요.
        </p>

        <h2>7. 바뀌면</h2>
        <p>이 방침이 바뀌면 공지와 이 페이지에 알려요.</p>
      </div>
    </main>
  );
}
