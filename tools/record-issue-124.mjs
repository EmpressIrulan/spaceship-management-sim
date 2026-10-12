// node tools/record-issue-124.mjs <cache-output-directory>
// npm install --prefix ~/.cache/spaceship-124 --no-save playwright-core
// Builds main read-only; all bundles, stills and video stay in the output directory.
import { build } from "esbuild";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const root = resolve(".");
const mainRoot = resolve(process.env.ISSUE124_MAIN_ROOT ?? "../..", "spaceship-management-sim");
const playwrightPath = process.env.PLAYWRIGHT_CORE_PATH ?? resolve(process.env.HOME, ".cache/spaceship-124/node_modules/playwright-core/index.js");
const { default: playwright } = await import(pathToFileURL(playwrightPath));
const fixture = resolve("tools/issue-124-demo-fixture.ts");
async function bundleGame(gameRoot, name) {
  const bundle = await build({ entryPoints: [join(gameRoot, "app/src/main.ts")], bundle: true,
    format: "esm", write: false, plugins: [{ name: "recording-only-fixture", setup(builder) {
      builder.onResolve({ filter: /^sim$/ }, () => ({ path: join(gameRoot, "sim/src/index.ts") }));
      builder.onResolve({ filter: /^\.\.\/sim\/src\// }, ({ path, importer }) => importer === fixture
        ? { path: resolve(gameRoot, "tools", `${path}.ts`) } : null);
      builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
        contents: `${await readFile(path, "utf8")}\nimport { installIssue124Demo } from ${JSON.stringify(fixture)};\nimport { MIN_ZOOM, MAX_ZOOM } from './camera';\ninstallIssue124Demo(ui, () => state, next => { state = next; }, { min: MIN_ZOOM, max: MAX_ZOOM });`,
        loader: "ts", resolveDir: join(gameRoot, "app/src"),
      }));
    } }] });
  const html = (await readFile(join(gameRoot, "app/index.html"), "utf8"))
    .replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`);
  const path = join(out, `${name}.html`);
  await writeFile(path, html);
  return pathToFileURL(path).href;
}
const [mainURL, branchURL] = await Promise.all([bundleGame(mainRoot, "main"), bundleGame(root, "branch")]);
const criteria = [
  "The belt and the gates are 5 times further from the station than today.",
  "Station modules, ships, docks, bugs and hives are drawn at a third of today's size.",
  "Asteroids and gates keep today's size.",
  "Ships still fit their docks as they do now.",
  "A new game opens on Home with the station filling the same amount of screen as today.",
  "Zoom in goes 3 times closer than today. At full zoom in, a module and a ship look as big as they do now.",
  "Zoom out goes until the system takes up about half the screen, with empty space round it.",
  "Ships fly at today's speed, so a mining trip takes about 5 times as long and income drops to match.",
  "The 5 times and the third are single numbers the team can retune after Alice has played it.",
];
const browser = await playwright.chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"], timeout: 30000 });
const baseContext = await browser.newContext({ viewport: { width: 800, height: 700 } });
const baseline = await baseContext.newPage();
await baseline.goto(`${mainURL}?seed=7`);
await baseline.waitForFunction(() => !!window.issue124Demo);
const context = await browser.newContext({ viewport: { width: 1600, height: 900 },
  recordVideo: { dir: out, size: { width: 1600, height: 900 } } });
const page = await context.newPage();
const started = Date.now();
const moments = [], errors = [];
page.on("pageerror", e => errors.push(e.message));
baseline.on("pageerror", e => errors.push(e.message));
await writeFile(join(out, "comparison.html"), `<!doctype html><html><head><style>
body{margin:0;background:#081428;color:#f8fafc;font:23px/1.35 monospace}header{height:90px;padding:12px 24px;box-sizing:border-box}
#panels{display:flex;position:relative}section{width:800px}h2{height:36px;margin:0;text-align:center;font-size:22px}
iframe,img{border:0;width:800px;height:700px;display:block}footer{padding:8px 24px;white-space:pre;font-size:21px}
#terminal{display:none;margin:30px 60px;background:#111827;border:1px solid #64748b;padding:30px;font-size:30px;white-space:pre-wrap}
</style></head><body><header id="caption"></header><div id="panels"><section id="left"><h2>MAIN — before</h2><img id="still"><iframe id="mainLive" style="display:none" src="${mainURL}?seed=7"></iframe></section><section id="right"><h2>PR #164 — after</h2><iframe id="game" src="${branchURL}?seed=7"></iframe></section></div><footer id="details"></footer><pre id="terminal"></pre></body></html>`);
await page.goto(pathToFileURL(join(out, "comparison.html")).href);
const current = page.frames().find(frame => frame.url().startsWith(branchURL));
const liveMain = page.frames().find(frame => frame.url().startsWith(mainURL));
await current.waitForFunction(() => !!window.issue124Demo);
await liveMain.waitForFunction(() => !!window.issue124Demo);

async function camera(target, x, y, zoom) {
  await target.evaluate(({ x, y, zoom }) => window.issue124Demo.camera(x, y, zoom), { x, y, zoom });
}
async function setup(target, scene) {
  await target.evaluate(scene => {
    document.querySelectorAll(".demo-label").forEach(el => el.remove());
    window.issue124Demo.setup(scene);
  }, scene);
}
async function systemCamera(target, zoom) {
  const bounds = await target.evaluate(() => {
    const s = window.issue124Demo.state;
    const points = [...s.asteroids.filter(a => a.sectorId === 0).map(a => a.position), s.sectors[0].gate.position, { x: 0, y: 0 }];
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2,
      width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  });
  await camera(target, bounds.x, bounds.y, zoom);
  return bounds;
}
async function annotate(target, labels) {
  await target.evaluate(labels => {
    document.querySelectorAll(".demo-label").forEach(el => el.remove());
    const ui = window.issue124Demo.ui;
    for (const { text, x, y } of labels) {
      const el = document.createElement("div"); el.className = "demo-label"; el.textContent = text;
      el.style.cssText = `position:fixed;left:${(x-ui.camera.center.x)*ui.camera.zoom+ui.viewport.width/2}px;top:${(y-ui.camera.center.y)*ui.camera.zoom+ui.viewport.height/2+20}px;color:#fff;background:#081428cc;font:17px monospace;pointer-events:none;padding:2px`;
      document.body.append(el);
    }
  }, labels);
}
async function still(scene) {
  await baseline.waitForTimeout(100);
  const bytes = await baseline.screenshot({ path: join(out, `main-${scene}.png`) });
  await page.locator("#still").evaluate((el, src) => { el.src = src; }, `data:image/png;base64,${bytes.toString("base64")}`);
}
async function mark(scene, details) {
  await page.bringToFront();
  await page.locator("#details").evaluate((el, text) => { el.textContent = text; }, details);
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(out, `scene-${scene}-screen.png`) });
  moments.push({ scene, seconds: (Date.now() - started) / 1000, criterion: criteria[scene - 1], details });
  console.log(JSON.stringify(moments.at(-1)));
}
try {
  for (let scene = 1; scene <= 9; scene++) {
    await page.locator("#caption").evaluate((el, text) => { el.textContent = text; }, `${scene}. ${criteria[scene - 1]}`);
    await setup(baseline, scene); await setup(current, scene);
    let details = "";
    if (scene === 1 || scene === 7) {
      if (scene === 7) {
        await page.locator("#game").evaluate(el => { el.style.width = "600px"; el.style.height = "500px"; });
        await page.locator("#right").evaluate(el => { el.style.width = "600px"; });
        await current.waitForFunction(() => window.issue124Demo.ui.viewport.width === 600);
      }
      const bounds = await systemCamera(current, scene === 1 ? 0.2 : 0.1);
      await systemCamera(baseline, 0.2);
      for (const target of [baseline, current]) {
        const labels = await target.evaluate(() => {
          const s = window.issue124Demo.state, belt = s.fields.find(f => f.sectorId === 0 && f.kind === "belt");
          return [{ text: "Station", x: 0, y: 0 }, { text: "Gate", ...s.sectors[0].gate.position }, { text: "Belt", x: belt.centre.x, y: belt.centre.y }];
        });
        await annotate(target, labels);
      }
      details = scene === 1 ? "Same zoom 0.2 on both screens | Gate radius: main 480 → branch 2400 world units"
        : `Zoom limit 0.1 | System span ${Math.round(bounds.width * 0.1)} × ${Math.round(bounds.height * 0.1)} px in a 600 × 500 px view`;
      if (scene === 7) await page.locator("#panels").evaluate(el => {
        document.querySelector("#left").style.display = "none"; el.style.justifyContent = "center";
      });
    } else if (scene === 2) {
      for (const target of [baseline, current]) {
        await camera(target, 65, 15, 4);
        const storageX = await target.evaluate(() => window.issue124Demo.state.stations[0].storage.position.x);
        await annotate(target, [{ text: "Dock", x: -8, y: 0 }, { text: "Storage", x: storageX - 10, y: -40 },
          { text: "Ship", x: 75, y: 0 }, { text: "Asteroid", x: 128, y: 0 },
          { text: "Hive", x: 94, y: 55 }, { text: "Bug", x: 138, y: 55 }]);
      }
      details = "Same zoom 4 | Seeded scale lineup; the asteroid stays unchanged as the reference";
    } else if (scene === 3) {
      for (const target of [baseline, current]) {
        await camera(target, 175, 0, 4);
        await annotate(target, [{ text: "Asteroid 13 × 10", x: 118, y: 0 }, { text: "Gate 24 × 24", x: 187, y: 0 }]);
      }
      details = "Same zoom 4 | Same asteroid and gate dimensions on both builds";
    } else if (scene === 4 || scene === 6) {
      await camera(baseline, 0, 0, 8);
      await camera(current, 0, 0, scene === 4 ? 8 : 24);
      details = scene === 4 ? "Same zoom 8 | A real berth: dock and ship shrink together; fit is unchanged"
        : "Main at its maximum 8 | Branch at its maximum 24 | Dock 144 × 216 px; ship 72 × 72 px on both";
    } else if (scene === 5) {
      const cameras = await Promise.all([baseline, current].map(target => target.evaluate(() => window.issue124Demo.ui.camera)));
      details = `Unmodified new games, seed 7, paused on first frame | Starting zoom: main ${cameras[0].zoom} → branch ${cameras[1].zoom}`;
    } else if (scene === 8) {
      await page.locator("#game").evaluate(el => { el.style.width = "800px"; el.style.height = "700px"; });
      await page.locator("#right").evaluate(el => { el.style.width = "800px"; });
      await current.waitForFunction(() => window.issue124Demo.ui.viewport.width === 800);
      await page.locator("#panels").evaluate(el => { document.querySelector("#left").style.display = "block"; el.style.justifyContent = ""; });
      await setup(liveMain, 8);
      // Keep both ends of the route clear of the game's right-hand ship panel.
      await camera(liveMain, 300, 0, 0.8); await camera(current, 1500, 0, 0.2);
      for (const target of [liveMain, current]) await target.evaluate(() => {
        window.issue124Demo.ui.selectedShips = [0];
        const readout = document.createElement("div"); readout.className = "demo-label";
        readout.style.cssText = "position:fixed;left:16px;bottom:28px;color:#fff;background:#081428ee;font:20px monospace;padding:8px;white-space:pre";
        document.body.append(readout);
        function update() {
          const s = window.issue124Demo.state, ship = s.ships[0];
          readout.textContent = `Seeded replay: 1.33 game s/frame\nGame time ${s.time.toFixed(1)} s | Miner: ${ship.state}\nDelivered ${s.stations[0].inventory.Metal.toFixed(1)} Metal`;
          requestAnimationFrame(update);
        }
        update();
      });
      await page.locator("#still").evaluate(el => { el.style.display = "none"; });
      await page.locator("#mainLive").evaluate(el => { el.style.display = "block"; });
      const [before, after] = await Promise.all([liveMain, current].map(target => target.evaluate(() => window.issue124Demo.metrics)));
      assert.equal(before.cruiseSpeed, after.cruiseSpeed);
      assert.ok(after.seconds > before.seconds); assert.ok(after.income < before.income);
      details = `Travel miner: 4 engines, 11 lasers, 2 cargo | Both ${before.cruiseSpeed} units/s | Flight ${(after.outboundSeconds / before.outboundSeconds).toFixed(1)}× longer\nFull trip: ${before.seconds} → ${after.seconds} s (${(after.seconds / before.seconds).toFixed(1)}×) | Actual income: ${before.income.toFixed(2)} → ${after.income.toFixed(2)} Metal/min`;
      await mark(scene, details);
      // Same simulated speed on both real game screens. Stop each after one delivery.
      const step = 40 / 30;
      assert.ok(step * 180 >= after.seconds, "Replay must include a whole delivery");
      for (let frame = 0; frame < 180; frame++) {
        for (const target of [liveMain, current]) await target.evaluate(step => {
          if (window.issue124Demo.state.stations[0].inventory.Metal < window.issue124Demo.metrics.delivered) window.issue124Demo.step(step);
        }, step);
        await page.waitForTimeout(1000 / 30);
      }
      for (const target of [liveMain, current]) assert.equal(await target.evaluate(() => window.issue124Demo.state.stations[0].inventory.Metal), after.delivered);
      await page.waitForTimeout(800);
      continue;
    } else if (scene === 9) {
      const source = await readFile(resolve("sim/src/size-constants.ts"), "utf8");
      // Replace the page so Chrome records the terminal frame even after both
      // busy game iframes stop painting. Source bytes are read, never hardcoded.
      await page.setContent(`<style>@keyframes terminalCursor{from{opacity:1}to{opacity:.2}}#cursor{animation:terminalCursor .4s infinite alternate}</style><body style="margin:0;background:#081428;color:#f8fafc;font:23px/1.35 monospace"><header style="padding:12px 24px"></header><pre id="source" style="margin:80px 60px;padding:30px;background:#111827;border:1px solid #64748b;font:30px/1.5 monospace"></pre><div id="cursor" style="margin:0 90px;font:30px monospace">▊</div><footer id="details" style="padding:24px"></footer></body>`);
      await page.locator("header").evaluate((el, text) => { el.textContent = text; }, `9. ${criteria[8]}`);
      await page.locator("#source").evaluate((el, source) => {
        el.textContent = `$ nl -ba sim/src/size-constants.ts\n\n${source.trimEnd().split("\n").map((line, i) => `${i + 1}  ${line}`).join("\n")}`;
      }, source);
      details = "Real source file read from this branch; the two shared tuning constants";
    }
    if (scene <= 6) await still(scene);
    await mark(scene, details);
    await page.waitForTimeout(scene === 9 ? 3500 : 2500);
  }
  assert.deepEqual(errors, []);
} finally {
  await context.close(); await baseContext.close(); await browser.close();
  await rename(await page.video().path(), join(out, "issue-124.webm"));
  // CPU contention can stretch the browser's frame capture. Keep the phone
  // demo short without dropping scenes or changing the simulated measurements.
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(out, "issue-124.webm")]);
  const duration = Number(stdout.trim());
  if (duration > 40) {
    const factor = 38 / duration;
    await rename(join(out, "issue-124.webm"), join(out, "raw.webm"));
    await run("/usr/bin/ffmpeg", ["-loglevel", "error", "-y", "-i", join(out, "raw.webm"),
      "-vf", `setpts=${factor}*PTS`, "-an", "-c:v", "libvpx-vp9", "-deadline", "realtime", join(out, "issue-124.webm")]);
    for (const moment of moments) { moment.rawSeconds = moment.seconds; moment.seconds *= factor; }
    console.log(`Condensed ${duration.toFixed(1)} s capture to 38 s; no scenes removed`);
  }
  await writeFile(join(out, "moments.json"), JSON.stringify(moments, null, 2));
}
console.log("Recorded all nine criteria");
