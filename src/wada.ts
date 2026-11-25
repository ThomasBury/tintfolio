import { contrast, correction, neutralText, passes } from "./colour.ts";
import { getColorDisplayName } from "./colour-name.ts";
import type { Role } from "./design.ts";

interface CollectionData {
  swatches: [name: string, hex: string][];
  combinations: [id: number, ...swatches: number[]][];
}
export interface Swatch {
  name: string;
  hex: string;
  code?: string;
}
export interface Combination {
  id: number | string;
  swatches: Swatch[];
  note?: string;
  starter?: number;
  tags?: { mood?: string; era?: string; use?: string[]; warmNeutral?: boolean };
}
export interface Assignment {
  role: Role;
  hex: string;
  source?: Swatch;
}

export function unpackCollection(data: CollectionData): Combination[] {
  const swatches = data.swatches.map(([name, hex]) => {
    if (typeof name !== "string" || typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex))
      throw new Error("Invalid collection swatch");
    return { name, hex };
  });
  if (data.combinations.length !== 348)
    throw new Error("Incomplete collection");
  return data.combinations.map(([id, ...indices], position) => {
    if (
      id !== position + 1 ||
      indices.length < 2 ||
      indices.length > 4 ||
      indices.some((index) => !Number.isInteger(index) || !swatches[index])
    )
      throw new Error("Invalid collection combination");
    return { id, swatches: indices.map((index) => swatches[index]), tags: { era: "Early Shōwa" } };
  });
}

export function combinationName({ id }: Combination) {
  return typeof id === "number" ? `Combination #${id}` : id;
}

export function combinationHexes({ swatches }: Combination) {
  return swatches.map(({ hex }) => hex.toUpperCase()).join(" · ");
}

export function combinationPigments({ swatches }: Combination) {
  return swatches.map((swatch) => getColorDisplayName(swatch.hex, swatch)).join(" · ");
}

export function matchingCombinations(
  collection: Combination[],
  count: number,
  query: string,
) {
  const term = query.trim().toLowerCase();
  const digits = term.replace(/^#\s*/, "");
  const byId = /^[0-9]+$/.test(digits);
  const numericHex = digits.length === 6 ? "#" + digits : "";
  const byCombinationName = term.includes(" · ");
  return collection.filter((combination) => {
    const { id, swatches } = combination;
    return (!count || swatches.length === count) &&
      (byId
        ? id === Number(digits) || swatches.some(({ hex }) => hex.toLowerCase() === numericHex)
        : (byCombinationName && (combinationHexes(combination).toLowerCase() === term ||
            combinationPigments(combination).toLowerCase() === term)) ||
          combinationName(combination).toLowerCase().includes(term) ||
          swatches.some(({ name, code, hex }) =>
            name.toLowerCase().includes(term) || code?.toLowerCase().includes(term) || hex.toLowerCase().includes(term)));
  });
}

export function randomCombination(matches: Combination[], current?: Combination["id"]): Combination | undefined {
  if (!matches.length) return;
  const eligible = matches.length > 1
    ? matches.filter(({ id }) => id !== current)
    : matches;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

function* orders(swatches: Swatch[]): Generator<Swatch[]> {
  if (!swatches.length) {
    yield [];
    return;
  }
  for (const [i, swatch] of swatches.entries()) {
    for (const rest of orders(swatches.filter((_, j) => i !== j))) {
      yield [swatch, ...rest];
    }
  }
}

function webOrder(swatches: Swatch[]) {
  let [background, text, accent, buttonText] = swatches;
  let fewestChanges = Infinity;
  let lightestBackground = 0;

  // Iterate in source order so the first assignment wins any remaining tie.
  for (const [bg, fg, button, label] of orders(swatches)) {
    const changes =
      Number(!passes(contrast(fg.hex, bg.hex))) +
      Number(label !== undefined && !passes(contrast(label.hex, button.hex)));
    // Relative luminance increases with contrast against black.
    const lightness = contrast(bg.hex, "#000000");
    if (
      changes < fewestChanges ||
      (changes === fewestChanges && lightness > lightestBackground)
    ) {
      [background, text, accent, buttonText] = [bg, fg, button, label];
      fewestChanges = changes;
      lightestBackground = lightness;
    }
  }

  return [background, text, accent, buttonText];
}

export function hasSourceContrast({ swatches, starter }: Combination) {
  const [background, text] = starter === undefined ? webOrder(swatches) : swatches;
  return passes(contrast(text.hex, background.hex));
}

export function assignWeb(swatches: Swatch[]): Assignment[] {
  const [background, text, accent, buttonText] = webOrder(swatches);
  const assignments: Assignment[] = [
    { role: "background", hex: background.hex.toUpperCase(), source: background },
    {
      role: "text",
      hex: correction(text.hex, background.hex) ?? text.hex.toUpperCase(),
      source: text,
    },
  ];
  if (accent) {
    assignments.push(
      { role: "accent", hex: accent.hex.toUpperCase(), source: accent },
      {
        role: "onAccent",
        hex: buttonText
          ? correction(buttonText.hex, accent.hex) ?? buttonText.hex.toUpperCase()
          : neutralText(accent.hex),
        source: buttonText,
      },
    );
  }
  return assignments;
}
