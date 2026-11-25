import "./style.css";
import {
  ceilingColour, defaultFloor, editable, example, hex, labels, lightingPresets, neutral, rooms, save,
  shareParams, startDesign, type Design, type Lighting, type Pair, type Role, type Room, type Theme, type Tool,
} from "./design.ts";
import { oklab, oklch } from "culori";
import { correction, parseColour, suggestions, toHex } from "./colour.ts";
import { exportTheme, formats, sheet, type ExportFormat } from "./export.ts";
import { icon } from "./icons.ts";
import { room } from "./room.ts";
import { assignmentSelect, chip, escapeText, mountCollection } from "./collection.ts";
import { assignWeb, combinationName, type Assignment, type Combination } from "./wada.ts";
import {
  contrastResults, dashboard, formatLc, resolveWeb, textContrast, tokenLabels, webTextPairs, type Token,
} from "./web-preview.ts";
import { mountSaved } from "./saved.ts";
import { mountPhoto } from "./photo.ts";

const tool = document.body.dataset.tool as Tool;
const preset = document.body.dataset.preset;
const paint = tool === "paint";
const mobileLayout = matchMedia("(max-width: 760px)");
const initial = startDesign(tool, preset);
let d = initial.design;
let role = editable(d)[0];
let undo: { role: Role; value: string; ceilingMode: Design["ceilingMode"] } | null = null;
let selected: { combination: Combination; wall: number; secondary: number; assignments: Assignment[] } | undefined;
const locks = new Set<Role>();
let auditioning = false;
let doorEditorOpen = false;
let toneStart: { input: HTMLInputElement; value: string; ceilingMode: Design["ceilingMode"] } | undefined;
let paletteUndo: { design: Design; role: Role; trigger?: HTMLElement; selected: typeof selected; keepCeiling: boolean; keepDoor: boolean } | null = null;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const editLabel = (r: Role) =>
  r === "wall" && d.mode === "single" ? "Walls &amp; ceiling" : labels[r];

function persist() {
  audition();
  save(tool, d, preset);
  if (location.search) history.replaceState(null, "", location.pathname + location.hash);
}

function applyDesign(design: Design, announcement: string, trigger?: HTMLElement, selection?: typeof selected) {
  const active = document.activeElement === trigger;
  const surfacesChanged = paint && (design.mode !== d.mode || !!selection !== !!selected);
  if (JSON.stringify(design) !== JSON.stringify(d)) {
    const keepCeiling = paint && design.mode === "pair" && design.pair === "feature" &&
      d.mode === "pair" && d.pair === "feature" && design.colours.ceiling === d.colours.ceiling &&
      design.ceilingMode === d.ceilingMode;
    paletteUndo = { design: structuredClone(d), role, trigger, selected, keepCeiling, keepDoor: design.door === d.door };
  }
  d = design;
  selected = selection;
  if (!editable(d).includes(role)) role = editable(d)[0];
  undo = null;
  persist();
  render(active ? trigger?.id : undefined);
  collection.setSelected(selected?.combination.id);
  const keepWebPreviewVisible = !paint && mobileLayout.matches &&
    getComputedStyle(el("preview-card")).position === "sticky";
  if ((surfacesChanged && mobileLayout.matches || keepWebPreviewVisible) && trigger?.closest("#palette-editor"))
    el("palette-editor").scrollIntoView({ block: "nearest" });
  el("status").textContent = announcement;
}

function paletteCeiling(combination?: Combination) {
  return combination?.swatches[2]?.hex.toUpperCase() ?? neutral.ceiling;
}

function combinationDesign(combination: Combination) {
  const { swatches } = combination;
  const mode = paint ? "pair" : swatches.length > 2 || locks.has("accent") || locks.has("onAccent") ? "site" : "text";
  const colours = { ...d.colours };
  let ceilingMode = d.ceilingMode;
  let assignments: Assignment[] = [];
  if (paint) {
    colours.wall = swatches[0].hex.toUpperCase();
    colours[d.pair] = swatches[1].hex.toUpperCase();
    if (!locks.has("ceiling")) {
      if (d.pair === "ceiling") ceilingMode = "auto";
      else if (ceilingMode === "auto") colours.ceiling = paletteCeiling(combination);
    }
  } else {
    assignments = combination.starter === undefined
      ? assignWeb(swatches)
      : editable(example("web", combination.starter)).map((role, index) =>
          ({ role, hex: swatches[index].hex, source: swatches[index] }));
    if (mode === "text") {
      const defaults = example("web").colours;
      assignments.push({ role: "accent", hex: defaults.accent }, { role: "onAccent", hex: defaults.onAccent });
    }
    for (const assignment of assignments) if (!locks.has(assignment.role)) colours[assignment.role] = assignment.hex;
    for (const [fg, bg] of [["text", "background"], ["onAccent", "accent"]] as const) {
      const assignment = assignments.find(({ role }) => role === fg);
      if (assignment && !locks.has(fg) && locks.has(bg)) {
        const source = assignment.source?.hex.toUpperCase() ?? assignment.hex;
        colours[fg] = assignment.hex = correction(source, colours[bg]) ?? source;
      }
    }
  }
  for (const locked of locks) colours[locked] = d.colours[locked];
  return { design: { ...d, mode, colours, ceilingMode }, selection: { combination, wall: 0, secondary: 1, assignments } };
}

function selectCombination(combination: Combination, trigger?: HTMLButtonElement) {
  const { design, selection } = combinationDesign(combination);
  applyDesign(design, combinationName(combination) + " applied.", trigger, selection);
}

