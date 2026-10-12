// node tools/record-issue-122.mjs <output-directory>
import { build } from "esbuild";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const { default: playwright } = await import(pathToFileURL(resolve(process.env.HOME, ".cache/spaceship-management-sim-128/node_modules/playwright-core/index.js")));
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: [{
  name: "issue-122-demo-fixture",
  setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nObject.defineProperty(window, "__repro", { value: { get state() { return state; }, get ui() { return ui; }, openShipMenu: shipMenuSystem.openShipMenu } });\nimport { installIssue122Demo } from ${JSON.stringify(resolve("tools/issue-122-demo-fixture.ts"))};\ninstallIssue122Demo(ui, next => { state = next; });`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  },
}] });
const html = (await readFile("app/index.html", "utf8")).replace('<script type="module" src="./main.js"></script>', `<script type="module">${bundle.outputFiles[0].text}</script>`);
const pagePath = resolve(out, "demo.html");
await writeFile(pagePath, html);
const browser = await playwright.chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"], timeout: 20000 });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.stack ?? error.message));
const started = Date.now();
const moments = [];
try {
  await page.goto(pathToFileURL(pagePath).href);
  await page.waitForFunction(() => !!window.__repro);
  await page.addStyleTag({ content: "#info{font-size:20px;line-height:1.4} #info-title{font-size:22px}" });
  async function show(criterion, caption, fn, hold = 2500) {
    await page.evaluate(fn);
    await page.evaluate(({ criterion, caption }) => {
      let label = document.querySelector("#demo-criterion");
      if (!label) { label = document.createElement("div"); label.id = "demo-criterion"; label.style.cssText = "position:fixed;left:24px;top:18px;padding:10px 14px;color:#fff;background:#081428ee;border:1px solid #94a3b8;font:22px monospace;z-index:10000;pointer-events:none"; document.body.append(label); }
      label.textContent = `Criterion ${criterion}: ${caption}`;
    }, { criterion, caption });
    moments.push({ criterion, caption, seconds: (Date.now() - started) / 1000 });
    await page.waitForTimeout(hold);
  }
  await show(1, "Select the starting miner: count its outlined blocks", () => { window.__repro.ui.camera = { center: { x: 0, y: 0 }, zoom: 10 }; window.__repro.ui.selectedShips = [0]; window.__repro.ui.selectedShip = 0; });
  await show(2, "Deselect: the outline disappears", () => { window.__repro.ui.selectedShips = []; window.__repro.ui.selectedShip = null; });
  await show(3, "Select two ships: neither has an outline", () => { window.__repro.ui.selectedShips = [0, 1]; window.__repro.ui.selectedShip = 0; });
  await show(4, "Only the selected ship is outlined", () => { window.__repro.ui.selectedShips = [1]; window.__repro.ui.selectedShip = 1; });
  await show(5, "Empty design squares stay open", () => { window.__repro.ui.selectedShips = [1]; window.__repro.ui.selectedShip = 1; });
  await show(6, "The outline remains visible at wide and close zoom", () => { window.__repro.ui.selectedShips = [0]; window.__repro.ui.selectedShip = 0; window.__repro.ui.camera = { center: { x: -25, y: 0 }, zoom: 2 }; });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__repro.ui.camera.zoom = 12);
  await page.waitForTimeout(1500);
  await show(7, "Faint lines preserve the block colours", () => { window.__repro.ui.camera.zoom = 18; });
  await show(8, "Build ship: starting miner design", () => {
    const { state, ui, openShipMenu } = window.__repro;
    openShipMenu(state.stations[0].modules.length - 1);
    const design = state.ships[0].design;
    ui.draft.cells = new Map(design.slots.flatMap((slot, i) => slot ? [[`${i % design.width},${Math.floor(i / design.width)}`, slot]] : []));
    ui.paintView = { center: { x: design.width / 2, y: design.height / 2 }, zoom: 48 };
  });
  for (const id of [1, 2]) {
    await page.evaluate(id => {
      const { state, ui } = window.__repro;
      const design = state.ships[id].design;
      ui.draft.cells = new Map(design.slots.flatMap((slot, i) => slot ? [[`${i % design.width},${Math.floor(i / design.width)}`, slot]] : []));
      ui.paintView = { center: { x: design.width / 2, y: design.height / 2 }, zoom: 48 };
      document.querySelector("#demo-criterion").textContent = `Criterion 8: Build ship design ${id + 1}`;
    }, id);
    await page.waitForTimeout(2000);
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(resolve(out, "moments.json"), JSON.stringify(moments, null, 2));
  await context.close();
  await browser.close();
  await rename(await page.video().path(), resolve(out, "issue-122-demo.webm"));
}
console.log("Recorded criteria 1–8");
