/**
 * OKLCH ⇄ sRGB, and WCAG relative luminance.
 *
 * Written out rather than imported: the token file's contrast is what is under
 * test, so the conversion has to be inspectable here and must not move with a
 * library's next release. The matrices are Björn Ottosson's.
 */

const srgbToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function oklchToRgb({ l, c, h }: Oklch): [number, number, number] {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const long_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const medium_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const short_ = l - 0.0894841775 * a - 1.291485548 * b;

  const long = long_ ** 3;
  const medium = medium_ ** 3;
  const short = short_ ** 3;

  return [
    linearToSrgb(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
    linearToSrgb(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    linearToSrgb(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
  ];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG 2.x contrast ratio. 4.5:1 is the floor for body text. */
export function contrastRatio(foreground: Oklch, background: Oklch): number {
  const [lighter, darker] = [
    relativeLuminance(oklchToRgb(foreground)),
    relativeLuminance(oklchToRgb(background)),
  ].sort((a, b) => b - a);

  return (lighter + 0.05) / (darker + 0.05);
}