function audition(combination?: Combination) {
  if (!combination && !auditioning) return;
  const design = combination ? combinationDesign(combination).design : d;
  auditioning = !!combination;
  if (paint) {
    const picture = el("room");
    if (!picture) return;
    picture.style.setProperty("--wall", design.colours.wall);
    picture.style.setProperty("--ceiling", ceilingColour(design));
    picture.style.setProperty("--feature", design.mode === "pair" && design.pair === "feature" ? design.colours.feature : design.colours.wall);
  } else {
    updateWebPreview(design);
  }
}

function swapRoles(accent = false): [Role, Role] | undefined {
  if (!paint) return accent ? ["accent", "onAccent"] : ["background", "text"];
  if (d.mode === "pair") return ["wall", d.pair];
}

function canSwap(accent = false) {
  return swapRoles(accent)?.every((target) => !locks.has(target)) ?? false;
}

function swap(trigger?: HTMLButtonElement, accent = false) {
  const targets = swapRoles(accent);
  if (!targets || !canSwap(accent)) return;
  const [first, second] = targets;
  const colours = { ...d.colours, [first]: d.colours[second], [second]: d.colours[first] };
  const ceilingMode = second === "ceiling" ? "manual" : d.ceilingMode;
  const selection = paint && selected ? { ...selected, wall: selected.secondary, secondary: selected.wall } : undefined;
  applyDesign({ ...d, colours, ceilingMode }, "Roles swapped.", trigger, selection);
}

function updateWebPreview(design: Design) {
  const specimen = el("specimen");
  for (const [name, value] of Object.entries(resolveWeb(design))) specimen.style.setProperty("--" + name, value);
}

function updatePreview() {
  if (paint) el("picture").innerHTML = room(d);
  else updateWebPreview(d);
}

function modes() {
  const choices = [["text", "Text pair"], ["site", "Site palette"]];
  return `<div class="modes"><div class="segmented" role="group" aria-label="Palette mode">${choices.map(([value, name]) =>
    `<button type="button" id="mode-${value}" data-mode="${value}" aria-pressed="${d.mode === value}">${name}</button>`,
  ).join("")}</div></div>`;
}

function strip() {
  const tokens = paint ? undefined : resolveWeb(d);
  function swatch(r: Role, token?: Token, against?: Token) {
    const current = el("tab-tune").getAttribute("aria-selected") === "true" && role === r;
    const locked = locks.has(r);
    const name = editLabel(r);
    const value = token && tokens ? tokens[token] : d.colours[r];
    const metrics = against && tokens ? textContrast(value, tokens[against]) : undefined;
    return `<div class="active-swatch">
      <button type="button" id="role-${r}" data-role="${r}" class="tile" aria-pressed="${current}" aria-label="Edit ${name} ${value}" ${metrics ? `aria-describedby="metrics-${r}"` : ""}>
        ${chip(value)}<span>${name}</span><code>${value}</code>
        ${metrics ? `<span id="metrics-${r}" class="swatch-metrics"><span class="sr">WCAG 2.2 normal text </span><data value="${metrics.ratio}">${metrics.ratio.toFixed(2)}:1</data> ${metrics.grade}<br> <span>APCA ${formatLc(metrics.lc)}</span></span>` : ""}
      </button>
      <button type="button" id="lock-${r}" data-lock="${r}" class="lock" aria-pressed="${locked}" aria-label="Lock ${labels[r]}" title="${locked ? "Unlock" : "Lock"} ${labels[r]}">${icon(locked ? "lock" : "unlock")}</button>
    </div>`;
  }
  if (paint) {
    if (d.mode === "single") return swatch("wall");
    return `<div class="swatch-pair">
      ${swatch("wall")}
      <button type="button" id="swap-colours" class="outline swap-pair" aria-label="Swap roles" title="Swap Main wall and ${labels[d.pair]} (S)" ${canSwap() ? "" : "disabled"}>⇄</button>
      ${swatch(d.pair)}
    </div>${d.pair === "feature" ? swatch("ceiling") : ""}`;
  }
  const pairs = [
    ["background", "text", "swap-colours"],
    ["accent", "onAccent", "swap-accent"],
  ] as const;
  return pairs.slice(0, d.mode === "site" ? 2 : 1).map(([bg, fg, id], index) => {
    const [textToken, backgroundToken] = webTextPairs[index];
    const label = `Swap ${labels[bg]} and ${labels[fg]}`;
    return `<div class="swatch-pair">
      ${swatch(bg, backgroundToken)}
      <button type="button" id="${id}" class="outline swap-pair" aria-label="${label}" title="${label}${index ? "" : " (S)"}" ${canSwap(index === 1) ? "" : "disabled"}>⇄</button>
      ${swatch(fg, textToken, backgroundToken)}
    </div>`;
  }).join("");
}

function showTab(tab: "explore" | "tune") {
  audition();
  for (const name of ["explore", "tune"] as const) {
    el("tab-" + name).setAttribute("aria-selected", String(name === tab));
    el("tab-" + name).tabIndex = name === tab ? 0 : -1;
    el(name === "explore" ? "library" : "tune").hidden = name !== tab;
  }
  el("role-strip").innerHTML = strip();
}

function setSheet(open: boolean) {
  if (!open) audition();
  el("palette-editor").classList.toggle("collapsed", !open);
  el("sheet-toggle").setAttribute("aria-expanded", String(open));
}

function tune(target: Role) {
  role = target;
  setSheet(true);
  showTab("tune");
  render();
  el("tune").scrollTop = 0;
  el("role-" + role).focus();
}

function warmth(value: string) {
  return Math.round(oklab(value)!.b * 100);
}

