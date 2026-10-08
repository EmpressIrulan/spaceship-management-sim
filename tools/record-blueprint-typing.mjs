// node tools/record-blueprint-typing.mjs ~/.cache/spaceship-management-sim-129
// Records the real game entry point with only a recording-only state fixture.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(out, "node_modules/playwright-core/index.mjs")));
const fixture = resolve("tools/blueprint-typing-fixture.ts");
const bundle = await build({
  entryPoints: ["app/src/main.ts"], bundle: true, format: "esm", write: false,
  plugins: [{
    name: "blueprint-typing-fixture",
    setup(builder) {
      builder.onLoad({ filter: /app\/src\/main\.ts$/ }, async ({ path }) => ({
        contents: `${await readFile(path, "utf8")}\nimport { installBlueprintTypingFixture } from ${JSON.stringify(fixture)};\ninstallBlueprintTypingFixture(ui, () => state, shipMenuSystem.openShipMenu);`,
        loader: "ts", resolveDir: resolve("app/src"),
      }));
    },
  }],
});
const html = (await readFile("app/index.html", "utf8")).replace(
  '<script type="module" src="./main.js"></script>',
  () => `<script type="module">${bundle.outputFiles[0].text}</script>`,
);
const pagePath = resolve(out, "blueprint-typing-demo.html");
await writeFile(pagePath, html);

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: out, size: { width: 1280, height: 900 } },
});
const page = await context.newPage();
page.on("pageerror", error => { console.error(error); });
const scenes = [];
const start = Date.now();
const snapshot = () => page.evaluate(() => window.blueprintTypingDemo.snapshot());
async function hold(scene, predicate) {
  await page.waitForFunction(predicate);
  scenes.push({ scene, seconds: (Date.now() - start) / 1000 });
  await page.waitForTimeout(4300); // Hold a verified in-game scene for reading.
}

try {
  await page.goto(pathToFileURL(pagePath).href);
  await page.waitForFunction(() => !!window.blueprintTypingDemo);
  await page.evaluate(() => window.blueprintTypingDemo.openMenu());
  await page.locator(".blueprint-name").waitFor({ state: "visible" });
  const name = page.locator(".blueprint-name");

  await name.click();
  await page.keyboard.type("miner");
  await hold(1, () => {
    const state = window.blueprintTypingDemo.snapshot();
    return state.blueprintName === "miner" && state.shipMenuOpen && !state.mapOpen;
  });
  assert.deepEqual(await snapshot(), { mapOpen: false, speed: 1, paused: false, blueprintName: "miner", shipMenuOpen: true });

  await name.fill("");
  await name.click();
  await page.keyboard.type("2");
  await hold(2, () => {
    const state = window.blueprintTypingDemo.snapshot();
    return state.blueprintName === "2" && state.speed === 1 && state.shipMenuOpen && !state.mapOpen;
  });
  assert.deepEqual(await snapshot(), { mapOpen: false, speed: 1, paused: false, blueprintName: "2", shipMenuOpen: true });

  await name.evaluate(element => element.blur());
  await page.keyboard.press("m");
  await hold(3, () => window.blueprintTypingDemo.snapshot().mapOpen === true);
  assert.equal((await snapshot()).mapOpen, true);

  await writeFile(resolve(out, "scenes.json"), JSON.stringify(scenes, null, 2));
} finally {
  await context.close();
  await browser.close();
}
const video = await page.video().path();
await writeFile(resolve(out, "video-path.txt"), video);
console.log(video);
console.log(JSON.stringify(scenes));
