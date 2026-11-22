import "./style.css";
import {
  defaultFloor, editable, example, hex, labels, lightingPresets, rooms, save,
  shareParams, startDesign, type Design, type Lighting, type Pair, type Role, type Room, type Theme, type Tool,
} from "./design.ts";
import { correction, suggestions } from "./colour.ts";
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
const initial = startDesign(tool, preset);
let d = initial.design;
let role = editable(d)[0];
let undo: { role: Role; value: string } | null = null;
let selected: { combination: Combination; wall: number; secondary: number; assignments: Assignment[] } | undefined;
let paletteUndo: { design: Design; role: Role; trigger: HTMLElement; selected: typeof selected } | null = null;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const editLabel = (r: Role) =>
  r === "wall" && d.mode === "single" ? "Walls &amp; ceiling" : labels[r];

function persist() {
  save(tool, d, preset);
  if (location.search) history.replaceState(null, "", location.pathname + location.hash);
}

function applyDesign(design: Design, announcement: string, trigger: HTMLElement, selection?: typeof selected) {
  const active = document.activeElement === trigger;
  paletteUndo = { design: structuredClone(d), role, trigger, selected };
  d = design;
  selected = selection;
  role = editable(d)[0];
  undo = null;
  persist();
  render(active ? trigger.id : undefined);
  el("status").textContent = announcement;
}

