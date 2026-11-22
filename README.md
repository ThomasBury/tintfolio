# Tintfolio

Tintfolio is a static colour explorer with two editors. **Wall paint** opens at `/paint/` with a sage living room. Try a second colour on the ceiling or the feature wall, then switch to the bedroom or kitchen to see the same paints in another setting. **Website colours** opens at `/web/` with an editorial text pair. Expand it to a site palette to edit a button and its label. The root page opens Wall paint.

## Run locally

Use Node 24 and npm. The application uses Vite, vanilla TypeScript and Culori. It serves its own fonts and runs entirely in the browser.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. Each editor keeps its last valid design for the browser tab’s session. Share copies a link that opens the active colours and mode, including the selected room and surfaces for paint. A shared design takes precedence over an earlier session. Both editors export labelled SVG swatches. The website editor also copies CSS custom properties.

## Verify a release

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The browser suite starts a local server for `dist/` on port 4173. On Linux CI, use `npx playwright install --with-deps chromium` to also install the required system libraries. To use an installed Google Chrome, run `PW_CHANNEL=chrome npm run test:browser`. GitHub Actions runs the type check, unit tests, production build and browser journeys on pushes and pull requests.

To browse the production build or measure it, start the preview server.

```sh
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

With the preview server running, execute `npm run measure` in another terminal. Lighthouse uses an installed Chrome or Chromium. Set `CHROME_PATH` to the browser executable if discovery needs a hint.

## How colours are checked

Paint suggestions adjust OKLCH lightness and chroma. Low-chroma paints produce neutral tones. Each result is mapped into sRGB and converted to six-digit HEX before duplicates and unchanged suggestions are removed. The fixed ceiling and trim are included in the swatch sheet whenever those surfaces use neutrals. [Culori API reference](https://culorijs.org/api/)

Website contrast uses the final sRGB HEX colours and a 4.5:1 minimum for both text pairs. The displayed ratio is rounded to two decimals. Pass or fail uses the full precision result. The regression fixture `#777773` on white displays 4.50:1 and still needs adjustment. A proposed text correction is checked again after conversion to HEX. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

The six starting palettes and their design rationales live in [src/examples.json](src/examples.json).

## Mobile walkthrough

The automated journeys ran in Chrome with touch emulation at **360 × 640 CSS pixels**. They selected Ceiling, applied Mist and used Undo, then repeated the task with Text on accent and the button-text correction. Each check verified that the changed surface or button and the action were on screen. Both restored the original HEX. The suite also checked accessible names, primary target dimensions, keyboard focus, and horizontal overflow at 320 pixels.

With a focused HEX field, a separate check reduced the viewport to 320 × 340 and confirmed that an incomplete value and its feedback remained reachable. A native phone keyboard walkthrough is still pending. No outside participant tried these tasks.

## Mobile lab measurements

Each route is loaded three times in a fresh headless Chrome process. The script uses Lighthouse’s default mobile emulation and simulated throttling, with a 150 ms network round trip, 1,638.4 Kbps throughput and 4× CPU slowdown. Initial JavaScript is measured from the script requests observed on each route, including shared chunks. Each built file is gzip-compressed separately with Node’s default compression. The budgets are 75,000 bytes and 2,500 ms median largest contentful paint (LCP).

Local production build, 22 November 2026, Lighthouse 13.6.0 and headless Chrome 158 on Linux.

| Route | Three cold LCP runs (ms) | Median LCP | Initial JS, gzip |
| --- | --- | ---: | ---: |
| `/paint/` | 1,508 · 1,657 · 1,668 | 1,657 ms | 25,072 bytes |
| `/web/` | 1,422 · 1,451 · 1,608 | 1,451 ms | 25,072 bytes |

## Deploy with Cloudflare Pages

Connect the Git repository to a Cloudflare Pages project and use these build settings.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | Set `NODE_VERSION` to `24` |

Pages supplies `CF_PAGES_URL` during its build. Tintfolio uses it to give social crawlers absolute URLs for the two route-specific preview images. The output contains ordinary HTML entry points for both editors, so shared URLs work without a catch-all rewrite. [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
