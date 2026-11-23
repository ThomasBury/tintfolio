import examples from "./examples.json" with { type: "json" };

export type Tool = "paint" | "web";
export type Room = "living" | "bedroom" | "kitchen";
export type Pair = "ceiling" | "feature";
export const lightingPresets = {
  north: "North-facing daylight",
  golden: "Golden hour",
  evening: "Warm evening (2700 K)",
} as const;
export type Lighting = keyof typeof lightingPresets;
export type Theme = "light" | "dark";
export const labels = {
  wall: "Main wall",
  ceiling: "Ceiling",
  feature: "Feature wall",
  trim: "Trim",
  background: "Background",
  text: "Primary Text",
  accent: "Accent",
  onAccent: "Text on accent",
} as const;
export type Role = keyof typeof labels;
export const rooms = {
  living: "Living room",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
} as const;
export const neutral = { ceiling: "#F5F0E6", trim: "#EBE4D7" };
export const defaultFloor = "#D2B18C";
export interface Design {
  mode: string;
  room: Room;
  pair: Pair;
  colours: Record<Role, string>;
  floor?: string;
  door?: string;
  lighting: Lighting;
  theme: Theme;
}
export const catalogue = examples;
export function example(tool: Tool, index = 0, room: Room = "living"): Design {
  const item = catalogue[tool][index];
  return {
    mode: item.mode,
    room,
    lighting: "north",
    theme: "light",
    pair: "pair" in item && item.pair === "feature" ? "feature" : "ceiling",
    colours: {
      wall: "#A9B39E",
      ...neutral,
      feature: "#66765E",
      background: "#F3EEDF",
      text: "#353C30",
      accent: "#B59A6B",
      onAccent: "#000000",
      ...item.colours,
    },
  };
}
export function editable(d: Design): Role[] {
  switch (d.mode) {
    case "single":
      return ["wall"];
    case "pair":
      return ["wall", d.pair];
    case "site":
      return ["background", "text", "accent", "onAccent"];
    default:
      return ["background", "text"];
  }
}
export function ceilingColour(d: Design) {
  if (d.mode === "single") return d.colours.wall;
  return d.pair === "ceiling" ? d.colours.ceiling : neutral.ceiling;
}
export function palette(d: Design): [Role, string][] {
  const entries: [Role, string][] = editable(d).map((r) => [r, d.colours[r]]);
  if (d.mode === "single" || d.mode === "pair") {
    if (!entries.some(([r]) => r === "ceiling"))
      entries.push(["ceiling", ceilingColour(d)]);
    entries.push(["trim", neutral.trim]);
  }
  return entries;
}
export function hex(input: string) {
  return /^#?[\da-f]{6}$/i.test(input)
    ? "#" + input.replace("#", "").toUpperCase()
    : null;
}
export function shareParams(tool: Tool, d: Design) {
  const p = new URLSearchParams({ mode: d.mode });
  if (tool === "paint") {
    p.set("room", d.room);
    if (d.mode === "pair") p.set("pair", d.pair);
    if (d.floor) p.set("floor", d.floor.slice(1));
    if (d.door) p.set("door", d.door.slice(1));
    p.set("lighting", d.lighting);
  } else p.set("theme", d.theme);
  for (const r of editable(d)) p.set(r, d.colours[r].slice(1));
  return p;
}
export function decode(tool: Tool, p: URLSearchParams): Design | null {
  const d = example(tool);
  const mode = p.get("mode") || "";
  if (
    !(tool === "paint" ? ["single", "pair"] : ["text", "site"]).includes(mode)
  )
    return null;
  d.mode = mode;
  if (tool === "paint") {
    const lighting = p.get("lighting") ?? d.lighting;
    if (!Object.hasOwn(lightingPresets, lighting)) return null;
    d.lighting = lighting as Lighting;
    const room = p.get("room") as Room;
    if (!Object.hasOwn(rooms, room)) return null;
    d.room = room;
    if (mode === "pair") {
      const pair = p.get("pair");
      if (pair !== "ceiling" && pair !== "feature") return null;
      d.pair = pair;
    }
    if (p.has("floor")) {
      const floor = hex(p.get("floor") || "");
      if (!floor) return null;
      d.floor = floor;
    }
    if (p.has("door")) {
      const door = hex(p.get("door") || "");
      if (!door) return null;
      d.door = door;
    }
  } else {
    const theme = p.get("theme") ?? d.theme;
    if (theme !== "light" && theme !== "dark") return null;
    d.theme = theme;
  }
  for (const r of editable(d)) {
    const value = hex(p.get(r) || "");
    if (!value) return null;
    d.colours[r] = value;
  }
  const expected = shareParams(tool, d);
  if (
    Array.from(p.keys()).some(
      (k) => !expected.has(k) || p.getAll(k).length !== 1,
    )
  )
    return null;
  return d;
}
function sessionKey(tool: Tool, preset?: string) {
  return "tintfolio-" + tool + (preset ? location.pathname : "");
}

export function startDesign(tool: Tool, preset?: string) {
  const fallback = (preset && decode(tool, new URLSearchParams(preset))) || example(tool);
  const search = location.search;
  if (search) {
    const design = decode(tool, new URLSearchParams(search));
    return {
      design: design ?? fallback,
      notice: design
        ? ""
        : "This design link is invalid. The starting palette is open.",
    };
  }
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(sessionKey(tool, preset)) || "null",
    );
    if (saved) {
      const d = decode(tool, new URLSearchParams(saved.active));
      if (
        d &&
        Object.keys(d.colours).every(
          (k) =>
            typeof saved.colours?.[k] === "string" && hex(saved.colours[k]),
        )
      ) {
        d.colours = {
          ...saved.colours,
          ...Object.fromEntries(editable(d).map((r) => [r, d.colours[r]])),
        };
        if (saved.pair === "feature" && d.mode === "single") d.pair = "feature";
        return { design: d, notice: "" };
      }
    }
  } catch {
    /* Storage is optional. */
  }
  return { design: fallback, notice: "" };
}
export function save(tool: Tool, d: Design, preset?: string) {
  try {
    sessionStorage.setItem(
      sessionKey(tool, preset),
      JSON.stringify({
        active: shareParams(tool, d).toString(),
        colours: d.colours,
        pair: d.pair,
      }),
    );
  } catch {
    /* The in-memory design remains editable. */
  }
}
