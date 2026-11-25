import { catalogue, labels, neutral, type Role, type Tool } from "./design.ts";
import { getColorDisplayName } from "./colour-name.ts";
import namedCombinations from "./named-combinations.json" with { type: "json" };
import { combinationHexes, combinationName, combinationPigments, hasSourceContrast, matchingCombinations, randomCombination, unpackCollection, type Combination, type Swatch } from "./wada.ts";

const pageSize = 24;
const websiteSwatchOrder = [3, 4, 2];
const paintSwatchOrder = [2, 3, 4];
declare const __FEATURED_COMBINATIONS__: Combination[];
const featured = __FEATURED_COMBINATIONS__.map((combination) => ({
  ...combination, tags: { era: "Early Shōwa" },
}));
export const escapeText = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export const chip = (hex: string) =>
  `<i class="chip" style="--swatch:${hex}" aria-hidden="true"></i>`;

function starters(tool: Tool): Combination[] {
  const tags = tool === "paint"
    ? [
        { mood: "Calm", use: ["Living rooms"] },
        { mood: "Calm", use: ["Bedrooms"], warmNeutral: true },
        { mood: "Calm", use: ["Accents"] },
      ]
    : [
        { mood: "Focused", use: ["Editorial"], warmNeutral: true },
        { mood: "Calm", use: ["Editorial"] },
        { mood: "Bold", use: ["Editorial"] },
      ];
  return catalogue[tool].map(({ name, reason, colours }, index) => {
    const swatches: Swatch[] = Object.values(colours).map((hex) => ({ name: getColorDisplayName(hex), hex }));
    if (tool === "paint" && swatches.length === 1)
      swatches.push({ name: getColorDisplayName(neutral.ceiling), hex: neutral.ceiling });
    return { id: name, starter: index, swatches, note: reason, tags: { ...tags[index], era: "Contemporary" } };
  });
}

function card(combination: Combination, tool: Tool, selected?: Combination["id"]) {
  const { id } = combination;
  const display = tool === "paint" && combination.swatches.length === 2
    ? { ...combination, swatches: [combination.swatches[1], combination.swatches[0]] }
    : combination;
  const { swatches } = display;
  const codes = tool === "paint" ? swatches.flatMap(({ code }) => code ? [code] : []).join(" · ") : "";
  return `<button type="button" class="wada-card" data-combination="${escapeText(String(id))}" aria-pressed="${selected === id}" title="${combinationHexes(display)}">
    <span class="wada-band" aria-hidden="true">${swatches.map(({ hex }) => chip(hex)).join("")}</span>
    <span class="wada-label"><b>${escapeText(combinationName(combination))}</b><small>${escapeText(combinationPigments(display))}</small>${codes ? `<code class="wada-codes">${escapeText(codes)}</code>` : ""}</span>
  </button>`;
}

function swatchOptions(combination: Combination, value: number, other: number) {
  return combination.swatches.map((swatch, index) =>
    `<option value="${index}" title="${swatch.hex.toUpperCase()}" ${index === value ? "selected" : ""} ${index === other ? "disabled" : ""}>${escapeText(getColorDisplayName(swatch.hex, swatch))}</option>`,
  ).join("");
}

