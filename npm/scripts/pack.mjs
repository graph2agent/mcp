#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = path.resolve(process.argv[2] || path.join(repositoryRoot, "dist/npm"));
const output = path.resolve(process.argv[3] || path.join(repositoryRoot, "dist/npm-packages"));
const npmCache = path.join(path.dirname(output), ".npm-pack-cache");

await rm(output, { recursive: true, force: true });
await rm(npmCache, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const platformDirectories = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
];
const packageDirectories = platformDirectories.map((name) => path.join(packageRoot, "platform", name));
packageDirectories.push(packageRoot);

const checksums = [];
for (const directory of packageDirectories) {
  const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  const outputJSON = execFileSync(
    "npm",
    ["pack", directory, "--json", "--pack-destination", output],
    {
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: npmCache },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const result = JSON.parse(outputJSON);
  if (!Array.isArray(result) || result.length !== 1 || !result[0].filename) {
    throw new Error(`npm pack returned an unexpected result for ${directory}`);
  }
  const packed = result[0];
  if (packed.name !== manifest.name || packed.version !== manifest.version || packed.bundled?.length !== 0) {
    throw new Error(`npm pack identity mismatch for ${directory}`);
  }
  const binary = manifest.name === "graph2agent-mcp"
    ? "bin/graph2agent-mcp.cjs"
    : manifest.files.find((name) => name === "graph2agent-mcp" || name === "graph2agent-mcp.exe");
  const expectedFiles = ["LICENSE", "README.md", binary, ...(manifest.name === "graph2agent-mcp" ? ["checksums.json"] : []), "package.json"].sort();
  const actualFiles = packed.files.map((file) => file.path).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`npm pack leaked or omitted files for ${manifest.name}: ${actualFiles.join(", ")}`);
  }
  for (const file of packed.files) {
    const expectedMode = file.path === binary ? 0o755 : 0o644;
    if (file.mode !== expectedMode) throw new Error(`wrong packed mode for ${manifest.name}/${file.path}`);
  }
  const maximum = manifest.name === "graph2agent-mcp" ? 1 << 20 : 64 << 20;
  if (packed.unpackedSize > maximum) throw new Error(`${manifest.name} exceeds its unpacked size limit`);
  const tarball = path.join(output, result[0].filename);
  const bytes = await readFile(tarball);
  checksums.push({ filename: result[0].filename, sha256: createHash("sha256").update(bytes).digest("hex") });
}

checksums.sort((left, right) => left.filename.localeCompare(right.filename));
await writeFile(
  path.join(output, "checksums.txt"),
  `${checksums.map(({ filename, sha256 }) => `${sha256}  ${filename}`).join("\n")}\n`,
);
await rm(npmCache, { recursive: true, force: true });
process.stdout.write(`${checksums.length} npm packages packed\n`);
