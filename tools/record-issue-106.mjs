// node tools/record-issue-106.mjs <cache-output-directory> <criterion-number>
import { build } from "esbuild";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
const scene = Number(process.argv[3]);
assert.ok(scene >= 1 && scene <= 6);
await mkdir(out, { recursive: true });
const cache = resolve(process.env.HOME, ".cache/spaceship-management-sim-106");
const { chromium } = await import(pathToFileURL(resolve(cache, "node_modules/playwright-core/index.mjs")));
const fixture = resolve("tools/issue-106-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: [{
  name: "issue-106-demo-fixture",
  setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nObject.defineProperty(window, "__repro", { value: { get state() { return state; }, get ui() { return ui; }, menu: shipMenuSystem } });\nimport { installIssue106Demo } from ${JSON.stringify(fixture)};\ninstallIssue106Demo(ui, () => state, next => { state = next; });`,
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
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const moments = [];
const started = Date.now();
async function mark(name, delay = 0.12) {
  await page.waitForTimeout(delay * 1000);
  if (await page.locator("#info").isVisible() && await page.locator("#info-title").textContent() === "Ship") {
    const line = await page.locator("#info-line").textContent();
    if (scene === 3) assert.equal(line, "Holding");
    else assert.match(line, /^(Holding|Idle: no laser)\nShield [\d.]+\/[\d.]+  HP [\d.]+\/[\d.]+$/);
    assert.equal(await page.locator("#info-line").evaluate(el => getComputedStyle(el).whiteSpace), "pre-wrap");
  }
  const text = await page.locator("#info").innerText();
  moments.push({ name, seconds: (Date.now() - started) / 1000, text });
  console.log(name, text.replaceAll("\n", " | "), JSON.stringify(await page.evaluate(() => ({ time: window.__repro.state.time, ships: window.__repro.state.ships.map(s => ({ id: s.id, shield: s.shield, hp: s.hp, hit: s.shieldLastHit })) }))));
  await page.waitForTimeout(500);
}
async function hover(id = 0) {
  const p = await page.evaluate(id => {
    const ship = window.__repro.state.ships.find(s => s.id === id);
    const { camera, viewport } = window.__repro.ui;
    return { x: (ship.position.x - camera.center.x) * camera.zoom + viewport.width / 2, y: (ship.position.y - camera.center.y) * camera.zoom + viewport.height / 2 };
  }, id);
  await page.mouse.move(p.x, p.y);
  await page.waitForFunction(() => document.querySelector("#info-title").textContent === "Ship" && !document.querySelector("#info").hidden);
}
async function step(seconds) {
  await page.evaluate(seconds => window.issue106Demo.step(seconds), seconds);
}
async function advance(seconds) {
  for (let i = 0; i < seconds * 4; i++) {
    await step(0.25);
    await page.waitForTimeout(250);
  }
}
async function paint() {
  await page.evaluate(() => window.__repro.menu.openShipMenu(2));
  await page.waitForTimeout(400);
  const bounds = await page.locator("canvas.paint").boundingBox();
  for (const [i, module] of ["Engine", "Capacitor", "Generator"].entries()) {
    await page.locator(`button[data-module="${module}"]`).click();
    await page.mouse.click(bounds.x + bounds.width / 2 + i * 16, bounds.y + bounds.height / 2);
    await page.waitForTimeout(700);
  }
  assert.deepEqual(await page.evaluate(() => [...window.__repro.ui.draft.cells.values()]), ["Engine", "Capacitor", "Generator"]);
}
try {
  await page.goto(pathToFileURL(pagePath).href);
  await page.waitForFunction(() => !!window.issue106Demo && window.__repro.ui.viewport.width > 0);
  await page.evaluate(scene => window.issue106Demo.setup(scene), scene);
  await page.evaluate(scene => {
    const label = document.createElement("div");
    label.textContent = `Criterion ${scene}`;
    label.style.cssText = "position:fixed;left:24px;top:20px;color:#f8fafc;font:18px monospace;pointer-events:none";
    document.body.append(label);
  }, scene);
  if (scene === 1 || scene === 6) {
    await paint();
    await mark("design-with-both", 1);
    await page.waitForTimeout(2500);
    if (scene === 6) {
      await page.locator("button[data-build]").click();
      assert.equal(await page.evaluate(() => window.__repro.state.stations[0].shipBuilds.length), 1);
      await mark("queued", 1);
      await page.evaluate(() => window.__repro.menu.closeShipMenu());
      for (let i = 0; i < 80; i++) {
        await step(1);
        await page.waitForTimeout(250);
        if (await page.evaluate(() => window.__repro.state.ships.length > 0)) break;
      }
      await hover(1);
      assert.match(await page.locator("#info-line").innerText(), /Shield 20\/20/);
      await mark("new-ship-full", 1);
      await page.waitForTimeout(4000);
    }
  } else if (scene === 2 || scene === 3) {
    await hover();
    await mark(scene === 2 ? "one-capacitor" : "generators-no-capacitor", 1);
    const text = await page.locator("#info-line").innerText();
    if (scene === 3) assert.ok(!text.includes("Shield"));
    else assert.match(text, /Holding\nShield 10\/20  HP 40\/40/);
    await page.waitForTimeout(4000);
    if (scene === 2) {
      await hover(1);
      assert.match(await page.locator("#info-line").innerText(), /Holding\nShield 20\/40  HP 40\/40/);
      await mark("two-capacitors", 1);
      await page.waitForTimeout(4000);
    }
  } else if (scene === 4) {
    await hover();
    await mark("before-bites", 1);
    await page.waitForTimeout(2000);
    await advance(1.75);
    await step(0.25);
    await mark("first-bite-blue-ring");
    assert.match(await page.locator("#info-line").innerText(), /Holding\nShield 1.5\/20  HP 40\/40/);
    await page.waitForTimeout(2000);
    await advance(1.75);
    await step(0.25);
    await mark("second-bite-hp-intact");
    assert.match(await page.locator("#info-line").innerText(), /Holding\nShield 0.5\/20  HP 40\/40/);
    await page.waitForTimeout(2000);
    await advance(1.75);
    await step(0.25);
    await mark("third-bite-half-carries-to-hp");
    assert.match(await page.locator("#info-line").innerText(), /Holding\nShield 0\/20  HP 39.5\/40/);
    await page.waitForTimeout(3000);
    await advance(2);
    await mark("empty-shield-hull-bite");
    assert.match(await page.locator("#info-line").innerText(), /Holding\nShield 0\/20  HP 38.5\/40/);
    await page.waitForTimeout(3000);
  } else {
    for (const generators of [1, 3]) {
      await page.evaluate(g => window.issue106Demo.setup(5, g), generators);
      await hover();
      await mark(`${generators}-generators-before-hit`, 1);
      await advance(1);
      await page.evaluate(() => window.issue106Demo.removeBugs());
      await mark(`${generators}-generators-last-hit`);
      assert.match(await page.locator("#info-line").innerText(), /Shield 15\/20/);
      await advance(4);
      await mark(`${generators}-generators-four-seconds`);
      assert.match(await page.locator("#info-line").innerText(), /Shield 15\/20/);
      await advance(1);
      await mark(`${generators}-generators-five-seconds`);
      assert.match(await page.locator("#info-line").innerText(), /Shield 15\/20/);
      await advance(1);
      await mark(`${generators}-generators-six-seconds`);
      assert.match(await page.locator("#info-line").innerText(), new RegExp(`Shield ${15 + generators}/20`));
      await advance(1);
      await mark(`${generators}-generators-seven-seconds`);
      await page.waitForTimeout(2000);
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(out, "moments.json"), JSON.stringify(moments, null, 2));
} finally {
  await context.close();
  await browser.close();
}
await rename(await page.video().path(), resolve(out, `criterion-${scene}.webm`));
console.log(resolve(out, `criterion-${scene}.webm`));