function toneControl(id: string, label: string, min: number, max: number, value: number) {
  return `<label><span class="tone-label">${label}<span id="${id}-value" aria-hidden="true"></span></span>
    <input id="${id}" type="range" min="${min}" max="${max}" value="${value}"></label>`;
}

function updateToneReadout(input: HTMLInputElement) {
  const value = input.valueAsNumber;
  const text = input.id === "lightness" ? `${value}%` : `${value > 0 ? "+" : ""}${value}`;
  el(input.id + "-value").textContent = text;
  input.setAttribute("aria-valuetext", text);
}

const apcaSizes = [
  [90, 14, "Preferred body text"],
  [75, 18, "Body text"],
  [60, 24, "Fluent text"],
  [45, 36, "Large text"],
  [30, 0, "Non-content text only"],
  [15, 0, "Certain non-text only"],
] as const;

function apcaDetails(tokens: ReturnType<typeof resolveWeb>) {
  const samples = webTextPairs.slice(0, d.mode === "site" ? 2 : 1).map(([fg, bg]) => {
    const { lc } = textContrast(tokens[fg], tokens[bg]);
    const reference = apcaSizes.find(([level]) => Math.abs(lc) >= level);
    // APCA's integration guidance calls for a 42px sample at Lc 45.
    const size = reference?.[0] === 45 ? 42 : reference?.[1];
    return `<div><p>${tokenLabels[fg]} on ${tokenLabels[bg]} · <code>${formatLc(lc)}</code></p>
      ${size ? `<p class="apca-sample" style="--fg:${tokens[fg]};--bg:${tokens[bg]};--size:${size}px">The quick brown fox</p>` : ""}
      <p>${size ? `<code>${size}px</code> · ` : ""}${reference?.[2] ?? "Below the lowest APCA reference level"}</p></div>`;
  }).join("");
  return `<section class="apca-details" aria-labelledby="apca-title">
    <h3 id="apca-title">APCA contrast</h3>
    <p>Positive Lc means darker text on a lighter background. Negative Lc means lighter text on a darker background. Use the size and weight guidance with the score.</p>
    <table class="contrast-table">
      <caption>APCA reference sizes at normal weight (400)</caption>
      <thead><tr><th scope="col">|Lc|</th><th scope="col">Size</th><th scope="col">Reference use</th></tr></thead>
      <tbody>${apcaSizes.map(([lc, size, note]) => `<tr><th scope="row"><code>${lc}</code></th><td>${size ? `<code>${size}px</code>` : "—"}</td><td>${note}</td></tr>`).join("")}</tbody>
    </table>
    <div class="apca-samples">${samples}</div>
    <p><a href="https://git.apcacontrast.com/documentation/WhyAPCA">Why APCA</a> ·
      <a href="https://git.apcacontrast.com/documentation/minimum_compliance.html">Reference guidance</a> ·
      <a href="https://github.com/Myndex/apca-w3#font-lookup-table">Font size and weight table</a> ·
      <a href="https://github.com/Myndex/SAPC-APCA/discussions">APCA discussion forum</a></p>
  </section>`;
}

function advice() {
  const undoControl = undo?.role === role
    ? `<button type="button" class="text-btn" id="undo">${icon("undo")}Undo</button>` : "";
  if (paint && (role === "ceiling" || role === "feature")) {
    const list = suggestions(d.colours.wall, role, d.colours[role]);
    return `<div class="advice"><div class="subhead"><b>Suggestions</b>${undoControl}</div><div class="choices">${list.map((c) =>
      `<button type="button" data-suggest="${c.value}">${chip(c.value)}${c.name}</button>`,
    ).join("") || "<small>No distinct tones in this direction.</small>"}</div></div>`;
  }
  if (paint) return undoControl;
  const tokens = resolveWeb(d);
  const corrections = d.mode === "site"
    ? [["text", "background", "text"], ["onAccent", "accent", "button text"]] as const
    : [["text", "background", "text"]] as const;
  return `${undoControl}${corrections.map(([fg, bg, name]) => {
    const fix = correction(d.colours[fg], d.colours[bg]);
    return fix && (d.theme === "light" || fg === "onAccent")
      ? `<button type="button" class="outline" id="fix-${fg}" data-fix="${fg}">Adjust ${name}</button>` : "";
  }).join("")}
    <table class="contrast-table">
      <caption>Contrast in the ${d.theme} preview</caption>
      <thead><tr><th scope="col">Pair</th><th scope="col">Ratio</th><th scope="col">AA</th><th scope="col">AAA</th></tr></thead>
      <tbody>${contrastResults(tokens).map(({ label, ratio, aa, aaa }) => `<tr><th scope="row">${label}</th><td>${ratio.toFixed(2)}:1</td><td>${aa ? "Pass" : "Fail"}</td><td>${aaa === null ? "—" : aaa ? "Pass" : "Fail"}</td></tr>`).join("")}</tbody>
    </table>
    <p class="sample">AA / AAA minimums are 4.5:1 / 7:1 for regular text and 3:1 / 4.5:1 for large headings. Graphical elements require 3:1 for AA. Grades use the unrounded ratio. <a href="https://www.w3.org/TR/WCAG22/#contrast-minimum">WCAG 2.2 guidance</a></p>
    ${apcaDetails(tokens)}`;
}

function key() {
  const entries = Object.entries(resolveWeb(d)).map(([name, value]) => [tokenLabels[name as Token], value]);
  return entries.map(([label, value]) => `<span>${chip(value)}${label} <code>${value}</code></span>`).join("");
}

