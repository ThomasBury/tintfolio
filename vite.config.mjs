import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { combinations, swatches } = JSON.parse(
  readFileSync(new URL("./public/wada-combinations.json", import.meta.url), "utf8"),
);
const featured = [4, 125, 344].map((number) => {
  const [id, ...indices] = combinations[number - 1];
  return {
    id,
    swatches: indices.map((index) => {
      const [name, hex] = swatches[index];
      return { name, hex };
    }),
  };
});

export default defineConfig({
  define: { __FEATURED_COMBINATIONS__: featured },
  plugins: [
    {
      name: "social-image-origin",
      transformIndexHtml(html) {
        const origin = process.env.CF_PAGES_URL;
        return origin
          ? html.replace(
              /(property="og:image" content=")(\/[^"]+)/,
              (_, prefix, path) => prefix + new URL(path, origin).href,
            )
          : html;
      },
    },
    {
      name: "bundled-licences",
      generateBundle() {
        const packages = ["culori", "@fontsource/instrument-serif", "@fontsource-variable/dm-sans"];
        const notices = packages.map(pkg => pkg + "\n\n" + readFileSync("node_modules/" + pkg + "/LICENSE", "utf8"));
        this.emitFile({type: "asset", fileName: "licences.txt", source: notices.join("\n\n")});
      },
    },
  ],
  build: {
    rolldownOptions: {
      input: ["index.html", "paint/index.html", "web/index.html"],
    },
  },
});
