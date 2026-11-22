import { oklch, rgb } from "culori";
import { contrast, toHex } from "./colour.ts";
import { example, type Design } from "./design.ts";

export const tokenLabels = {
  background: "Background",
  surface: "Surface",
  "primary-text": "Primary Text",
  "muted-text": "Muted Text",
  accent: "Accent",
  "text-on-accent": "Text on accent",
  border: "Input border",
} as const;
export type Token = keyof typeof tokenLabels;
export type WebTokens = Record<Token, string>;

export function invertLightness(hex: string) {
  const color = oklch(hex)!;
  return toHex({ ...color, l: 1 - color.l });
}

function mix(from: string, into: string, amount: number) {
  const a = rgb(from)!;
  const b = rgb(into)!;
  return "#" + (["r", "g", "b"] as const)
    .map((key) => Math.round(255 * (a[key] + (b[key] - a[key]) * amount))
      .toString(16).padStart(2, "0"))
    .join("").toUpperCase();
}

export function resolveWeb(d: Design): WebTokens {
  const active = d.theme === "dark" ? invertLightness : (value: string) => value;
  const background = active(d.colours.background);
  const text = active(d.colours.text);
  const surface = mix(background, text, 0.07);
  const actions = d.mode === "text" ? example("web").colours : d.colours;
  return {
    background,
    surface,
    "primary-text": text,
    "muted-text": mix(text, surface, 0.23),
    accent: actions.accent,
    "text-on-accent": actions.onAccent,
    border: mix(text, surface, 0.35),
  };
}

const pairs = [
  ["Page text", "primary-text", "background", "text"],
  ["Page heading", "primary-text", "background", "large"],
  ["Card text", "primary-text", "surface", "text"],
  ["Card headings", "primary-text", "surface", "large"],
  ["Muted card text", "muted-text", "surface", "text"],
  ["Button label", "text-on-accent", "accent", "text"],
  ["Button fill", "accent", "surface", "ui"],
  ["Input border", "border", "surface", "ui"],
  ["Alert icon", "accent", "surface", "ui"],
] as const;

export function contrastResults(tokens: WebTokens) {
  return pairs.map(([label, fg, bg, kind]) => {
    const ratio = contrast(tokens[fg], tokens[bg]);
    const aa = kind === "text" ? 4.5 : 3;
    const aaa = kind === "text" ? 7 : 4.5;
    return { label, fg, bg, ratio, aa: ratio >= aa, aaa: kind === "ui" ? null : ratio >= aaa };
  });
}

export function dashboard(tokens: WebTokens) {
  const style = Object.entries(tokens).map(([key, value]) => `--${key}:${value}`).join(";");
  return `<article id="specimen" style="${style}" aria-label="Sample website">
    <div class="dashboard-heading"><h3>Workspace</h3><p>Manage your team and plan.</p></div>
    <div class="dashboard-grid">
      <section class="dashboard-card" aria-label="Dashboard card">
        <h4>Activity</h4>
        <p class="dashboard-metric">24 <span class="dashboard-badge">Active</span></p>
        <p class="dashboard-muted">Projects this month</p>
        <div class="dashboard-alert"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 5v3m0 2v1" stroke="currentColor" stroke-width="2"/></svg><span>Usage report is ready</span></div>
      </section>
      <section class="dashboard-card" aria-label="Pricing and inputs">
        <h4>Plans</h4>
        <table><thead><tr><th scope="col">Plan</th><th scope="col">Monthly</th></tr></thead><tbody><tr><th scope="row">Starter</th><td>$12</td></tr><tr><th scope="row">Team</th><td>$24</td></tr></tbody></table>
        <div class="dashboard-form"><label>Email<input type="email" id="sample-email" placeholder="you@example.com" autocomplete="off"></label>
        <button type="button" id="specimen-button" aria-label="Try accent">Try</button></div>
      </section>
    </div>
  </article>`;
}
