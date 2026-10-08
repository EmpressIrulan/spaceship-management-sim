// node tools/record-issue-128.mjs ~/.cache/spaceship-management-sim-128/rec/run1
// Headless recording of the real game entry point with recording-only station layouts.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(process.env.HOME, ".cache/spaceship-management-sim-128/node_modules/playwright-core/index.mjs")));
const fixture = resolve("tools/issue-128-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: [{
  name: "issue-128-demo-fixture",
  setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nObject.defineProperty(window, "__repro", { value: { get state() { return state; }, get ui() { return ui; } } });\nimport { installIssue128Demo } from ${JSON.stringify(fixture)};\ninstallIssue128Demo(ui, () => state, next => { state = next; });`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  },
}] });
const html = (await readFile("app/index.html", "utf8")).replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`);
const pagePath = resolve(out, "demo.html");
await writeFile(pagePath, html);
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
page.on("pageerror", error => console.error(error));
const scenes = [];
const startedAt = Date.now();
const snapshot = () => page.evaluate(() => window.issue128Demo.snapshot());

async function setup(modules) {
  await page.evaluate(modules => window.issue128Demo.setup(modules), modules);
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
    const station = window.issue128Demo.snapshot();
    return station.buildQueue.some(module => module.position.x === x && module.position.y === y)
      || (station.construction?.position.x === x && station.construction.position.y === y);
  }, position, { timeout: 5000 });
}

async function caption(text) {
  await page.evaluate(text => {
    let element = document.getElementById("issue-128-caption");
    if (!element) {
      element = document.createElement("div");
      element.id = "issue-128-caption";
      element.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:10px 16px;background:rgba(2,6,23,.88);border:1px solid #64748b;color:#f8fafc;font:18px monospace;z-index:10000;pointer-events:none;white-space:nowrap";
      document.body.append(element);
    }
    element.textContent = text;
  }, text);
}

async function hold(scene, predicate, arg, text) {
  await page.waitForFunction(predicate, arg, { timeout: 60000 });
  await caption(text);
  scenes.push({ scene, seconds: (Date.now() - startedAt) / 1000 });
  await page.waitForTimeout(4500);
}

const isBuiltAt = (positions, count = positions.length) => ({ positions, count }) => {
  const station = window.issue128Demo.snapshot();
  return station.construction === null
    && station.buildQueue.length === 0
    && station.modules.length >= count
    && positions.every(position => station.modules.some(module => module.position.x === position.x && module.position.y === position.y));
};

try {
  await page.goto(pathToFileURL(pagePath).href);
  await page.waitForFunction(() => !!window.issue128Demo && window.__repro.ui.viewport.width > 0);

  // Criterion 1: a one-module station queues north and south, then finishes both.
  await setup([{ type: "Dock", position: { x: 0, y: 0 } }]);
  await queue({ x: 0, y: -40 }, "Storage");
  await queue({ x: 0, y: 40 }, "Builder");
  await hold("1-queued", () => {
    const s = window.issue128Demo.snapshot();
    return (s.construction?.position.y === -40 || s.buildQueue.some(m => m.position.y === -40))
      && s.buildQueue.some(m => m.position.y === 40);
  }, null, "1 · One module, construction queued above and below");
  await page.evaluate(() => window.issue128Demo.unpause());
  await hold("1-built", isBuiltAt([{ x: 0, y: -40 }, { x: 0, y: 40 }]), { positions: [{ x: 0, y: -40 }, { x: 0, y: 40 }], count: 3 }, "1 · Both modules built above and below");

  // Criterion 2: from a built left module, queue another left and one above it.
  await setup([{ type: "Dock", position: { x: 0, y: 0 } }, { type: "Storage", position: { x: -40, y: 0 } }]);
  await queue({ x: -80, y: 0 }, "Builder");
  await queue({ x: -40, y: -40 }, "Storage");
  await hold("2-queued", () => {
    const s = window.issue128Demo.snapshot();
    return (s.construction?.position.x === -80 || s.buildQueue.some(m => m.position.x === -80))
      && s.buildQueue.some(m => m.position.x === -40 && m.position.y === -40);
  }, null, "2 · Left module built; another queued left and one above");
  await page.evaluate(() => window.issue128Demo.unpause());
  await hold("2-built", isBuiltAt([{ x: -80, y: 0 }, { x: -40, y: -40 }], 4), { positions: [{ x: -80, y: 0 }, { x: -40, y: -40 }], count: 4 }, "2 · Both new modules built");

  // Criterion 3: a station already at eight modules queues and finishes a ninth.
  const eight = [
    { type: "Dock", position: { x: 0, y: 0 } },
    { type: "Storage", position: { x: 40, y: 0 } },
    { type: "Builder", position: { x: 80, y: 0 } },
    { type: "Storage", position: { x: 120, y: 0 } },
    { type: "Builder", position: { x: 0, y: 40 } },
    { type: "Storage", position: { x: 40, y: 40 } },
    { type: "Builder", position: { x: 80, y: 40 } },
    { type: "Storage", position: { x: 120, y: 40 } },
  ];
  await setup(eight);
  await queue({ x: 160, y: 0 }, "Storage");
  await hold("3-queued", () => {
    const s = window.issue128Demo.snapshot();
    return s.modules.length === 8 && (s.construction?.position.x === 160 || s.buildQueue.some(m => m.position.x === 160));
  }, null, "3 · Eight modules; a ninth queued on a free side");
  await page.evaluate(() => window.issue128Demo.unpause());
  await hold("3-built", isBuiltAt([{ x: 160, y: 0 }], 9), { positions: [{ x: 160, y: 0 }], count: 9 }, "3 · Ninth module built");

  await writeFile(resolve(out, "scenes.json"), JSON.stringify(scenes, null, 2));
} finally {
  await context.close();
  await browser.close();
}
const video = await page.video().path();
await writeFile(resolve(out, "video-path.txt"), video);
console.log(video);
console.log(JSON.stringify(scenes));
