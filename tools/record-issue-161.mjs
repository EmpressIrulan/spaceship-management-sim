// node tools/record-issue-161.mjs ~/.cache/spaceship-161
// Only the recording bundle contains the seeded fixture.
import { build } from "esbuild";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const { default: playwright } = await import(pathToFileURL(resolve(process.env.HOME, ".cache/spaceship-161/node_modules/playwright-core/index.js")));
const fixture = resolve("tools/issue-161-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false,
  plugins: [{ name: "demo-fixture", setup(builder) {
    builder.onResolve({ filter: /^sim$/ }, () => ({ path: resolve("sim/src/index.ts") }));
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nimport { installIssue161Demo } from ${JSON.stringify(fixture)};\nimport { MIN_ZOOM, MAX_ZOOM } from './camera';\ninstallIssue161Demo(ui, next => { state = next; }, { min: MIN_ZOOM, max: MAX_ZOOM });`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  } }] });
await writeFile(join(out, "game.html"), (await readFile("app/index.html", "utf8"))
  .replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`));
const gameURL = pathToFileURL(join(out, "game.html")).href;
await writeFile(join(out, "demo.html"), `<!doctype html><style>
body{margin:0;background:#081428;color:#fff;font:23px/1.35 sans-serif}header{height:100px;padding:12px 24px;box-sizing:border-box}
main{display:flex}iframe{width:1000px;height:680px;border:0}aside{width:400px;text-align:center;padding-top:40px}canvas{image-rendering:pixelated}footer{height:80px;padding:12px 24px}
</style><header id="caption"></header><main><iframe src="${gameURL}?seed=7"></iframe><aside id="crops"></aside></main><footer id="details"></footer>`);
const browser = await playwright.chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1400, height: 860 }, recordVideo: { dir: out, size: { width: 1400, height: 860 } } });
const page = await context.newPage();
const errors = []; page.on("pageerror", e => errors.push(e.message));
await page.goto(pathToFileURL(join(out, "demo.html")).href);
const game = page.frames().find(f => f.url().startsWith(gameURL));
await game.waitForFunction(() => !!window.issue161Demo);
const criteria = [
  "Zoom out until a ship would be under 2 pixels. It shows as a 2 pixel dot in its own colour.",
  "Bugs and asteroids get the same minimum dot.",
  "Each station shows a small marker with its name once its modules are too small to make out.",
  "Click a marker. The station is selected and its panel opens, as when clicking it up close.",
  "Double-click a marker. The view flies in to that station.",
  "Zoom back in. Dots and markers give way to the normal ships and stations.",
];
const moments = [], start = Date.now();
async function camera(x, y, zoom) { await game.evaluate(p => window.issue161Demo.camera(...p), [x, y, zoom]); }
async function note(text) { await page.locator("#details").evaluate((el, text) => el.textContent = text, text); }
async function mark(scene, kind = "criterion") {
  await page.waitForTimeout(200);
  moments.push({ scene, kind, seconds: (Date.now() - start) / 1000, criterion: criteria[scene - 1] });
  await page.screenshot({ path: join(out, `scene-${scene}-${kind}.png`) });
  console.log(JSON.stringify(moments.at(-1)));
}
async function crops(items) {
  const data = await game.evaluate(items => {
    const src = document.querySelector("#screen"), api = window.issue161Demo;
    return items.map(({ x, name }) => {
      const sx = (x - api.ui.camera.center.x) * api.ui.camera.zoom + api.ui.viewport.width / 2;
      const sy = api.ui.viewport.height / 2;
      const c = document.createElement("canvas"); c.width = 40; c.height = 40;
      c.getContext("2d").drawImage(src, sx - 20, sy - 20, 40, 40, 0, 0, 40, 40);
      return { name, src: c.toDataURL() };
    });
  }, items);
  await page.locator("#crops").evaluate((el, data) => {
    el.replaceChildren();
    for (const item of data) {
      const label = document.createElement("div"); label.textContent = item.name + " — magnified 6×";
      const img = document.createElement("img"); img.src = item.src; img.width = 240; img.height = 240; img.style.imageRendering = "pixelated";
      el.append(label, img);
    }
  }, data);
}
try {
  for (let scene = 1; scene <= 6; scene++) {
    await page.locator("#caption").evaluate((el, text) => el.textContent = text, `${scene}. ${criteria[scene - 1]}${scene <= 2 ? " Right: magnified crops of the same frame." : ""}`);
    await page.locator("#crops").evaluate(el => el.replaceChildren());
    await game.evaluate(scene => window.issue161Demo.setup(scene), scene);
    if (scene === 1) {
      await camera(0, 0, 24); await note("Same seeded orange ship, close view first | Zoom 24 (player maximum)");
      await mark(scene, "close"); await page.waitForTimeout(1800);
      await page.mouse.move(500, 440);
      for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(20); }
      await page.waitForTimeout(350);
      assert.equal(await game.evaluate(() => window.issue161Demo.ui.camera.zoom), 0.1);
      await crops([{ x: 0, name: "Orange ship: 2 × 2 px" }]);
      await note("Scroll wheel to zoom 0.1 (player minimum) | Same orange ship; crop enlarges pixels, not camera zoom");
    } else if (scene === 2) {
      await camera(500, 0, 0.1); await page.waitForTimeout(250);
      await crops([{ x: 500, name: "Purple bug: 2 × 2 px" }, { x: 1000, name: "Brown asteroid: 2 × 2 px" }]);
      await note("Full game view on the left | Purple bug at centre; brown asteroid to its right | Zoom 0.1");
    } else if (scene === 3) {
      await note("Two completed seeded stations in the same sector: Home and North Dock | Zoom 0.1");
    } else if (scene === 4) {
      await page.mouse.click(350, 429);
      await game.waitForFunction(() => window.issue161Demo.ui.stationPanelId === 0);
      assert.ok(await game.locator("#station-panel").isVisible());
      await note("One click on Home's marker label opens the game's Home station panel");
    } else if (scene === 5) {
      await note("Double-click Home | Actual 450 ms camera flight, shown at ¼ speed so its motion is visible");
      await page.waitForTimeout(900);
      // Virtual time slows the existing animation, never substitutes a camera path.
      const clockStart = Date.now();
      await page.clock.install({ time: clockStart });
      await page.clock.pauseAt(clockStart + 1000);
      await page.mouse.dblclick(350, 429);
      const flight = [];
      for (let i = 0; i < 20; i++) {
        await page.clock.runFor(30);
        flight.push(await game.evaluate(() => structuredClone(window.issue161Demo.ui.camera)));
        await new Promise(r => setTimeout(r, 100));
      }
      assert.ok(flight.some(c => c.zoom > 0.1 && c.zoom < flight.at(-1).zoom));
      assert.ok(flight.at(-1).zoom > 0.1);
      await page.clock.resume();
      await writeFile(join(out, "flight.json"), JSON.stringify(flight));
    } else {
      // Anchor the wheel in empty space, not on the station's build buttons.
      await camera(-1420, 0, 0.1);
      await note("Start at zoom 0.1: Home marker and tiny orange ship, purple bug, brown asteroid");
      await mark(scene, "before"); await page.waitForTimeout(1000);
      await page.mouse.move(500, 440);
      for (let i = 0; i < 40; i++) {
        const before = await game.evaluate(() => window.issue161Demo.ui.camera.zoom);
        if (before >= 3) break;
        await page.mouse.wheel(0, -100);
        await game.waitForFunction(before => window.issue161Demo.ui.camera.zoom > before, before);
        await page.waitForTimeout(40);
      }
      const zoom = await game.evaluate(() => window.issue161Demo.ui.camera.zoom);
      assert.ok(zoom >= 3 && zoom <= 24);
      await page.mouse.move(80, 750);
      await note(`Scroll wheel back in to zoom ${zoom.toFixed(2)} | Home's normal modules, orange ship, purple bug and brown asteroid restored`);
    }
    await mark(scene); await page.waitForTimeout(scene === 5 ? 1300 : 2600);
  }
  assert.deepEqual(errors, []);
} finally {
  await context.close(); await browser.close();
  await rename(await page.video().path(), join(out, "issue-161.webm"));
  await writeFile(join(out, "moments.json"), JSON.stringify(moments, null, 2));
}
console.log("Recorded all six criteria with reachable zooms");
