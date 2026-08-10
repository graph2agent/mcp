#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const distDirectory = path.resolve(process.argv[2] || path.join(repositoryRoot, "dist"));
const mode = process.argv[3] || "snapshot";
const outputDirectory = path.join(distDirectory, "npm");

const targets = new Map([
  ["darwin:arm64", { directory: "darwin-arm64", binary: "graph2agent-mcp", packageName: "graph2agent-mcp-darwin-arm64" }],
  ["darwin:amd64", { directory: "darwin-x64", binary: "graph2agent-mcp", packageName: "graph2agent-mcp-darwin-x64" }],
  ["linux:arm64", { directory: "linux-arm64", binary: "graph2agent-mcp", packageName: "graph2agent-mcp-linux-arm64" }],
  ["linux:amd64", { directory: "linux-x64", binary: "graph2agent-mcp", packageName: "graph2agent-mcp-linux-x64" }],
  ["windows:arm64", { directory: "win32-arm64", binary: "graph2agent-mcp.exe", packageName: "graph2agent-mcp-win32-arm64" }],
  ["windows:amd64", { directory: "win32-x64", binary: "graph2agent-mcp.exe", packageName: "graph2agent-mcp-win32-x64" }],
]);

function fail(message) {
  process.stderr.write(`assemble npm packages: ${message}\n`);
  process.exit(1);
}

async function sha256(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

let artifacts;
try {
  artifacts = JSON.parse(await readFile(path.join(distDirectory, "artifacts.json"), "utf8"));
} catch (error) {
  fail(`cannot read ${path.join(distDirectory, "artifacts.json")}: ${error.message}`);
}

const binaries = artifacts.filter(
  (artifact) => artifact.type === "Binary" && artifact.extra?.ID === "graph2agent-mcp",
);
if (binaries.length !== targets.size) {
  fail(`expected ${targets.size} GoReleaser binaries, found ${binaries.length}`);
}

const rootManifest = JSON.parse(await readFile(path.join(repositoryRoot, "npm/package.json"), "utf8"));
const metadata = JSON.parse(await readFile(path.join(distDirectory, "metadata.json"), "utf8"));
if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/.test(metadata.version)) {
  fail(`GoReleaser produced a non-SemVer package version: ${metadata.version}`);
}
if (mode === "release") {
  if (metadata.version !== rootManifest.version) {
    fail(`release binary ${metadata.version} does not match npm source ${rootManifest.version}`);
  }
} else if (mode === "snapshot") {
  if (!/^0\.0\.0-dev\.[0-9a-f]+$/.test(metadata.version)) {
    fail(`snapshot version is not isolated from publishable versions: ${metadata.version}`);
  }
} else {
  fail(`mode must be snapshot or release, got ${mode}`);
}

rootManifest.version = metadata.version;
for (const packageName of Object.keys(rootManifest.optionalDependencies)) {
  rootManifest.optionalDependencies[packageName] = metadata.version;
}
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(path.join(repositoryRoot, "npm/bin"), path.join(outputDirectory, "bin"), { recursive: true });
await writeFile(path.join(outputDirectory, "package.json"), `${JSON.stringify(rootManifest, null, 2)}\n`);
await copyFile(path.join(repositoryRoot, "npm/README.md"), path.join(outputDirectory, "README.md"));
await copyFile(path.join(repositoryRoot, "LICENSE"), path.join(outputDirectory, "LICENSE"));
await chmod(path.join(outputDirectory, "bin/graph2agent-mcp.cjs"), 0o755);

const checksums = {};
const seen = new Set();
for (const artifact of binaries) {
  const target = targets.get(`${artifact.goos}:${artifact.goarch}`);
  if (!target) fail(`unexpected GoReleaser target ${artifact.goos}/${artifact.goarch}`);
  if (seen.has(target.packageName)) fail(`duplicate GoReleaser target ${artifact.goos}/${artifact.goarch}`);
  seen.add(target.packageName);

  const source = path.isAbsolute(artifact.path)
    ? artifact.path
    : path.resolve(repositoryRoot, artifact.path);
  const platformSource = path.join(repositoryRoot, "npm/platform", target.directory);
  const platformOutput = path.join(outputDirectory, "platform", target.directory);
  await mkdir(platformOutput, { recursive: true });
  await copyFile(path.join(platformSource, "package.json"), path.join(platformOutput, "package.json"));
  await copyFile(path.join(repositoryRoot, "npm/platform/README.md"), path.join(platformOutput, "README.md"));
  await copyFile(path.join(repositoryRoot, "LICENSE"), path.join(platformOutput, "LICENSE"));
  await copyFile(source, path.join(platformOutput, target.binary));
  await chmod(path.join(platformOutput, target.binary), 0o755);

  const manifest = JSON.parse(await readFile(path.join(platformOutput, "package.json"), "utf8"));
  if (manifest.name !== target.packageName) fail(`${target.packageName} source manifest has the wrong name`);
  manifest.version = rootManifest.version;
  await writeFile(path.join(platformOutput, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  checksums[target.packageName] = {
    file: target.binary,
    sha256: await sha256(path.join(platformOutput, target.binary)),
  };
}

for (const packageName of Object.keys(rootManifest.optionalDependencies)) {
  if (!seen.has(packageName)) fail(`optional dependency ${packageName} has no assembled binary`);
}

const stableChecksums = Object.fromEntries(
  Object.entries(checksums)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => [name, { file: value.file, sha256: value.sha256 }]),
);
await writeFile(path.join(outputDirectory, "checksums.json"), `${JSON.stringify(stableChecksums, null, 2)}\n`);

process.stdout.write(`${outputDirectory}\n`);
