import { labels, type Pair, type Tool } from "./design.ts";
import namedCombinations from "./named-combinations.json" with { type: "json" };
import {
  assignWeb,
  matchingCombinations,
  randomCombination,
  unpackCollection,
  type Assignment,
  type Combination,
  type Swatch,
} from "./wada.ts";

const pageSize = 24;
declare const __FEATURED_COMBINATIONS__: Combination[];
const featured = __FEATURED_COMBINATIONS__;
const escapeText = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const chip = (hex: string) =>
  `<i class="chip" style="--swatch:${hex}" aria-hidden="true"></i>`;
const cardSelector = (id: Combination["id"]) =>
  `[data-combination="${CSS.escape(String(id))}"]`;

function previewLabel(id: Combination["id"]) {
  return typeof id === "number" ? `combination #${id}` : id;
}

function card({ id, swatches }: Combination, selected?: Combination["id"]) {
  const title = typeof id === "number" ? `#${id}` : escapeText(id);
  return `<button type="button" class="wada-card" data-combination="${escapeText(String(id))}" aria-pressed="${id === selected}" aria-label="Preview ${escapeText(previewLabel(id))} ${swatches.length} swatches">
    <span class="wada-band" aria-hidden="true">${swatches.map(({ hex }) => chip(hex)).join("")}</span>
    <span><b>${title}</b> <small>${swatches.length} swatches</small></span>
  </button>`;
}

function swatchList(swatches: Swatch[]) {
  return `<ul class="wada-swatches">${swatches.map(({ hex, name, code }) =>
    `<li>${chip(hex)}<span>${escapeText(name)} <code>${hex}</code>${code ? ` · ${escapeText(code)}` : ""}</span></li>`,
  ).join("")}</ul>`;
}

function webRoles(assignments: Assignment[]) {
  return `<dl class="wada-roles">${assignments.map(({ role, hex, source }) => {
    let note = source
      ? escapeText(source.name)
      : `Added · ${hex === "#000000" ? "Black" : "White"}`;
    if (source && source.hex.toUpperCase() !== hex)
      note = `Adjusted from ${escapeText(source.name)} <code>${source.hex}</code>`;
    return `<div><dt>${labels[role]}</dt><dd>${chip(hex)}<span><code>${hex}</code> · ${note}</span></dd></div>`;
  }).join("")}</dl>`;
}

function paintRoles(swatches: Swatch[]) {
  const options = swatches.map(({ name, hex }, index) =>
    `<option value="${index}">${escapeText(name)} · ${hex}</option>`,
  ).join("");
  const field = (id: string) =>
    `<label><span id="wada-${id}-label"></span><span class="wada-paint-select">
      <i class="chip" id="wada-${id}-chip" aria-hidden="true"></i>
      <select id="wada-${id}">${options}</select></span></label>`;
  return `<div class="wada-paint-roles">${field("wall")}${field("secondary")}</div>`;
}

