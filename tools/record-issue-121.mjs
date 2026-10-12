// node tools/record-issue-121.mjs <cache-output-directory>
import { build } from "esbuild";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const playwrightPath = resolve(process.env.HOME, ".cache/spaceship-management-sim-121/node_modules/playwright-core/index.js");
const { default: playwright } = await import(pathToFileURL(playwrightPath));
const fixture = resolve("tools/issue-121-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: [{
  name: "issue-121-demo-fixture",
  setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nObject.defineProperty(window, "__repro", { value: { get state() { return state; }, get ui() { return ui; } } });\nimport { installIssue121Demo } from ${JSON.stringify(fixture)};\ninstallIssue121Demo(ui, next => { state = next; });`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  },
}] });
const html = (await readFile("app/index.html", "utf8")).replace('<script type="module" src="./main.js"></script>', `<script type="module">${bundle.outputFiles[0].text}</script>`);
const pagePath = resolve(out, "demo.html");
await writeFile(pagePath, html);
const browser = await playwright.chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const started = Date.now();
const moments = [];
try {
  await page.goto(pathToFileURL(pagePath).href);
  await page.locator("#screen").waitFor({ state: "visible" });
  await page.waitForFunction(() => !!window.issue121Demo && window.__repro.ui.viewport.width > 0);
  for (let scene = 1; scene <= 8; scene++) {
    await page.evaluate(scene => window.issue121Demo.setup(scene), scene);
    await page.mouse.move(640, 450);
    await page.evaluate(() => { window.__repro.ui.pointer = { x: 640, y: 450 }; });
    // Hover the actual Storage position through the game's normal pointer path.
    const point = await page.evaluate(scene => {
      const { camera, viewport } = window.__repro.ui;
      const storage = window.__repro.state.stations[scene === 5 ? 1 : 0].storage.position;
      return { x: (storage.x - camera.center.x) * camera.zoom + viewport.width / 2, y: (storage.y - camera.center.y) * camera.zoom + viewport.height / 2 };
    }, scene);
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(scene === 2 || scene === 3 || scene === 7 || scene === 8 ? 3500 : 1800);
    // Freeze the observed rate after normal-speed simulation. For criterion 6
    // this is the visible pause action itself, not fixture state manipulation.
    await page.mouse.click(1118, 26);
    await page.mouse.move(point.x, point.y);
    const state = await page.evaluate(scene => {
      const station = window.__repro.state.stations[scene === 5 ? 1 : 0];
      return { time: window.__repro.state.time, line: document.querySelector("#info")?.innerText ?? "",
        inventory: station.inventory, builtAt: station.builtAt ?? 0,
        construction: station.construction?.type ?? null, deliveries: station.deliveries };
    }, scene);
    assert.match(state.line, /Income: Metal \+\d+\.\d+\/min, Ice \+\d+\.\d+\/min/);
    moments.push({ scene, seconds: (Date.now() - started) / 1000, ...state });
    const recent = state.deliveries.filter(delivery => delivery.at > state.time - 3600);
    const metal = recent.filter(delivery => delivery.material === "Metal").reduce((sum, delivery) => sum + delivery.amount, 0);
    const ice = recent.filter(delivery => delivery.material === "Ice").reduce((sum, delivery) => sum + delivery.amount, 0);
    const caption = scene === 1 ? `Storage line: ${state.line.split("\n").at(-1)}`
      : scene === 2 ? `Two hours in: ${metal} Metal and ${ice} Ice delivered within the last hour`
      : scene === 3 ? `Ship unloaded ${state.inventory.Metal} Metal into Storage; ${state.line.split("\n").at(-1)}`
      : scene === 4 ? `${(state.time / 60).toFixed(0)} minutes in: ${metal} Metal delivered; ${state.line.split("\n").at(-1)}`
      : scene === 5 ? `Station age ${((state.time - state.builtAt) / 60).toFixed(0)} minutes: ${metal} Metal delivered; ${state.line.split("\n").at(-1)}`
      : scene === 6 ? `Paused at game time ${state.time.toFixed(0)} seconds: ${state.line.split("\n").at(-1)}`
      : scene === 7 ? `${state.construction ?? "Build started"}; Storage has ${state.inventory.Metal} Metal; ${state.line.split("\n").at(-1)}`
      : `Only deliveries in the last hour count: ${metal} Metal; ${state.line.split("\n").at(-1)}`;
    await page.evaluate(({ scene, caption }) => {
      let label = document.getElementById("demo-caption");
      if (!label) { label = document.createElement("div"); label.id = "demo-caption"; label.style.cssText = "position:fixed;left:0;right:0;bottom:0;padding:12px;background:#081428ee;color:#fff;font:20px monospace;z-index:9999"; document.body.append(label); }
      label.textContent = `Criterion ${scene}: ${caption}`;
      const style = document.createElement("style"); style.textContent = "#info{font-size:20px;line-height:1.45;z-index:3} #info-title{font-size:22px}"; document.head.append(style);
    }, { scene, caption });
    await page.waitForTimeout(1900);
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(out, "moments.json"), JSON.stringify(moments, null, 2));
} finally {
  await context.close();
  await browser.close();
  await rename(await page.video().path(), resolve(out, "issue-121.webm"));
}
console.log(resolve(out, "issue-121.webm"));
