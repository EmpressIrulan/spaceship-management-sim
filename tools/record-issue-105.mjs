// npm install --prefix ~/.cache/spaceship-management-sim-105 playwright-core@1.56.1
// SCENE=1 node tools/record-issue-105.mjs ~/.cache/spaceship-management-sim-105/rec/runN
// Each criterion records independently, so failed scenes never replace good ones.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const scene = Number(process.env.SCENE ?? 1);
const { chromium } = await import(pathToFileURL(resolve(process.env.HOME, ".cache/spaceship-management-sim-105/node_modules/playwright-core/index.mjs")));
const fixture = resolve("tools/issue-105-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: [{
  name: "issue-105-demo", setup(b) {
    b.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nObject.defineProperty(window,"__repro",{value:{get state(){return state},get ui(){return ui}}});\nimport {installIssue105Demo} from ${JSON.stringify(fixture)};installIssue105Demo(ui,()=>state,s=>{state=s});`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  },
}] });
const html = (await readFile("app/index.html", "utf8")).replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`);
const file = resolve(out, "demo.html"); await writeFile(file, html);
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
page.on("pageerror", e => console.error(e));
const shots = [];
const snap = () => page.evaluate(() => window.__repro.state);
const pause = () => page.evaluate(() => window.issue105Demo.pause());
const run = (speed = 4) => page.evaluate(speed => window.issue105Demo.run(speed), speed);
const focus = (p, zoom = 3) => page.evaluate(({ p, zoom }) => window.issue105Demo.focus(p, zoom), { p, zoom });
const park = async () => { await page.mouse.move(30, 840); await page.waitForTimeout(100); };
const point = p => page.evaluate(p => { const { camera, viewport } = window.__repro.ui; return { x: (p.x - camera.center.x) * camera.zoom + viewport.width / 2, y: (p.y - camera.center.y) * camera.zoom + viewport.height / 2 }; }, p);
async function hover(p, expected) {
  const xy = await point(p); await page.mouse.move(xy.x, xy.y);
  await page.waitForFunction(expected => !document.querySelector("#info").hidden && document.querySelector("#info").innerText.includes(expected), expected);
  // The real hover box anchors beyond the body's bottom-right edge.
  const box = await page.locator("#info").boundingBox(); assert.ok(box && (box.x > xy.x || box.y > xy.y));
}
async function caption(text) {
  await page.evaluate(text => { let e = document.getElementById("demo-caption"); if (!e) { e = document.createElement("div"); e.id = "demo-caption"; e.style.cssText = "position:fixed;top:65px;left:50%;transform:translateX(-50%);padding:10px 16px;background:#020617ee;color:white;font:18px monospace;z-index:9999;pointer-events:none;white-space:nowrap"; document.body.append(e); } e.textContent = text; }, `${scene} · ${text}`);
}
async function hold(name, text, ms = 3500) {
  await caption(text); await page.waitForTimeout(100);
  const videoTime = await page.evaluate(() => performance.now() / 1000);
  shots.push({ name, seconds: videoTime, caption: text });
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  await page.waitForTimeout(ms);
}
async function sector(id) {
  await page.keyboard.press("m"); await page.waitForFunction(() => window.__repro.ui.mapOpen);
  const xy = await page.evaluate(id => { const v = window.__repro.ui.viewport; const positions = [[0, 0], [1, 0], [2, 0], [0, 1]]; return { x: v.width * (.2 + positions[id][0] * .25), y: v.height * (.25 + positions[id][1] * .25) }; }, id);
  await page.mouse.click(xy.x, xy.y); await page.waitForFunction(id => window.__repro.ui.currentSector === id && !window.__repro.ui.mapOpen, id);
}
try {
  await page.goto(`${pathToFileURL(file).href}?seed=105`);
  await page.waitForFunction(() => !!window.issue105Demo && window.__repro.ui.viewport.width > 0);
  // Headless Chrome omits the OS pointer from video. Show its actual position.
  await page.evaluate(() => {
    const cursor = document.createElement("div");
    cursor.style.cssText = "position:fixed;width:12px;height:18px;pointer-events:none;z-index:10001;clip-path:polygon(0 0,0 100%,35% 72%,64% 100%,82% 90%,53% 62%,100% 62%);background:white;filter:drop-shadow(1px 1px 1px black)";
    document.body.append(cursor);
    document.addEventListener("mousemove", e => { cursor.style.left = `${e.clientX}px`; cursor.style.top = `${e.clientY}px`; });
  });
  await page.evaluate(() => window.issue105Demo.setup());
  await sector(1);
  let s = await snap(); const h = s.hives[0];
  await focus(h.position); await park();
  if (scene === 1) {
    await hover(h.position, "HP 200/200"); await hold("scene-1", "Hive next to Home · hover HP 200/200", 5000);
  } else if (scene === 2) {
    await caption("One bug every 10 game seconds · watching at 4x"); await run();
    for (let n = 1; n <= 3; n++) {
      await page.waitForFunction(n => window.__repro.state.bugs.length === n, n, { timeout: 15000 });
      s = await snap(); console.log(`Birth ${n} at ${s.time.toFixed(2)} game seconds`);
    }
    await pause(); s = await snap(); await hover(s.bugs[2].position, "HP 6/6"); await hold("scene-2", "Third hatch at 30 seconds · bug hover HP 6/6", 5000);
  } else if (scene === 3) {
    await page.evaluate(() => window.issue105Demo.setup(4, true)); s = await snap(); await focus({ x: h.position.x + 45, y: h.position.y }, 3);
    await park(); await hold("scene-3-start", "Four bugs around the hive · nearby ship", 3500); await caption("Four bugs hover by the hive; nearby ship ignored"); await run(1); await page.waitForTimeout(6500); await pause();
    s = await snap(); assert.equal(s.bugs.length, 4); assert.equal(s.ships[0].hp, 40); assert.ok(s.bugs.every(b => b.state === "hovering"));
    await hold("scene-3", "Four bugs still hovering · ship untouched", 4500);
  } else if (scene === 4) {
    await page.evaluate(() => window.issue105Demo.hunting()); s = await snap(); await focus({ x: h.position.x + 40, y: h.position.y }, 2.5);
    const loaded = await point(s.ships[0].position); await page.mouse.click(loaded.x, loaded.y); await park();
    await hold("scene-4-loaded", "Five bugs · nearer ship carries cargo", 3000);
    await caption("Five bugs fly at the nearest ship"); await run(2);
    await page.waitForFunction(() => window.__repro.state.ships[0].hp < 40, null, { timeout: 20000 }); await pause(); s = await snap();
    await hover(s.ships[0].position, `HP ${s.ships[0].hp}/40`); await hold("scene-4", "Bites reduce the ship's HP", 3500);
    await run(2); await page.waitForFunction(() => window.__repro.state.ships[0].hp <= 10, null, { timeout: 30000 }); await pause(); s = await snap();
    await hover(s.ships[0].position, `HP ${s.ships[0].hp}/40`); await hold("scene-4-low", "More bites · hull nearly gone", 3000);
    await focus(s.ships[0].position, 1); await park(); await caption("At zero HP the loaded ship explodes"); await run(2);
    await page.waitForFunction(() => !window.__repro.state.ships.some(s => s.id === 0), null, { timeout: 20000 });
    await pause(); await page.waitForTimeout(600);
    await page.evaluate(() => window.issue105Demo.holdAnimation());
    await hold("scene-4-explosion", "Loaded ship explodes into fire-coloured pixels", 4500);
    s = await snap(); assert.equal(s.ships.length, 1); assert.equal(s.ships[0].id, 99);
  } else if (scene === 5) {
    await page.evaluate(() => window.issue105Demo.designer()); await sector(0); await focus({ x: 40, y: 0 }, 4);
    const builder = await point({ x: 80, y: 0 }); await page.mouse.click(builder.x, builder.y);
    await page.waitForFunction(() => !document.querySelector("#ship-menu").hidden);
    await page.locator('#ship-menu button[data-module="Gun"]').click();
    await page.evaluate(() => { for (let y = 0; y < 3; y++) { window.issue105Demo.paint("Engine", 0, y); window.issue105Demo.paint("Hull", 1, y); window.issue105Demo.paint("Gun", 2, y); } });
    await park(); await hold("scene-5", "Ship designer · yellow Gun pixels placed", 4500);
    await page.locator('#ship-menu button[data-build]').click(); await run();
    await page.waitForFunction(() => window.__repro.state.ships.length > 0, null, { timeout: 60000 }); await pause(); s = await snap();
    const id = s.ships[0].id; assert.ok(s.ships[0].design.slots.includes("Gun"));
    await page.evaluate(({ id, p }) => window.issue105Demo.move(id, p, 1), { id, p: h.position });
    await caption("Built Gun ship · Move order to the hive sector"); await park(); await run();
    await page.waitForFunction(() => window.__repro.state.ships[0].sectorId === 1, null, { timeout: 60000 }); await pause(); await sector(1); s = await snap(); await focus(s.ships[0].position, 5);
    await park(); await hold("scene-5-move", "Built Gun ship arrives with a Move order", 4000);
    assert.equal(s.ships[0].order.kind, "move");
  } else if (scene === 6 || scene === 7) {
    await page.evaluate(() => window.issue105Demo.combat()); await focus({ x: h.position.x - 30, y: h.position.y }, 5); await park();
    await caption("Gun ship fires automatically · bug needs two hits"); await run(1);
    await page.waitForFunction(() => { const shot = window.__repro.state.ships[0].gunShot; return shot?.target.kind === "bug" && shot.timer < .32 && shot.timer > .15; }); await pause();
    if (scene === 6) await hold("scene-6", "Yellow projectile in flight to the bug", 3500);
    await run(1); await page.waitForFunction(() => window.__repro.state.bugs[0]?.hp === 3 && !window.__repro.state.ships[0].gunShot); await pause();
    if (scene === 6) { s = await snap(); await hover(s.bugs[0].position, "HP 3/6"); await hold("scene-6-impact", "Projectile arrives · bug HP falls to 3/6", 2500); await park(); }
    await run(1); await page.waitForFunction(() => window.__repro.state.bugs.length === 0); await pause(); s = await snap();
    if (scene === 7) { await hover(s.drops[0].position, "Bug juice"); await hold("scene-7", "Bug juice floats where the bug died", 4500); }
    await park(); await caption("Gun ship automatically shoots the wounded hive"); await run(1);
    await page.waitForFunction(() => { const shot = window.__repro.state.ships[0].gunShot; return shot?.target.kind === "hive" && shot.timer < .32 && shot.timer > .15; }); await pause();
    if (scene === 6) await hold("scene-6-hive", "Yellow projectile in flight to the wounded hive", 3500);
    await run(1); await page.waitForFunction(() => !window.__repro.state.hives[0].alive, null, { timeout: 15000 }); await pause(); s = await snap();
    if (scene === 7) { const d = s.drops.find(d => d.kind === "queenLarvae"); await hover(d.position, "Queen larvae"); await hold("scene-7-queen", "Queen larvae floats where the hive died", 4500); }
  } else if (scene === 8) {
    await page.evaluate(() => window.issue105Demo.dead()); await focus(h.position, 5); await park();
    s = await snap(); assert.equal(s.hives[0].alive, false); assert.ok(s.ships.every(ship => !ship.gunShot));
    await hold("scene-8-before", "Last projectile landed · Gun ship has stopped firing", 3500);
    await caption("Time passes at 4x · no further hatches"); await run(); await page.waitForTimeout(8500); await pause();
    s = await snap(); assert.ok(s.time >= 30); assert.equal(s.bugs.length, 0); assert.equal(s.nextBugId, 0);
    assert.ok(s.ships.every(ship => !ship.gunShot));
    await hold("scene-8", "30+ game seconds later · no bugs, no shots", 4500);
  }
  await writeFile(resolve(out, "scenes.json"), JSON.stringify(shots, null, 2));
} finally { await context.close(); }
const video = page.video(); await video.saveAs(resolve(out, "demo.webm")); await browser.close();
console.log(`Recorded scene ${scene}: ${resolve(out, "demo.webm")}`);
