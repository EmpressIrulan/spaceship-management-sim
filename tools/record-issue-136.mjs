// node tools/record-issue-136.mjs ~/.cache/spaceship-management-sim-136
import { build } from "esbuild";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const { default: playwright } = await import(pathToFileURL(resolve(process.env.HOME, ".cache/spaceship-161/node_modules/playwright-core/index.js")));
const fixture = resolve("tools/issue-136-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: [{
  name: "recording-only-fixture", setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nObject.defineProperty(window, '__repro', { value: { get state() { return state; }, get ui() { return ui; }, menu: shipMenuSystem } });\nimport { installIssue136Demo } from ${JSON.stringify(fixture)};\ninstallIssue136Demo(ui, () => state, next => { state = next; });`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  },
}] });
await writeFile(resolve(out, "demo.html"), (await readFile("app/index.html", "utf8")).replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`));
const browser = await playwright.chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
const errors = []; page.on("pageerror", error => errors.push(error.message));
const moments = [];
const labels = ["Repair in the designer palette", "4 Repair pixels: 0.8 HP per second", "Repair spends no resources", "Default: Repair chooses the nearest damage repeatedly", "Right-click repair, then resume Default: Repair", "Parked beside the target: beam and HP to full", "Healing continues while bugs bite", "No self-healing; two repair ships heal each other"];
async function snapshot() { return page.evaluate(() => structuredClone(window.__repro.state)); }
async function hold(name) {
  moments.push({ name, state: await snapshot() });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
}
async function frames(count, dt = 0.1) {
  for (let i = 0; i < count; i++) {
    await page.evaluate(dt => window.issue136Demo.step(dt), dt);
    await page.waitForTimeout(50);
  }
}
async function until(predicate) {
  for (let i = 0; i < 1000; i++) {
    if (await page.evaluate(predicate)) return;
    await frames(1, 0.5);
  }
  throw new Error("Simulation condition timed out");
}
async function point(x, y = 0) {
  return page.evaluate(({x,y}) => { const {camera,viewport} = window.__repro.ui; return {x:(x-camera.center.x)*camera.zoom+viewport.width/2,y:(y-camera.center.y)*camera.zoom+viewport.height/2}; }, {x,y});
}
try {
  await page.goto(pathToFileURL(resolve(out, "demo.html")).href);
  await page.waitForFunction(() => !!window.issue136Demo);
  for (let scene = 1; scene <= 8; scene++) {
    await page.evaluate(({scene,label}) => {
      window.__repro.menu.closeShipMenu(); window.issue136Demo.setup(scene);
      let el = document.querySelector("#demo-readout");
      if (!el) {
        el = document.createElement("div"); el.id = "demo-readout";
        el.style.cssText = "position:fixed;left:20px;bottom:20px;padding:18px;background:#081428ee;color:#fff;font:20px/1.5 monospace;white-space:pre;pointer-events:none;z-index:9999";
        document.body.append(el);
        const update = () => {
          const s = window.__repro.state;
          el.textContent = window.demoLabel + `\nSeeded demo fixture | Game time ${s.time.toFixed(1)} s (accelerated playback)\n` + s.ships.map(ship => `Ship ${ship.id}: HP ${(ship.hp??40).toFixed(2)}/40 | ${ship.state} | default ${ship.defaultBehaviour} | target ${JSON.stringify(ship.repairTarget??null)} | order ${ship.order?.kind??'none'}`).join('\n') + `\nBuilder HP ${(s.stations[0].modules[0].hp??40).toFixed(2)}/40 | Inventory ${JSON.stringify(s.stations[0].inventory)}`;
          requestAnimationFrame(update);
        }; update();
      }
      window.demoLabel = `${scene}. ${label}`;
    }, {scene,label:labels[scene-1]});
    if (scene === 1) {
      await page.evaluate(() => window.__repro.menu.openShipMenu(0));
      const button = page.locator('button[data-module="Repair"]');
      await button.click();
      assert.equal(await page.evaluate(() => window.__repro.ui.draft.module), "Repair");
      await page.locator("canvas.paint").click();
      assert.ok(await page.evaluate(() => [...window.__repro.ui.draft.cells.values()].includes("Repair")));
      await hold("criterion-1-palette");
    } else if (scene === 2 || scene === 3) {
      const before = await snapshot(); await hold(`criterion-${scene}-before`); await frames(10);
      const after = await snapshot();
      assert.ok(Math.abs(after.ships[1].hp-before.ships[1].hp-0.8)<1e-8);
      assert.deepEqual(after.stations[0].inventory,before.stations[0].inventory);
      await hold(`criterion-${scene}-after`);
    } else if (scene === 4) {
      await frames(1);
      assert.equal((await snapshot()).ships[0].repairTarget.shipId,11);
      await hold("criterion-4-nearest-ship");
      await until(() => window.__repro.state.ships[0].repairTarget?.kind === "module");
      await hold("criterion-4-next-builder");
      await until(() => window.__repro.state.ships[0].repairTarget?.shipId === 12);
      await hold("criterion-4-next-ship");
      await until(() => window.__repro.state.ships.every(ship => ship.hp === 40) && window.__repro.state.stations[0].modules[0].hp === 40);
      await hold("criterion-4-all-full");
    } else if (scene === 5) {
      const a = await point(-1.8), b = await point(30);
      await page.mouse.click(a.x,a.y);
      await page.mouse.click(b.x,b.y,{button:"right"});
      assert.equal((await snapshot()).ships[0].order?.kind,"repair");
      assert.equal((await snapshot()).ships[0].repairTarget.shipId,12);
      await hold("criterion-5-right-click");
      await until(() => window.__repro.state.ships[2].hp === 40 && window.__repro.state.ships[0].order === null);
      await frames(1);
      assert.equal((await snapshot()).ships[0].repairTarget.shipId,11);
      await hold("criterion-5-back-to-default");
    } else if (scene === 6) {
      const before = await snapshot(); await hold("criterion-6-parked-beam");
      await until(() => window.__repro.state.ships[1].hp === 40);
      assert.deepEqual((await snapshot()).ships[0].position,before.ships[0].position);
      await frames(1); await hold("criterion-6-full");
    } else if (scene === 7) {
      await hold("criterion-7-before-bite");
      await frames(3); const bitten = (await snapshot()).ships[1].hp;
      assert.ok(bitten < 30); await hold("criterion-7-bitten");
      await frames(5); assert.ok((await snapshot()).ships[1].hp > bitten);
      await hold("criterion-7-healing-between-bites");
      await frames(30); await hold("criterion-7-fight-continues");
    } else {
      await frames(20); assert.equal((await snapshot()).ships[0].hp,30);
      await hold("criterion-8-alone-no-self-heal");
      await page.evaluate(() => window.issue136Demo.addPartner());
      await frames(20); const s = await snapshot();
      assert.ok(s.ships.every(ship => ship.hp > 30));
      assert.equal(s.ships[0].repairTarget.shipId,11); assert.equal(s.ships[1].repairTarget.shipId,10);
      await hold("criterion-8-mutual-heal");
    }
    console.log(`Criterion ${scene} verified`);
  }
  assert.deepEqual(errors,[]);
} finally {
  await writeFile(resolve(out,"moments.json"),JSON.stringify(moments,null,2));
  await context.close(); await browser.close();
  await rename(await page.video().path(),resolve(out,"raw.webm"));
}
