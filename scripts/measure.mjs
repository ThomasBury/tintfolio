import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const origin = "http://127.0.0.1:4173";
for (const route of ["paint", "web"]) {
  const timings = [];
  let scriptBytes = 0;
  for (let run = 0; run < 3; run++) {
    const raw = execFileSync(
      process.execPath,
      [
        "node_modules/lighthouse/cli/index.js",
        origin + "/" + route + "/",
        "--quiet",
        "--only-categories=performance",
        "--output=json",
        "--output-path=stdout",
        "--chrome-flags=--headless --disable-dev-shm-usage",
      ],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    const report = JSON.parse(raw);
    if (report.runtimeError) throw Error(report.runtimeError.message);
    const lcp = report.audits["largest-contentful-paint"].numericValue;
    if (!Number.isFinite(lcp)) throw Error("Missing LCP");
    timings.push(lcp);
    const requests = report.audits["network-requests"].details.items;
    const files = new Set(
      requests.filter((r) => r.resourceType === "Script").map((r) => r.url),
    );
    if (!files.size) throw Error("No initial JavaScript measured");
    let bytes = 0;
    for (const file of files) {
      const url = new URL(file);
      if (url.origin !== origin)
        throw Error("Unexpected external script: " + file);
      bytes += gzipSync(readFileSync("dist" + url.pathname)).length;
    }
    scriptBytes = Math.max(scriptBytes, bytes);
    console.log(
      route,
      "run",
      run + 1,
      Math.round(lcp),
      "ms;",
      bytes,
      "JS gzip bytes",
    );
    if (run === 0)
      console.log(
        report.lighthouseVersion,
        report.environment.hostUserAgent,
        JSON.stringify(report.configSettings.throttling),
      );
  }
  const median = timings.sort((a, b) => a - b)[1];
  console.log(route, "median mobile LCP", Math.round(median), "ms");
  if (median > 2500 || scriptBytes > 75000) process.exitCode = 1;
}
