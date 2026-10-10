// node tools/record-issue-134.mjs <cache-output-directory> <proof|criterion-number>
import { build } from "esbuild";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
const scene = process.argv[3] === "proof" ? "proof" : Number(process.argv[3]);
await mkdir(out, { recursive: true });
const { default: playwright } = await import(pathToFileURL(resolve(process.env.HOME, ".cache/spaceship-management-sim-134/node_modules/playwright-core/index.js")));
const fixture = resolve("tools/issue-134-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: scene === "proof" ? [] : [{
  name: "issue-134-demo-fixture",
  setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nObject.defineProperty(window, "__repro", { value: { get state() { return state; }, get ui() { return ui; } } });\nimport { installIssue134Demo } from ${JSON.stringify(fixture)};\ninstallIssue134Demo(ui, () => state, next => { state = next; });`,
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
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const moments = [];
const started = Date.now();
async function hover(position) {
  const point = await page.evaluate(({ x, y }) => {
    const { camera, viewport } = window.__repro.ui;
    return { x: (x - camera.center.x) * camera.zoom + viewport.width / 2, y: (y - camera.center.y) * camera.zoom + viewport.height / 2 };
  }, position);
  await page.mouse.move(point.x, point.y);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function mark(name, hold = 4000) {
  const data = await page.evaluate(() => {
    const s = window.__repro.state, station = s.stations[0];
    return { time: s.time, info: document.querySelector("#info").innerText, inventory: station.inventory, site: station.constructionSite.inventory, queue: station.buildQueue.map(m => ({ type: m.type, position: m.position })), modules: station.modules.map(m => ({ type: m.type, hp: m.hp, position: m.position })), bugs: s.bugs, ships: s.ships.map(s => ({ id: s.id, hp: s.hp })), hives: s.hives };
  });
  moments.push({ name, seconds: (Date.now() - started) / 1000, ...data });
  console.log(name, JSON.stringify(data));
  await page.waitForTimeout(hold);
}
async function until(predicate, speed = 1) {
  const deadline = Date.now() + 45000;
  while (!(await page.evaluate(predicate))) {
    assert.ok(Date.now() < deadline, "state condition timed out");
    await page.evaluate(dt => window.issue134Demo.step(dt), speed / 30);
    await page.waitForTimeout(1000 / 30);
  }
  await page.waitForFunction(predicate, null, { timeout: 1000 });
}
async function queue(position, type, showMenu = false) {
  await hover({ x: 0, y: 0 });
  await hover(position);
  await page.locator(`#build-controls button[data-x="${position.x}"][data-y="${position.y}"]`).click();
  await page.locator(`#build-menu button[data-module="${type}"]`).waitFor({ state: "visible" });
  if (showMenu) await mark("build-menu-offers-turret");
  await page.locator(`#build-menu button[data-module="${type}"]`).click();
  await page.waitForFunction(({ x, y }) => {
    const s = window.__repro.state.stations[0];
    return [s.construction, ...s.buildQueue].some(m => m?.position.x === x && m.position.y === y);
  }, position);
}
try {
  await page.goto(pathToFileURL(pagePath).href);
  await page.locator("#screen").waitFor({ state: "visible" });
  if (scene === "proof") await page.waitForTimeout(5000);
  else {
    assert.ok(scene >= 1 && scene <= 6);
    await page.waitForFunction(() => !!window.issue134Demo && window.__repro.ui.viewport.width > 0);
    await page.evaluate(scene => {
      window.issue134Demo.setup(scene);
      const label = document.createElement("div");
      label.textContent = `Criterion ${scene}`;
      label.style.cssText = "position:fixed;left:24px;top:18px;color:#f8fafc;font:20px monospace;pointer-events:none";
      document.body.append(label);
      const style = document.createElement("style");
      style.textContent = "#info {font-size:18px;line-height:1.45;z-index:3} #info-title {font-size:20px}";
      document.head.append(style);
      // This recording-only readout exposes the actual queue order and shared
      // stock, while the product's ghosts, hovers and explosions stay visible.
      const readout = document.createElement("div");
      readout.style.cssText = "position:fixed;bottom:24px;left:24px;padding:14px;background:#081428ee;border:1px solid #64748b;color:#f8fafc;font:18px/1.5 monospace;white-space:pre;pointer-events:none";
      document.body.append(readout);
      function update() {
        const s = window.__repro.state, station = s.stations[0];
        readout.textContent = `Bugs alive: ${s.bugs.length}   Hive HP: ${s.hives[0].hp}/${s.hives[0].maxHp}\nStation stock: Metal ${station.inventory.Metal} | Ice ${station.inventory.Ice}\nSite stock: Metal ${station.constructionSite.inventory.Metal} | Ice ${station.constructionSite.inventory.Ice}\nBuilding: ${station.construction ? station.construction.type + " (" + Math.ceil(station.construction.timer) + " s)" : "none"}\nQueue: ${station.buildQueue.length ? station.buildQueue.map((m,i) => `${i+1}. ${m.type} (${m.position.x},${m.position.y})`).join(" -> ") : "empty"}`;
        requestAnimationFrame(update);
      }
      update();
    }, scene);
    if (scene >= 3 && scene <= 5) await queue({ x: 0, y: 40 }, "Storage");
    if (scene === 6) {
      await queue({ x: 0, y: -40 }, "Turret", true);
      await page.evaluate(() => window.issue134Demo.release(6));
      await hover({ x: 40, y: -15 });
      await mark("turret-building-metal-6");
      await until(() => window.__repro.state.stations[0].modules.some(m => m.type === "Turret"), 4);
      await until(() => window.__repro.state.stations[0].modules.find(m => m.type === "Turret").turretShot?.target.kind === "bug");
      await page.evaluate(() => window.issue134Demo.step(0.25));
      await mark("automatic-bug-shot-metal-5");
      await until(() => window.__repro.state.bugs[0]?.hp === 3);
      await mark("bug-hit-hp-3-metal-5");
      await until(() => window.__repro.state.stations[0].modules.find(m => m.type === "Turret").turretShot?.target.kind === "hive");
      await page.evaluate(() => window.issue134Demo.step(0.25));
      await mark("automatic-hive-shot");
      await until(() => window.__repro.state.hives[0].hp === 197);
      await mark("hive-hit-hp-197");
      await until(() => window.__repro.state.stations[0].modules.find(m => m.type === "Turret").turretNoMetal);
      await hover({ x: 0, y: -55 });
      await page.waitForFunction(() => document.querySelector("#info-line").textContent.includes("Turret: no Metal"));
      await mark("no-metal-during-last-shot");
      await until(() => window.__repro.state.stations[0].modules.find(m => m.type === "Turret").turretShot === null);
      await mark("no-metal-stopped");
      const hp = await page.evaluate(() => window.__repro.state.hives[0].hp);
      await page.evaluate(() => { window.issue134End = window.__repro.state.time + 8; });
      await until(() => window.__repro.state.time >= window.issue134End);
      assert.equal(await page.evaluate(() => window.__repro.state.hives[0].hp), hp);
      await mark("still-not-firing-eight-seconds-later");
      await page.evaluate(() => { window.issue134Demo.moveHive({ x: 500, y: -80 }); window.issue134Demo.step(1 / 60); });
      await page.waitForFunction(() => document.querySelector("#info-line").textContent.includes("Turret: no Metal"));
      await mark("no-metal-with-no-target-in-range");
    } else {
      const target = { x: scene === 4 || scene === 5 ? 40 : 80, y: 0 };
      await hover({ ...target, y: -15 });
      await page.waitForFunction(scene => document.querySelector("#info-line").textContent.includes(scene === 5 ? "Stored 300" : "HP"), scene);
      await mark(scene === 5 ? "storage-stock-before-300" : "before-bites");
      await page.evaluate(scene => window.issue134Demo.release(scene), scene);
      await mark("bugs-released", 1000);
      if (scene === 1) {
        await page.evaluate(() => window.issue134Demo.step(1));
        assert.ok(await page.evaluate(() => window.__repro.state.bugs.every(b => b.leg && (b.targetShipId !== null || b.targetModule !== null))));
        await mark("five-bugs-flying-at-nearest-targets");
        await until(() => window.__repro.state.stations[0].modules.every(m => m.hp < 40) && window.__repro.state.ships[0].hp < 40);
        assert.ok(await page.evaluate(() => window.__repro.state.bugs.every(b => b.targetShipId !== null || b.targetModule !== null)));
        await mark("five-nearest-targets-bitten");
      } else if (scene === 2) {
        await until(() => window.__repro.state.stations[0].modules.find(m => m.type === "Builder").hp === 35);
        await mark("hp-down-to-35");
        await page.evaluate(() => { window.issue134Demo.removeBugs(); window.issue134Demo.step(20); });
        await page.waitForFunction(() => document.querySelector("#info-line").textContent.includes("HP 35/40"));
        await mark("bugs-gone-no-healing-after-20-seconds");
      } else {
        await until(() => window.__repro.state.moduleDestructions.length > 0);
        await page.evaluate(() => window.issue134Demo.removeBugs());
        await hover({ ...target, y: -15 });
        await mark("exploded-ghosts-at-queue-end");
        assert.equal(await page.evaluate(() => window.__repro.state.stations[0].buildQueue.length), scene === 4 ? 4 : 2);
        if (scene === 5) {
          await hover({ ...target, y: -15 });
          await page.waitForFunction(() => !document.querySelector("#info").hidden && document.querySelector("#info-line").textContent.includes("Stored 0"));
          await mark("storage-lost-all-300-stock");
        } else if (scene === 4) {
          await hover({ x: -65, y: -70 });
          await mark("three-destroyed-ghosts-visible-in-order");
        } else if (scene === 3) {
          await page.waitForFunction(() => document.querySelector("#info-line").textContent.includes("25 Metal and 25 Ice"));
          await mark("normal-rebuild-price");
          await page.evaluate(() => { window.issue134Demo.supply(75); window.issue134Demo.step(1/60); });
          await hover({ x: -65, y: -70 });
          await mark("existing-queue-first-site-50-each");
          await until(() => window.__repro.state.stations[0].construction?.type === "Builder", 4);
          await hover({ ...target, y: -15 });
          await mark("rebuild-paid-25-each");
          await until(() => window.__repro.state.stations[0].modules.some(m => m.type === "Builder" && m.position.x === 80), 4);
          await hover({ ...target, y: -15 });
          await page.waitForFunction(() => document.querySelector("#info-line").textContent.includes("HP 40/40"));
          await mark("rebuilt-full-hp-normal-price");
        }
      }
    }
    await writeFile(resolve(out, "moments.json"), JSON.stringify(moments, null, 2));
  }
  assert.deepEqual(errors, []);
} finally {
  await context.close();
  await browser.close();
}
const name = scene === "proof" ? "proof" : `criterion-${scene}`;
await rename(await page.video().path(), resolve(out, `${name}.webm`));
console.log(resolve(out, `${name}.webm`));
