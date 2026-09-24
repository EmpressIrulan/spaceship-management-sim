import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import esbuild from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appDir = path.join(root, "app");
const distDir = path.join(root, "dist");

const buildOptions = {
  entryPoints: [path.join(appDir, "src", "main.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
};

async function dev() {
  const ctx = await esbuild.context({
    ...buildOptions,
    outfile: path.join(appDir, "main.js"),
    sourcemap: true,
  });
  await ctx.watch();
  const { hosts, port } = await ctx.serve({ servedir: appDir });
  console.log(`serving http://${hosts[0]}:${port}`);
}

async function build() {
  // No sourcemap: dist/index.html is a single file with no server behind it,
  // and a sourceMappingURL comment would 404 when opened from the filesystem.
  const result = await esbuild.build({
    ...buildOptions,
    outfile: path.join(appDir, "main.js"),
    write: false,
  });
  const bundle = result.outputFiles.find((file) => file.path.endsWith(".js"));
  if (!bundle) {
    throw new Error("esbuild produced no output for app/src/main.ts");
  }

  const html = await readFile(path.join(appDir, "index.html"), "utf8");
  const tag = '<script type="module" src="./main.js"></script>';
  if (!html.includes(tag)) {
    throw new Error(`app/index.html is missing the script tag: ${tag}`);
  }
  const inlined = html.replace(
    tag,
    () => `<script type="module">\n${bundle.text}\n</script>`,
  );

  await mkdir(distDir, { recursive: true });
  await writeFile(path.join(distDir, "index.html"), inlined);
  console.log(`wrote ${path.join("dist", "index.html")}`);
}

const mode = process.argv.includes("--dev") ? "dev" : "build";
if (mode === "dev") {
  await dev();
} else {
  await build();
}
