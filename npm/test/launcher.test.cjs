"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EventEmitter } = require("node:events");

const launcher = require("../bin/graph2agent-mcp.cjs");

test("maps every supported platform and architecture", () => {
  const expected = {
    "darwin:arm64": "graph2agent-mcp-darwin-arm64",
    "darwin:x64": "graph2agent-mcp-darwin-x64",
    "linux:arm64": "graph2agent-mcp-linux-arm64",
    "linux:x64": "graph2agent-mcp-linux-x64",
    "win32:arm64": "graph2agent-mcp-win32-arm64",
    "win32:x64": "graph2agent-mcp-win32-x64",
  };
  for (const [pair, packageName] of Object.entries(expected)) {
    const [platform, arch] = pair.split(":");
    assert.equal(launcher.platformPackage(platform, arch).packageName, packageName);
  }
});

test("rejects unsupported targets", () => {
  assert.throws(() => launcher.platformPackage("aix", "ppc64"), /unsupported platform aix\/ppc64/);
});

test("resolves and verifies the installed native package", async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "graph2agent-mcp-launcher-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const platformRoot = path.join(temporary, "node_modules/graph2agent-mcp-linux-x64");
  fs.mkdirSync(platformRoot, { recursive: true });
  fs.writeFileSync(path.join(platformRoot, "package.json"), JSON.stringify({ name: "graph2agent-mcp-linux-x64", version: "0.2.0" }));
  fs.writeFileSync(path.join(platformRoot, "graph2agent-mcp"), "verified fixture");
  const digest = crypto.createHash("sha256").update("verified fixture").digest("hex");
  const resolvePackage = () => path.join(platformRoot, "package.json");

  const binary = await launcher.resolveBinary({
    platform: "linux",
    arch: "x64",
    rootManifest: { version: "0.2.0" },
    checksums: { "graph2agent-mcp-linux-x64": { file: "graph2agent-mcp", sha256: digest } },
    resolvePackage,
  });
  assert.equal(binary, path.join(platformRoot, "graph2agent-mcp"));

  await assert.rejects(
    launcher.resolveBinary({
      platform: "linux",
      arch: "x64",
      rootManifest: { version: "0.2.0" },
      checksums: { "graph2agent-mcp-linux-x64": { file: "graph2agent-mcp", sha256: "0".repeat(64) } },
      resolvePackage,
    }),
    /checksum verification failed/,
  );
});

test("reports missing optional platform package", async () => {
  await assert.rejects(
    launcher.resolveBinary({
      platform: "linux",
      arch: "x64",
      rootManifest: { version: "0.2.0" },
      checksums: {},
      resolvePackage: () => {
        const error = new Error("missing");
        error.code = "MODULE_NOT_FOUND";
        throw error;
      },
    }),
    /reinstall graph2agent-mcp with optional dependencies enabled/,
  );
});

test("spawns with inherited protocol streams and propagates arguments", async () => {
  let observed;
  const fakeSpawn = (binary, args, options) => {
    observed = { binary, args, options };
    const child = new EventEmitter();
    process.nextTick(() => child.emit("exit", 23, null));
    return child;
  };
  const result = await launcher.runBinary("/verified/server", ["--fixture"], fakeSpawn);
  assert.deepEqual(result, { code: 23, signal: null });
  assert.equal(observed.binary, "/verified/server");
  assert.deepEqual(observed.args, ["--fixture"]);
  assert.equal(observed.options.stdio, "inherit");
  assert.equal(observed.options.cwd, process.cwd());
  assert.equal(observed.options.env, process.env);
  assert.equal(observed.options.windowsHide, true);
});
