import { calcAPCA } from "apca-w3";
import { oklch, rgb } from "culori";
import { contrast, passes, toHex } from "./colour.ts";
import { example, type Design } from "./design.ts";

export const tokenLabels = {
  background: "Background",
  surface: "Surface",
  "primary-text": "Primary Text",
  "muted-text": "Muted Text",
  accent: "Accent",
  "text-on-accent": "Text on accent",
  border: "Input border",
  divider: "Divider",
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
  const base = oklch(background)!;
  const shift = Math.max(-0.04, Math.min(0.04, 0.5 - base.l));
  const surface = toHex({ ...base, l: base.l + shift });
  const card = oklch(surface)!;
  const toText = oklch(text)!.l - card.l;
  const actions = d.mode === "text" ? example("web").colours : d.colours;
  return {
    background,
    surface,
    "primary-text": text,
    "muted-text": mix(text, surface, 0.23),
    accent: actions.accent,
    "text-on-accent": actions.onAccent,
    border: toHex({ ...card, l: card.l + 0.65 * toText }),
    divider: mix(surface, text, 0.16),
  };
}

export const webTextPairs = [
  ["primary-text", "background"],
  ["text-on-accent", "accent"],
] as const;

export function textContrast(foreground: string, background: string) {
  const ratio = contrast(foreground, background);
  return { ratio, grade: ratio >= 7 ? "AAA" : passes(ratio) ? "AA" : "Below AA", lc: calcAPCA(foreground, background) };
}

export function formatLc(lc: number) {
  const rounded = Math.sign(lc) * Math.round(Math.abs(lc));
  return `Lc ${rounded > 0 ? "+" : ""}${rounded}`;
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
  ["Latest activity bar", "accent", "surface", "ui"],
  ["View report text", "accent", "surface", "text"],
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
  const projectsByWeek = [4, 5, 6, 9];
  const projectsThisMonth = projectsByWeek.reduce((total, count) => total + count, 0);
  return `<article id="specimen" data-canvas-role="background" style="${style}" aria-label="Sample website">
    <div class="dashboard-heading"><h3 data-canvas-role="text">Workspace</h3><p data-canvas-role="text">Manage your team and plan.</p></div>
    <div class="dashboard-grid">
      <section class="dashboard-card" aria-label="Dashboard card">
        <h4 data-canvas-role="text">Activity</h4>
        <p class="dashboard-metric">${projectsThisMonth} <span class="dashboard-badge">Active</span></p>
        <p class="dashboard-muted">Projects this month</p>
        <ul class="dashboard-chart" role="list" aria-label="Projects per week">
          ${projectsByWeek.map((count, index) => `<li><span>${count}</span> <span class="dashboard-bar" style="--projects:${count}" aria-hidden="true"></span> <span>Wk ${index + 1}</span></li>`).join("")}
        </ul>
        <div class="dashboard-alert">
          <span class="dashboard-alert-message"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 5v3m0 2v1" stroke="currentColor" stroke-width="2"/></svg>Usage report is ready</span>
          <button type="button" class="dashboard-report" data-canvas-role="accent">View report</button>
        </div>
      </section>
      <section class="dashboard-card" aria-label="Pricing and inputs">
        <h4 data-canvas-role="text">Plans</h4>
        <table><thead><tr><th scope="col">Plan</th><th scope="col">Monthly</th></tr></thead><tbody><tr><th scope="row">Starter</th><td>$12</td></tr><tr><th scope="row">Team</th><td>$24</td></tr></tbody></table>
        <div class="dashboard-form"><label>Email<input type="email" id="sample-email" placeholder="you@example.com" autocomplete="off"></label>
        <button type="button" id="specimen-button" data-canvas-role="accent" aria-label="Tune accent"><span data-canvas-role="onAccent">Try</span></button></div>
      </section>
    </div>
  </article>`;
}
