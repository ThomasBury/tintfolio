import "./style.css";
import {
  ceilingColour, defaultFloor, editable, example, hex, labels, lightingPresets, rooms, save,
  shareParams, startDesign, type Design, type Lighting, type Pair, type Role, type Room, type Theme, type Tool,
} from "./design.ts";
import { oklab, oklch } from "culori";
import { correction, suggestions, toHex } from "./colour.ts";
import { exportTheme, formats, sheet, type ExportFormat } from "./export.ts";
import { icon } from "./icons.ts";
import { room } from "./room.ts";
import { assignmentSelect, chip, combinationName, escapeText, mountCollection } from "./collection.ts";
import { assignWeb, type Assignment, type Combination } from "./wada.ts";
import { contrastResults, dashboard, resolveWeb, tokenLabels, type Token } from "./web-preview.ts";
import { mountSaved } from "./saved.ts";
import { mountPhoto } from "./photo.ts";

const tool = document.body.dataset.tool as Tool;
const preset = document.body.dataset.preset;
const paint = tool === "paint";
const mobileLayout = matchMedia("(max-width: 760px)");
const initial = startDesign(tool, preset);
let d = initial.design;
let role = editable(d)[0];
let undo: { role: Role; value: string } | null = null;
let selected: { combination: Combination; wall: number; secondary: number; assignments: Assignment[] } | undefined;
const locks = new Set<Role>();
let auditioning = false;
let toneStart: { input: HTMLInputElement; value: string } | undefined;
let paletteUndo: { design: Design; role: Role; trigger?: HTMLElement; selected: typeof selected } | null = null;
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
  if (JSON.stringify(design) !== JSON.stringify(d))
    paletteUndo = { design: structuredClone(d), role, trigger, selected };
  d = design;
  selected = selection;
  if (!editable(d).includes(role)) role = editable(d)[0];
  undo = null;
  persist();
  render(active ? trigger?.id : undefined);
  collection.setSelected(selected?.combination.id);
  if (surfacesChanged && mobileLayout.matches && trigger?.closest("#palette-editor"))
    el("palette-editor").scrollIntoView({ block: "nearest" });
  el("status").textContent = announcement;
}

function combinationDesign(combination: Combination) {
  const { swatches } = combination;
  const mode = paint ? "pair" : swatches.length > 2 || locks.has("accent") || locks.has("onAccent") ? "site" : "text";
  const colours = { ...d.colours };
  let assignments: Assignment[] = [];
  if (paint) {
    colours.wall = swatches[0].hex.toUpperCase();
    colours[d.pair] = swatches[1].hex.toUpperCase();
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
  return { design: { ...d, mode, colours }, selection: { combination, wall: 0, secondary: 1, assignments } };
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
    const picture = el("specimen");
    if (!picture) return;
    for (const [name, value] of Object.entries(resolveWeb(design))) picture.style.setProperty("--" + name, value);
  }
}

function swapRoles(): [Role, Role] | undefined {
  if (!paint) return ["background", "text"];
  if (d.mode === "pair") return ["wall", d.pair];
}

function canSwap() {
  return swapRoles()?.every((target) => !locks.has(target)) ?? false;
}

function swap(trigger?: HTMLButtonElement) {
  const targets = swapRoles();
  if (!targets || !canSwap()) return;
  const [first, second] = targets;
  const colours = { ...d.colours, [first]: d.colours[second], [second]: d.colours[first] };
  const selection = paint && selected ? { ...selected, wall: selected.secondary, secondary: selected.wall } : undefined;
  applyDesign({ ...d, colours }, "Roles swapped.", trigger, selection);
}

function preview() {
  return paint ? room(d) : dashboard(resolveWeb(d));
}

function modes() {
  const choices = paint
    ? [["single", "Single colour"], ["pair", "Colour pair"]]
    : [["text", "Text pair"], ["site", "Site palette"]];
  return `<div class="modes"><div class="segmented" role="group" aria-label="Palette mode">${choices.map(([value, name]) =>
    `<button type="button" id="mode-${value}" data-mode="${value}" aria-pressed="${d.mode === value}">${name}</button>`,
  ).join("")}</div></div>`;
}

