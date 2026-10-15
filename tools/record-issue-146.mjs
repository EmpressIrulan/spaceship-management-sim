// node tools/record-issue-146.mjs ~/.cache/spaceship-management-sim-146/rec/run1
// Headless recording of the real game entry point with recording-only scenes.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const { default: playwright } = await import(pathToFileURL(resolve(process.env.HOME, ".cache/spaceship-161/node_modules/playwright-core/index.js")));
const fixture = resolve("tools/issue-146-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false, plugins: [{
  name: "recording-only-fixture", setup(builder) {
    builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nObject.defineProperty(window, "__repro", { value: { get state() { return state; }, get ui() { return ui; } } });\nimport { installIssue146Demo } from ${JSON.stringify(fixture)};\ninstallIssue146Demo(ui, () => state, next => { state = next; });`,
      loader: "ts", resolveDir: resolve("app/src"),
    }));
  },
}] });
const pagePath = resolve(out, "demo.html");
await writeFile(pagePath, (await readFile("app/index.html", "utf8")).replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`));
const browser = await playwright.chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
const errors = []; page.on("pageerror", error => errors.push(error.message));

const SHIP_PIXEL = 0.75;
const BUG_RADIUS = Math.hypot(10 / 3, 8 / 3) / 2;
const shipRadius = (s) => Math.hypot(s.width * SHIP_PIXEL, s.height * SHIP_PIXEL) / 2;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lineDistance = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
};
const inside = (p, box, pad = 0) => Math.abs(p.x - box.x) < box.width / 2 + pad && Math.abs(p.y - box.y) < box.height / 2 + pad;

const labels = [
  "1. Two ships on crossing paths curve past each other",
  "2. Ships and a bug go around the station; a ship passes through the asteroid",
  "3. A packed group nudges apart",
  "4. Docked and mining ships keep their spots while traffic passes",
  "5. A group sent to one point spreads to free spots",
  "6. Bugs avoid ships the same way",
];

async function caption(text) {
  await page.evaluate(text => {
    let el = document.querySelector("#demo-readout");
    if (!el) {
      el = document.createElement("div"); el.id = "demo-readout";
      el.style.cssText = "position:fixed;left:20px;bottom:20px;padding:14px 18px;background:#081428ee;color:#fff;font:18px/1.45 monospace;white-space:pre;pointer-events:none;z-index:9999";
      document.body.append(el);
    }
    el.textContent = text;
  }, text);
}

