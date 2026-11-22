import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
export default defineConfig({
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
