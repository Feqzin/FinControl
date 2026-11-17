export const DEFAULT_ACCENT = "#1173d4";
export const ACCENT_PRESETS = [
  { name: "Azul original", value: DEFAULT_ACCENT },
  { name: "Roxo", value: "#9b2bd6" },
  { name: "Verde", value: "#168363" },
  { name: "Rosa", value: "#c42b77" },
  { name: "Âmbar", value: "#ad650b" },
] as const;
export function isAccentColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
export function getAccentTokens(hex: string) {
  const color = isAccentColor(hex) ? hex : DEFAULT_ACCENT;
  const rgb = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16) / 255);
  const [r, g, b] = rgb;
  const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
  const light = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  let hue = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  const luminance = rgb.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  return {
    primary: `${hue.toFixed(1)} ${(saturation * 100).toFixed(1)}% ${(light * 100).toFixed(1)}%`,
    foreground: luminance > .179 ? "0 0% 5%" : "0 0% 100%",
    lightText: `${hue.toFixed(1)} ${(saturation * 100).toFixed(1)}% ${(luminance > .179 ? 20 : light * 100).toFixed(1)}%`,
    softText: `${hue.toFixed(1)} ${(saturation * 70).toFixed(1)}% 80%`,
  };
}
