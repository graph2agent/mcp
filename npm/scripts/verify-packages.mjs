#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = path.resolve(process.argv[2] || path.join(repositoryRoot, "dist/npm"));

const expected = {
  "darwin-arm64": { name: "graph2agent-mcp-darwin-arm64", os: "darwin", cpu: "arm64", binary: "graph2agent-mcp" },
  "darwin-x64": { name: "graph2agent-mcp-darwin-x64", os: "darwin", cpu: "x64", binary: "graph2agent-mcp" },
  "linux-arm64": { name: "graph2agent-mcp-linux-arm64", os: "linux", cpu: "arm64", binary: "graph2agent-mcp" },
  "linux-x64": { name: "graph2agent-mcp-linux-x64", os: "linux", cpu: "x64", binary: "graph2agent-mcp" },
  "win32-arm64": { name: "graph2agent-mcp-win32-arm64", os: "win32", cpu: "arm64", binary: "graph2agent-mcp.exe" },
  "win32-x64": { name: "graph2agent-mcp-win32-x64", os: "win32", cpu: "x64", binary: "graph2agent-mcp.exe" },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function listFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(path.join(directory, entry.name), relative));
    else {
      if (!entry.isFile()) throw new Error(`package staging contains a non-regular entry: ${relative}`);
      result.push(relative.split(path.sep).join("/"));
    }
  }
  return result.sort();
}

const root = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const checksums = JSON.parse(await readFile(path.join(packageRoot, "checksums.json"), "utf8"));
assert(root.name === "graph2agent-mcp", "wrong umbrella package name");
assert(root.engines?.node === ">=22", "umbrella package must require supported Node 22+");
assert(root.mcpName === "io.github.graph2agent/mcp", "wrong MCP Registry name");
assert(!root.scripts, "umbrella package must not contain lifecycle scripts");
assert(root.bin?.["graph2agent-mcp"] === "bin/graph2agent-mcp.cjs", "wrong umbrella bin contract");

const rootFiles = (await listFiles(packageRoot)).filter((name) => !name.startsWith("platform/"));
assert(
  JSON.stringify(rootFiles) === JSON.stringify(["LICENSE", "README.md", "bin/graph2agent-mcp.cjs", "checksums.json", "package.json"]),
  `unexpected umbrella files: ${rootFiles.join(", ")}`,
);

for (const [directory, contract] of Object.entries(expected)) {
  const location = path.join(packageRoot, "platform", directory);
  const manifest = JSON.parse(await readFile(path.join(location, "package.json"), "utf8"));
  assert(manifest.name === contract.name, `${directory}: wrong package name`);
  assert(manifest.version === root.version, `${directory}: version mismatch`);
  assert(root.optionalDependencies[contract.name] === root.version, `${directory}: optional dependency is not exact`);
  assert(JSON.stringify(manifest.os) === JSON.stringify([contract.os]), `${directory}: wrong os restriction`);
  assert(JSON.stringify(manifest.cpu) === JSON.stringify([contract.cpu]), `${directory}: wrong cpu restriction`);
  assert(!manifest.scripts, `${directory}: platform package must not contain lifecycle scripts`);
  const files = await listFiles(location);
  assert(
    JSON.stringify(files) === JSON.stringify(["LICENSE", "README.md", contract.binary, "package.json"].sort()),
    `${directory}: unexpected files: ${files.join(", ")}`,
  );
  const binaryDetails = await lstat(path.join(location, contract.binary));
  assert(binaryDetails.isFile() && !binaryDetails.isSymbolicLink(), `${directory}: binary missing or not regular`);
  const actual = createHash("sha256").update(await readFile(path.join(location, contract.binary))).digest("hex");
  assert(checksums[contract.name]?.file === contract.binary, `${directory}: wrong checksum filename`);
  assert(checksums[contract.name]?.sha256 === actual, `${directory}: checksum mismatch`);
}

assert(Object.keys(checksums).length === Object.keys(expected).length, "unexpected checksum entries");
process.stdout.write("npm package verification: ok\n");
