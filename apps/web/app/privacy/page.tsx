import type { Metadata } from "next";
import Link from "next/link";
import { SHRINE_KEEP_DAYS } from "@/lib/types";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "개인정보처리방침 · 한때는...", alternates: { canonical: "/privacy" } };

const EFFECTIVE = "2026년 11월 13일";

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
        <p>게임을 한 번도 만들어 본 적 없는 개인이 만든 포트폴리오예요. 후원, 광고, 유료 재화는 없어요. 모은 정보를 팔거나 광고·마케팅에 쓰지 않아요.</p>

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
            <tr>
              <td>
                방문 통계: 들어온 경로(이전 사이트의 도메인만, 예: google.com), 주소의 utm 값, 처음 연 페이지의 종류, 기기 종류(모바일·데스크톱),
                브라우저 이름, 국가(접속 위치로 알아낸 나라 이름만), 화면을 켜 둔 시간, 처음·다시 온 방문 여부
              </td>
              <td>
                몇 명이 어디서 와서 얼마나 머무는지 알고 서비스를 고치기 위해. 날짜·시간대별 합계로만 저장하고, 누구의 방문인지 알 수 있는 값(IP 원문,
                이전 페이지의 전체 주소, 브라우저 정보 원문)은 남기지 않아요
              </td>
            </tr>
          </tbody>
        </table>

        <h2>3. 보관 기간</h2>
        <ul>
          <li>이장한 묘비: 성황당에서 {SHRINE_KEEP_DAYS}일 동안 보관한 뒤 지워요.</li>
          <li>성불한 묘비: 「성불한 이야기들」에 남겨 두고, 지워 달라고 요청하면 지워요.</li>
          <li>오류 보고: 14일 뒤 지워요.</li>
          <li>방문 통계(날짜·시간대별 합계): 90일 뒤 저절로 지워져요.</li>
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
          계정 식별자 쿠키와 방문 통계 쿠키를 써요. 방문 통계 쿠키는 무작위 값 하나로, 처음 온 방문인지와 하루에 몇 명이 왔는지를
          겹치지 않게 세는 데만 쓰고 서버에는 그 값 자체를 저장하지 않아요(되돌릴 수 없는 형태로 섞어 인원 수만 셉니다). 1년 뒤 사라지고,
          지워도 서비스 이용에는 영향이 없어요. 광고·추적용 쿠키는 쓰지 않아요. 계정 식별자 쿠키를 지우면 개인 코드 없이는 이전 계정으로
          돌아올 수 없어요.
        </p>

        <h2>7. 바뀌면</h2>
        <p>이 방침이 바뀌면 공지와 이 페이지에 알려요.</p>
      </div>
    </main>
  );
}
