# Tintfolio

[Open Tintfolio](https://tintfolio.bury-thomas.workers.dev/)

Tintfolio is a static colour explorer with two editors. **Wall paint** opens at `/paint/` with an illustrated sage living room. Try one paint across the walls and ceiling or assign a second colour to the ceiling or feature wall. **Website colours** opens at `/web/` with a sample dashboard. Try a colour pair or edit a full site palette and check its contrast in light and dark previews. The root page opens Wall paint.

## Run locally

Use Node 24, npm and [Just](https://just.systems/man/en/). Tintfolio uses Vite, vanilla TypeScript and Culori and serves its own fonts.

```sh
just install
just serve
```

Open the URL Vite prints. Run `just` to list commands or `just serve 5174` to choose a different port.

## Using the studios

Both editors open on **Explore**. Search presets by name, pigment, code, HEX or Wada number, or filter by source, swatch count and style. **High Contrast** in Website colours finds palettes whose assigned source text and background already meet 4.5:1. Click or tap a preset to apply it. On a desktop, hover to audition it and move away to return to the active design. **Randomize** uses the current filters, and **Undo** restores the previous palette.

Select a canvas surface or an active swatch to open **Tune**. Edit the HEX, lightness or warmth, see Paint suggestions or Website contrast, and lock any swatches you want to carry into the next preset. With focus on the workspace itself, press Space to randomize, S to swap roles, or Left and Right to cycle through the filtered Wada presets. On a phone you can collapse the palette sheet while you assess the preview.

Each editor remembers the last design in the browser tab. A valid share URL takes precedence and includes the active colours, lighting or theme. **Saved swatches** stores up to four designs per editor in the browser for comparison and restore.

- **Paint spec sheet** lists the paint HEX for each surface and the existing floor. Use the print dialog to print it or save a PDF. The lighting presets are approximate. Check a physical sample where the paint will be used. **Tint a photo** works in the browser. A shared link opens the illustrated room with the same design.
- **Export theme** uses the active dashboard colours. Copy or download HEX or OKLCH CSS variables, Tailwind v4 `@theme` CSS, or sRGB DTCG JSON for Figma Variables. [Tailwind theme variables](https://tailwindcss.com/docs/theme) · [Figma mode import](https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables/)

Paint suggestions adjust OKLCH lightness and chroma, then map each suggestion into sRGB before checking for duplicates. Web contrast also uses the final sRGB values. It checks body and large text against AA and AAA and required borders and icons against 3:1 AA. Pass decisions use the full ratio. For example, `#777773` on white displays 4.50:1 and fails body AA. [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

The 348 numbered palettes keep Sanzo Wada’s swatch names, HEX values and swatch order from upstream revision `c142bd0bc8049ea48db4da5eb397981f047e8ef4`. Bold and Warm Neutral use reviewed tags on curated palettes. [Starting palettes](src/examples.json) · [Named palettes](src/named-combinations.json) · [Wada dataset](https://github.com/mattdesl/dictionary-of-colour-combinations/tree/c142bd0bc8049ea48db4da5eb397981f047e8ef4) · [MIT notice](public/wada-license.txt)

## Verify a release

```sh
just install-browser
just check
```

`just check` runs TypeScript, unit tests, the production build and browser tests. The browser suite serves `dist/` on port 4173. Run `PW_CHANNEL=chrome just test-browser` to use installed Google Chrome. The sole GitHub Actions workflow runs these checks on pull requests.

Run `just preview` and then `just measure` in another terminal for the production build’s performance check. The script measures three cold loads per editor with Lighthouse mobile emulation and simulated throttling. The budgets are 75,000 gzip bytes of initial JavaScript and 2,500 ms median largest contentful paint (LCP). Set `CHROME_PATH` to an installed browser if discovery needs a hint.

The build generates both pairing pages from the editor templates. Their pairing guidance is readable without JavaScript. The site includes clean canonical URLs in its sitemap and uses the same canonicals for shared query variants.

## Deploy with Cloudflare Workers

The production origin is `https://tintfolio.bury-thomas.workers.dev`. Workers Static Assets serves `dist/` with a real 404 for unknown URLs. Use the existing **tintfolio** Worker’s **Settings → Builds** for the GitHub integration. [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [Static asset routing](https://developers.cloudflare.com/workers/static-assets/routing/)

| Setting | Value |
| --- | --- |
| Git repository | `ThomasBury/tintfolio` |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Deploy command | `npx --no-install wrangler deploy` |
| Preview command | `npx --no-install wrangler preview` |
| Build variables | `NODE_VERSION=24`, `TINTFOLIO_ORIGIN=https://tintfolio.bury-thomas.workers.dev` |

Enable **Builds for Preview branches**. Native `workers.dev` Preview URLs send `X-Robots-Tag: noindex`. Wrangler is pinned in `package.json` and `package-lock.json`. Require the `build` GitHub Actions job on an up-to-date branch and require a pull request to merge to `main`, including for administrators. [Workers Previews](https://developers.cloudflare.com/workers/previews/) · [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

Before handing over a release, check the single GitHub workflow and Cloudflare Preview on the PR. After merging, confirm one production deployment in Cloudflare and smoke-test both editors, the pilot pages and a previously shared link. If a legacy hostname is discovered, keep its redirect on the old hostname with the incoming path and query string intact.

To roll back, open **Workers & Pages → tintfolio → Deployments**, select the last known-good version’s menu and choose **Rollback**. Confirm the new active deployment and open both editors. [Cloudflare rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
