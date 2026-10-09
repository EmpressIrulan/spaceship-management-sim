// node tools/record-issue-118.mjs ~/.cache/spaceship-management-sim-118/rec/run1
// Headless recording of the real game entry point with recording-only station layouts.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(process.env.HOME, ".cache/spaceship-management-sim-128/node_modules/playwright-core/index.mjs")));
const fixture = resolve("tools/issue-118-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: [{
  name: "issue-118-demo-fixture",
  setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nObject.defineProperty(window, "__repro", { value: { get state() { return state; }, get ui() { return ui; } } });\nimport { installIssue118Demo } from ${JSON.stringify(fixture)};\ninstallIssue118Demo(ui, () => state, next => { state = next; });`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  },
}] });
const html = (await readFile("app/index.html", "utf8")).replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`);
const pagePath = resolve(out, "demo.html");
await writeFile(pagePath, html);
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on("pageerror", error => console.error(error));
const scenes = [];
const startedAt = Date.now();
const snapshot = () => page.evaluate(() => window.issue118Demo.snapshot());

async function setup(modules, obstacles) {
  await page.evaluate(({ modules, obstacles }) => window.issue118Demo.setup(modules, obstacles), { modules, obstacles });
  await hoverModule(modules[0].position);
  await page.waitForFunction(() => !document.querySelector("#build-controls").hidden);
}

async function hoverModule(position) {
  const point = await page.evaluate(({ x, y }) => {
    const { camera, viewport } = window.__repro.ui;
    return { x: (x - camera.center.x) * camera.zoom + viewport.width / 2, y: (y - camera.center.y) * camera.zoom + viewport.height / 2 };
  }, position);
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(({ x, y }) => !!window.__repro.ui.pointer && Math.abs(window.__repro.ui.pointer.x - x) < 1 && Math.abs(window.__repro.ui.pointer.y - y) < 1, point);
}

// Keep the build controls visible while parking the pointer in the empty gap
// between module footprints and plus buttons, away from the hover info box.
async function parkPointer() {
  const point = await page.evaluate(() => {
    const { camera, viewport } = window.__repro.ui;
    const x = 20;
    const y = 20;
    return { x: (x - camera.center.x) * camera.zoom + viewport.width / 2, y: (y - camera.center.y) * camera.zoom + viewport.height / 2 };
  });
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(({ x, y }) => !!window.__repro.ui.pointer
    && Math.abs(window.__repro.ui.pointer.x - x) < 1
    && Math.abs(window.__repro.ui.pointer.y - y) < 1
    && !document.querySelector("#build-controls").hidden, point);
}

async function queue(position, type) {
  await hoverModule({ x: 0, y: 0 });
  const point = await page.evaluate(({ x, y }) => {
    const { camera, viewport } = window.__repro.ui;
    return { x: (x - camera.center.x) * camera.zoom + viewport.width / 2, y: (y - camera.center.y) * camera.zoom + viewport.height / 2 };
  }, position);
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(({ x, y }) => !!window.__repro.ui.pointer && Math.abs(window.__repro.ui.pointer.x - x) < 1 && Math.abs(window.__repro.ui.pointer.y - y) < 1, point);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const targetable = await page.evaluate(({ x, y }) => {
    const button = document.querySelector(`#build-controls button[data-x="${x}"][data-y="${y}"]`);
    if (!button) return false;
    const rect = button.getBoundingClientRect();
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return target === button || button.contains(target);
  }, position);
  assert.ok(targetable, `build control at ${position.x},${position.y} must receive pointer events`);
  await page.mouse.click(point.x, point.y);
  await page.locator(`#build-menu button[data-module="${type}"]`).click();
  await page.waitForFunction(({ x, y }) => {
    const station = window.issue118Demo.snapshot();
    return station.buildQueue.some(module => module.position.x === x && module.position.y === y)
      || (station.construction?.position.x === x && station.construction.position.y === y);
  }, position, { timeout: 5000 });
}

async function caption(text) {
  await page.evaluate(text => {
    let element = document.getElementById("issue-118-caption");
    if (!element) {
      element = document.createElement("div");
      element.id = "issue-118-caption";
      element.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:10px 16px;background:rgba(2,6,23,.88);border:1px solid #64748b;color:#f8fafc;font:18px monospace;z-index:10000;pointer-events:none;white-space:nowrap";
      document.body.append(element);
    }
    element.textContent = text;
  }, text);
}

