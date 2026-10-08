// npm install --prefix ~/.cache/spaceship-management-sim-83 playwright-core
// node tools/record-dock-area.mjs ~/.cache/spaceship-management-sim-83
// Builds a fixture-only copy of the real entry point; production is untouched.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(out, "node_modules/playwright-core/index.mjs")));
const fixture = resolve("tools/dock-area-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: [{
  name: "demo-fixture",
  setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nimport { installDockAreaFixture } from ${JSON.stringify(fixture)};\ninstallDockAreaFixture(ui, () => state, next => { state = next; });`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  },
}] });
const html = (await readFile("app/index.html", "utf8")).replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`);
await writeFile(resolve(out, "demo.html"), html);
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
page.on("pageerror", (error) => { console.error(error); });
await page.goto(pathToFileURL(resolve(out, "demo.html")).href);
await page.waitForFunction(() => !!window.dockAreaDemo);
const times = [];
const start = Date.now();
const snapshot = () => page.evaluate(() => window.dockAreaDemo.snapshot());
async function setup(w, h, n, docks = 1, oversized = false) {
  await page.evaluate(([w,h,n,docks,oversized]) => window.dockAreaDemo.setup(w,h,n,docks,oversized), [w,h,n,docks,oversized]);
  await page.waitForFunction(() => window.dockAreaDemo.snapshot().paused);
  await page.mouse.move(1200, 700);
}
async function caption(scene, text) {
  times.push({ scene, seconds: (Date.now() - start) / 1000 });
  await page.evaluate((text) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = document.createElement("div"); el.id = "demo-caption";
      el.style.cssText = "position:fixed;left:0;right:0;bottom:0;padding:16px 22px;background:rgba(0,0,0,.9);color:white;font:20px sans-serif;z-index:2147483647";
      document.body.append(el);
    }
    el.textContent = text;
  }, text);
  // Delays hold an already-verified scene for reading; transitions below all
  // wait on the simulation or the real DOM, never on assumed flight durations.
  await page.waitForTimeout(4300);
}
await setup(4,4,0);
let s = await snapshot();
await caption(1, `1. Dock ${s.dock.size.width / 2.25}×${s.dock.size.height / 2.25} ship pixels — ${s.dock.capacity} area. No fixed pads.`);
await setup(4,4,6);
s = await snapshot();
assert.equal(s.ships.filter(ship => ship.state === "unloading").length, 6);
await caption(2, `2. ${s.ships.length} ships, ${s.ships[0].design.width}×${s.ships[0].design.height} each, packed inside one Dock.`);
await setup(4,4,7);
await page.waitForFunction(() => window.dockAreaDemo.snapshot().ships[6].state === "waiting");
await caption(3, "3. Six inside; Ship 7 waits outside in the parking spread.");
await page.evaluate(() => window.dockAreaDemo.leave());
await page.waitForFunction(() => window.dockAreaDemo.snapshot().ships[6].state === "berthing" && window.dockAreaDemo.snapshot().ships[6].berth !== null);
await page.waitForFunction(() => window.dockAreaDemo.snapshot().ships[6].state === "unloading");
await page.evaluate(() => window.dockAreaDemo.pause());
s = await snapshot();
assert.equal(s.ships[0].berth, null);
assert.ok(Math.abs(s.ships[0].position.x - s.dock.position.x) > s.dock.size.width / 2);
await caption("3b", `3. Ship ${s.ships[0].id + 1} leaves; waiting Ship ${s.ships[6].id + 1} has flown into its freed room.`);
await setup(2,4,12);
s = await snapshot();
assert.equal(s.ships.filter(ship => ship.state === "unloading").length, 12);
await caption(4, `4. ${s.ships.length} ships of ${s.ships[0].design.width}×${s.ships[0].design.height} share one Dock (${s.dock.capacity} area).`);
await setup(8,12,1);
s = await snapshot();
await caption("4b", `4. One ${s.ships[0].design.width}×${s.ships[0].design.height} ship fills the same ${s.dock.capacity}-area Dock.`);
await setup(9,12,1,1,true);
await page.locator('select[name="ship-home"]').waitFor({ state: "visible" });
await page.selectOption('select[name="ship-home"]', "0");
await page.waitForFunction(() => document.querySelector("#hint").textContent === "Ship 3 is too big for this Dock");
assert.equal((await snapshot()).ships[0].homeStationId, 1);
assert.equal(await page.locator('select[name="ship-home"]').inputValue(), "1");
await caption(5, `5. ${await page.locator("#hint").innerText()} — Home remains “${await page.locator('select[name="ship-home"] option:checked').innerText()}”.`);
await setup(4,4,3);
const hover = await page.evaluate(() => window.dockAreaDemo.screen(0, 10));
await page.mouse.move(hover.x, hover.y);
await page.waitForFunction(() => document.querySelector("#info-line").textContent.includes("Dock 48/96"));
await caption(6, `6. Hover only: ${(await page.locator("#info-line").innerText()).replaceAll("\n", " — ")}.`);
await setup(4,4,9,2);
s = await snapshot();
assert.equal(s.ships.filter(ship => ship.state === "unloading").length, 9);
const hover2 = await page.evaluate(() => window.dockAreaDemo.screen(-40, 10));
await page.mouse.move(hover2.x, hover2.y);
await page.waitForFunction(() => document.querySelector("#info-line").textContent.includes("Dock 144/192"));
await caption(7, `7. ${s.modules.filter(module => module.type === "Dock").length} Dock modules: ${(await page.locator("#info-line").innerText()).replaceAll("\n", " — ")}.`);
await writeFile(resolve(out, "scenes.json"), JSON.stringify(times, null, 2));
await context.close();
await browser.close();
const video = await page.video().path();
await writeFile(resolve(out, "video-path.txt"), video);
console.log(video);
console.log(JSON.stringify(times));
