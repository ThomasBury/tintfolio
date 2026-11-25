import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { combinations, swatches } = JSON.parse(
  readFileSync(new URL("./public/wada-combinations.json", import.meta.url), "utf8"),
);
const featured = [4, 125, 344].map((number) => {
  const [id, ...indices] = combinations[number - 1];
  return { id, swatches: indices.map((index) => {
    const [name, hex] = swatches[index];
    return { name, hex };
  }) };
});

const pilots = [
  {
    tool: "paint",
    path: "/wall-paint/sage-green-and-warm-cream-living-room",
    title: "Sage green and warm cream for a living room",
    description: "Try soft sage walls and a warm cream ceiling under three light settings.",
    preset: "mode=pair&room=living&pair=ceiling&wall=A9B39E&ceiling=F3E5D5&lighting=north",
    guidance: "Use soft sage (#A9B39E) on the walls and warm cream (#F3E5D5) overhead. The cream picks up the warmth of oak or linen. Compare north-facing daylight with warm evening light, then check a sample where the wall meets the ceiling.",
  },
  {
    tool: "web",
    path: "/website-colours/high-contrast-cream-and-plum-palette",
    title: "High-contrast cream and plum for websites",
    description: "Preview cream and deep plum on a dashboard with teal buttons and cream input surfaces.",
    preset: "mode=site&background=F3EADF&text=492E46&accent=35615E&onAccent=FFFFFF&theme=light",
    guidance: "Set paragraphs in deep plum (#492E46) on warm cream (#F3EADF). Reserve teal (#35615E) and white (#FFFFFF) for the primary action. Check the muted text, input border and alert icon separately, especially after switching to the dark preview.",
  },
];

const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const origin = process.env.TINTFOLIO_ORIGIN ?? "https://tintfolio.bury-thomas.workers.dev";
const originUrl = new URL(origin);
if (originUrl.origin !== origin || !["https:", "http:"].includes(originUrl.protocol))
  throw new Error("TINTFOLIO_ORIGIN must be an HTTP(S) origin without a trailing slash, query or path.");
const canonical = (path) => new URL(path, origin).href;

function pilotHtml(editor, { tool, path, title, description, preset, guidance }) {
  const pairing = `<section class="pairing" aria-labelledby="pairing-title"><h2 id="pairing-title">Pairing guidance</h2><p>${escape(guidance)}</p><a href="/${tool}/">Open the ${tool === "paint" ? "Wall paint" : "Website colours"} studio</a></section>`;
  const html = editor
    .replace(/(<title>|property="og:title" content=")[^"<]+/g, `$1${escape(title)} · Tintfolio`)
    .replace(/((?:name|property)="(?:og:)?description"\s+content=")[^"]+/g, `$1${escape(description)}`)
    .replace(/(rel="canonical" href=")[^"]+/, `$1${escape(canonical(path))}`)
    .replace(`data-tool="${tool}"`, `data-tool="${tool}" data-preset="${escape(preset)}"`);
  return html
    .replace(/<h1 class="sr">[^<]+<\/h1>/,
      `<div class="intro"><h1>${escape(title)}</h1><p>${escape(description)}</p></div>`)
    .replace(/<\/main>(?:\s*<footer class="wrap" aria-label="Pairing guide">[\s\S]*?<\/footer>)?/, `${pairing}</main>`);
}

export default defineConfig({
  appType: "mpa",
  define: { __FEATURED_COMBINATIONS__: featured, __WADA_PIGMENTS__: swatches },
  plugins: [
    {
      name: "canonical-editor-pages",
      transformIndexHtml(html, { path }) {
        const route = path.replace(/index\.html$/, "");
        if (!["/paint/", "/web/"].includes(route)) return html;
        const head = `<link rel="canonical" href="${escape(canonical(route))}" />`;
        html = html.replace("</head>", `  ${head}\n  </head>`);
        return html.replace(
          /(property="og:image" content=")(\/[^"]+)/,
          (_, prefix, image) => prefix + escape(canonical(image)),
        );
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const path = req.url?.split("?")[0];
          const pilot = pilots.find((item) => item.path === path);
          if (!pilot) return next();
          try {
            const editor = `/${pilot.tool}/index.html`;
            const template = readFileSync(new URL("." + editor, import.meta.url), "utf8");
            const html = await server.transformIndexHtml(editor, template, req.url);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(pilotHtml(html, pilot));
          } catch (error) {
            next(error);
          }
        });
      },
      generateBundle: {
        order: "post",
        handler(_, bundle) {
          for (const pilot of pilots) {
            const { tool, path } = pilot;
            const editor = bundle[`${tool}/index.html`].source.toString();
            const source = pilotHtml(editor, pilot);
            this.emitFile({ type: "asset", fileName: path.slice(1) + ".html", source });
          }
          const urls = ["/paint/", "/web/", ...pilots.map(({ path }) => path)]
            .map((path) => `  <url><loc>${escape(canonical(path))}</loc></url>`);
          this.emitFile({ type: "asset", fileName: "sitemap.xml", source:
            ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>", ""].join("\n"),
          });
        },
      },
    },
    {
      name: "bundled-licences",
      generateBundle() {
        const packages = {
          culori: "LICENSE",
          "apca-w3": "LICENSE.md",
          colorparsley: "LICENSE.md",
          "@fontsource/instrument-serif": "LICENSE",
          "@fontsource-variable/dm-sans": "LICENSE",
          "@fontsource-variable/geist": "LICENSE",
          "@fontsource-variable/geist-mono": "LICENSE",
        };
        const notices = Object.entries(packages).map(([pkg, file]) =>
          pkg + "\n\n" + readFileSync(`node_modules/${pkg}/${file}`, "utf8"));
        this.emitFile({ type: "asset", fileName: "licences.txt", source: notices.join("\n\n") });
      },
    },
  ],
  build: {
    rolldownOptions: {
      input: ["index.html", "paint/index.html", "web/index.html"],
    },
  },
});