function selectOptions<T extends string>(options: Record<T, string>, current: T) {
  return Object.entries(options).map(([value, name]) =>
    `<option value="${value}" ${value === current ? "selected" : ""}>${name}</option>`,
  ).join("");
}

function radioGroup(name: string, label: string, options: Record<string, string>, current: string) {
  return `<fieldset class="radio-group" id="${name}"><legend>${label}</legend>
    <div class="radio-options">${Object.entries(options).map(([value, caption]) =>
      `<label><input type="radio" name="${name}" id="${name}-${value}" value="${value}" ${value === current ? "checked" : ""}>${caption}</label>`,
    ).join("")}</div></fieldset>`;
}

function paintSwatches() {
  if (!selected || d.mode !== "pair") return "";
  const { combination, wall, secondary } = selected;
  const currentIndex = (index: number, target: Role) =>
    combination.swatches[index].hex.toUpperCase() === d.colours[target] ? index : -1;
  const wallIndex = currentIndex(wall, "wall");
  const secondaryIndex = currentIndex(secondary, d.pair);
  return assignmentSelect("wall", combination, wallIndex, secondaryIndex, d.colours.wall) +
    assignmentSelect(d.pair, combination, secondaryIndex, wallIndex, d.colours[d.pair]);
}

function colourFields(value: string, label: string, prefix = "") {
  const transformed = !paint && d.theme === "dark" && (role === "background" || role === "text");
  return `<label class="field-label" for="${prefix}hex">${transformed ? "Base " : ""}${label} <span>HEX or OKLCH</span></label>
    <div class="field-row"><label class="picker"><input id="${prefix}picker" type="color" value="${value}" aria-label="Pick ${label} colour"></label>
    <input class="hex-field" id="${prefix}hex" spellcheck="false" autocomplete="off" autocapitalize="characters" aria-describedby="${prefix}feedback${transformed ? " base-colour-note" : ""}" value="${value}">
    ${prefix ? "" : `<button type="button" id="copy" class="outline">${icon("copy")}Copy</button>`}</div>
    ${transformed ? '<p id="base-colour-note" class="sample">The dark preview inverts the base colour’s lightness.</p>' : ""}
    <p class="hex-feedback" id="${prefix}feedback" role="status"></p>`;
}

function paintTools() {
  const layout = radioGroup("paint-layout", "Paint layout",
    { single: "One colour", ceiling: "Separate ceiling", feature: "Feature wall" },
    d.mode === "single" ? "single" : d.pair);
  const assignment = selected && d.mode === "pair"
    ? `${selected.combination.swatches.length > 2 ? '<p class="swatch-help">Choose which two palette colours to apply.</p>' : ""}
       <div class="swatch-fields" id="swatch-fields">${paintSwatches()}</div>` : "";
  return `${layout}
      <div class="floor-control"><label>Existing floor <span class="picker"><input id="floor" type="color" value="${d.floor ?? defaultFloor}"></span></label><button type="button" id="reset-floor" class="outline surface-action" ${d.floor ? "" : "disabled"}>Reset floor</button></div>
      ${d.mode === "pair" && d.pair === "feature" ? `<div class="ceiling-control"><span>Ceiling</span><button type="button" id="reset-ceiling" class="outline surface-action" ${locks.has("ceiling") ? "disabled" : ""}>Use palette ceiling</button></div>` : ""}
      <div class="door-control">
        <div class="door-actions"><span><strong>Door</strong> <span id="door-value">${d.door ?? "Same as main wall"}</span></span>
          <button type="button" id="edit-door" class="outline surface-action" aria-controls="door-editor" aria-expanded="${doorEditorOpen}">Edit door colour</button></div>
        <div id="door-editor" ${doorEditorOpen ? "" : "hidden"}>${colourFields(d.door ?? d.colours.wall, "Door", "door-")}</div>
        <button type="button" id="match-door" class="text-btn" ${d.door ? "" : "hidden"}>Match main wall</button>
      </div>
      ${assignment}
      <div id="canvas-notes"></div>`;
}

function webNotes(changed: Assignment[]) {
  if (!changed.length) return "";
  const notes = changed.map(({ role, hex, source }) => {
    const description = source
      ? `Adjusted from <code>${source.hex.toUpperCase()}</code>`
      : "Added";
    return `<li>${labels[role]} <code>${hex}</code> · ${description}</li>`;
  }).join("");
  return `<div class="assignment-notes"><b>Palette assignments${d.theme === "dark" ? " before dark preview" : ""}</b><ul>${notes}</ul></div>`;
}

function updateCanvasNotes() {
  const name = selected ? escapeText(combinationName(selected.combination)) : "";
  const note = selected?.combination.note ? " · " + escapeText(selected.combination.note) : "";
  const activeRoles = editable(d);
  const changed = paint ? [] : selected?.assignments.filter(({ role, hex, source }) =>
    d.colours[role] === hex &&
    (activeRoles.includes(role) || (d.mode === "text" && selected?.combination.swatches.length === 2)) &&
    (!source || source.hex.toUpperCase() !== hex),
  ) ?? [];
  if (!paint) el("assignment-count").textContent = changed.length ? changed.length + " adjusted or added" : "";
  el("canvas-notes").innerHTML = `${name ? `<span><strong>${name}</strong>${note}</span>` : ""}${webNotes(changed)}`;
}

