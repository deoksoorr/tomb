import type { AdminDevNoteResponse, AdminDevNotesResponse } from "@/lib/devNotes/admin";
import type { DevNoteUploadMode } from "@/app/api/admin/devnotes/upload/route";
import { ApiRequestError, request } from "@/lib/api";
import type { LocalUploadResponse, Notice, NoticeBlock } from "@/lib/types";

// 관리자 「개발자 노트」 화면 → /api/admin/devnotes/*. 인증은 관리자 쿠키가 자동으로 실린다.

/** 서버로 보내는 글 (서버가 lib/devNotes/input.ts로 다시 검증한다) */
export type DevNotePayload = {
  title: string;
  summary?: string;
  hero: string | null;
  intro: string;
  callout?: string;
  blocks: NoticeBlock[];
  outro: string;
  pinned: boolean;
};

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const path = (id: string) => `/api/admin/devnotes/${encodeURIComponent(id)}`;

export const devNoteApi = {
  list: () => request<AdminDevNotesResponse>("/api/admin/devnotes", { cache: "no-store" }),
  get: (id: string) => request<AdminDevNoteResponse>(path(id), { cache: "no-store" }),
  create: (p: DevNotePayload) => request<{ notice: Notice }>("/api/admin/devnotes", json("POST", p)),
  update: (id: string, p: DevNotePayload) => request<{ notice: Notice }>(path(id), json("PUT", p)),
  setPinned: (id: string, pinned: boolean) => request<{ notice: Notice }>(path(id), json("PATCH", { pinned })),
  remove: (id: string) => request<{ ok: true }>(path(id), { method: "DELETE" }),
  /** 고친 정적 글 → 원본 */
  revert: (id: string) => request<{ ok: true }>(`${path(id)}/revert`, { method: "POST" }),
};

// ── 이미지 올리기 ──

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
/** 고를 수 있는 원본 크기 (브라우저에서 줄인 뒤 서버 한도는 5MB) */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** 올리는 그림의 최대 폭 (사이트 본문 폭의 두 배쯤) */
const MAX_WIDTH = 1600;

export const IMAGE_ACCEPT = ACCEPT.join(",");

/** 파일 고르기·끌어다 놓기·붙여넣기에서 이미지 파일 하나 */
export function firstImageFile(files: FileList | readonly File[] | null | undefined): File | null {
  for (const f of files ? Array.from(files) : []) if (f.type.startsWith("image/")) return f;
  return null;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** 1600px 폭 이하 WebP로 줄인다 (WebP로 못 만드는 브라우저는 JPEG). 줄인 게 더 크면 원본 그대로 */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("이미지를 읽지 못했어요. 다른 파일로 해 주세요.");
  const scale = Math.min(1, MAX_WIDTH / bmp.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 줄이지 못했어요.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  let out = await toBlob(canvas, "image/webp", 0.86);
  if (!out || out.type !== "image/webp") {
    // JPEG는 투명을 못 담으니 흰 바탕에 다시 그린다
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    out = await toBlob(canvas, "image/jpeg", 0.88);
  }
  bmp.close();
  if (!out) throw new Error("이미지를 줄이지 못했어요.");
  return scale === 1 && file.size <= out.size && file.size <= MAX_UPLOAD_BYTES ? file : out;
}

const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

let modeOnce: Promise<DevNoteUploadMode["mode"]> | null = null;
function uploadMode() {
  modeOnce ??= request<DevNoteUploadMode>("/api/admin/devnotes/upload", { cache: "no-store" }).then(
    (r) => r.mode,
    (e: unknown) => {
      modeOnce = null;
      throw e;
    },
  );
  return modeOnce;
}

/** 이미지 하나를 줄여서 올리고 주소를 돌려준다 (실패하면 사람이 읽을 메시지로 던진다) */
export async function uploadDevNoteImage(file: File): Promise<string> {
  if (!ACCEPT.includes(file.type)) throw new Error("PNG·JPG·WebP 이미지만 올릴 수 있어요.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("원본이 너무 커요. 20MB 이하 파일로 해 주세요.");
  const blob = await shrink(file);
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("줄여도 5MB가 넘어요. 더 작은 이미지로 해 주세요.");
  const type = blob.type in EXT ? blob.type : file.type;
  const mode = await uploadMode();
  if (mode === "local") {
    const fd = new FormData();
    fd.append("file", blob, `image.${EXT[type]}`);
    return (await request<LocalUploadResponse>("/api/admin/devnotes/upload/local", { method: "POST", body: fd })).url;
  }
  const { uploadPresigned } = await import("@vercel/blob/client");
  const name = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  try {
    const r = await uploadPresigned(`devnotes/${name}.${EXT[type]}`, blob, {
      access: "public",
      handleUploadUrl: "/api/admin/devnotes/upload",
      contentType: type,
    });
    return r.url;
  } catch (e) {
    if (e instanceof ApiRequestError) throw e;
    throw new Error("이미지를 올리지 못했어요. 잠시 뒤 다시 해 주세요.");
  }
}
