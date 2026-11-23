import { oklch, rgb } from "culori";
import { defaultFloor, labels, lightingPresets, palette, rooms, type Design } from "./design.ts";
import type { WebTokens } from "./web-preview.ts";

export const formats = {
  hex: "CSS variables (HEX)",
  oklch: "CSS variables (OKLCH)",
  tailwind: "Tailwind v4 @theme",
  figma: "Figma Variables (JSON)",
};
export type ExportFormat = keyof typeof formats;

export function exportTheme(tokens: WebTokens, format: ExportFormat) {
  const entries = Object.entries(tokens);
  if (format === "figma") {
    return JSON.stringify(Object.fromEntries(entries.map(([key, hex]) => {
      const { r, g, b } = rgb(hex)!;
      return [key, {
        $type: "color",
        $value: { colorSpace: "srgb", components: [r, g, b], alpha: 1, hex },
      }];
    })), null, 2) + "\n";
  }
  const tailwind = format === "tailwind";
  const lines = entries.map(([key, hex]) => {
    const { l, c, h = 0 } = oklch(hex)!;
    const value = format === "oklch"
      ? `oklch(${l.toFixed(8)} ${c.toFixed(8)} ${h.toFixed(6)})`
      : hex;
    return `  --${tailwind ? "color-" : ""}${key}: ${value};`;
  });
  return [tailwind ? "@theme static {" : ":root {", ...lines, "}", ""].join("\n");
}

export function sheet(d: Design) {
  const sample = (hex: string) =>
    `<i class="chip" style="--swatch:${hex}" aria-hidden="true"></i> <code>${hex}</code>`;
  const rows = palette(d).map(([role, hex]) => {
    const name = role === "wall" && d.mode === "single" ? "Walls" : labels[role];
    return `<tr><th scope="row">${name}</th><td>${sample(hex)}</td></tr>`;
  }).join("");
  return `<h2 id="sheet-title">Paint spec sheet</h2>
    <p>${rooms[d.room]} · ${lightingPresets[d.lighting]}</p>
    <table><thead><tr><th scope="col">Painted surface</th><th scope="col">HEX</th></tr></thead><tbody>${rows}<tr><th scope="row">Door</th><td>${sample(d.door ?? d.colours.wall)}</td></tr></tbody></table>
    <p class="spec-floor"><strong>Existing floor</strong> ${sample(d.floor ?? defaultFloor)}</p>
    <p>Lighting is approximate. Check a physical paint sample in your room.</p>`;
}
