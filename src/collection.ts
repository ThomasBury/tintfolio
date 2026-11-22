import { catalogue, editable, example, labels, neutral, type Role, type Tool } from "./design.ts";
import namedCombinations from "./named-combinations.json" with { type: "json" };
import { hasSourceContrast, matchingCombinations, randomCombination, unpackCollection, type Combination, type Swatch } from "./wada.ts";

const pageSize = 24;
declare const __FEATURED_COMBINATIONS__: Combination[];
const featured = __FEATURED_COMBINATIONS__.map((combination) => ({
  ...combination, tags: { era: "Early Shōwa" },
}));
export const escapeText = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export const chip = (hex: string) =>
  `<i class="chip" style="--swatch:${hex}" aria-hidden="true"></i>`;
export const combinationName = ({ id }: Combination) => typeof id === "number" ? `Combination #${id}` : id;

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
  return catalogue[tool].map(({ name, reason }, index) => {
    const design = example(tool, index);
    const swatches: Swatch[] = editable(design).map((role) => ({ name: labels[role], hex: design.colours[role] }));
    if (tool === "paint" && swatches.length === 1)
      swatches.push({ name: "Warm cream", hex: neutral.ceiling });
    return { id: name, starter: index, swatches, note: reason, tags: { ...tags[index], era: "Contemporary" } };
  });
}

function card({ id, swatches }: Combination, selected?: Combination["id"]) {
  const wada = typeof id === "number";
  const names = swatches.map(({ name }) => escapeText(name)).join(" · ");
  const codes = swatches.flatMap(({ code }) => code ? [escapeText(code)] : []).join(" · ");
  return `<button type="button" class="wada-card" data-combination="${escapeText(String(id))}" aria-pressed="${selected === id}">
    <span class="wada-band" aria-hidden="true">${swatches.map(({ hex }) => chip(hex)).join("")}</span>
    <span class="wada-label"><b>${wada ? `Combination #${id}` : escapeText(id)}</b>
    <small>${names}${codes ? " · " + codes : ""}</small></span>
  </button>`;
}

function swatchOptions(combination: Combination, value: number, other: number) {
  return combination.swatches.map(({ name, hex }, index) =>
    `<option value="${index}" ${index === value ? "selected" : ""} ${index === other ? "disabled" : ""}>${escapeText(name)} · ${hex.toUpperCase()}</option>`,
  ).join("");
}

export function mountCollection(
  library: HTMLElement,
  tool: Tool,
  apply: (combination: Combination, trigger?: HTMLButtonElement) => void,
  audition: (combination?: Combination) => void,
) {
  library.innerHTML = `
    <div class="library-search">
      <label><span>Search palettes</span><input id="wada-search" type="search" placeholder="Name or #48"></label>
      <button type="button" class="outline" id="wada-filters-toggle" aria-expanded="false" aria-controls="wada-filters">Filters</button>
      <button type="button" class="outline" id="wada-random">Randomize</button>
    </div>
    <div class="library-filters filters-collapsed" id="wada-filters">
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
    <div class="library-loading"><p id="wada-load" role="status"></p><button type="button" class="outline" id="wada-retry" hidden>Retry</button></div>
    <p id="wada-results-status" role="status"></p>
    <div class="wada-grid" id="wada-results"></div>
    <button type="button" class="outline" id="wada-more">Load more</button>
    <footer class="wada-credit">Numbered combinations come from Sanzo Wada’s
      <a href="https://en.seigensha.com/books/978-4-86152-247-5/"><cite>A Dictionary of Color Combinations</cite></a>,
      published by Seigensha.
      <a href="https://github.com/mattdesl/dictionary-of-colour-combinations/tree/c142bd0bc8049ea48db4da5eb397981f047e8ef4">Dataset and conversion notes</a> ·
      <a href="/wada-license.txt">MIT notice</a>
    </footer>`;

  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    library.querySelector<T>("#wada-" + id)!;
  const search = el<HTMLInputElement>("search");
  const source = el<HTMLSelectElement>("source");
  const count = el<HTMLSelectElement>("count");
  const style = el<HTMLSelectElement>("style");
  const results = el("results");
  const random = el<HTMLButtonElement>("random");
  const more = el<HTMLButtonElement>("more");
  const retry = el<HTMLButtonElement>("retry");
  const recommended = tool === "paint" ? "Nordic Limewash" : "Developer Docs";
  const curated = [
    ...starters(tool), ...namedCombinations.filter(({ id }) => id === recommended),
    ...featured, ...namedCombinations.filter(({ id }) => id !== recommended),
  ];
  let collection: Combination[] = curated;
  let matches: Combination[] = [];
  let selected: Combination["id"] | undefined;
  let visible = pageSize;
  let loaded = false;
  let loading = false;
  let failed = false;

  function setSelected(id?: Combination["id"]) {
    selected = id;
    for (const button of results.querySelectorAll<HTMLButtonElement>("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.combination === String(selected)));
    }
  }

  function updateControls() {
    const shown = Math.min(visible, matches.length);
    el("results-status").textContent = matches.length
      ? `${shown} of ${matches.length} ${loaded ? "" : "available "}combinations`
      : "No matching combinations";
    more.hidden = (loaded && shown >= matches.length) || failed;
    random.disabled = matches.length === 0;
  }

  function filter() {
    audition();
    matches = matchingCombinations(collection, Number(count.value), search.value).filter((item) => {
      if (source.value && source.value !== (typeof item.id === "number" ? "wada" : "curated")) return false;
      if (style.value === "bold") return item.tags?.mood === "Bold";
      if (style.value === "warm") return item.tags?.warmNeutral;
      if (style.value === "contrast") return hasSourceContrast(item);
      return true;
    });
    const focused = document.activeElement instanceof HTMLButtonElement && results.contains(document.activeElement)
      ? document.activeElement.dataset.combination : undefined;
    results.innerHTML = matches.slice(0, visible).map((item) => card(item, selected)).join("");
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
      updateControls();
    } finally {
      loading = false;
      more.removeAttribute("aria-busy");
    }
  }

  function append(advanceFocus: boolean) {
    const first = visible;
    visible += pageSize;
    results.insertAdjacentHTML("beforeend", matches.slice(first, visible).map((item) => card(item, selected)).join(""));
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

  el("filters-toggle").addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const collapsed = el("filters").classList.toggle("filters-collapsed");
    button.setAttribute("aria-expanded", String(!collapsed));
  });
  search.addEventListener("input", reset);
  for (const input of [source, count, style]) input.addEventListener("change", reset);
  function reset() {
    visible = pageSize;
    filter();
    void load();
  }
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
  const custom = index < 0 ? `<option value="" selected disabled>Custom · ${value}</option>` : "";
  return `<label>${labels[role]}<select id="swatch-${role}" data-swatch-role="${role}" aria-label="${labels[role]}">${custom}${swatchOptions(combination, index, other)}</select></label>`;
}