const results = [];
async function runScene(scene) {
  await page.evaluate(scene => window.issue146Demo.setup(scene), scene);
  const first = await page.evaluate(() => window.issue146Demo.snapshot());
  const plan = new Map();
  for (const s of first.ships) plan.set(`s${s.id}`, { from: s.from ?? { x: s.x, y: s.y }, to: s.to ?? { x: s.x, y: s.y }, start: { x: s.x, y: s.y }, state: s.state });
  for (const b of first.bugs) plan.set(`b${b.id}`, { from: b.from, to: b.to, start: { x: b.x, y: b.y }, state: "bug" });
  const m = { minGap: Infinity, minShipGap: Infinity, swerve: {}, drift: 0, stationFrames: 0, rockFrames: 0, frames: 0, firstDistinct: null, firstClosest: null };
  let snap = first;
  let track = false;
  const measure = (snap) => {
    const bodies = [
      ...snap.ships.map(s => ({ key: `s${s.id}`, x: s.x, y: s.y, r: shipRadius(s), parked: ["docked", "working"].includes(s.state), ship: true })),
      ...snap.bugs.map(b => ({ key: `b${b.id}`, x: b.x, y: b.y, r: BUG_RADIUS, parked: false, ship: false })),
    ];
    let closest = Infinity, closestShips = Infinity, overlapRatio = Infinity;
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      if (a.parked && b.parked) continue;
      const d = dist(a, b);
      closest = Math.min(closest, d);
      overlapRatio = Math.min(overlapRatio, d / (a.r + b.r));
      if (a.ship && b.ship) closestShips = Math.min(closestShips, d);
    }
    m.gapNow = closest;
    if (track) {
      m.minGap = Math.min(m.minGap, closest);
      m.minShipGap = Math.min(m.minShipGap, closestShips);
      m.minRatio = Math.min(m.minRatio ?? Infinity, overlapRatio);
    }
    for (const body of bodies) {
      const p = plan.get(body.key);
      if (body.parked) m.drift = Math.max(m.drift, dist(body, p.start));
      else if (p.from && p.to) m.swerve[body.key] = Math.max(m.swerve[body.key] ?? 0, lineDistance(body, p.from, p.to));
    }
    for (const body of bodies) {
      if (body.parked) continue;
      if (snap.modules.some(mod => inside(body, mod))) m.stationFrames += 1;
      if (snap.asteroids.some(rock => inside(body, rock))) m.rockFrames += 1;
    }
    m.frames += 1;
    m.distinct = new Set(bodies.map(b => `${b.x.toFixed(3)},${b.y.toFixed(3)}`)).size;
    m.count = bodies.length;
  };
  const text = (snap, note = "") => {
    const swerve = Object.entries(m.swerve).map(([k, v]) => `${k}:${v.toFixed(1)}`).join(" ");
    const lines = [labels[scene - 1], `Seeded demo fixture | game time ${snap.time.toFixed(1)} s (real tick, 2x playback)`];
    if (scene === 1) lines.push(`closest centre gap ${m.minGap.toFixed(2)} (touching = 4.24) | sideways swerve ${swerve}`);
    if (scene === 2) lines.push(`frames with a body centre inside a station module: ${m.stationFrames} | inside the asteroid: ${m.rockFrames}`, `sideways swerve ${swerve}`);
    if (scene === 3) lines.push(`${m.count} ships, ${m.distinct} distinct positions now (start: 1) | closest pair now ${m.gapNow.toFixed(2)} (touching = 4.24)`);
    if (scene === 4) lines.push(`parked ships moved at most ${m.drift.toFixed(3)} | movers' closest centre gap to anything ${m.minGap.toFixed(2)}`, `movers' sideways swerve ${swerve}`);
    if (scene === 5) lines.push(`${m.count} ships, ${m.distinct} distinct positions | closest pair now ${m.gapNow.toFixed(2)} (touching = 4.24)`);
    if (scene === 6) lines.push(`closest pair gap so far ${m.minGap.toFixed(2)} (bug and ship touching = 4.27) | bug and ship sideways swerve ${swerve}`);
    if (note) lines.push(note);
    return lines.join("\n");
  };
  measure(snap);
  await caption(text(snap));
  await page.screenshot({ path: resolve(out, `scene-${scene}-start.png`) });
  await page.waitForTimeout(1200);
  // A bug's first leg is the scene; after it the real hunting AI picks a new target.
  const endTime = first.time + Math.max(0, ...first.bugs.map(b => b.timer));
  const busy = (s) => s.ships.some(x => x.state === "moving") || s.time < endTime - 1e-6;
  let frame = 0;
  const shots = new Set([8, 16, 24, 32, 40, 48, 56, 64]);
  track = true;
  while (frame < 400) {
    await page.evaluate(() => window.issue146Demo.step(0.08));
    snap = await page.evaluate(() => window.issue146Demo.snapshot());
    frame += 1;
    measure(snap);
    await caption(text(snap));
    if (shots.has(frame)) await page.screenshot({ path: resolve(out, `scene-${scene}-f${frame}.png`) });
    await page.waitForTimeout(40);
    if (!busy(snap)) break;
  }
  await caption(text(snap, "(done)"));
  await page.screenshot({ path: resolve(out, `scene-${scene}-end.png`) });
  await page.waitForTimeout(2200);
  results.push({ scene, frames: frame, gapNow: m.gapNow, minGap: m.minGap, minRatio: m.minRatio, minShipGap: m.minShipGap, swerve: m.swerve, drift: m.drift,
    stationFrames: m.stationFrames, rockFrames: m.rockFrames, distinct: m.distinct, count: m.count });
}

try {
  await page.goto(pathToFileURL(pagePath).href);
  await page.waitForFunction(() => !!window.issue146Demo && window.__repro.ui.viewport.width > 0);
  for (let scene = 1; scene <= 6; scene++) await runScene(scene);
  await writeFile(resolve(out, "results.json"), JSON.stringify({ results, errors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
const video = await page.video().path();
await writeFile(resolve(out, "video-path.txt"), video);
console.log(video);
console.log(JSON.stringify({ results, errors }));
