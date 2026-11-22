import "./style.css";
import {
  catalogue,
  editable,
  example,
  hex,
  labels,
  palette,
  rooms,
  save,
  shareParams,
  startDesign,
  type Pair,
  type Role,
  type Room,
  type Tool,
} from "./design.ts";
import { contrast, correction, passes, suggestions } from "./colour.ts";
import { sheet, css } from "./export.ts";
import { icon } from "./icons.ts";
import { room } from "./room.ts";

const tool = document.body.dataset.tool as Tool;
const paint = tool === "paint";
const initial = startDesign(tool);
let d = initial.design;
let role: Role = editable(d)[0];
let undo: { role: Role; value: string } | null = null;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const chip = (value: string) =>
  `<i class="chip" style="--swatch:${value}" aria-hidden="true"></i>`;
const note =
  "Check a paint sample in your room. Light, finish and texture change how it looks.";
const label = (r: Role) =>
  r === "wall" && d.mode === "single" ? "Walls" : labels[r];
function persist() {
  save(tool, d);
  if (location.search) history.replaceState(null, "", location.pathname);
}
function preview() {
  if (paint) return room(d);
  const c = d.colours;
  return `<article id="specimen" style="--paper:${c.background};--ink:${c.text};--accent:${c.accent};--on-accent:${c.onAccent}"><div class="masthead">Fieldwork <span>Design journal</span></div><div class="story"><div><h3>The art of living slowly.</h3><p>Notes on the colours, objects and quiet rituals that make a room our own.</p><a href="#role-strip">Explore the palette</a>${d.mode === "site" ? '<button id="specimen-button">View colours</button>' : ""}</div><svg viewBox="0 0 160 185" aria-hidden="true"><rect width="160" height="185" fill="currentColor" opacity=".09"/><path d="M22 164V88a58 58 0 0 1 116 0v76z" fill="currentColor" opacity=".7"/><path d="M47 164V93a33 33 0 0 1 66 0v71z" fill="var(--paper)"/><circle cx="80" cy="117" r="18" fill="currentColor"/></svg></div></article>`;
}
function modes() {
  const choices = paint
    ? [
        ["single", "Single colour"],
        ["pair", "Colour pair"],
      ]
    : [
        ["text", "Text pair"],
        ["site", "Site palette"],
      ];
  return `<div class="modes"><div class="section-heading">${icon("sliders")}<h2>Palette editor</h2></div><div class="segmented" role="group" aria-label="Palette mode">${choices.map(([v, n]) => `<button id="mode-${v}" data-mode="${v}" aria-pressed="${d.mode === v}">${n}</button>`).join("")}</div>
  ${d.mode === "pair" ? '<label class="pair-select">Surfaces<select id="pair"><option value="ceiling">Wall + ceiling</option><option value="feature" ' + (d.pair === "feature" ? "selected" : "") + ">Main wall + feature wall</option></select></label>" : ""}</div>`;
}
function strip() {
  return editable(d)
    .map(
      (r) =>
        `<button id="role-${r}" data-role="${r}" class="tile" aria-pressed="${role === r}"><i style="--swatch:${d.colours[r]}"></i><span>${label(r)}</span>${role === r ? icon("check") : ""}</button>`,
    )
    .join("");
}
function advice() {
  const undoControl =
    undo?.role === role
      ? `<button class="text-btn" id="undo">${icon("undo")}Undo</button>`
      : "";
  if (paint && (role === "ceiling" || role === "feature")) {
    const list = suggestions(d.colours.wall, role, d.colours[role]);
    return `<div class="advice"><div class="subhead"><b>Suggestions</b>${undoControl}</div><div class="choices">${list.map((c) => `<button data-suggest="${c.value}" id="suggest-${c.name}">${chip(c.value)}${c.name}</button>`).join("") || "<small>No distinct tones in this direction.</small>"}</div></div>`;
  }
  if (paint) return undoControl;
  return (
    d.mode === "site"
      ? ([
          ["text", "background"],
          ["onAccent", "accent"],
        ] as const)
      : ([["text", "background"]] as const)
  )
    .map(([fg, bg]) => {
      const ratio = contrast(d.colours[fg], d.colours[bg]);
      const fix = correction(d.colours[fg], d.colours[bg]);
      const restore = role === fg || role === bg ? undoControl : "";
      const adjust = fix
        ? `<button data-fix="${fg}" id="fix-${fg}" title="Use ${fix} for ${labels[fg]}">Adjust ${fg === "text" ? "text" : "button text"}</button>`
        : "";
      return `<div class="contrast"><span><b>${labels[fg]} / ${labels[bg].toLowerCase()}</b><small>${passes(ratio) ? "Passes" : "Needs adjustment"} · ${ratio.toFixed(2)}:1</small></span>${adjust}${restore}${adjust || restore ? "" : icon("check")}</div>`;
    })
    .join("");
}
function key() {
  return palette(d)
    .map(([r, v]) => `<span>${chip(v)}${label(r)}</span>`)
    .join("");
}
function render(focus?: string) {
  el("studio").innerHTML =
    `<section class="preview-card" aria-labelledby="preview-title"><div class="preview-head"><div class="section-heading">${icon(paint ? "room" : "web")}<h2 id="preview-title">${paint ? "Room preview" : "Page preview"}</h2></div>
  ${
    paint
      ? `<select aria-label="Room" id="room-choice">${Object.entries(rooms)
          .map(
            ([v, n]) =>
              `<option value="${v}" ${d.room === v ? "selected" : ""}>${n}</option>`,
          )
          .join("")}</select>`
      : ""
  }</div><div id="picture">${preview()}</div><div id="key">${key()}</div></section>
  <aside class="control-card" aria-label="Colour controls">${modes()}<div class="editing"><div class="eyebrow">Palette colours</div><div id="role-strip" role="group" aria-label="Select a colour to edit" tabindex="-1">${strip()}</div>
  <label class="field-label" for="hex">${label(role)} <span>HEX</span></label><div class="field-row"><label class="picker" title="Pick ${label(role)} colour"><input id="picker" type="color" value="${d.colours[role]}" aria-label="Pick ${label(role)} colour"></label>
  <input id="hex" spellcheck="false" autocomplete="off" autocapitalize="characters" aria-describedby="feedback" value="${d.colours[role]}"><button id="copy" class="outline">${icon("copy")}Copy</button></div><p id="feedback" role="status"></p><div id="advice">${advice()}</div></div>
  <div class="actions">${paint ? "" : '<button id="css" class="outline">Copy CSS</button>'}<button id="share" class="solid">${icon("share")}Share</button><button id="download" class="outline">${icon("download")}Download palette SVG</button></div></aside>
  ${paint ? `<p class="sample">${icon("info")}${note}</p>` : ""}<p class="sr" id="status" role="status"></p>`;
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
  el("key").innerHTML = key();
  el("role-strip").innerHTML = strip();
  el("advice").innerHTML = advice();
  el<HTMLInputElement>("picker").value = value;
  if (!typing) el<HTMLInputElement>("hex").value = value;
  el("feedback").textContent = "";
  el("hex").removeAttribute("aria-invalid");
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
  button.closest(".field-row, .actions")!.after(result);
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
document.addEventListener("click", (e) => {
  const b = (e.target as Element).closest("button");
  if (!b) return;
  if (b.dataset.example !== undefined) {
    d = example(tool, Number(b.dataset.example), d.room);
    role = editable(d)[0];
    undo = null;
    persist();
    render();
    el("status").textContent =
      catalogue[tool][Number(b.dataset.example)].name + " applied.";
    return;
  }
  if (b.dataset.mode) {
    d.mode = b.dataset.mode;
    if (!editable(d).includes(role)) role = editable(d)[0];
    undo = null;
    persist();
    render(b.id);
  } else if (b.dataset.role) {
    role = b.dataset.role as Role;
    render(b.id);
  } else if (b.dataset.suggest) {
    updateColour(b.dataset.suggest);
    el("undo")?.focus({ preventScroll: true });
    el("status").textContent = label(role) + " updated.";
  } else if (b.dataset.fix) {
    role = b.dataset.fix as Role;
    const bg = role === "text" ? "background" : "accent";
    const fix = correction(d.colours[role], d.colours[bg]);
    if (fix) {
      updateColour(fix);
      render("undo");
      el("status").textContent = label(role) + " now passes contrast.";
    }
  } else if (b.id === "undo" && undo) {
    d.colours[undo.role] = undo.value;
    undo = null;
    persist();
    render("role-" + role);
    el("status").textContent = label(role) + " restored.";
  } else if (b.id === "copy") void copy(d.colours[role], b, "HEX copied.");
  else if (b.id === "css") void copy(css(d), b, "CSS copied.");
  else if (b.id === "share")
    void copy(
      location.origin + "/" + tool + "/?" + shareParams(tool, d),
      b,
      "Design link copied.",
    );
  else if (b.id === "download") {
    const url = URL.createObjectURL(
      new Blob([sheet(d)], { type: "image/svg+xml" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "tintfolio-" + tool + ".svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    el("status").textContent = "Palette SVG downloaded.";
  } else if (b.id === "specimen-button") {
    role = "accent";
    render();
    el("role-accent").focus();
  }
});
document.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id === "room-choice") {
    d.room = input.value as Room;
    persist();
    render(input.id);
  }
  if (input.id === "pair") {
    d.pair = input.value as Pair;
    role = d.pair;
    undo = null;
    persist();
    render(input.id);
  }
});
document.addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id === "hex" || input.id === "picker") {
    const value = hex(input.value);
    if (value) updateColour(value, input.id === "hex");
    else {
      el("feedback").textContent = "";
      input.removeAttribute("aria-invalid");
    }
  }
});
document.addEventListener("focusout", (e) => {
  if ((e.target as Element).id === "hex") validate();
});
document.addEventListener("keydown", (e) => {
  if ((e.target as Element).id === "hex" && e.key === "Enter") validate();
});

