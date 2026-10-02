export interface OCRRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}
// Detect a sustained white gutter, not ordinary spaces between words. Retain
// full-width headers/abstracts/tables and read each detected column separately.
export function ocrRegions(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): OCRRegion[] {
  const middle = Math.floor(width / 2),
    strip = Math.max(2, Math.floor(width * 0.003));
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (
      pixels[i + 3] > 128 &&
      (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 < 200
    );
  };
  const spans: [number, number][] = [];
  let start = -1;
  for (let y = 0; y <= height; y++) {
    let empty = y < height;
    if (empty)
      for (let x = middle - strip; x <= middle + strip; x++)
        if (dark(x, y)) {
          empty = false;
          break;
        }
    if (empty && start < 0) start = y;
    if (!empty && start >= 0) {
      if (y - start >= Math.max(120, height * 0.08)) {
        const density = (x1: number, x2: number) => {
          let ink = 0,
            samples = 0;
          for (let row = start; row < y; row++)
            for (let x = x1; x < x2; x += 4) {
              samples++;
              if (dark(x, row)) ink++;
            }
          return ink / Math.max(1, samples);
        };
        if (
          density(0, middle - strip) > 0.008 &&
          density(middle + strip, width) > 0.008
        ) {
          // Snap cuts to a completely blank row so glyphs at a full-width
          // heading/abstract boundary are not sliced in half.
          const blank = (row: number) => {
            for (let x = 0; x < width; x += 2) if (dark(x, row)) return false;
            return true;
          };
          let a = start,
            b = y;
          const margin = Math.ceil(height * 0.025);
          while (a < start + margin && a < y && !blank(a)) a++;
          while (b > y - margin && b > a && b < height && !blank(b - 1)) b--;
          if (b - a >= 120) spans.push([a, b]);
        }
      }
      start = -1;
    }
  }
  if (!spans.length || spans.length > 4)
    return [{ left: 0, top: 0, width, height }];
  const regions: OCRRegion[] = [];
  let top = 0;
  for (const [a, b] of spans) {
    if (a > top) regions.push({ left: 0, top, width, height: a - top });
    regions.push(
      { left: 0, top: a, width: middle, height: b - a },
      { left: middle, top: a, width: width - middle, height: b - a },
    );
    top = b;
  }
  if (top < height) regions.push({ left: 0, top, width, height: height - top });
  return regions;
}