function selectCombination(combination: Combination, trigger: HTMLButtonElement) {
  const { swatches } = combination;
  const mode = paint ? "pair" : swatches.length === 2 ? "text" : "site";
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
    for (const assignment of assignments) colours[assignment.role] = assignment.hex;
  }
  applyDesign({ ...d, mode, colours }, combinationName(combination) + " applied.", trigger,
    { combination, wall: 0, secondary: 1, assignments });
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
  return editable(d).map((r) =>
    `<button type="button" id="role-${r}" data-role="${r}" class="tile" aria-pressed="${role === r}">${chip(d.colours[r])}<span>${editLabel(r)}</span>${role === r ? icon("check") : ""}</button>`,
  ).join("");
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
    <p class="sample">AA / AAA minimums are 4.5:1 / 7:1 for body text and 3:1 / 4.5:1 for large headings. Borders and icons require 3:1 for AA.</p>`;
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

function paintTools(open: boolean) {
  return `<details id="canvas-options" ${open ? "open" : ""}>
    <summary>Room surfaces${selected && d.mode === "pair" ? " and swatches" : ""}</summary>
    <div class="canvas-fields">
      ${d.mode === "pair" ? `<label>Surfaces<select id="pair">${selectOptions({ ceiling: "Wall + ceiling", feature: "Main wall + feature wall" }, d.pair)}</select></label>` : ""}
      ${selected && d.mode === "pair" ? `<div class="swatch-fields" id="swatch-fields">${paintSwatches()}</div>` : ""}
      <div class="floor-control"><label>Existing floor <span class="picker"><input id="floor" type="color" value="${d.floor ?? defaultFloor}"></span></label><button type="button" id="reset-floor" class="outline" ${d.floor ? "" : "disabled"}>Reset floor</button></div>
      <div id="canvas-notes"></div>
    </div></details>`;
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
  const canvasOpen = el<HTMLDetailsElement>("canvas-options")?.open;
  const previewControl = paint
    ? `<label>Room<select id="room-choice" aria-label="Room">${selectOptions(rooms, d.room)}</select></label>
       <label>Lighting<select id="lighting" aria-label="Lighting">${selectOptions(lightingPresets, d.lighting)}</select></label>`
    : `<label>Theme<select id="theme" aria-label="Theme">${selectOptions({ light: "Light", dark: "Dark" }, d.theme)}</select></label>`;
  el("preview-card").innerHTML = `
    <div class="preview-head"><div class="section-heading">${icon(paint ? "room" : "web")}<h2 id="preview-title">${paint ? "Room preview" : "Website preview"}</h2></div>
      <div class="preview-options">${previewControl}</div></div>
    <div id="picture">${preview()}</div>
    <div class="canvas-bar">${paint ? '<small>Approximate lighting</small>' : '<a href="#contrast-details" id="show-contrast">Check contrast</a><small id="assignment-count"></small>'}
      ${paint && d.mode === "pair" ? '<button type="button" id="swap-colours" class="outline">Swap roles</button>' : ""}</div>
    ${paint ? paintTools(!!canvasOpen) : ""}`;
  updateCanvasNotes();
  if (!paint) el("key").innerHTML = key();
  el("palette-fields").innerHTML =
    `${modes()}<div class="editing"><div id="role-strip" role="group" aria-label="Select a colour to edit">${strip()}</div>
      <label class="field-label" for="hex">${editLabel(role)} <span>HEX</span></label>
      <div class="field-row"><label class="picker"><input id="picker" type="color" value="${d.colours[role]}" aria-label="Pick ${editLabel(role)} colour"></label>
      <input id="hex" spellcheck="false" autocomplete="off" autocapitalize="characters" aria-describedby="feedback" value="${d.colours[role]}"><button type="button" id="copy" class="outline">${icon("copy")}Copy</button></div>
      <p id="feedback" role="status"></p>${paint ? '<div id="advice"></div>' : ""}</div>`;
  el("advice").innerHTML = advice();
  el<HTMLButtonElement>("undo-palette").disabled = !paletteUndo;
  if (focus) el(focus)?.focus({ preventScroll: true });
}

function updateColour(value: string, typing = false) {
  document.querySelector(".copy-result")?.remove();
  if (value !== d.colours[role]) {
    undo = { role, value: d.colours[role] };
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
  if (!typing) el<HTMLInputElement>("hex").value = value;
  el("feedback").textContent = "";
  el("hex").removeAttribute("aria-invalid");
}

function updateFloor(value: string) {
  d.floor = value === defaultFloor ? undefined : value;
  el("room").style.setProperty("--floor", value);
  el<HTMLButtonElement>("reset-floor").disabled = !d.floor;
  persist();
}

function validate() {
  if (hex(el<HTMLInputElement>("hex").value)) return;
  el("feedback").textContent = "Enter six HEX digits, for example #A9B39E.";
  el("hex").setAttribute("aria-invalid", "true");
}

async function copy(value: string, button: HTMLElement, message: string) {
  document.querySelector(".copy-result")?.remove();
  const result = document.createElement("div");
  result.className = "copy-result";
  button.closest(".field-row, .actions, .export-actions")!.after(result);
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

el("studio").innerHTML = `
  <section id="preview-card" class="preview-card" aria-labelledby="preview-title"></section>
  <div class="workspace">
    <div class="control-card">
      <details id="palette-editor"><summary>Edit colours</summary><div id="palette-fields"></div></details>
      ${paint ? "" : '<details id="contrast-details"><summary>Contrast and active colours</summary><div id="canvas-notes"></div><div id="key"></div><div id="advice"></div></details>'}
      <div class="actions">
        <button type="button" id="saved-open" class="outline" aria-haspopup="dialog">Saved swatches</button>
        <button type="button" id="share" class="outline">${icon("share")}Share</button>
        ${paint ? '<button type="button" id="sheet-open" class="outline" aria-haspopup="dialog">Paint spec sheet</button><button type="button" id="photo-open" class="outline" aria-haspopup="dialog">Tint a photo</button>' : '<button type="button" id="export-open" class="outline" aria-haspopup="dialog">Export theme</button>'}
      </div>
    </div>
    <section id="library" class="library" aria-labelledby="library-title"></section>
  </div>`;
el("studio").insertAdjacentHTML("afterend", '<p class="sr" id="status" role="status"></p>');
const setSelected = mountCollection(el("library"), tool, selectCombination);
const openSaved = mountSaved(tool, () => d, (design) => {
  applyDesign(design, "Saved design restored.", el("saved-open"));
  setSelected();
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
    d = previous.design;
    role = previous.role;
    selected = previous.selected;
    undo = null;
    paletteUndo = null;
    persist();
    render();
    setSelected(selected?.combination.id);
    const target = previous.trigger.isConnected ? previous.trigger
      : previous.trigger.dataset.combination
        ? document.querySelector<HTMLElement>(`[data-combination="${CSS.escape(previous.trigger.dataset.combination)}"]`) ?? el("wada-search")
        : el("wada-search");
    target.focus({ preventScroll: true });
    el("status").textContent = "Previous palette restored.";
  } else if (button.dataset.mode) {
    d.mode = button.dataset.mode;
    if (!editable(d).includes(role)) role = editable(d)[0];
    undo = null;
    persist();
    render(id);
  } else if (button.dataset.role) {
    role = button.dataset.role as Role;
    render(id);
  } else if (id === "swap-colours" && d.mode === "pair") {
    const target = d.pair;
    [d.colours.wall, d.colours[target]] = [d.colours[target], d.colours.wall];
    if (selected) selected = { ...selected, wall: selected.secondary, secondary: selected.wall };
    undo = null;
    persist();
    render(id);
    el("status").textContent = "Roles swapped.";
  } else if (button.dataset.suggest) {
    updateColour(button.dataset.suggest);
    el("undo")?.focus({ preventScroll: true });
    el("status").textContent = labels[role] + " updated.";
  } else if (button.dataset.fix) {
    role = button.dataset.fix as Role;
    const bg = role === "text" ? "background" : "accent";
    const fix = correction(d.colours[role], d.colours[bg]);
    if (fix) {
      updateColour(fix);
      render("undo");
      el("status").textContent = labels[role] + " adjusted.";
    }
  } else if (id === "undo" && undo) {
    role = undo.role;
    d.colours[role] = undo.value;
    undo = null;
    persist();
    render();
    const editor = el<HTMLDetailsElement>("palette-editor");
    editor.open = true;
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
  } else if (id === "specimen-button") {
    d.mode = "site";
    role = "accent";
    persist();
    el<HTMLDetailsElement>("palette-editor").open = true;
    render();
    el("role-accent").focus();
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
    if (value) updateColour(value, input.id === "hex");
    else {
      el("feedback").textContent = "";
      input.removeAttribute("aria-invalid");
    }
  }
});
document.addEventListener("focusout", (event) => {
  if ((event.target as Element).id === "hex") validate();
});
document.addEventListener("keydown", (event) => {
  if ((event.target as Element).id === "hex" && event.key === "Enter") validate();
});
el("preview-card").addEventListener("click", (event) => {
  if ((event.target as Element).id !== "show-contrast") return;
  event.preventDefault();
  const details = el<HTMLDetailsElement>("contrast-details");
  details.open = true;
  details.querySelector("summary")?.focus();
});
if (initial.notice) {
  el("notice").hidden = false;
  el("notice").textContent = initial.notice;
}
save(tool, d, preset);
render();
new ResizeObserver(([entry]) => {
  el("studio").style.setProperty("--preview-height", `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`);
}).observe(el("preview-card"));