const artPalettes = paint
  ? [
      ["#A9B39E", "#65765F", "#E9E3CE", "#B7A688"],
      ["#C78E76", "#EED6BD", "#A86754", "#E8BA9D"],
      ["#C3D0D0", "#657F89", "#DFDDC8", "#8EA9A8"],
    ]
  : [
      ["#F3EEDF", "#353C30", "#C4BCA9", "#8F967F"],
      ["#F1EFDF", "#4C6447", "#98A082", "#B3AF91"],
      ["#332C38", "#ECB393", "#9C7E8D", "#EEE2CA"],
    ];
function art(i: number) {
  const [a, b, c, f] = artPalettes[i];
  const paths = [
    `<circle cx="55" cy="66" r="49" fill="${b}"/><path d="M94 98V63a49 49 0 0 1 98 0v35" fill="${c}"/><circle cx="229" cy="25" r="58" fill="${f}"/>`,
    `<path d="M-20 100L73-8h58L40 100" fill="${c}"/><circle cx="126" cy="30" r="37" fill="${b}"/><path d="M142 100L230-8h74L217 100" fill="${f}"/>`,
    `<path d="M0 45Q50-2 104 42t102 0t100 0v65H0" fill="${f}"/><path d="M0 69Q50 21 104 65t102 0t100 0v60H0" fill="${b}"/><circle cx="208" cy="12" r="24" fill="${c}"/>`,
  ];
  return `<svg viewBox="0 0 280 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="280" height="90" fill="${a}"/>${paths[i]}</svg>`;
}
el("examples").innerHTML = catalogue[tool]
  .map(
    (x, i) =>
      `<button data-example="${i}" aria-label="Apply ${x.name} palette"><span class="art">${art(i)}</span><span class="example-body"><strong>${x.name}</strong>${icon("arrow")}<small>${x.use}</small><span>${x.reason}</span></span></button>`,
  )
  .join("");
if (initial.notice) {
  el("notice").hidden = false;
  el("notice").textContent = initial.notice;
}
save(tool, d);
render();
