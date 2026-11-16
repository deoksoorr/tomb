"use client";

import type { LinkedAccount, MemberLinks } from "@/lib/sameUserRules";
import mm from "./Members.module.css";

/** 이름 목록 한 줄 (전부 보여 주고, 길면 여러 줄로 감긴다). 이름을 누르면 그 계정을 찾는다 */
export function NameLine({ label, accounts, onFind }: { label: string; accounts: readonly LinkedAccount[]; onFind: (accountId: string) => void }) {
  if (!accounts.length) return null;
  return (
    <p className={mm.linkLine}>
      <span className={mm.linkLabel}>{label}</span>
      {accounts.map((a, i) => (
        <span key={a.accountId}>
          <button type="button" className={mm.linkName} onClick={() => onFind(a.accountId)} title={`이 계정을 찾아요 (${a.accountId})`}>
            {a.name ?? "이름 없음"}
          </button>
          {a.staff && <span className={mm.linkStaff}>운영자</span>}
          {i < accounts.length - 1 && ","}
        </span>
      ))}
    </p>
  );
}

/** 회원 목록·추천 탭: 같은 IP 접속·같은 기기 계정 (없으면 아무것도 그리지 않는다) */
export default function LinkedNames({ links, onFind }: { links: MemberLinks; onFind: (accountId: string) => void }) {
  if (!links.ip.length && !links.device.length) return null;
  return (
    <div className={mm.links}>
      <NameLine label="같은 IP 접속" accounts={links.ip} onFind={onFind} />
      <NameLine label="같은 기기" accounts={links.device} onFind={onFind} />
    </div>
  );
}

export const hasLinks = (links: MemberLinks | undefined) => !!links && (links.ip.length > 0 || links.device.length > 0);
