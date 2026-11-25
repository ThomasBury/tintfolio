import { oklab } from "culori";
import namedCombinations from "./named-combinations.json" with { type: "json" };
import { hex } from "./design.ts";

type ColourMetadata = { hex: string; name: string };
declare const __WADA_PIGMENTS__: [name: string, value: string][];

function pigmentName(value: string) {
  const name = value.trim();
  return name && !hex(name) && !/^(?:P )?\d+(?:-\d+)? (?:C|U|TCX|TPG|TN)$/i.test(name) ? name : undefined;
}

const wadaNames = new Map((typeof __WADA_PIGMENTS__ === "undefined" ? [] : __WADA_PIGMENTS__)
  .map(([name, value]) => [value.toUpperCase(), name]));
const curatedNames = new Map(namedCombinations.flatMap(({ swatches }) =>
  swatches.flatMap(({ hex, name }) => {
    const pigment = pigmentName(name);
    return pigment ? [[hex.toUpperCase(), pigment] as const] : [];
  })));

const references = [
  ["Black", "#000000"], ["Near Black", "#111111"], ["Charcoal", "#343638"],
  ["Dark Gray", "#606060"], ["Slate Gray", "#5B6471"], ["Gray", "#808080"], ["Silver Gray", "#C3C4C5"],
  ["White", "#FFFFFF"], ["Soft White", "#F8F7F2"], ["Chalk Cream", "#F3E5D5"],
  ["Ivory", "#F5F0E6"],
  ["Sand", "#D2B18C"], ["Taupe", "#998877"], ["Chestnut Brown", "#774535"],
  ["Warm Terracotta", "#C78E76"], ["Apricot", "#ECB393"], ["Burnt Orange", "#C25321"],
  ["Amber", "#E38E2F"], ["Golden Yellow", "#F2CD43"], ["Mustard", "#AD8426"],
  ["Olive", "#777341"], ["Dark Olive", "#353C30"], ["Moss Green", "#536D49"],
  ["Soft Sage", "#A9B39E"], ["Mint", "#AEE8CB"], ["Leaf Green", "#4A9B42"],
  ["Forest Green", "#24553F"], ["Teal", "#247F7A"], ["Turquoise", "#32BDB7"],
  ["Mist Blue", "#C3D0D0"], ["Slate Blue", "#657F89"], ["Sky Blue", "#78BBE7"],
  ["Cobalt Blue", "#2659BB"], ["Navy", "#1C2541"], ["Midnight Ink", "#1C1F2A"], ["Violet", "#8642AC"],
  ["Lavender", "#C0AADE"], ["Deep Plum", "#332C38"], ["Lilac", "#AE79B7"],
  ["Pale Blush", "#F9EDE7"], ["Rose Pink", "#E289A8"], ["Orchid Pink", "#F16AB7"],
  ["Berry", "#952554"], ["Burgundy", "#681B2C"], ["Crimson", "#BA2437"],
  ["Coral", "#F16E63"], ["Scarlet", "#E33929"],
].map(([name, value]) => ({ name, lab: oklab(value)! }));

export function getColorDisplayName(value: string, metadata?: ColourMetadata) {
  const colour = hex(value.trim());
  if (!colour) return "Unknown colour";
  if (metadata && hex(metadata.hex) === colour) {
    const name = pigmentName(metadata.name);
    if (name) return name;
  }
  const exact = curatedNames.get(colour) ?? wadaNames.get(colour);
  if (exact) return exact;

  const lab = oklab(colour)!;
  let nearest = "Unknown colour";
  let distance = Infinity;
  for (const reference of references) {
    const sample = reference.lab;
    const squared = (lab.l - sample.l) ** 2 + (lab.a - sample.a) ** 2 + (lab.b - sample.b) ** 2;
    if (squared < distance) {
      distance = squared;
      nearest = reference.name;
    }
  }
  return nearest;
}
