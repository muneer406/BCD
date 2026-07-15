const HEATMAP_MAX_DIMENSION = 320;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function copyImageData(src: ImageData): ImageData {
  return new ImageData(
    new Uint8ClampedArray(src.data),
    src.width,
    src.height,
  );
}

function prepareImage(
  img: HTMLImageElement,
  width: number,
  height: number,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function heatmapColor(t: number): [number, number, number] {
  if (t < 0.5) {
    const local = t / 0.5;
    const r = local;
    const g = 0.5 + local * 0.3;
    const b = 1 - local;
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  const local = (t - 0.5) / 0.5;
  const r = 1;
  const g = 0.8 * (1 - local);
  const b = 0;
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function boxBlur(src: ImageData, radius: number): ImageData {
  const w = src.width;
  const h = src.height;
  const input = src.data;
  const temp = new Uint8ClampedArray(input.length);
  const output = new Uint8ClampedArray(input.length);

  const r = Math.max(1, Math.round(radius));
  const area = 2 * r + 1;

  for (let y = 0; y < h; y++) {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let aSum = 0;

    for (let x = -r; x <= r; x++) {
      const idx = (y * w + clamp(x, 0, w - 1)) * 4;
      rSum += input[idx];
      gSum += input[idx + 1];
      bSum += input[idx + 2];
      aSum += input[idx + 3];
    }

    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      temp[idx] = rSum / area;
      temp[idx + 1] = gSum / area;
      temp[idx + 2] = bSum / area;
      temp[idx + 3] = aSum / area;

      const leftIdx = (y * w + clamp(x - r, 0, w - 1)) * 4;
      const rightIdx = (y * w + clamp(x + r + 1, 0, w - 1)) * 4;
      rSum += input[rightIdx] - input[leftIdx];
      gSum += input[rightIdx + 1] - input[leftIdx + 1];
      bSum += input[rightIdx + 2] - input[leftIdx + 2];
      aSum += input[rightIdx + 3] - input[leftIdx + 3];
    }
  }

  for (let x = 0; x < w; x++) {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let aSum = 0;

    for (let y = -r; y <= r; y++) {
      const idx = (clamp(y, 0, h - 1) * w + x) * 4;
      rSum += temp[idx];
      gSum += temp[idx + 1];
      bSum += temp[idx + 2];
      aSum += temp[idx + 3];
    }

    for (let y = 0; y < h; y++) {
      const idx = (y * w + x) * 4;
      output[idx] = rSum / area;
      output[idx + 1] = gSum / area;
      output[idx + 2] = bSum / area;
      output[idx + 3] = aSum / area;

      const topIdx = (clamp(y - r, 0, h - 1) * w + x) * 4;
      const bottomIdx = (clamp(y + r + 1, 0, h - 1) * w + x) * 4;
      rSum += temp[bottomIdx] - temp[topIdx];
      gSum += temp[bottomIdx + 1] - temp[topIdx + 1];
      bSum += temp[bottomIdx + 2] - temp[topIdx + 2];
      aSum += temp[bottomIdx + 3] - temp[topIdx + 3];
    }
  }

  return new ImageData(output, w, h);
}

function yieldFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function generateHeatmap(
  currentImage: HTMLImageElement,
  baselineImage: HTMLImageElement,
): Promise<HTMLCanvasElement> {
  const maxDim = Math.max(
    currentImage.naturalWidth,
    currentImage.naturalHeight,
    baselineImage.naturalWidth,
    baselineImage.naturalHeight,
  );
  const scale = Math.min(1, HEATMAP_MAX_DIMENSION / maxDim);
  const width = Math.max(1, Math.round(currentImage.naturalWidth * scale));
  const height = Math.max(1, Math.round(currentImage.naturalHeight * scale));

  const currentData = prepareImage(currentImage, width, height);
  const baselineData = prepareImage(baselineImage, width, height);

  const cd = currentData.data;
  const bd = baselineData.data;
  const heatmap = copyImageData(currentData);
  const hd = heatmap.data;

  const len = cd.length;
  const maxDiff = 3 * 255;

  await yieldFrame();
  for (let i = 0; i < len; i += 4) {
    const diff =
      Math.abs(cd[i] - bd[i]) +
      Math.abs(cd[i + 1] - bd[i + 1]) +
      Math.abs(cd[i + 2] - bd[i + 2]);
    const t = clamp(diff / maxDiff, 0, 1);
    const [r, g, b] = heatmapColor(t);
    hd[i] = r;
    hd[i + 1] = g;
    hd[i + 2] = b;
    hd[i + 3] = 255;
  }

  await yieldFrame();
  const blurred = boxBlur(heatmap, 2);

  await yieldFrame();
  const blended = copyImageData(currentData);
  const blend = blended.data;
  const blur = blurred.data;
  const overlayAlpha = 0.5;
  const invAlpha = 1 - overlayAlpha;

  for (let i = 0; i < len; i += 4) {
    blend[i] = Math.round(invAlpha * blend[i] + overlayAlpha * blur[i]);
    blend[i + 1] = Math.round(
      invAlpha * blend[i + 1] + overlayAlpha * blur[i + 1],
    );
    blend[i + 2] = Math.round(
      invAlpha * blend[i + 2] + overlayAlpha * blur[i + 2],
    );
    blend[i + 3] = 255;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.putImageData(blended, 0, 0);
  return canvas;
}
