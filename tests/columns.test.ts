import { it, expect } from "vitest";
import { ocrRegions } from "../src/documents/columns";
it("preserves full-width material and reads a sustained two-column gutter separately", () => {
  const width = 200,
    height = 400,
    pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const ink = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
  };
  for (let y = 10; y < 100; y += 10) for (let x = 20; x < 180; x++) ink(x, y);
  for (let y = 110; y < 380; y += 10)
    for (let x = 20; x < 180; x++) if (x < 90 || x > 110) ink(x, y);
  const regions = ocrRegions(pixels, width, height);
  expect(regions).toHaveLength(3);
  expect(regions[0].width).toBe(width);
  expect(regions[1].left).toBe(0);
  expect(regions[2].left).toBe(100);
  expect(regions.reduce((a, r) => a + r.width * r.height, 0)).toBe(
    width * height,
  );
});
it("keeps single-column pages intact even if the center is blank", () => {
  const width = 200,
    height = 400,
    pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 10; y < 390; y += 10)
    for (let x = 20; x < 80; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
    }
  expect(ocrRegions(pixels, width, height)).toEqual([
    { left: 0, top: 0, width, height },
  ]);
});
