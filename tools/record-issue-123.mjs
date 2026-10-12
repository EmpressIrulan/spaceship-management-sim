// node tools/record-issue-123.mjs ~/.cache/spaceship-123/take1
import { build } from "esbuild";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const fixture = resolve("tools/issue-123-demo-fixture.ts");
const bundle = await build({ entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false,
  plugins: [{ name: "recording-only-fixture", setup(b) {
    b.onResolve({ filter: /^sim$/ }, () => ({ path: resolve("sim/src/index.ts") }));
    b.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({ loader: "ts",
      resolveDir: resolve("app/src"), contents: `${await readFile(path, "utf8")}\nimport { installIssue123Demo } from ${JSON.stringify(fixture)};\nimport { MIN_ZOOM, MAX_ZOOM } from './camera';\ninstallIssue123Demo(ui, () => state, next => { state = next; }, shipMenuSystem.openShipMenu, shipMenuSystem.closeShipMenu, { min: MIN_ZOOM, max: MAX_ZOOM });` }));
  } }] });
await writeFile(join(out, "game.html"), (await readFile("app/index.html", "utf8"))
  .replace('<script type="module" src="./main.js"></script>', () => `<script type="module">${bundle.outputFiles[0].text}</script>`));
await writeFile(join(out, "demo.html"), `<!doctype html><style>body{margin:0;background:#081428;color:white;font:20px/1.3 monospace}header{height:100px;padding:12px 18px;box-sizing:border-box}iframe{border:0;width:714px;height:640px;transform:scale(1.4);transform-origin:top left}</style><header id="caption"></header><iframe src="game.html?seed=7"></iframe>`);
const { default: playwright } = await import(pathToFileURL(resolve(process.env.HOME, ".cache/spaceship-123/node_modules/playwright-core/index.js")));
const browser = await playwright.chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1000, height: 1000 }, recordVideo: { dir: out, size: { width: 1000, height: 1000 } } });
const page = await context.newPage();
const errors = []; page.on("pageerror", e => errors.push(e.message));
await page.goto(pathToFileURL(join(out, "demo.html")).href);
const game = page.frames().find(f => f.url().includes("game.html"));
await game.waitForFunction(() => !!window.issue123Demo);
const criteria = [
  'Select the starting miner. Its menu has a "Modules" section with one line per module type it has, like "Engine x1", "Laser x1", "Storage x2".',
  'Module types the ship does not have are left out.',
  "The lines are always in the designer's order, which is Engine, Laser, Storage, Hangar, Hull, Gun, Capacitor, Generator.",
  'The counts match the ship. Count the blocks on the outline from #122 and the numbers agree.',
  'Select two or more ships. No module list shows.',
  'In the Build ship menu, each design has the same list under it.',
  'There is no overall size line, only the counts.',
];
const starter = ['Engine x4', 'Laser x4', 'Storage x8'];
const mixed = ['Engine x2', 'Laser x1', 'Storage x1', 'Hull x1', 'Gun x1', 'Capacitor x1', 'Generator x1'];
const moments = [];
async function check(expected, build = false) {
  const selector = build ? '#ship-menu .modules' : '#ship-panel .ship-modules';
  await game.waitForFunction(({ selector, expected }) => {
    const el = document.querySelector(selector);
    return el && expected.every(line => el.innerText.includes(line));
  }, { selector, expected });
  const lines = (await game.locator(selector).innerText()).split('\n').map(s => s.trim()).filter(s => s && s !== 'Modules');
  assert.deepEqual(lines, expected);
}
async function mark(scene, suffix = '') {
  await page.waitForTimeout(150);
  const seconds = await page.evaluate(() => performance.now() / 1000);
  moments.push({ scene, seconds, criterion: criteria[scene - 1], suffix });
  await page.screenshot({ path: join(out, `scene-${scene}${suffix}.png`) });
  console.log(JSON.stringify(moments.at(-1)));
}
try {
  for (let scene = 1; scene <= 7; scene++) {
    await page.locator('#caption').evaluate((el, text) => el.textContent = text, `${scene}. ${criteria[scene - 1]}`);
    await game.evaluate(({ scene }) => window.issue123Demo.setup([2, 3].includes(scene), scene === 5), { scene });
    if (scene === 5) {
      await game.waitForFunction(() => document.querySelector('#ship-panel h2').textContent === '2 ships selected');
      assert.equal(await game.locator('#ship-panel .ship-modules').count(), 0);
    } else await check([2, 3].includes(scene) ? mixed : starter);
    if (scene === 6 || scene === 7) {
      await game.evaluate(() => window.issue123Demo.build());
      await check(starter, true);
      await game.locator('#ship-menu .modules').scrollIntoViewIfNeeded();
    }
    await mark(scene);
    await page.waitForTimeout(scene === 6 ? 2500 : 3500);
    if (scene === 6) {
      await game.evaluate(() => window.issue123Demo.build(true));
      await check(mixed, true);
      await game.locator('#ship-menu .modules').scrollIntoViewIfNeeded();
      await mark(scene, '-mixed');
      await page.waitForTimeout(2500);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await context.close(); await browser.close();
  await rename(await page.video().path(), join(out, 'issue-123.webm'));
  await writeFile(join(out, 'moments.json'), JSON.stringify(moments, null, 2));
}
console.log('Recorded all seven criteria');