function render(focus?: string) {
  toneStart = undefined;
  const previewControl = paint
    ? `<label>Room<select id="room-choice" aria-label="Room">${selectOptions(rooms, d.room)}</select></label>
       ${radioGroup("lighting", "Lighting", { ...lightingPresets, north: "North daylight", evening: "Warm evening" }, d.lighting)}`
    : `<fieldset id="theme" class="radio-group"><legend class="sr">Theme</legend><div class="segmented radio-options">
        ${[["light", "☀", "Light"], ["dark", "☾", "Dark"]].map(([value, symbol, label]) =>
          `<label><input type="radio" id="theme-${value}" name="theme" value="${value}" ${d.theme === value ? "checked" : ""}><span aria-hidden="true">${symbol}</span> ${label}</label>`,
        ).join("")}
       </div></fieldset>
       <button type="button" class="text-btn" id="show-contrast">Check contrast</button><small id="assignment-count"></small>`;
  el("preview-options").innerHTML = previewControl;
  updatePreview();
  if (paint) el("room-surfaces-fields").innerHTML = paintTools();
  el("role-strip").innerHTML = strip();
  const value = d.colours[role];
  el("palette-fields").innerHTML = `${paint ? "" : modes()}<div class="editing">
      ${colourFields(value, editLabel(role))}
      <div class="tone-controls">
        ${toneControl("lightness", "Lightness", 0, 100, Math.round(oklab(value)!.l * 100))}
        ${toneControl("warmth", "Warmth", -32, 32, warmth(value))}
      </div>
      ${paint ? '<div id="advice"></div>' : ""}
    </div>`;
  updateToneReadout(el("lightness"));
  updateToneReadout(el("warmth"));
  updateCanvasNotes();
  if (!paint) el("key").innerHTML = key();
  el("advice").innerHTML = advice();
  el<HTMLButtonElement>("undo-palette").disabled = !paletteUndo;
  if (focus) el(focus)?.focus({ preventScroll: true });
}

function updateColour(value: string, source: string) {
  document.querySelector(".copy-result")?.remove();
  const ceilingMode = role === "ceiling" ? "manual" : d.ceilingMode;
  if (value !== d.colours[role] || ceilingMode !== d.ceilingMode) {
    const start = toneStart?.input.id === source ? toneStart : undefined;
    undo = { role, value: start?.value ?? d.colours[role], ceilingMode: start?.ceilingMode ?? d.ceilingMode };
    d.colours[role] = value;
    d.ceilingMode = ceilingMode;
    persist();
  }
  updatePreview();
  if (!paint) el("key").innerHTML = key();
  else if (role === "wall" && !d.door) {
    el<HTMLInputElement>("door-picker").value = value;
    el<HTMLInputElement>("door-hex").value = value;
    colourFeedback(el("door-hex"));
  }
  el("role-strip").innerHTML = strip();
  el("advice").innerHTML = advice();
  const swatches = document.getElementById("swatch-fields");
  if (swatches) swatches.innerHTML = paintSwatches();
  updateCanvasNotes();
  el<HTMLInputElement>("picker").value = value;
  if (source !== "hex") el<HTMLInputElement>("hex").value = value;
  if (source !== "lightness") el<HTMLInputElement>("lightness").value = String(Math.round(oklab(value)!.l * 100));
  if (source !== "warmth") el<HTMLInputElement>("warmth").value = String(warmth(value));
  updateToneReadout(el("lightness"));
  updateToneReadout(el("warmth"));
  colourFeedback(el("hex"));
}

function updateFloor(value: string) {
  d.floor = value === defaultFloor ? undefined : value;
  el("room").style.setProperty("--floor", value);
  el<HTMLButtonElement>("reset-floor").disabled = !d.floor;
  persist();
}

function setRoomSurfaces(open: boolean) {
  el("room-surfaces-toggle").setAttribute("aria-expanded", String(open));
}

function setDoorEditor(open: boolean) {
  audition();
  doorEditorOpen = open;
  el("edit-door").setAttribute("aria-expanded", String(open));
  el("door-editor").hidden = !open;
  const target = el(open ? "door-hex" : "edit-door");
  target.scrollIntoView({ block: "nearest" });
  target.focus({ preventScroll: true });
}

function updateDoor(value: string | undefined, source?: string) {
  d.door = value;
  const style = el("room").style;
  if (value) style.setProperty("--door", value);
  else style.removeProperty("--door");
  const colour = value ?? d.colours.wall;
  el<HTMLInputElement>("door-picker").value = colour;
  const field = el<HTMLInputElement>("door-hex");
  if (source !== field.id) field.value = colour;
  colourFeedback(field);
  el("door-value").textContent = value ?? "Same as main wall";
  el("match-door").hidden = !value;
  persist();
}

function colourFeedback(input: HTMLElement, message = "") {
  const feedback = el(input.id === "door-hex" ? "door-feedback" : "feedback");
  feedback.textContent = message;
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
  return feedback;
}

function validate(input: HTMLInputElement, reveal = false) {
  const value = parseColour(input.value);
  if (value) {
    input.value = value;
    return;
  }
  const feedback = colourFeedback(input, "Enter six HEX digits or an opaque OKLCH colour, for example oklch(60% 0.1 280).");
  if (reveal) feedback.scrollIntoView({ block: "center" });
}

async function copy(value: string, button: HTMLElement, message: string) {
  document.querySelector(".copy-result")?.remove();
  const result = document.createElement("div");
  result.className = "copy-result";
  if (button.id === "share") el("share-result").append(result);
  else button.closest(".field-row, .export-actions")!.after(result);
  try {
    await navigator.clipboard.writeText(value);
    result.setAttribute("role", "status");
    result.textContent = message;
  } catch {
    const label = document.createElement("label");
    label.textContent = "Select and copy manually";
    const output = document.createElement("textarea");
    output.readOnly = true;
    output.value = value;
    label.append(output);
    result.append(label);
    output.focus();
    output.select();
  }
}

