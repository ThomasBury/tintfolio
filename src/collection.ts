import { catalogue, editable, example, labels, neutral, type Role, type Tool } from "./design.ts";
import namedCombinations from "./named-combinations.json" with { type: "json" };
import { matchingCombinations, randomCombination, unpackCollection, type Combination, type Swatch } from "./wada.ts";

const pageSize = 24;
declare const __FEATURED_COMBINATIONS__: Combination[];
const featured = __FEATURED_COMBINATIONS__.map((combination) => ({
  ...combination, tags: { era: "Early Shōwa" },
}));
const facets = {
  mood: ["Mood", ["Calm", "Focused", "Bold"]],
  era: ["Era", ["Early Shōwa", "Contemporary"]],
  use: ["Use case", ["Living rooms", "Bedrooms", "Documentation", "Editorial", "Accents"]],
} as const;
type Facet = keyof typeof facets;

export const escapeText = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export const chip = (hex: string) =>
  `<i class="chip" style="--swatch:${hex}" aria-hidden="true"></i>`;
export const combinationName = ({ id }: Combination) => typeof id === "number" ? `Combination #${id}` : id;

function starters(tool: Tool): Combination[] {
  const tags = tool === "paint"
    ? [
        { mood: "Calm", use: ["Living rooms"] },
        { mood: "Calm", use: ["Bedrooms"] },
        { mood: "Calm", use: ["Accents"] },
      ]
    : [
        { mood: "Focused", use: ["Editorial"] },
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
    <b>${wada ? names : escapeText(id)}</b>
    <small>${wada ? `Combination #${id} · ${swatches.length} swatches` : names}</small>
    ${codes ? `<small>${codes}</small>` : ""}
  </button>`;
}

export function swatchOptions(combination: Combination, value: number, other: number) {
  return combination.swatches.map(({ name, hex }, index) =>
    `<option value="${index}" ${index === value ? "selected" : ""} ${index === other ? "disabled" : ""}>${escapeText(name)} · ${hex.toUpperCase()}</option>`,
  ).join("");
}

const select = (id: string, label: string, options: readonly string[]) =>
  `<label>${label}<select id="wada-${id}"><option value="">Any</option>${options.map((option) =>
    `<option>${option}</option>`,
  ).join("")}</select></label>`;

export function mountCollection(
  library: HTMLElement,
  tool: Tool,
  apply: (combination: Combination, trigger: HTMLButtonElement) => void,
) {
  library.innerHTML = `
    <div class="library-head">
      <h2 id="library-title">Colour combinations</h2>
      <button type="button" id="undo-palette" class="text-btn" aria-label="Undo palette" disabled>Undo</button>
    </div>
    <div class="library-search">
      <label>Search combinations<input id="wada-search" type="search" placeholder="Name, pigment, code or #48"></label>
      <button type="button" class="outline" id="wada-random">Randomize</button>
    </div>
    <div class="library-filters">
      <label>Swatch count<select id="wada-count">
        <option value="0">Any</option>${[2, 3, 4].map((count) => `<option value="${count}">${count} swatches</option>`).join("")}
      </select></label>
      ${Object.entries(facets).map(([key, [label, options]]) => select(key, label, options)).join("")}
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
  const count = el<HTMLSelectElement>("count");
  const results = el("results");
  const random = el<HTMLButtonElement>("random");
  const more = el<HTMLButtonElement>("more");
  const retry = el<HTMLButtonElement>("retry");
  const filters = Object.keys(facets).map((facet) =>
    [facet as Facet, el<HTMLSelectElement>(facet)] as const);
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
    matches = matchingCombinations(collection, Number(count.value), search.value).filter(({ tags }) =>
      filters.every(([facet, input]) => {
        const value = tags?.[facet];
        return !input.value || (typeof value === "string" ? value === input.value : value?.includes(input.value));
      }),
    );
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

  function show(combination: Combination, trigger: HTMLButtonElement) {
    setSelected(combination.id);
    apply(combination, trigger);
  }

  search.addEventListener("input", reset);
  for (const input of [count, ...filters.map(([, input]) => input)]) input.addEventListener("change", reset);
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
  random.addEventListener("click", () => {
    const result = randomCombination(matches, selected);
    if (result) show(result, random);
  });
  results.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-combination]");
    const match = button && matches.find(({ id }) => String(id) === button.dataset.combination);
    if (match) show(match, button);
  });

  filter();
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting || document.activeElement === more) return;
    if (loaded && !more.hidden) append(false);
    else void load();
  });
  observer.observe(more);
  return setSelected;
}

export function assignmentSelect(role: Role, combination: Combination, index: number, other: number) {
  return `<label>${labels[role]}<select id="swatch-${role}" data-swatch-role="${role}" aria-label="${labels[role]}">${swatchOptions(combination, index, other)}</select></label>`;
}