export function mountCollection(
  library: HTMLElement,
  tool: Tool,
  mobileLayout: MediaQueryList,
  apply: (combination: Combination, trigger?: HTMLButtonElement) => void,
  audition: (combination?: Combination) => void,
) {
  const swatchOrder = tool === "web" ? websiteSwatchOrder : paintSwatchOrder;
  library.innerHTML = `
    <div class="library-search">
      <label><span>Search palettes</span><input id="wada-search" type="search" placeholder="HEX, name or #48"></label>
      <button type="button" class="outline" id="wada-filters-toggle" aria-expanded="false" aria-controls="wada-filters">Filters</button>
      <button type="button" class="outline" id="wada-random">Randomize</button>
    </div>
    <div class="library-filters" id="wada-filters" hidden>
      <label>Source<select id="wada-source">
        <option value="">All sources</option><option value="wada">Wada</option><option value="curated">Curated</option>
      </select></label>
      <label>Swatch count<select id="wada-count">
        <option value="0">Any count</option>${[2, 3, 4].map((count) => `<option value="${count}">${count} swatches</option>`).join("")}
      </select></label>
      <label>Style<select id="wada-style">
        <option value="">All styles</option><option value="bold">Bold</option><option value="warm">Warm Neutral</option>
        ${tool === "web" ? '<option value="contrast">High Contrast</option>' : ""}
      </select></label>
    </div>
    <div class="library-results-frame"><div class="library-results"><div class="library-results-content">
    <div class="library-loading"><p id="wada-load" role="status"></p><button type="button" class="outline" id="wada-retry" hidden>Retry</button></div>
    <div id="wada-recovery">
      <p id="wada-results-status" role="status"></p>
      <div class="library-empty-actions">
        <button type="button" class="text-btn" id="wada-clear-search" hidden>Clear search</button>
        <button type="button" class="text-btn" id="wada-clear-filters" hidden>Clear filters</button>
      </div>
    </div>
    <div class="wada-grid" id="wada-results"></div>
    <button type="button" class="outline" id="wada-more">Load more</button>
    <footer class="wada-credit">Wada combinations come from Sanzo Wada’s
      <a href="https://en.seigensha.com/books/978-4-86152-247-5/"><cite>A Dictionary of Color Combinations</cite></a>,
      published by Seigensha.
      <a href="https://github.com/mattdesl/dictionary-of-colour-combinations/tree/c142bd0bc8049ea48db4da5eb397981f047e8ef4">Dataset and conversion notes</a> ·
      <a href="/wada-license.txt">MIT notice</a>
    </footer>
    </div></div></div>`;

  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    library.querySelector<T>("#wada-" + id)!;
  const search = el<HTMLInputElement>("search");
  const source = el<HTMLSelectElement>("source");
  const count = el<HTMLSelectElement>("count");
  const style = el<HTMLSelectElement>("style");
  const filterInputs = [source, count, style];
  const filters = el("filters");
  const filtersToggle = el<HTMLButtonElement>("filters-toggle");
  const results = el("results");
  const random = el<HTMLButtonElement>("random");
  const more = el<HTMLButtonElement>("more");
  const retry = el<HTMLButtonElement>("retry");
  const clearSearch = el<HTMLButtonElement>("clear-search");
  const clearFilters = el<HTMLButtonElement>("clear-filters");
  const resultsScroll = library.querySelector<HTMLElement>(".library-results")!;
  const recommended = tool === "paint" ? "Nordic Limewash" : "Developer Docs";
  const starterCards = starters(tool);
  const websiteStarter = tool === "web" ? starterCards.find(({ swatches }) => swatches.length === 4) : undefined;
  const curated = [
    ...starterCards, ...namedCombinations.filter(({ id }) => id === recommended),
    ...featured, ...namedCombinations.filter(({ id }) => id !== recommended),
  ];
  let collection: Combination[] = curated;
  let matches: Combination[] = [];
  let resultsOrder: Combination[] = [];
  let selected: Combination["id"] | undefined;
  let visible = pageSize;
  let loaded = false;
  let loading = false;
  let failed = false;
  const activeFilters = () => filterInputs.filter((input) => input.selectedIndex > 0).length;

  function setSelected(id?: Combination["id"]) {
    selected = id;
    for (const button of results.querySelectorAll<HTMLButtonElement>("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.combination === String(selected)));
    }
  }

  function updateControls() {
    const shown = Math.min(visible, matches.length);
    const noMatches = !matches.length && !loading;
    const filterCount = activeFilters();
    filtersToggle.textContent = filterCount ? `Filters (${filterCount})` : "Filters";
    el("results-status").textContent = matches.length
      ? `${shown} of ${matches.length} ${loaded ? "" : "available "}combinations`
      : noMatches ? "No matching combinations" : "";
    clearSearch.hidden = !noMatches || !search.value.trim();
    clearFilters.hidden = !noMatches || !filterCount;
    more.hidden = (loaded && shown >= matches.length) || failed;
    random.disabled = matches.length === 0;
  }

  function filter() {
    audition();
    matches = matchingCombinations(collection, Number(count.value), search.value, tool === "paint").filter((item) => {
      if (source.value && source.value !== (typeof item.id === "number" ? "wada" : "curated")) return false;
      if (style.value === "bold") return item.tags?.mood === "Bold";
      if (style.value === "warm") return item.tags?.warmNeutral;
      if (style.value === "contrast") return hasSourceContrast(item);
      return true;
    });
    // Keep the catalogue order for the workspace's previous and next shortcuts.
    resultsOrder = [...matches].sort((a, b) =>
      swatchOrder.indexOf(a.swatches.length) - swatchOrder.indexOf(b.swatches.length));
    if (websiteStarter && mobileLayout.matches && !search.value.trim() && !activeFilters()) {
      resultsOrder.splice(resultsOrder.indexOf(websiteStarter), 1);
      resultsOrder.unshift(websiteStarter);
    }
    const focused = document.activeElement instanceof HTMLButtonElement && results.contains(document.activeElement)
      ? document.activeElement.dataset.combination : undefined;
    results.innerHTML = resultsOrder.slice(0, visible).map((item) => card(item, tool, selected)).join("");
    if (focused) {
      const button = results.querySelector<HTMLButtonElement>(`[data-combination="${CSS.escape(focused)}"]`);
      (button ?? search).focus({ preventScroll: true });
    }
    updateControls();
  }

  async function load() {
    if (loaded || loading || failed) return;
    loading = true;
    el("load").textContent = "Loading Wada combinations…";
    more.setAttribute("aria-busy", "true");
    updateControls();
    try {
      const response = await fetch("/wada-combinations.json");
      if (!response.ok) throw new Error("Could not load collection");
      const featuredIds = new Set(featured.map(({ id }) => id));
      collection = [...curated, ...unpackCollection(await response.json()).filter(({ id }) => !featuredIds.has(id))];
      loaded = true;
      filter();
      el("load").textContent = "";
    } catch {
      failed = true;
      el("load").textContent = "The Wada combinations could not be loaded. Curated palettes are still available.";
      retry.hidden = false;
      if (document.activeElement === more) retry.focus();
    } finally {
      loading = false;
      more.removeAttribute("aria-busy");
      updateControls();
    }
  }

  function append(advanceFocus: boolean) {
    const first = visible;
    visible += pageSize;
    results.insertAdjacentHTML("beforeend", resultsOrder.slice(first, visible).map((item) => card(item, tool, selected)).join(""));
    if (advanceFocus) (results.children[first] as HTMLButtonElement | undefined)?.focus();
    updateControls();
  }

  function randomize(trigger?: HTMLButtonElement) {
    const result = randomCombination(matches, selected);
    if (result) apply(result, trigger);
  }

  function cycle(direction: number) {
    const wada = matches.filter(({ id }) => typeof id === "number");
    if (!wada.length) return;
    const index = wada.findIndex(({ id }) => id === selected);
    const next = index < 0 ? (direction > 0 ? 0 : wada.length - 1) : (index + direction + wada.length) % wada.length;
    apply(wada[next]);
  }

  function cardFrom(target: EventTarget | null) {
    return target instanceof Element ? target.closest<HTMLButtonElement>("[data-combination]") : null;
  }

  function combinationFor(button: HTMLButtonElement | null) {
    return button && matches.find(({ id }) => String(id) === button.dataset.combination);
  }

  filtersToggle.addEventListener("click", () => {
    filters.hidden = !filters.hidden;
    filtersToggle.setAttribute("aria-expanded", String(!filters.hidden));
  });
  search.addEventListener("input", reset);
  for (const input of filterInputs) input.addEventListener("change", reset);
  if (websiteStarter) mobileLayout.addEventListener("change", filter);
  function reset() {
    resultsScroll.scrollTop = 0;
    visible = pageSize;
    filter();
    void load();
  }
  clearSearch.addEventListener("click", () => {
    search.value = "";
    reset();
    search.focus();
  });
  clearFilters.addEventListener("click", () => {
    for (const input of filterInputs) input.selectedIndex = 0;
    reset();
    search.focus();
  });
  retry.addEventListener("click", async () => {
    failed = false;
    await load();
    if (loaded) {
      if (document.activeElement === retry) search.focus();
      retry.hidden = true;
    }
  });
  more.addEventListener("click", async () => {
    if (loading) return;
    if (loaded) { append(true); return; }
    const first = results.children.length;
    await load();
    if (document.activeElement === more && loaded) {
      const next = results.children[first] as HTMLButtonElement | undefined;
      if (next) next.focus();
      else if (!more.hidden) append(true);
      else search.focus();
    }
  });
  random.addEventListener("click", () => randomize(random));
  results.addEventListener("click", (event) => {
    const button = cardFrom(event.target);
    const combination = combinationFor(button);
    if (button && combination) apply(combination, button);
  });
  for (const type of ["pointerover", "pointerout"] as const) {
    results.addEventListener(type, (event) => {
      if (event.pointerType !== "mouse") return;
      const button = cardFrom(event.target);
      if (!button || button === cardFrom(event.relatedTarget)) return;
      const combination = combinationFor(button);
      audition(type === "pointerover" && combination ? combination : undefined);
    });
  }
  window.addEventListener("blur", () => audition());

  const frame = resultsScroll.parentElement!;
  const updateFades = () => {
    const { scrollTop, scrollHeight, clientHeight } = resultsScroll;
    frame.toggleAttribute("data-fade-top", scrollTop > 1);
    frame.toggleAttribute("data-fade-bottom", scrollHeight - clientHeight - scrollTop > 1);
  };
  const size = new ResizeObserver(updateFades);
  size.observe(resultsScroll);
  size.observe(resultsScroll.firstElementChild!);
  resultsScroll.addEventListener("scroll", updateFades, { passive: true });

  filter();
  void load();
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting || document.activeElement === more) return;
    if (loaded && !more.hidden) append(false);
    else void load();
  });
  observer.observe(more);
  return { setSelected, randomize, cycle };
}

export function assignmentSelect(role: Role, combination: Combination, index: number, other: number, value: string) {
  const custom = index < 0
    ? `<option value="" title="${value}" selected disabled>Custom · ${escapeText(getColorDisplayName(value))}</option>` : "";
  return `<label class="field-label" for="swatch-${role}">Palette colour for ${labels[role].toLowerCase()}</label>
    <select id="swatch-${role}" data-swatch-role="${role}">${custom}${swatchOptions(combination, index, other)}</select>`;
}