function exportFile(value: string, format: ExportFormat) {
  const json = format === "figma";
  const url = URL.createObjectURL(new Blob([value], { type: json ? "application/json" : "text/css" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `tintfolio-${d.theme}.${json ? "json" : "css"}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

el("studio").setAttribute("role", "region");
el("studio").setAttribute("aria-label", "Colour workspace");
el("studio").setAttribute("aria-keyshortcuts", "Space S ArrowLeft ArrowRight");
el("studio").tabIndex = 0;
el("studio").innerHTML = `
  <div class="canvas-stack">
    <section id="preview-card" class="preview-card" aria-labelledby="preview-title">
      <div class="preview-head"><div class="section-heading">${icon(paint ? "room" : "web")}<h2 id="preview-title">${paint ? "Room preview" : "Website preview"}</h2></div>
        <div id="preview-options" class="preview-options"></div></div>
      <div id="picture"${paint ? "" : ' tabindex="0" role="region" aria-label="Sample website preview"'}>${paint ? "" : dashboard()}</div>
      ${paint ? "" : '<p class="preview-scroll-hint">Scroll for calendar and form</p>'}
    </section>
    ${paint ? `<section id="canvas-options" aria-labelledby="room-surfaces-title">
      <div class="canvas-heading"><h3 id="room-surfaces-title"><span>Room surfaces</span>
        <button type="button" id="room-surfaces-toggle" aria-expanded="false" aria-controls="room-surfaces-fields">Room surfaces${icon("chevron")}</button>
      </h3><small>Approximate lighting</small></div>
      <div id="room-surfaces-fields" class="canvas-fields"></div>
    </section>` : ""}
  </div>
  <div class="palette-slot">
  <section id="palette-editor" aria-labelledby="palette-title">
    <div class="palette-head">
      <h2 id="palette-title">Palette editor</h2>
      <div class="palette-actions">
        <button type="button" id="undo-palette" class="text-btn" aria-label="Undo palette" disabled>Undo</button>
        <button type="button" id="sheet-toggle" class="text-btn" aria-label="Toggle palette sheet" aria-expanded="true" aria-controls="palette-body">${icon("chevron")}</button>
      </div>
    </div>
    <div id="palette-body">
      <div class="palette-nav">
        <div class="segmented" role="tablist" aria-label="Palette tools">
          <button type="button" id="tab-explore" role="tab" aria-selected="true" aria-controls="library">Explore</button>
          <button type="button" id="tab-tune" role="tab" aria-selected="false" aria-controls="tune" tabindex="-1">Tune</button>
        </div>
      </div>
      <div id="library" class="library palette-scroll" role="tabpanel" aria-labelledby="tab-explore"></div>
      <div id="tune" class="palette-scroll" role="tabpanel" aria-labelledby="tab-tune" hidden>
        <div id="palette-fields"></div>
        ${paint ? "" : '<div id="contrast-details"><div id="canvas-notes"></div><div id="key"></div><div id="advice"></div></div>'}
      </div>
    </div>
    <div id="role-strip" role="group" aria-label="Active swatches"></div>
  </section></div>`;
el("studio").insertAdjacentHTML("afterend", '<p class="sr" id="status" role="status"></p>');
const collection = mountCollection(el("library"), tool, mobileLayout, selectCombination, audition);
const openSaved = mountSaved(tool, () => d, (design) => {
  applyDesign(design, "Saved design restored.", el("saved-open"));
});
const openPhoto = paint ? mountPhoto(() => d) : undefined;
document.body.insertAdjacentHTML("beforeend", paint
  ? `<dialog id="spec-sheet" class="sheet-dialog" aria-labelledby="sheet-title">
    <div id="sheet-content"></div><div class="dialog-actions">
    <button type="button" class="solid" id="print-sheet">Print or save as PDF</button>
    <form method="dialog"><button class="outline">Close</button></form></div></dialog>`
  : `<dialog id="theme-export" class="sheet-dialog" aria-labelledby="export-title">
    <div class="dialog-head"><h2 id="export-title">Export theme</h2>
    <form method="dialog"><button class="outline">Close</button></form></div>
    <p id="export-mode"></p>
    <label>Format <select id="format">${selectOptions(formats, "hex")}</select></label>
    <label class="export-code">Output<textarea id="theme-code" spellcheck="false" readonly rows="9"></textarea></label>
    <div class="export-actions"><button type="button" id="copy-theme" class="outline">Copy</button>
    <button type="button" id="download-theme" class="solid">Download</button></div></dialog>`);
const dialogOpeners = { saved: "saved-open", ...(paint
  ? { "spec-sheet": "sheet-open", photo: "photo-open" }
  : { "theme-export": "export-open" }) };
const more = paint ? el<HTMLButtonElement>("paint-more") : null;
for (const [dialog, opener] of Object.entries(dialogOpeners)) {
  el(dialog).addEventListener("close", () => {
    const action = el(opener);
    (action.checkVisibility() ? action : more)?.focus();
  });
}

if (more) {
  const open = () => more.getAttribute("aria-expanded") === "true";
  const setOpen = (expanded: boolean) => more.setAttribute("aria-expanded", String(expanded));
  more.addEventListener("click", () => setOpen(!open()));
  document.addEventListener("click", (event) => {
    if (open() && !(event.target as Element).closest(".paint-actions")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !open()) return;
    event.preventDefault();
    setOpen(false);
    more.focus();
  });
  el("paint-extra-actions").addEventListener("click", () => {
    if (!open()) return;
    setOpen(false);
    more.focus();
  });
  mobileLayout.addEventListener("change", () => setOpen(false));
}

function updateExport() {
  el<HTMLTextAreaElement>("theme-code").value = exportTheme(resolveWeb(d), el<HTMLSelectElement>("format").value as ExportFormat);
}

document.addEventListener("click", (event) => {
  const button = (event.target as Element).closest("button");
  if (!button) return;
  const id = button.id;
  if (id === "undo-palette" && paletteUndo) {
    const previous = paletteUndo;
    const surfacesChanged = paint && (previous.design.mode !== d.mode || !!previous.selected !== !!selected);
    if (previous.keepCeiling && d.mode === "pair" && d.pair === "feature") {
      previous.design.colours.ceiling = d.colours.ceiling;
      previous.design.ceilingMode = d.ceilingMode;
    }
    if (previous.keepDoor) previous.design.door = d.door;
    d = previous.design;
    role = previous.role;
    selected = previous.selected;
    undo = null;
    paletteUndo = null;
    persist();
    render();
    collection.setSelected(selected?.combination.id);
    const trigger = previous.trigger;
    const target = (trigger?.isConnected ? trigger
      : trigger?.id ? document.getElementById(trigger.id)
      : trigger?.dataset.combination
        ? document.querySelector<HTMLElement>(`[data-combination="${CSS.escape(trigger.dataset.combination)}"]`)
        : null) ?? el("wada-search");
    const fallback = el("palette-editor").classList.contains("collapsed") && el("sheet-toggle").checkVisibility()
      ? el("sheet-toggle") : el("palette-editor").querySelector<HTMLElement>('[aria-selected="true"]')!;
    if (surfacesChanged && mobileLayout.matches) el("palette-editor").scrollIntoView({ block: "nearest" });
    if (target.closest(".swatch-pair")) target.scrollIntoView({ block: "nearest" });
    (target.checkVisibility() ? target : fallback).focus({ preventScroll: true });
    el("status").textContent = "Previous palette restored.";
  } else if (button.dataset.mode) {
    d.mode = button.dataset.mode;
    if (!editable(d).includes(role)) role = editable(d)[0];
    undo = null;
    persist();
    render(id);
  } else if (button.dataset.role) {
    tune(button.dataset.role as Role);
  } else if (button.dataset.lock) {
    const target = button.dataset.lock as Role;
    if (locks.has(target)) locks.delete(target);
    else locks.add(target);
    audition();
    el("role-strip").innerHTML = strip();
    const reset = el<HTMLButtonElement>("reset-ceiling");
    if (reset) reset.disabled = locks.has("ceiling");
    el(id).focus({ preventScroll: true });
  } else if (id === "tab-explore" || id === "tab-tune") {
    showTab(id === "tab-explore" ? "explore" : "tune");
  } else if (id === "sheet-toggle") {
    const open = button.getAttribute("aria-expanded") !== "true";
    setSheet(open);
    if (!open) el("palette-editor").scrollIntoView({ block: "nearest" });
  } else if (id === "swap-colours" || id === "swap-accent") {
    swap(button, id === "swap-accent");
  } else if (button.dataset.suggest) {
    updateColour(button.dataset.suggest, id);
    el("undo")?.focus({ preventScroll: true });
    el("status").textContent = labels[role] + " updated.";
  } else if (button.dataset.fix) {
    role = button.dataset.fix as Role;
    const bg = role === "text" ? "background" : "accent";
    const fix = correction(d.colours[role], d.colours[bg]);
    if (fix) {
      updateColour(fix, id);
      render("undo");
      el("status").textContent = labels[role] + " adjusted.";
    }
  } else if (id === "undo" && undo) {
    role = undo.role;
    d.colours[role] = undo.value;
    d.ceilingMode = undo.ceilingMode;
    undo = null;
    persist();
    render();
    el("role-" + role).focus();
    el("status").textContent = labels[role] + " restored.";
  } else if (id === "reset-ceiling" && !locks.has("ceiling")) {
    const ceiling = paletteCeiling(selected?.combination);
    if (d.ceilingMode === "auto" && d.colours.ceiling === ceiling) return;
    const colours = { ...d.colours, ceiling };
    applyDesign({ ...d, colours, ceilingMode: "auto" }, "Automatic ceiling restored.", button, selected);
  } else if (id === "reset-floor") {
    el<HTMLInputElement>("floor").value = defaultFloor;
    updateFloor(defaultFloor);
    el("floor").focus();
  } else if (id === "room-surfaces-toggle") {
    setRoomSurfaces(button.getAttribute("aria-expanded") !== "true");
  } else if (id === "edit-door") {
    setDoorEditor(!doorEditorOpen);
  } else if (id === "match-door") {
    setDoorEditor(false);
    updateDoor(undefined);
  } else if (id === "copy") void copy(d.colours[role], button, "HEX copied.");
  else if (id === "share") {
    audition();
    const url = new URL(location.pathname, location.origin);
    url.search = shareParams(tool, d).toString();
    void copy(url.href, button, "Design link copied.");
  } else if (id === "saved-open") {
    audition();
    openSaved();
  } else if (id === "photo-open") {
    audition();
    openPhoto?.();
  } else if (id === "sheet-open") {
    audition();
    el("sheet-content").innerHTML = sheet(d);
    el<HTMLDialogElement>("spec-sheet").showModal();
  } else if (id === "print-sheet") window.print();
  else if (id === "export-open") {
    audition();
    el("export-mode").textContent = d.theme === "dark" ? "Dark preview colours" : "Light preview colours";
    updateExport();
    el<HTMLDialogElement>("theme-export").showModal();
  } else if (id === "copy-theme" || id === "download-theme") {
    const value = el<HTMLTextAreaElement>("theme-code").value;
    if (id === "copy-theme") void copy(value, button, "Theme copied.");
    else exportFile(value, el<HTMLSelectElement>("format").value as ExportFormat);
  }
});

document.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement | HTMLSelectElement;
  if (input.id === "format") { updateExport(); return; }
  if (input.id === "room-choice") d.room = input.value as Room;
  else if (input.name === "lighting") d.lighting = input.value as Lighting;
  else if (input.name === "theme") d.theme = input.value as Theme;
  else if (input.name === "paint-layout") {
    d.mode = input.value === "single" ? "single" : "pair";
    if (d.mode === "single") role = "wall";
    else {
      const pair = input.value as Pair;
      if (pair !== d.pair && d.ceilingMode === "auto" && !locks.has("ceiling")) {
        if (pair === "feature") d.colours.ceiling = paletteCeiling(selected?.combination);
        else if (selected) d.colours.ceiling = selected.combination.swatches[selected.secondary].hex.toUpperCase();
      }
      d.pair = pair;
      role = d.pair;
    }
    undo = null;
  } else if (input.dataset.swatchRole && selected) {
    const target = input.dataset.swatchRole as Role;
    const index = Number(input.value);
    selected = { ...selected, [target === "wall" ? "wall" : "secondary"]: index };
    d.colours[target] = selected.combination.swatches[index].hex.toUpperCase();
    if (target === "ceiling") d.ceilingMode = "manual";
    undo = null;
  } else return;
  persist();
  render(input.id);
});

document.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === "floor") {
    const value = hex(input.value);
    if (value) updateFloor(value);
  } else if (input.matches(".hex-field, #picker, #door-picker")) {
    const value = parseColour(input.value);
    if (!value) {
      if (input.matches(".hex-field")) colourFeedback(input);
    }
    else if (input.id.startsWith("door-")) updateDoor(value, input.id);
    else updateColour(value, input.id);
  } else if (input.id === "lightness" || input.id === "warmth") {
    if (toneStart?.input !== input) toneStart = { input, value: d.colours[role], ceilingMode: d.ceilingMode };
    const base = oklab(toneStart.value)!;
    if (input.id === "lightness") base.l = input.valueAsNumber / 100;
    else base.b = input.valueAsNumber / 100;
    updateColour(toHex(oklch(base)!), input.id);
  }
});
document.addEventListener("focusout", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.matches(".hex-field")) validate(input);
  if (toneStart && event.target === toneStart.input) {
    const { input } = toneStart;
    const value = d.colours[role];
    input.value = String(input.id === "warmth" ? warmth(value) : Math.round(oklab(value)!.l * 100));
    updateToneReadout(input);
    toneStart = undefined;
  }
});
document.addEventListener("keydown", (event) => {
  const input = event.target as HTMLInputElement;
  if (event.key === "Enter" && input.matches(".hex-field")) validate(input, true);
});
el("studio").addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.defaultPrevented) return;
  if (target.getAttribute("role") === "tab" && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const tab = event.key === "Home" ? "explore" : event.key === "End" ? "tune"
      : target.id === "tab-explore" ? "tune" : "explore";
    showTab(tab);
    el("tab-" + tab).focus();
    return;
  }
  if (target.closest("input, select, textarea, button, summary, a, dialog, #picture, [contenteditable]")) return;
  const key = event.key.toLowerCase();
  if (![" ", "s", "arrowleft", "arrowright"].includes(key)) return;
  event.preventDefault();
  if (key === " ") collection.randomize();
  else if (key === "s") swap();
  else collection.cycle(key === "arrowright" ? 1 : -1);
});

el("preview-card").addEventListener("click", (event) => {
  const target = event.target as Element;
  if (target.id === "show-contrast") {
    setSheet(true);
    showTab("tune");
    el("contrast-details").scrollIntoView({ block: "nearest" });
    el("tab-tune").focus({ preventScroll: true });
    return;
  }
  if (target.closest("input, label, select, summary")) return;
  const surface = target.closest<SVGElement>("[data-surface]")?.dataset.surface;
  if (mobileLayout.matches && (surface === "door" || surface === "floor")) setRoomSurfaces(true);
  if (surface === "door") {
    setDoorEditor(true);
    return;
  }
  if (surface === "floor") {
    const floor = el("floor");
    floor.scrollIntoView({ block: "nearest" });
    floor.focus({ preventScroll: true });
    return;
  }
  let picked = target.closest<HTMLElement>("[data-canvas-role]")?.dataset.canvasRole as Role | undefined;
  if (surface === "wall" || surface === "feature") picked = d.mode === "pair" && d.pair === surface ? surface : "wall";
  if (surface === "ceiling") picked = d.mode === "single" ? "wall" : "ceiling";
  if (!picked) return;
  if (!paint && (picked === "accent" || picked === "onAccent") && d.mode === "text") {
    d.mode = "site";
    persist();
  }
  tune(picked);
});

if (initial.notice) {
  el("notice").hidden = false;
  el("notice").textContent = initial.notice;
}
save(tool, d, preset);
render();
const workspace = el("studio");
const layout = new ResizeObserver(() => {
  workspace.style.setProperty("--workspace-top", `${Math.ceil(workspace.getBoundingClientRect().top + window.scrollY)}px`);
  workspace.style.setProperty("--preview-height", `${Math.ceil(el("preview-card").getBoundingClientRect().height)}px`);
});
for (const selector of ["header", ".intro", "#share-result", "#notice", "#preview-card"]) {
  const element = document.querySelector(selector);
  if (element) layout.observe(element);
}
