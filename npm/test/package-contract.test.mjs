import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const npmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = JSON.parse(await readFile(path.join(npmRoot, "package.json"), "utf8"));

test("umbrella package is publish-safe and has exact optional versions", () => {
  assert.equal(root.name, "graph2agent-mcp");
  assert.equal(root.version, "0.2.0");
  assert.equal(root.license, "Apache-2.0");
  assert.equal(root.engines.node, ">=22");
  assert.equal(root.bin["graph2agent-mcp"], "bin/graph2agent-mcp.cjs");
  assert.equal(root.mcpName, "io.github.graph2agent/mcp");
  assert.equal(root.repository.url, "git+https://github.com/graph2agent/mcp.git");
  assert.equal(root.scripts, undefined);
  assert.equal(Object.keys(root.optionalDependencies).length, 6);
  for (const version of Object.values(root.optionalDependencies)) assert.equal(version, root.version);
});

test("platform manifests are restricted and contain no lifecycle scripts", async () => {
  const directories = (await readdir(path.join(npmRoot, "platform"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(directories, ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"]);
  for (const directory of directories) {
    const manifest = JSON.parse(await readFile(path.join(npmRoot, "platform", directory, "package.json"), "utf8"));
    assert.equal(manifest.version, root.version);
    assert.equal(root.optionalDependencies[manifest.name], root.version);
    assert.equal(manifest.license, "Apache-2.0");
    assert.equal(manifest.scripts, undefined);
    assert.equal(manifest.os.length, 1);
    assert.equal(manifest.cpu.length, 1);
    assert.deepEqual(manifest.publishConfig, { access: "public" });
  }
});
