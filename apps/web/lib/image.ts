// 스크린샷을 브라우저에서 WebP(긴 변 960px 이하, 200KB 이하)로 줄인다. 서버 상한(300KB)보다 여유 있게 맞춘다.
// 캔버스가 WebP 인코딩을 못 하는 브라우저(일부 Safari)는 jSquash WASM 인코더로 대신한다.

export const SCREENSHOT_MAX_SIDE = 960;
export const SCREENSHOT_MAX_BYTES = 200 * 1024;

// @jsquash/webp 1.5.0의 인코더 wasm을 public/에 복사해 두고 그 주소로 불러온다.
// 번들러가 node_modules 안의 wasm을 어떻게 내보내든 상관없게 하려는 것. 패키지를 올리면 폴더도 같이 바꾼다.
const WEBP_WASM_DIR = "/wasm/jsquash-webp-1.5.0";

const UNSUPPORTED_MESSAGE = "이 브라우저에서는 사진 변환을 지원하지 않아요. 다른 브라우저에서 올려 주세요.";

export class ImageConvertError extends Error {}

/** 비율을 지키며 긴 변을 maxSide 이하로 (확대하지 않는다) */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** 용량이 맞을 때까지 시도하는 순서: 같은 크기에서 품질을 먼저 내리고, 그래도 크면 크기를 줄인다 */
export const ENCODE_STEPS: readonly { scale: number; quality: number }[] = [1, 0.8, 0.64, 0.5, 0.4].flatMap(
  (scale) => [0.82, 0.68, 0.55].map((quality) => ({ scale, quality })),
);

export type WebpEncoders = {
  /** 지금 그려진 크기로 인코딩. 이 브라우저가 WebP를 못 만들면 null */
  native: (quality: number) => Promise<Blob | null>;
  /** native가 한 번이라도 null이면 이후 단계는 전부 이것으로 */
  fallback: (quality: number) => Promise<Blob>;
};

/** ENCODE_STEPS를 따라 maxBytes 이하가 나올 때까지 줄인다. render(scale)는 캔버스를 그 비율로 다시 그린다 */
export async function shrinkToWebp(
  render: (scale: number) => void,
  encoders: WebpEncoders,
  maxBytes = SCREENSHOT_MAX_BYTES,
): Promise<Blob> {
  let useFallback = false;
  let renderedScale = 0;
  for (const { scale, quality } of ENCODE_STEPS) {
    if (scale !== renderedScale) {
      render(scale);
      renderedScale = scale;
    }
    let blob = useFallback ? null : await encoders.native(quality);
    if (!blob) {
      useFallback = true;
      blob = await encoders.fallback(quality);
    }
    if (blob.size <= maxBytes) return blob;
  }
  throw new ImageConvertError("사진을 200KB 이하로 줄이지 못했어요. 다른 사진을 골라 주세요.");
}

type WasmEncode = (image: ImageData, quality: number) => Promise<ArrayBuffer>;
let wasmEncoder: Promise<WasmEncode> | null = null;

/** 필요할 때만 받는다 (수백 KB) */
function loadWasmEncoder(): Promise<WasmEncode> {
  wasmEncoder ??= (async () => {
    const { default: encode, init } = await import("@jsquash/webp/encode");
    await init({ locateFile: (path: string) => `${WEBP_WASM_DIR}/${path}` });
    return (image: ImageData, quality: number) => encode(image, { quality: Math.round(quality * 100) });
  })().catch((e: unknown) => {
    wasmEncoder = null;
    throw e;
  });
  return wasmEncoder;
}

function canvasWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) =>
    // WebP 인코딩을 못 하는 브라우저는 조용히 PNG를 돌려준다
    canvas.toBlob((blob) => resolve(blob?.type === "image/webp" ? blob : null), "image/webp", quality),
  );
}

export async function toWebp(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageConvertError("이미지를 읽지 못했어요. 다른 파일을 골라 주세요.");
  }
  try {
    const base = fitWithin(bitmap.width, bitmap.height, SCREENSHOT_MAX_SIDE);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new ImageConvertError("사진을 변환하지 못했어요.");
    const render = (scale: number) => {
      canvas.width = Math.max(1, Math.round(base.width * scale));
      canvas.height = Math.max(1, Math.round(base.height * scale));
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    };
    return await shrinkToWebp(render, {
      native: (quality) => canvasWebp(canvas, quality),
      fallback: async (quality) => {
        let encode: WasmEncode;
        try {
          encode = await loadWasmEncoder();
        } catch {
          throw new ImageConvertError(UNSUPPORTED_MESSAGE);
        }
        const bytes = await encode(ctx.getImageData(0, 0, canvas.width, canvas.height), quality);
        return new Blob([bytes], { type: "image/webp" });
      },
    });
  } finally {
    bitmap.close();
  }
}
