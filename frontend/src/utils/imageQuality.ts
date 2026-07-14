export type QualityIssue = {
  kind: "blur" | "brightness" | "coverage";
  message: string;
};

export type QualityResult = {
  issues: QualityIssue[];
  timingMs: number;
};

const ANALYSIS_MAX_DIMENSION = 320;
const SKIN_THRESHOLD_PIXELS = 200;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to load image for quality check"));
    };
    img.src = URL.createObjectURL(file);
  });
}

function getAnalysisCanvas(
  img: HTMLImageElement,
): [HTMLCanvasElement, CanvasRenderingContext2D, ImageData] {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Canvas 2D context not available");
  }

  const scale = Math.min(
    1,
    ANALYSIS_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  return [canvas, ctx, imageData];
}

function rgbToHsv(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; v: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta + 6) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }
    h *= 60;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

function detectBlur(data: Uint8ClampedArray, width: number): boolean {
  const gray = new Uint8Array(width * Math.floor(data.length / 4 / width));
  const height = Math.floor(data.length / 4 / width);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const luminance = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
      );
      gray[y * width + x] = luminance;
    }
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian =
        gray[idx - width] +
        gray[idx + width] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  if (count === 0) return true;

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return variance < 80;
}

function detectBrightness(data: Uint8ClampedArray): "dark" | "bright" | null {
  const totalPixels = data.length / 4;
  const histogram = new Uint32Array(256);
  let sumLuminance = 0;

  for (let i = 0; i < data.length; i += 4) {
    const luminance = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
    );
    histogram[luminance]++;
    sumLuminance += luminance;
  }

  const mean = sumLuminance / totalPixels;

  let darkPixels = 0;
  let brightPixels = 0;
  for (let i = 0; i < 50; i++) darkPixels += histogram[i];
  for (let i = 205; i < 256; i++) brightPixels += histogram[i];

  const darkRatio = darkPixels / totalPixels;
  const brightRatio = brightPixels / totalPixels;

  if (mean < 55 || darkRatio > 0.35) return "dark";
  if (mean > 200 || brightRatio > 0.35) return "bright";
  return null;
}

function detectSkinCoverage(data: Uint8ClampedArray): boolean {
  let skinPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const { h, s, v } = rgbToHsv(data[i], data[i + 1], data[i + 2]);

    if (
      ((h >= 0 && h <= 50) || (h >= 340 && h <= 360)) &&
      s >= 0.15 &&
      s <= 0.68 &&
      v >= 0.2 &&
      v <= 1.0
    ) {
      skinPixels++;
    }
  }

  return skinPixels >= SKIN_THRESHOLD_PIXELS;
}

export async function analyzeImageQuality(
  file: File,
  signal?: AbortSignal,
): Promise<QualityResult> {
  const start = performance.now();
  const issues: QualityIssue[] = [];

  if (signal?.aborted) {
    return { issues, timingMs: performance.now() - start };
  }

  const img = await loadImage(file);
  const [, , imageData] = getAnalysisCanvas(img);
  const { data, width } = imageData;

  if (detectBlur(data, width)) {
    issues.push({
      kind: "blur",
      message: "Photo is blurry — please retake",
    });
  }

  if (signal?.aborted) {
    return { issues, timingMs: performance.now() - start };
  }

  const brightness = detectBrightness(data);
  if (brightness) {
    issues.push({
      kind: "brightness",
      message:
        brightness === "dark"
          ? "Lighting is too dark — try adjusting your position"
          : "Lighting is too bright — try adjusting your position",
    });
  }

  if (signal?.aborted) {
    return { issues, timingMs: performance.now() - start };
  }

  if (!detectSkinCoverage(data)) {
    issues.push({
      kind: "coverage",
      message: "Position not detected — please adjust your camera position",
    });
  }

  return { issues, timingMs: performance.now() - start };
}