export function mountCollection(
  curated: HTMLElement,
  tool: Tool,
  target: Pair,
  apply: (id: Combination["id"], assignments: Assignment[]) => void,
) {
  curated.insertAdjacentHTML("beforebegin", `
    <section class="wada-featured" aria-labelledby="wada-featured-title">
      <h2 id="wada-featured-title" tabindex="-1">Colour combinations</h2>
      <div id="wada-featured" class="wada-grid">${featured.map((combination) => card(combination)).join("")}</div>
      <div class="wada-featured-actions">
        <a href="#wada-browse">Browse all combinations</a>
        <p id="wada-load" role="status"></p>
        <button type="button" class="outline" id="wada-retry" hidden>Retry</button>
      </div>
    </section>`);
  curated.insertAdjacentHTML("afterend", `
    <footer class="wada-credit">Many combinations come from Sanzo Wada’s
        <a href="https://en.seigensha.com/books/978-4-86152-247-5/"><cite>A Dictionary of Color Combinations</cite></a>,
        published by Seigensha.
        <a href="https://github.com/mattdesl/dictionary-of-colour-combinations/tree/c142bd0bc8049ea48db4da5eb397981f047e8ef4">Dataset and conversion notes</a> ·
        <a href="/wada-license.txt">MIT notice</a>
    </footer>`);
  curated.insertAdjacentHTML("beforebegin", `
    <section class="examples wada" id="wada" aria-labelledby="wada-browse">
      <h2 id="wada-browse" tabindex="-1">Browse combinations</h2>
      <section id="wada-preview" aria-labelledby="wada-preview-title" hidden></section>
      <div class="wada-filters">
        <label>Search combinations<input id="wada-search" type="search" placeholder="Name or number"></label>
        <label>Swatch count<select id="wada-count">
          <option value="0">Any count</option>
          <option value="2">2 swatches</option>
          <option value="3">3 swatches</option>
          <option value="4">4 swatches</option>
        </select></label>
        <button type="button" class="outline" id="wada-random">Randomize</button>
      </div>
      <p class="sr" id="wada-draw" role="status"></p>
      <div class="wada-results-head">
        <h3 id="wada-results-title" tabindex="-1">Results</h3>
        <p id="wada-results-status" role="status"></p>
      </div>
      <div class="wada-grid" id="wada-results"></div>
      <div class="wada-pages" id="wada-pages" aria-label="Combination pages" role="group">
        <button type="button" class="outline" id="wada-prev">Previous</button>
        <span id="wada-page"></span>
        <button type="button" class="outline" id="wada-next">Next</button>
      </div>
    </section>`);

  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById("wada-" + id) as T;
  const featuredGrid = el("featured");
  const results = el("results");
  const preview = el("preview");
  const retry = el<HTMLButtonElement>("retry");
  const search = el<HTMLInputElement>("search");
  const count = el<HTMLSelectElement>("count");
  const random = el<HTMLButtonElement>("random");
  const previous = el<HTMLButtonElement>("prev");
  const next = el<HTMLButtonElement>("next");
  let collection: Combination[] = namedCombinations;
  let loaded = false;
  let loading = false;
  let matches: Combination[] = [];
  let page = 0;
  let selected: Combination | undefined;
  let wall = 0;
  let secondary = 1;
  let assignments: Assignment[] = [];

  function updatePaintRoles() {
    if (!selected) return;
    const swatches = selected.swatches;
    assignments = [
      { role: "wall", hex: swatches[wall].hex.toUpperCase() },
      { role: target, hex: swatches[secondary].hex.toUpperCase() },
    ];
    const fields = [["wall", wall, secondary], ["secondary", secondary, wall]] as const;
    for (const [id, index, other] of fields) {
      const select = el<HTMLSelectElement>(id);
      select.value = String(index);
      for (const [optionIndex, option] of Array.from(select.options).entries())
        option.disabled = optionIndex === other;
      el(id + "-label").textContent = id === "wall" ? labels.wall : labels[target];
      el(id + "-chip").style.setProperty("--swatch", swatches[index].hex);
    }
  }

  function renderPreview() {
    preview.hidden = !selected;
    if (!selected) {
      preview.replaceChildren();
      return;
    }

    const { id, swatches, note } = selected;
    if (tool === "web") assignments = assignWeb(swatches);
    preview.innerHTML = `
      <h3 id="wada-preview-title" tabindex="-1">Preview ${escapeText(previewLabel(id))}</h3>
      ${note ? `<p class="wada-note">${escapeText(note)}</p>` : ""}
      <div class="wada-preview-body">
        <div><h4>Original swatches</h4>${swatchList(swatches)}</div>
        <div><h4>Proposed roles</h4>
          ${tool === "paint" ? paintRoles(swatches) : webRoles(assignments)}
        </div>
      </div>
      <button type="button" class="solid" id="wada-apply">Apply</button>`;
    if (tool === "paint") updatePaintRoles();
  }

  function renderResults() {
    const start = page * pageSize;
    const total = Math.ceil(matches.length / pageSize);
    const active = document.activeElement;
    const focused = active instanceof HTMLButtonElement && results.contains(active)
      ? active.dataset.combination
      : undefined;
    results.innerHTML = matches.slice(start, start + pageSize)
      .map((combination) => card(combination, selected?.id)).join("");
    if (focused)
      results.querySelector<HTMLButtonElement>(cardSelector(focused))?.focus({ preventScroll: true });
    const status = matches.length
      ? `${start + 1}–${Math.min(start + pageSize, matches.length)} of ${matches.length} combinations`
      : "No matching combinations";
    if (el("results-status").textContent !== status)
      el("results-status").textContent = status;
    el("pages").hidden = total < 2;
    el("page").textContent = `Page ${page + 1} of ${total}`;
    previous.disabled = page === 0;
    next.disabled = page >= total - 1;
    random.disabled = matches.length === 0;
  }

  function show(combination: Combination) {
    if (selected?.id === combination.id) return;
    selected = combination;
    wall = 0;
    secondary = 1;
    renderPreview();
    for (const grid of [featuredGrid, results]) {
      grid.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
      grid.querySelector(cardSelector(combination.id))?.setAttribute("aria-pressed", "true");
    }
  }

  function filter(clearSelection = false) {
    matches = matchingCombinations(collection, Number(count.value), search.value);
    page = 0;
    if (clearSelection && selected && !matches.some(({ id }) => id === selected?.id)) {
      selected = undefined;
      renderPreview();
      featuredGrid.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
    }
    renderResults();
  }

  async function load() {
    if (loading || loaded) return;
    loading = true;
    el("load").textContent = "Loading more combinations…";
    retry.setAttribute("aria-disabled", "true");
    try {
      const response = await fetch(
        "/wada-combinations.json",
        retry.hidden ? undefined : { cache: "reload" },
      );
      if (!response.ok) throw new Error("Could not load collection");
      collection = [...namedCombinations, ...unpackCollection(await response.json())];
      filter();
      loaded = true;
      if (document.activeElement === retry) search.focus();
      retry.hidden = true;
      el("load").textContent = "";
    } catch {
      el("load").textContent = "The Wada combinations could not be loaded.";
      retry.hidden = false;
    } finally {
      retry.removeAttribute("aria-disabled");
      loading = false;
    }
  }

  retry.addEventListener("click", () => void load());
  search.addEventListener("input", () => filter(true));
  count.addEventListener("change", () => filter(true));
  random.addEventListener("click", () => {
    const combination = randomCombination(matches, selected?.id);
    if (!combination) return;
    page = Math.floor(matches.indexOf(combination) / pageSize);
    renderResults();
    show(combination);
    preview.scrollIntoView({ block: "nearest" });
    el("draw").textContent = `Previewing ${previewLabel(combination.id)}.`;
  });
  function turnPage(offset: number) {
    page += offset;
    renderResults();
    el("results-title").focus();
  }
  previous.addEventListener("click", () => turnPage(-1));
  next.addEventListener("click", () => turnPage(1));
  function selectCard(event: MouseEvent) {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-combination]");
    if (!button) return;
    const id = button.dataset.combination;
    const combination = collection.find((item) => String(item.id) === id) ??
      featured.find((item) => String(item.id) === id);
    if (!combination) return;
    el("draw").textContent = "";
    show(combination);
    preview.scrollIntoView({ block: "start" });
    el("preview-title").focus({ preventScroll: true });
  }
  featuredGrid.addEventListener("click", selectCard);
  results.addEventListener("click", selectCard);
  preview.addEventListener("click", (event) => {
    if ((event.target as Element).closest("#wada-apply") && selected)
      apply(selected.id, assignments);
  });
  preview.addEventListener("change", (event) => {
    const select = event.target as HTMLSelectElement;
    if (select.id === "wada-wall") wall = Number(select.value);
    if (select.id === "wada-secondary") secondary = Number(select.value);
    updatePaintRoles();
  });
  filter();
  void load();
  return {
    setTarget(pair: Pair) {
      if (target === pair) return;
      target = pair;
      if (tool === "paint" && selected) updatePaintRoles();
    },
  };
}