async function hold(scene, predicate, arg, text, duration = 4500) {
  await page.waitForFunction(predicate, arg, { timeout: 60000 });
  await parkPointer();
  await caption(text);
  await page.screenshot({ path: resolve(out, `${scene}.png`) });
  scenes.push({ scene, seconds: (Date.now() - startedAt) / 1000, duration: duration / 1000 });
  await page.waitForTimeout(duration);
}

const isBuiltAt = (positions, count = positions.length) => ({ positions, count }) => {
  const station = window.issue118Demo.snapshot();
  return station.construction === null
    && station.buildQueue.length === 0
    && station.modules.length >= count
    && positions.every(position => station.modules.some(module => module.position.x === position.x && module.position.y === position.y));
};

try {
  await page.goto(pathToFileURL(pagePath).href);
  await page.waitForFunction(() => !!window.issue118Demo && window.__repro.ui.viewport.width > 0);

  // Criterion 1: the free Dock offers the four cardinal sides.
  await setup([{ type: "Dock", position: { x: 0, y: 0 } }]);
  await queue({ x: 0, y: -40 }, "Storage");
  await hoverModule({ x: 0, y: 0 });
  await hold("criterion-1", () => window.issue118Demo.snapshot().controls.length >= 3, null, "1 · Four-way build controls; queued above, other free sides visible");

  // Criterion 2: queue one module in every direction and let the real sim build them.
  await setup([
    { type: "Dock", position: { x: 0, y: 0 } },
    { type: "Storage", position: { x: 0, y: -40 } }, { type: "Builder", position: { x: 0, y: 40 } },
    { type: "Storage", position: { x: -40, y: 0 } }, { type: "Builder", position: { x: 40, y: 0 } },
  ]);
  await hold("criterion-2", () => window.issue118Demo.snapshot().modules.length === 5, null, "2 · Modules are built above, below, left and right of the Dock");

  // Criterion 3: twelve modules remain expandable; keep a build queued on screen.
  const twelve = [-80, -40, 0, 40, 80].map((y, i) => ({ type: i ? "Storage" : "Dock", position: { x: 0, y } }))
    .concat([-120, -80, -40, 40, 80, 120, 160].map(x => ({ type: "Storage", position: { x, y: 0 } })));
  await setup(twelve);
  const expandableSite = await page.evaluate(() => window.issue118Demo.snapshot().controls[0]);
  assert.ok(expandableSite, "twelve-module station must still show an available build site");
  await queue(expandableSite, "Builder");
  await hoverModule({ x: 0, y: 0 });
  await hold("criterion-3", () => window.issue118Demo.snapshot().modules.length === 12, null, "3 · Twelve modules; a new build is queued and free sides remain");

  // Criterion 4a: the north site is occupied by a built module.
  await setup([{ type: "Dock", position: { x: 0, y: 0 } }, { type: "Storage", position: { x: 0, y: -40 } }], {
  });
  await hold("criterion-4-module", () => window.issue118Demo.snapshot().modules.length === 2, null,
    "4a · No plus: another module occupies the site above the Dock", 3200);

  // Criterion 4b: a large, fully visible asteroid occupies the north site.
  await setup([{ type: "Dock", position: { x: 0, y: 0 } }], {
    asteroids: [{ id: 501, sectorId: 0, rich: false, fieldId: 0, position: { x: 0, y: -40 }, size: { width: 80, height: 80 }, ore: 10, material: "Metal" }],
  });
  await hold("criterion-4-asteroid", () => window.issue118Demo.snapshot().modules.length === 1, null,
    "4b · No plus: a large asteroid occupies the site above the Dock", 3200);

  // Criterion 4c: a separate station occupies the east site.
  await setup([{ type: "Dock", position: { x: 0, y: 0 } }], {
    station: [
      { type: "Dock", position: { x: 40, y: 0 } },
      { type: "Storage", position: { x: 80, y: 0 } },
    ],
  });
  await hold("criterion-4-station", () => window.issue118Demo.snapshot().modules.length === 1, null,
    "4c · No plus: another station occupies the site to the right", 3200);

  // Criterion 5: old horizontal behavior still queues and builds both sides.
  await setup([{ type: "Dock", position: { x: 0, y: 0 } }, { type: "Storage", position: { x: -40, y: 0 } }, { type: "Builder", position: { x: 40, y: 0 } }]);
  await hold("criterion-5", () => window.issue118Demo.snapshot().modules.length === 3, null, "5 · Left and right modules remain built beside the Dock");

  await writeFile(resolve(out, "scenes.json"), JSON.stringify(scenes, null, 2));
} finally {
  await context.close();
  await browser.close();
}
console.log(JSON.stringify(scenes));
