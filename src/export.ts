import { labels, palette, type Design } from "./design.ts";
export function css(d: Design) {
  return (
    ":root {\n" +
    palette(d)
      .map(
        ([r, v]) =>
          "  --" + (r === "onAccent" ? "text-on-accent" : r) + ": " + v + ";",
      )
      .join("\n") +
    "\n}"
  );
}
export function sheet(d: Design) {
  const colours = palette(d);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${110 + colours.length * 72}" viewBox="0 0 600 ${110 + colours.length * 72}" role="img" aria-labelledby="title"><title id="title">Tintfolio colour palette</title><rect width="100%" height="100%" fill="#FAF8F2"/><text x="32" y="55" fill="#292C27" font-family="Georgia,serif" font-size="32">Tintfolio palette</text>${colours.map(([r, v], i) => `<g transform="translate(32 ${82 + i * 72})"><rect width="80" height="52" rx="4" fill="${v}" stroke="#72726A"/><g fill="#292C27" font-family="sans-serif" font-size="19"><text x="108" y="32">${labels[r]}</text><text x="420" y="32">${v}</text></g></g>`).join("")}</svg>`;
}
