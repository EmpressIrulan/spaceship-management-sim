// node tools/record-issue-135.mjs <cache-output-directory> <proof|criterion-number>
import { build } from "esbuild";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
const scene = process.argv[3] === "proof" ? "proof" : Number(process.argv[3]);
await mkdir(out, { recursive: true });
const { default: playwright } = await import(pathToFileURL(resolve(process.env.HOME, ".cache/spaceship-management-sim-135/node_modules/playwright-core/index.js")));
const fixture = resolve("tools/issue-135-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: scene === "proof" ? [] : [{
  name: "issue-135-demo-fixture",
  setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nObject.defineProperty(window, "__repro", { value: { get state() { return state; }, get ui() { return ui; } } });\nimport { installIssue135Demo } from ${JSON.stringify(fixture)};\ninstallIssue135Demo(ui, () => state, next => { state = next; });`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  },
}] });
const html = (await readFile("app/index.html", "utf8")).replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`);
const pagePath = resolve(out, "demo.html");
await writeFile(pagePath, html);
const browser = await playwright.chromium.launch({ executablePath: resolve(process.env.HOME, ".cache/ms-playwright/chromium-1243/chrome-linux64/chrome"), args: ["--no-sandbox"], timeout: 20000 });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const moments = [];
const started = Date.now();
async function mark(name) {
  const data = await page.evaluate(() => ({ time: window.__repro.state.time, sector: window.__repro.ui.currentSector, hives: window.__repro.state.hives, bugs: window.__repro.state.bugs, info: document.querySelector("#info").innerText }));
  moments.push({ name, seconds: (Date.now() - started) / 1000, ...data });
  console.log(name, JSON.stringify(data));
  await page.waitForTimeout(4000);
}
async function until(predicate, speed = "fast") {
  const deadline = Date.now() + 45000;
  while (!(await page.evaluate(predicate))) {
    assert.ok(Date.now() < deadline, "state condition timed out");
    await page.evaluate(speed => window.issue135Demo.stepFrame(speed), speed);
    await page.waitForTimeout(1000 / 30);
  }
}
async function sector(id) {
  await page.keyboard.press("m");
  await page.waitForFunction(() => window.__repro.ui.mapOpen);
  await page.mouse.click(1280 * (0.2 + [0, 1, 2, 0][id] * 0.25), 900 * (0.25 + [0, 0, 0, 1][id] * 0.25));
  await page.waitForFunction(id => window.__repro.ui.currentSector === id && !window.__repro.ui.mapOpen, id);
  // Frame the fixture's known layout after the real map navigation.
  await page.evaluate(() => { window.__repro.ui.camera = { center: { x: 0, y: 0 }, zoom: 2 }; });
}
async function hover(position) {
  const point = await page.evaluate(({ x, y }) => {
    const { camera, viewport } = window.__repro.ui;
    return { x: (x - camera.center.x) * camera.zoom + viewport.width / 2, y: (y - camera.center.y) * camera.zoom + viewport.height / 2 };
  }, position);
  await page.mouse.move(point.x, point.y);
}
try {
  await page.goto(pathToFileURL(pagePath).href);
  await page.locator("#screen").waitFor({ state: "visible" });
  if (scene === "proof") await page.waitForTimeout(5000);
  else {
    await page.waitForFunction(() => !!window.issue135Demo);
    await page.evaluate(scene => {
      window.issue135Demo.setup(scene);
      const readout = document.createElement("div");
      readout.style.cssText = "position:fixed;left:24px;bottom:24px;padding:16px;color:#f8fafc;background:#081428ee;border:1px solid #64748b;font:20px/1.5 monospace;white-space:pre;pointer-events:none";
      document.body.append(readout);
      const label = document.createElement("div");
      label.textContent = `Criterion ${scene}`;
      label.style.cssText = "position:fixed;left:24px;top:18px;color:#f8fafc;font:22px monospace;pointer-events:none";
      document.body.append(label);
      const style = document.createElement("style");
      style.textContent = "#info {font-size:20px;line-height:1.45;z-index:3} #info-title {font-size:22px}";
      document.head.append(style);
      function update() {
        const s = window.__repro.state, id = window.__repro.ui.currentSector;
        const bugs = s.bugs.filter(b => b.sectorId === id);
        readout.textContent = `Recording state | Game time: ${s.time.toFixed(1)} s\nSector: ${s.sectors[id].name} | Live bugs: ${bugs.length}\nHives: ${s.hives.filter(h => h.alive && h.sectorId === id).length} | Migrating: ${bugs.filter(b => b.state === "invading").length} | Gathering: ${bugs.filter(b => b.state === "gathering").length}`;
        requestAnimationFrame(update);
      }
      update();
    }, scene);
    if (scene !== 5) {
      if (scene === 3 || scene === 4) {
        await sector(2);
        await mark(scene === 4 ? "destination-before-two-bugs" : "destination-empty");
        await sector(1);
      }
      await hover({ x: 150, y: 0 });
      await mark("source-nine-bugs");
      await until(() => window.__repro.state.bugs.filter(b => b.state === "invading").length === 10);
      await mark("ten-departing");
      await until(() => window.__repro.state.bugs.filter(b => b.state === "invading").every(b => b.timer < 0.3), "normal");
      await mark("ten-at-source-gate");
      await until(() => window.__repro.state.bugs.every(b => b.sectorId !== 1), "normal");
      if (scene === 2) {
        await hover({ x: 150, y: 0 });
        await mark("old-hive-zero-bugs");
        await until(() => window.__repro.state.bugs.some(b => b.sectorId === 1), "normal");
        await mark("old-hive-breeds-again");
      } else {
        await sector(2);
        if (scene === 4) {
          assert.equal(await page.evaluate(() => window.__repro.state.bugs.filter(b => b.sectorId === 2).length), 12);
          await mark("destination-after-twelve-bugs");
        } else {
          assert.equal(await page.evaluate(() => window.__repro.state.bugs.filter(b => b.sectorId === 2 && b.state === "gathering").length), 10);
          await hover({ x: -200, y: 0 });
          await mark("ten-gathering-at-destination");
          await until(() => window.__repro.state.hives.some(h => h.sectorId === 2));
        }
      }
    }
    if (scene === 1 || scene === 3 || scene === 5) {
      await hover(await page.evaluate(() => { const p = window.__repro.state.hives.find(h => h.sectorId === 2).position; return { x: p.x, y: p.y + 14 }; }));
      await page.waitForFunction(() => document.querySelector("#info-line").textContent.includes("HP 200/200"));
      await mark("destination-hive");
      const found = await page.evaluate(() => window.__repro.state.hives.find(h => h.sectorId === 2));
      assert.deepEqual(found.position, { x: -200, y: 0 }, "hive must be founded where bugs arrive, at destination gate");
    }
    if (scene === 5) {
      const born = await page.evaluate(() => window.__repro.state.time);
      for (let count = 1; count <= 2; count++) {
        await page.evaluate(count => { window.demoExpected = count; }, count);
        await until(() => window.__repro.state.bugs.filter(b => b.sectorId === 2).length === window.demoExpected);
        assert.ok(Math.abs(await page.evaluate(() => window.__repro.state.time) - born - count * 10) < 0.2);
        await hover({ x: -200, y: 14 });
        await mark(`new-hive-bug-${count}-at-${count * 10}-seconds`);
      }
      await until(() => window.__repro.state.bugs.filter(b => b.sectorId === 2).length === 5);
      await until(() => window.__repro.state.bugs.filter(b => b.sectorId === 2).every(b => b.state === "hunting"), "normal");
      await hover({ x: -30, y: -15 });
      await mark("five-bugs-attack-player-builder");
      await until(() => window.__repro.state.stations[0].modules.find(m => m.type === "Builder")?.hp < 40, "combat");
      await hover({ x: -30, y: -15 });
      await page.waitForFunction(() => document.querySelector("#info-line").textContent.includes("HP") && !document.querySelector("#info-line").textContent.includes("HP 40/40"));
      await mark("player-builder-bitten");
      await until(() => window.__repro.state.bugs.filter(b => b.sectorId === 2 && b.state === "invading").length === 10);
      await hover({ x: -200, y: 0 });
      await mark("new-hive-ten-leave-again");
      await until(() => window.__repro.state.bugs.filter(b => b.sectorId === 2 && b.state === "invading").every(b => b.timer < 0.2), "normal");
      await mark("new-swarm-at-gate");
      await until(() => !window.__repro.state.bugs.some(b => b.sectorId === 2 && b.state === "invading"), "normal");
      await mark("new-hive-after-departure");
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(resolve(out, "moments.json"), JSON.stringify(moments, null, 2));
  await context.close();
  await browser.close();
  await rename(await page.video().path(), resolve(out, `${scene === "proof" ? "proof" : `criterion-${scene}`}.webm`));
}
console.log("Recorded", scene);
