/** className 합치기 (거짓 값은 건너뜀) */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
