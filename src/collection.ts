import { labels, type Pair, type Tool } from "./design.ts";
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
const featuredIds = [4, 125, 344];
const escapeText = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const chip = (hex: string) =>
  `<i class="chip" style="--swatch:${hex}" aria-hidden="true"></i>`;

function card({ id, swatches }: Combination, selected?: number) {
  return `<button type="button" class="wada-card" data-combination="${id}" aria-pressed="${id === selected}">
    <span class="wada-band" aria-hidden="true">${swatches.map(({ hex }) => chip(hex)).join("")}</span>
    <span><span class="sr">Preview combination </span><b>#${id}</b> <small>${swatches.length} swatches</small></span>
  </button>`;
}

function swatchList(swatches: Swatch[]) {
  return `<ul class="wada-swatches">${swatches.map(({ hex, name }) =>
    `<li>${chip(hex)}<span>${escapeText(name)} <code>${hex}</code></span></li>`,
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
  return `<div class="wada-paint-roles">${field("wall")}${field("secondary")}
    <button type="button" class="outline" id="wada-swap">Swap assignments</button></div>`;
}

export function mountCollection(
  after: HTMLElement,
  tool: Tool,
  target: Pair,
  apply: (id: number, assignments: Assignment[]) => void,
) {
  after.insertAdjacentHTML("afterend", `
    <details class="examples wada" id="wada">
      <summary><h2>Sanzo Wada collection</h2></summary>
      <p class="wada-credit">348 combinations from Sanzo Wada’s
        <a href="https://en.seigensha.com/books/978-4-86152-247-5/"><cite>A Dictionary of Color Combinations</cite></a>,
        published by Seigensha. Data compiled by Dain M. Blodorn Kim, with sRGB conversion by Matt DesLauriers.
        <a href="https://github.com/mattdesl/dictionary-of-colour-combinations/tree/c142bd0bc8049ea48db4da5eb397981f047e8ef4">Dataset and conversion notes</a> ·
        <a href="/wada-license.txt">MIT notice</a>
      </p>
      <p id="wada-load" role="status"></p>
      <button type="button" class="outline" id="wada-retry" hidden>Retry</button>
      <div id="wada-content" hidden>
        <h3>Featured combinations</h3>
        <div id="wada-featured" class="wada-grid"></div>
        <div class="wada-filters">
          <label>Search combinations<input id="wada-search" type="search" placeholder="Number or colour name"></label>
          <label>Swatch count<select id="wada-count">
            <option value="0">Any count</option>
            <option value="2">2 swatches</option>
            <option value="3">3 swatches</option>
            <option value="4">4 swatches</option>
          </select></label>
          <button type="button" class="outline" id="wada-random">Randomize</button>
        </div>
        <p class="sr" id="wada-draw" role="status"></p>
        <section id="wada-preview" aria-labelledby="wada-preview-title" hidden></section>
        <div class="wada-results-head">
          <h3 id="wada-results-title" tabindex="-1">Browse combinations</h3>
          <p id="wada-results-status" role="status"></p>
        </div>
        <div class="wada-grid" id="wada-results"></div>
        <div class="wada-pages" id="wada-pages" aria-label="Combination pages" role="group">
          <button type="button" class="outline" id="wada-prev">Previous</button>
          <span id="wada-page"></span>
          <button type="button" class="outline" id="wada-next">Next</button>
        </div>
      </div>
    </details>`);

  const details = document.getElementById("wada") as HTMLDetailsElement;
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    details.querySelector<T>("#wada-" + id)!;
  const preview = el("preview");
  const retry = el<HTMLButtonElement>("retry");
  const search = el<HTMLInputElement>("search");
  const count = el<HTMLSelectElement>("count");
  const random = el<HTMLButtonElement>("random");
  const previous = el<HTMLButtonElement>("prev");
  const next = el<HTMLButtonElement>("next");
  let collection: Combination[] = [];
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

    const { id, swatches } = selected;
    if (tool === "web") assignments = assignWeb(swatches);
    preview.innerHTML = `
      <h3 id="wada-preview-title" tabindex="-1">Preview combination #${id}</h3>
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
    el("results").innerHTML = matches.slice(start, start + pageSize)
      .map((combination) => card(combination, selected?.id)).join("");
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
    if (selected === combination) return;
    selected = combination;
    wall = 0;
    secondary = 1;
    renderPreview();
    for (const button of details.querySelectorAll<HTMLButtonElement>("[data-combination]")) {
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.combination) === combination.id),
      );
    }
  }

  function filter() {
    matches = matchingCombinations(collection, Number(count.value), search.value);
    page = 0;
    if (selected && !matches.includes(selected)) {
      selected = undefined;
      renderPreview();
      el("featured").querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
    }
    renderResults();
  }

  async function load() {
    if (loading || collection.length) return;
    loading = true;
    el("load").textContent = "Loading combinations…";
    retry.setAttribute("aria-disabled", "true");
    try {
      const response = await fetch(
        "/wada-combinations.json",
        retry.hidden ? undefined : { cache: "reload" },
      );
      if (!response.ok) throw new Error("Could not load collection");
      collection = unpackCollection(await response.json());
      el("featured").innerHTML = featuredIds.map((id) => card(collection[id - 1])).join("");
      filter();
      el("content").hidden = false;
      if (document.activeElement === retry) search.focus();
      retry.hidden = true;
      el("load").textContent = "";
    } catch {
      el("load").textContent = "The combinations could not be loaded.";
      retry.hidden = false;
    } finally {
      retry.removeAttribute("aria-disabled");
      loading = false;
    }
  }

  details.addEventListener("toggle", () => {
    if (details.open && retry.hidden) void load();
  });
  retry.addEventListener("click", () => void load());
  search.addEventListener("input", filter);
  count.addEventListener("change", filter);
  random.addEventListener("click", () => {
    const combination = randomCombination(matches, selected?.id);
    if (!combination) return;
    page = Math.floor(matches.indexOf(combination) / pageSize);
    renderResults();
    show(combination);
    el("draw").textContent = `Previewing combination #${combination.id}.`;
  });
  function turnPage(offset: number) {
    page += offset;
    renderResults();
    el("results-title").focus();
  }
  previous.addEventListener("click", () => turnPage(-1));
  next.addEventListener("click", () => turnPage(1));
  details.addEventListener("click", (event) => {
    const button = (event.target as Element).closest("button");
    if (button?.dataset.combination) {
      el("draw").textContent = "";
      show(collection[Number(button.dataset.combination) - 1]);
      el("preview-title").focus();
    } else if (button?.id === "wada-swap") {
      [wall, secondary] = [secondary, wall];
      updatePaintRoles();
    } else if (button?.id === "wada-apply" && selected) {
      apply(selected.id, assignments);
    }
  });
  preview.addEventListener("change", (event) => {
    const select = event.target as HTMLSelectElement;
    if (select.id === "wada-wall") wall = Number(select.value);
    if (select.id === "wada-secondary") secondary = Number(select.value);
    updatePaintRoles();
  });
  return {
    setTarget(pair: Pair) {
      if (target === pair) return;
      target = pair;
      if (tool === "paint" && selected) updatePaintRoles();
    },
  };
}