function strip() {
  return editable(d).map((r) => {
    const current = el("tab-tune").getAttribute("aria-selected") === "true" && role === r;
    const locked = locks.has(r);
    return `<div class="active-swatch">
      <button type="button" id="role-${r}" data-role="${r}" class="tile" aria-pressed="${current}" aria-label="Tune ${editLabel(r)}" title="${editLabel(r)} ${d.colours[r]}">${chip(d.colours[r])}<span>${editLabel(r)}</span></button>
      <button type="button" id="lock-${r}" data-lock="${r}" class="lock" aria-pressed="${locked}" aria-label="Lock ${labels[r]}" title="${locked ? "Unlock" : "Lock"} ${labels[r]}">${icon(locked ? "lock" : "unlock")}</button>
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
    <p class="sample">AA / AAA minimums are 4.5:1 / 7:1 for regular text and 3:1 / 4.5:1 for large headings. Graphical elements require 3:1 for AA.</p>`;
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

function paintTools() {
  return `<div class="canvas-heading"><h3 id="room-surfaces-title">Room surfaces</h3><small>Approximate lighting</small></div>
    <div class="canvas-fields">
      <div class="floor-control"><label>Existing floor <span class="picker"><input id="floor" type="color" value="${d.floor ?? defaultFloor}"></span></label><button type="button" id="reset-floor" class="outline" ${d.floor ? "" : "disabled"}>Reset floor</button></div>
      ${d.mode === "pair" ? `<label>Surfaces<select id="pair" aria-label="Surfaces">${selectOptions({ ceiling: "Wall + ceiling", feature: "Main wall + feature wall" }, d.pair)}</select></label>` : ""}
      ${selected && d.mode === "pair" ? `<div class="swatch-fields" id="swatch-fields">${paintSwatches()}</div>` : ""}
      <div id="canvas-notes"></div>
    </div>`;
}

function webNotes(changed: Assignment[]) {
  if (!changed.length) return "";
  const notes = changed.map(({ role, hex, source }) => {
    const description = source
      ? `Adjusted from ${escapeText(source.name)} <code>${source.hex.toUpperCase()}</code>`
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
       <label>Lighting<select id="lighting" aria-label="Lighting">${selectOptions(lightingPresets, d.lighting)}</select></label>`
    : `<label>Theme<select id="theme" aria-label="Theme">${selectOptions({ light: "Light", dark: "Dark" }, d.theme)}</select></label>
       <button type="button" class="text-btn" id="show-contrast">Check contrast</button><small id="assignment-count"></small>`;
  el("preview-card").innerHTML = `
    <div class="preview-head"><div class="section-heading">${icon(paint ? "room" : "web")}<h2 id="preview-title">${paint ? "Room preview" : "Website preview"}</h2></div>
      <div class="preview-options">${previewControl}</div></div>
    <div id="picture">${preview()}</div>`;
  if (paint) el("canvas-options").innerHTML = paintTools();
  el("role-strip").innerHTML = strip();
  const value = d.colours[role];
  el("palette-fields").innerHTML = `${modes()}<div class="editing">
      <label class="field-label" for="hex">${editLabel(role)} <span>HEX</span></label>
      <div class="field-row"><label class="picker"><input id="picker" type="color" value="${value}" aria-label="Pick ${editLabel(role)} colour"></label>
      <input id="hex" spellcheck="false" autocomplete="off" autocapitalize="characters" aria-describedby="feedback" value="${value}"><button type="button" id="copy" class="outline">${icon("copy")}Copy</button></div>
      <p id="feedback" role="status"></p>
      <div class="tone-controls">
        <label>Lightness<input id="lightness" type="range" min="0" max="100" value="${Math.round(oklab(value)!.l * 100)}"></label>
        <label>Warmth<input id="warmth" type="range" min="-32" max="32" value="${warmth(value)}"></label>
      </div>
      ${paint ? '<div id="advice"></div>' : ""}
    </div>`;
  updateCanvasNotes();
  if (!paint) el("key").innerHTML = key();
  el("advice").innerHTML = advice();
  el<HTMLButtonElement>("undo-palette").disabled = !paletteUndo;
  el<HTMLButtonElement>("swap-colours").disabled = !canSwap();
  if (focus) el(focus)?.focus({ preventScroll: true });
}

function updateColour(value: string, source: string) {
  document.querySelector(".copy-result")?.remove();
  if (value !== d.colours[role]) {
    undo = { role, value: toneStart?.input.id === source ? toneStart.value : d.colours[role] };
    d.colours[role] = value;
    persist();
  }
  el("picture").innerHTML = preview();
  if (!paint) el("key").innerHTML = key();
  el("role-strip").innerHTML = strip();
  el("advice").innerHTML = advice();
  const swatches = document.getElementById("swatch-fields");
  if (swatches) swatches.innerHTML = paintSwatches();
  updateCanvasNotes();
  el<HTMLInputElement>("picker").value = value;
  if (source !== "hex") el<HTMLInputElement>("hex").value = value;
  if (source !== "lightness") el<HTMLInputElement>("lightness").value = String(Math.round(oklab(value)!.l * 100));
  if (source !== "warmth") el<HTMLInputElement>("warmth").value = String(warmth(value));
  el("feedback").textContent = "";
  el("hex").removeAttribute("aria-invalid");
}

function updateFloor(value: string) {
  d.floor = value === defaultFloor ? undefined : value;
  el("room").style.setProperty("--floor", value);
  el<HTMLButtonElement>("reset-floor").disabled = !d.floor;
  persist();
}

function validate(reveal = false) {
  if (hex(el<HTMLInputElement>("hex").value)) return;
  el("feedback").textContent = "Enter six HEX digits, for example #A9B39E.";
  el("hex").setAttribute("aria-invalid", "true");
  if (reveal) el("feedback").scrollIntoView({ block: "center" });
}

async function copy(value: string, button: HTMLElement, message: string) {
  document.querySelector(".copy-result")?.remove();
  const result = document.createElement("div");
  result.className = "copy-result";
  const area = button.closest(".field-row, .actions, .export-actions")!;
  if (area.classList.contains("actions")) area.append(result);
  else area.after(result);
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
    <section id="preview-card" class="preview-card" aria-labelledby="preview-title"></section>
    ${paint ? '<section id="canvas-options" aria-labelledby="room-surfaces-title"></section>' : ""}
    <div class="actions">
      <button type="button" id="saved-open" class="outline" aria-haspopup="dialog">Saved swatches</button>
      <button type="button" id="share" class="outline">${icon("share")}Share</button>
      ${paint ? '<button type="button" id="sheet-open" class="outline" aria-haspopup="dialog">Paint spec sheet</button><button type="button" id="photo-open" class="outline" aria-haspopup="dialog">Tint a photo</button>' : '<button type="button" id="export-open" class="outline" aria-haspopup="dialog">Export theme</button>'}
    </div>
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
        <button type="button" id="swap-colours" class="outline" title="Swap roles (S)">Swap roles</button>
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
const collection = mountCollection(el("library"), tool, selectCombination, audition);
const openSaved = mountSaved(tool, () => d, (design) => {
  applyDesign(design, "Saved design restored.", el("saved-open"));
  el("saved-open").focus();
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
    d = previous.design;
    role = previous.role;
    selected = previous.selected;
    undo = null;
    paletteUndo = null;
    persist();
    render();
    collection.setSelected(selected?.combination.id);
    const target = previous.trigger?.isConnected ? previous.trigger
      : previous.trigger?.dataset.combination
        ? document.querySelector<HTMLElement>(`[data-combination="${CSS.escape(previous.trigger.dataset.combination)}"]`) ?? el("wada-search")
        : el("wada-search");
    const fallback = el("palette-editor").classList.contains("collapsed") && el("sheet-toggle").checkVisibility()
      ? el("sheet-toggle") : el("palette-editor").querySelector<HTMLElement>('[aria-selected="true"]')!;
    if (surfacesChanged && mobileLayout.matches) el("palette-editor").scrollIntoView({ block: "nearest" });
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
    el("role-strip").innerHTML = strip();
    el<HTMLButtonElement>("swap-colours").disabled = !canSwap();
    el(id).focus({ preventScroll: true });
  } else if (id === "tab-explore" || id === "tab-tune") {
    showTab(id === "tab-explore" ? "explore" : "tune");
  } else if (id === "sheet-toggle") {
    setSheet(button.getAttribute("aria-expanded") !== "true");
  } else if (id === "swap-colours") {
    swap(button);
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
    undo = null;
    persist();
    render();
    el("role-" + role).focus();
    el("status").textContent = labels[role] + " restored.";
  } else if (id === "reset-floor") {
    el<HTMLInputElement>("floor").value = defaultFloor;
    updateFloor(defaultFloor);
    el("floor").focus();
  } else if (id === "copy") void copy(d.colours[role], button, "HEX copied.");
  else if (id === "share") {
    const url = new URL(location.pathname, location.origin);
    url.search = shareParams(tool, d).toString();
    void copy(url.href, button, "Design link copied.");
  } else if (id === "saved-open") openSaved();
  else if (id === "photo-open") openPhoto?.();
  else if (id === "sheet-open") {
    el("sheet-content").innerHTML = sheet(d);
    el<HTMLDialogElement>("spec-sheet").showModal();
  } else if (id === "print-sheet") window.print();
  else if (id === "export-open") {
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
  const input = event.target as HTMLSelectElement;
  if (input.id === "format") { updateExport(); return; }
  if (input.id === "room-choice") d.room = input.value as Room;
  else if (input.id === "lighting") d.lighting = input.value as Lighting;
  else if (input.id === "theme") d.theme = input.value as Theme;
  else if (input.id === "pair") {
    d.pair = input.value as Pair;
    if (selected) d.colours[d.pair] = selected.combination.swatches[selected.secondary].hex.toUpperCase();
    role = d.pair;
    undo = null;
  } else if (input.dataset.swatchRole && selected) {
    const target = input.dataset.swatchRole as Role;
    const index = Number(input.value);
    selected = { ...selected, [target === "wall" ? "wall" : "secondary"]: index };
    d.colours[target] = selected.combination.swatches[index].hex.toUpperCase();
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
  } else if (input.id === "hex" || input.id === "picker") {
    const value = hex(input.value);
    if (value) updateColour(value, input.id);
    else {
      el("feedback").textContent = "";
      input.removeAttribute("aria-invalid");
    }
  } else if (input.id === "lightness" || input.id === "warmth") {
    if (toneStart?.input !== input) toneStart = { input, value: d.colours[role] };
    const base = oklab(toneStart.value)!;
    if (input.id === "lightness") base.l = input.valueAsNumber / 100;
    else base.b = input.valueAsNumber / 100;
    updateColour(toHex(oklch(base)!), input.id);
  }
});
document.addEventListener("focusout", (event) => {
  if ((event.target as Element).id === "hex") validate();
  if (toneStart && event.target === toneStart.input) {
    const { input } = toneStart;
    const value = d.colours[role];
    input.value = String(input.id === "warmth" ? warmth(value) : Math.round(oklab(value)!.l * 100));
    toneStart = undefined;
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.target as Element).id === "hex" && event.key === "Enter") validate(true);
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
  if (target.closest("input, select, textarea, button, summary, a, dialog, [contenteditable]")) return;
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
  if (surface === "floor") {
    const floor = el("floor");
    floor.scrollIntoView({ block: "nearest" });
    floor.focus({ preventScroll: true });
    return;
  }
  let picked = target.closest<HTMLElement>("[data-canvas-role]")?.dataset.canvasRole as Role | undefined;
  if (surface === "wall" || surface === "feature") picked = d.mode === "pair" && d.pair === surface ? surface : "wall";
  if (surface === "ceiling" && (d.mode === "single" || d.pair === "ceiling")) picked = d.mode === "single" ? "wall" : "ceiling";
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
for (const element of [document.querySelector("header")!, document.querySelector(".intro")!, el("notice"), el("preview-card")])
  layout.observe(element);
