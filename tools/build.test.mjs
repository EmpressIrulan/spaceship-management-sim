import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "./build.mjs";

// The build inlines app/main.js into dist/index.html. A string replacer would
// interpret replacement tokens like `$$` and `$&` inside the bundle, so this
// fixture pins the literal bytes and the missing-tag failure path.
const SCRIPT_TAG = '<script type="module" src="./main.js"></script>';
// Side effect so tree shaking cannot drop the tokens from the bundle.
const ENTRY = `console.log("$$" + "$&" + "$'" + "$\`");\n`;

const dirs = [];

async function makeFixture(html) {
  const dir = await mkdtemp(path.join(tmpdir(), "inline-fixture-"));
  dirs.push(dir);
  await mkdir(path.join(dir, "app", "src"), { recursive: true });
  await writeFile(path.join(dir, "app", "src", "main.ts"), ENTRY);
  await writeFile(path.join(dir, "app", "index.html"), html);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("build inlining", () => {
  it("leaves replacement tokens in the bundle literal", async () => {
    const dir = await makeFixture(`<!doctype html><html><head>${SCRIPT_TAG}</head></html>`);
    await build(dir);
    const out = await readFile(path.join(dir, "dist", "index.html"), "utf8");
    for (const token of ["$$", "$&", "$'", "$`"]) {
      expect(out).toContain(token);
    }
    expect(out).not.toContain(SCRIPT_TAG);
    expect(out).not.toContain("./main.js");
  });

  it("fails when the expected script tag is missing", async () => {
    const dir = await makeFixture("<!doctype html><p>no script tag</p>");
    await expect(build(dir)).rejects.toThrow(/missing the script tag/);
    await expect(readFile(path.join(dir, "dist", "index.html"))).rejects.toThrow();
  });
});
