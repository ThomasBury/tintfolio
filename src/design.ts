import examples from "./examples.json" with { type: "json" };

export type Tool = "paint" | "web";
export type Room = "living" | "bedroom" | "kitchen";
export type Pair = "ceiling" | "feature";
export const labels = {
  wall: "Main wall",
  ceiling: "Ceiling",
  feature: "Feature wall",
  trim: "Trim",
  background: "Background",
  text: "Text",
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
}
export const catalogue = examples;
export function example(tool: Tool, index = 0, room: Room = "living"): Design {
  const item = catalogue[tool][index];
  return {
    mode: item.mode,
    room,
    pair: "pair" in item && item.pair === "feature" ? "feature" : "ceiling",
    colours: {
      wall: "#A9B39E",
      ...neutral,
      feature: "#66765E",
      background: "#F3EEDF",
      text: "#353C30",
      accent: "#B59A6B",
      onAccent: "#FFFFFF",
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
  }
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
export function startDesign(tool: Tool) {
  const search = location.search;
  if (search) {
    const design = decode(tool, new URLSearchParams(search));
    return {
      design: design ?? example(tool),
      notice: design
        ? ""
        : "This design link is invalid. The starting palette is open.",
    };
  }
  try {
    const saved = JSON.parse(
      sessionStorage.getItem("tintfolio-" + tool) || "null",
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
  return { design: example(tool), notice: "" };
}
export function save(tool: Tool, d: Design) {
  try {
    sessionStorage.setItem(
      "tintfolio-" + tool,
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
