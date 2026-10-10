// node tools/record-issue-117.mjs <cache-output-directory> <criterion-number>
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
const scene = Number(process.argv[3]);
assert.ok(scene >= 1 && scene <= 6);
await mkdir(out, { recursive: true });
const cache = resolve(process.env.HOME, ".cache/spaceship-management-sim-117");
const { chromium } = await import(pathToFileURL(resolve(cache, "node_modules/playwright-core/index.mjs")));
const fixture = resolve("tools/issue-117-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: [{
  name: "issue-117-demo-fixture",
  setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nObject.defineProperty(window, "__repro", { value: { get state() { return state; }, get ui() { return ui; } } });\nimport { installIssue117Demo } from ${JSON.stringify(fixture)};\ninstallIssue117Demo(ui, () => state, next => { state = next; });`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  },
}] });
const html = (await readFile("app/index.html", "utf8")).replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`);
const pagePath = resolve(out, "demo.html");
await writeFile(pagePath, html);
const browser = await chromium.launch({ executablePath: resolve(process.env.HOME, ".cache/ms-playwright/chromium-1243/chrome-linux64/chrome"), args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
page.on("pageerror", error => { throw error; });
const moments = [];
const started = Date.now();
const box = material => page.locator(`#ship-panel input[name="mine-material"][value="${material}"]`);
const snapshot = () => page.evaluate(() => window.issue117Demo.snapshot());
async function point(position) {
  return page.evaluate(({ x, y }) => {
    const { camera, viewport } = window.__repro.ui;
    return { x: (x - camera.center.x) * camera.zoom + viewport.width / 2, y: (y - camera.center.y) * camera.zoom + viewport.height / 2 };
  }, position);
}
async function select(id, shift = false) {
  const s = await snapshot();
  const p = await point(s.ships.find(ship => ship.id === id).position);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up("Shift");
  await page.waitForFunction(id => window.__repro.ui.selectedShips.includes(id), id);
}
async function only(material) {
  await box(material).check();
  await box(material === "Ice" ? "Metal" : "Ice").uncheck();
}
async function clock(paused) {
  await page.evaluate(paused => { window.__repro.ui.clock.paused = paused; }, paused);
}
async function hold(name, seconds = 3) {
  const clipped = await page.locator('#ship-panel dd[data-row="State"]').evaluateAll(cells => cells.some(cell => cell.scrollWidth > cell.clientWidth));
  assert.equal(clipped, false, "the ship panel must show its complete state, not an ellipsis");
  moments.push({ name, seconds: (Date.now() - started) / 1000 + 1 });
  console.log(name, (await page.locator("#ship-panel").innerText()).replaceAll("\n", " | "));
  await page.waitForTimeout(seconds * 1000);
}
async function site() {
  const s = await snapshot();
  const p = await point(s.stations[0].constructionSite.position);
  await page.mouse.move(p.x + 22, p.y);
  await page.waitForFunction(() => document.querySelector("#info-title").textContent === "Construction site" && !document.querySelector("#info").hidden);
}
async function deliver(material) {
  await clock(false);
  await page.waitForFunction(material => window.__repro.state.ships[0].state === "working" && window.__repro.state.ships[0].target && window.__repro.state.asteroids.find(rock => rock.id === window.__repro.state.ships[0].target.asteroidId)?.material === material, material);
  await hold(`criterion-${scene}-mining-${material}`, 2);
  await page.waitForFunction(material => window.__repro.state.stations[0].constructionSite.inventory[material] >= 10, material, { timeout: 60000 });
  await clock(true);
  const s = await snapshot();
  assert.ok(s.stations[0].constructionSite.inventory[material] >= 10);
  assert.equal(s.stations[0].constructionSite.inventory[material === "Ice" ? "Metal" : "Ice"], 0);
  await site();
  console.log("site stock", s.stations[0].constructionSite.inventory);
  await hold(`criterion-${scene}-delivered-${material}`, 4);
}
try {
  await page.goto(pathToFileURL(pagePath).href);
  await page.waitForFunction(() => !!window.issue117Demo && window.__repro.ui.viewport.width > 0);
  await page.evaluate(scene => window.issue117Demo.setup(scene), scene);
  await select(0);
  await page.evaluate(scene => {
    const label = document.createElement("div");
    label.textContent = `Criterion ${scene}`;
    label.style.cssText = "position:fixed;left:24px;top:20px;color:#f8fafc;font:18px monospace;pointer-events:none";
    document.body.append(label);
  }, scene);
  if (scene === 1) {
    assert.ok(await box("Metal").isChecked());
    assert.ok(await box("Ice").isChecked());
    await hold("criterion-1-both-ticked", 5);
  } else if (scene === 2) {
    await only("Ice");
    await site();
    await hold("criterion-2-empty-Ice", 2);
    await deliver("Ice");
    await page.evaluate(() => window.issue117Demo.setup(2));
    await select(0);
    await only("Metal");
    await site();
    await hold("criterion-2-empty-Metal", 2);
    await deliver("Metal");
  } else if (scene === 3) {
    await only("Ice");
    await clock(false);
    await page.waitForFunction(() => document.querySelector("#ship-panel").textContent.includes("Supplying site: Ice"));
    await clock(true);
    await hold("criterion-3-Ice", 4);
    await box("Metal").check();
    await page.waitForFunction(() => document.querySelector("#ship-panel").textContent.includes("Supplying site: Metal, Ice"));
    await hold("criterion-3-both", 4);
  } else if (scene === 4) {
    await only("Ice");
    await clock(false);
    await page.waitForFunction(() => document.querySelector("#ship-panel").textContent.includes("Waiting: no Ice"));
    const s = await snapshot();
    assert.deepEqual(s.ships[0].position, s.stations[0].dock.position);
    await hold("criterion-4-waiting", 4);
    await page.waitForFunction(() => window.__repro.state.asteroids.some(rock => rock.material === "Ice") && document.querySelector("#ship-panel").textContent.includes("Supplying site: Ice"), null, { timeout: 20000 });
    await hold("criterion-4-resumed", 4);
  } else if (scene === 5) {
    await only("Ice");
    await hold("criterion-5-default-Mine-Ice", 2);
    await clock(false);
    await page.waitForFunction(() => window.__repro.state.ships[0].state === "working");
    await hold("criterion-5-mining-Ice", 2);
    await page.waitForFunction(() => window.__repro.state.ships[0].state === "homebound" && window.__repro.state.ships[0].cargo > 0, null, { timeout: 60000 });
    await clock(true);
    await hold("criterion-5-loaded-Ice", 3);
    const p = await point((await snapshot()).stations[0].constructionSite.position);
    await page.mouse.click(p.x, p.y, { button: "right" });
    await page.waitForFunction(() => window.__repro.state.ships[0].order?.kind === "supplyBuild");
    await hold("criterion-5-one-off-order", 3);
    await clock(false);
    await page.waitForFunction(() => window.__repro.state.stations[0].constructionSite.inventory.Ice >= 10, null, { timeout: 60000 });
    await clock(true);
    assert.equal((await snapshot()).stations[0].constructionSite.inventory.Metal, 0);
    await site();
    await hold("criterion-5-delivered-Ice", 4);
    await clock(false);
    await page.waitForFunction(() => window.__repro.state.ships[0].order === null && window.__repro.state.ships[0].state === "working");
    assert.equal((await snapshot()).ships[0].cargoMaterial, "Ice");
    await hold("criterion-5-back-to-mining-Ice", 3);
    assert.equal((await snapshot()).ships[0].defaultBehaviour, "mine");
  } else {
    await select(1, true);
    await hold("criterion-6-multi-before", 2);
    await box("Metal").uncheck();
    assert.ok((await snapshot()).ships.every(ship => JSON.stringify(ship.mineMaterials) === '["Ice"]'));
    await hold("criterion-6-multi-after", 4);
    await select(0);
    assert.equal(await box("Metal").isChecked(), false);
    await hold("criterion-6-first-ship", 3);
    await select(1);
    assert.equal(await box("Metal").isChecked(), false);
    await hold("criterion-6-second-ship", 3);
  }
  await writeFile(resolve(out, "moments.json"), JSON.stringify(moments, null, 2));
} finally {
  await context.close();
  await browser.close();
}
const video = await page.video().path();
await writeFile(resolve(out, "video-path.txt"), video);
console.log(video);
