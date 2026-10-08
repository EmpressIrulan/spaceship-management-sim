// npm install --prefix ~/.cache/spaceship-management-sim-133 playwright-core
// node tools/record-ship-menu.mjs ~/.cache/spaceship-management-sim-133/rec/run1
// Headless recording of the real game entry point with a recording-only state driver.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const fixture = resolve("tools/ship-menu-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: [{
  name: "ship-menu-demo", setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nimport { installShipMenuDemo } from ${JSON.stringify(fixture)};\ninstallShipMenuDemo(ui, () => state, next => { state = next; }, shipMenuSystem);`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  },
}] });
const html = (await readFile("app/index.html", "utf8")).replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`);
const pagePath = resolve(out, "demo.html");
await writeFile(pagePath, html);
const { chromium } = await import(pathToFileURL(resolve(process.env.HOME, ".cache/spaceship-management-sim-133/node_modules/playwright-core/index.mjs")));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
page.on("pageerror", error => console.error(error));
const scenes = [];
const snapshot = () => page.evaluate(() => window.shipMenuDemo.snapshot());
async function hold(scene, predicate) {
  try { await page.waitForFunction(predicate, null, { timeout: 45000 }); }
  catch (error) { console.error(`scene ${scene} timed out; observed states: ${JSON.stringify((await snapshot()).states)}`); throw error; }
  scenes.push({ scene, seconds: (Date.now() - start) / 1000 });
  await page.waitForTimeout(5000);
}
const start = Date.now();
try {
  await page.goto(pathToFileURL(pagePath).href);
  await page.waitForFunction(() => !!window.shipMenuDemo);
  await page.evaluate(() => window.shipMenuDemo.start());
  const buttons = page.locator("#ship-panel button");
  const selects = page.locator('#ship-panel select[name="default"]');
  const originalButtons = await buttons.evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()));
  const originalSelect = await selects.evaluate(el => el.getBoundingClientRect().toJSON());
  await hold(1, () => {
    const s = window.shipMenuDemo.snapshot();
    return s.states.includes("working") && s.states.includes("homebound") && s.ship.state === "unloading";
  });
  assert.deepEqual(await buttons.evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON())), originalButtons);
  assert.deepEqual(await selects.evaluate(el => el.getBoundingClientRect().toJSON()), originalSelect);

  await page.evaluate(() => window.shipMenuDemo.resetMining());
  await selects.selectOption("none");
  await page.waitForFunction(() => window.shipMenuDemo.snapshot().ship.defaultBehaviour === "none");
  await selects.selectOption("mine");
  await selects.evaluate(el => { el.setAttribute("size", "4"); el.focus(); });
  const option = page.locator('#ship-panel select[name="default"] option:checked');
  await hold(2, () => window.shipMenuDemo.snapshot().cycleCount >= 1);
  assert.equal(await option.getAttribute("value"), "mine");
  await selects.evaluate(el => el.removeAttribute("size"));
  await selects.selectOption("none");
  await page.waitForFunction(() => window.shipMenuDemo.snapshot().ship.defaultBehaviour === "none");
  await hold("2b", () => window.shipMenuDemo.snapshot().ship.defaultBehaviour === "none");

  await page.evaluate(() => window.shipMenuDemo.resetMining());
  await page.locator('#speed-controls button[data-speed="1"]').click();
  await page.locator('#speed-controls button[data-speed="2"]').click();
  await hold(3, () => {
    const s = window.shipMenuDemo.snapshot();
    return s.ship.cargo > 0 && s.states.length >= 3;
  });
  await page.evaluate(() => window.shipMenuDemo.stop());
  await writeFile(resolve(out, "scenes.json"), JSON.stringify(scenes, null, 2));
} finally {
  await context.close(); await browser.close();
}
const video = await page.video().path();
await writeFile(resolve(out, "video-path.txt"), video);
console.log(video);
console.log(JSON.stringify(scenes));
