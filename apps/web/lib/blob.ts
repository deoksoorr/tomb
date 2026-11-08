import { del } from "@vercel/blob";
import { nanoid } from "nanoid";
import { env } from "./env";
import { HttpError } from "./http";
import { sha256Hex } from "./session";

export const MAX_UPLOAD_BYTES = 300 * 1024;
export const UPLOAD_CONTENT_TYPE = "image/webp";
/** 업로드 토큰 수명. 받자마자 바로 올리는 용도라 짧게 둔다 */
export const UPLOAD_TOKEN_TTL_MS = 60_000;

// ── 업로더 소유권 ──
// 모든 이미지는 `graves/<sha256(visitorId) 앞 16자>/` 아래에 둔다. 묘비에는 자기 폴더의 이미지만 붙일 수 있으므로
// 남의 이미지 주소로 묘비를 세웠다가 이장해서 그 이미지를 지우는 일이 불가능하다.

export const uploadPrefix = (visitorId: string) => `graves/${sha256Hex(visitorId).slice(0, 16)}/`;

/** 클라이언트가 고르는 Blob 경로: `<prefix><이름>.webp` */
export function isUploadPathFor(pathname: string, visitorId: string): boolean {
  const prefix = uploadPrefix(visitorId);
  return pathname.startsWith(prefix) && /^[A-Za-z0-9_-]{1,64}\.webp$/.test(pathname.slice(prefix.length));
}

/** 이 프로젝트 스토어의 공개 호스트. SDK는 `https://${storeId}.public.blob.vercel-storage.com`을 만들고 URL은 호스트를 소문자로 바꾼다 */
function blobHost(): string | null {
  const storeId = env.blobStoreId();
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

// ── 로컬 대체 업로드 (BLOB_READ_WRITE_TOKEN이 없는 개발 환경 전용, 운영에서는 막는다) ──

export const LOCAL_UPLOAD_PATH = "/api/upload/local/";
const LOCAL_FILE_RE = /^graves\/[0-9a-f]{16}\/[A-Za-z0-9_-]{12}\.webp$/;
const LOCAL_MAX_FILES = 200;

const g = globalThis as typeof globalThis & { __tombLocalUploads?: Map<string, Uint8Array<ArrayBuffer>> };
const localFiles = (g.__tombLocalUploads ??= new Map());

/**
 * 우리 저장소 이미지면 저장 경로(`graves/<해시>/<파일>.webp`), 아니면 null.
 * Blob은 이 프로젝트 스토어의 호스트와 정확히 같아야 하고, 로컬 경로는 개발 중에만 받는다.
 */
export function imagePath(url: string): string | null {
  if (url.startsWith(LOCAL_UPLOAD_PATH)) {
    const path = url.slice(LOCAL_UPLOAD_PATH.length);
    return !env.isProd() && LOCAL_FILE_RE.test(path) ? path : null;
  }
  try {
    const u = new URL(url);
    const ok = u.protocol === "https:" && u.hostname === blobHost() && /^\/graves\/[0-9a-f]{16}\/[^/]+$/.test(u.pathname);
    return ok ? u.pathname.slice(1) : null;
  } catch {
    return null;
  }
}

export const isAllowedImageUrl = (url: string) => imagePath(url) !== null;

/** 묘비에 붙일 수 있는 이미지: 요청자가 직접 올린 것, 또는 (수정 시) 이미 붙어 있던 것 */
export function assertImageUsable(url: string | undefined, visitorId: string, current?: string): void {
  if (!url || url === current || imagePath(url)?.startsWith(uploadPrefix(visitorId))) return;
  throw new HttpError(400, "INVALID_INPUT", "직접 올린 이미지만 쓸 수 있어요.");
}

/** 메모리에 보관하고 서빙 주소를 돌려준다. 오래된 것부터 버려서 개발 서버 메모리가 계속 늘지 않게 한다 */
export function saveLocalUpload(bytes: Uint8Array<ArrayBuffer>, visitorId: string): string {
  const path = `${uploadPrefix(visitorId)}${nanoid(12)}.webp`;
  localFiles.set(path, bytes);
  if (localFiles.size > LOCAL_MAX_FILES) localFiles.delete(localFiles.keys().next().value!);
  return LOCAL_UPLOAD_PATH + path;
}

export const getLocalUpload = (path: string) => localFiles.get(path);

/** WebP 매직 바이트: "RIFF" ???? "WEBP" */
export function isWebp(bytes: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  return bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}

/** 이미지 파일 삭제. 실패해도 묘비 삭제는 진행되도록 로그만 남긴다. Blob list()는 쓰지 않는다 */
export async function deleteImage(url: string | undefined): Promise<void> {
  const path = url ? imagePath(url) : null;
  if (!url || !path) return;
  if (url.startsWith(LOCAL_UPLOAD_PATH)) {
    localFiles.delete(path);
    return;
  }
  try {
    // 읽기쓰기 토큰이 없으면 token을 비워 두어 SDK가 OIDC(BLOB_STORE_ID)로 인증하게 한다
    await del(url, { token: env.blobToken() });
  } catch (e) {
    console.error("[blob] 이미지 삭제 실패", url, e);
  }
}
