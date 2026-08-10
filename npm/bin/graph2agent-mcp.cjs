#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PLATFORM_PACKAGES = Object.freeze({
  "darwin:arm64": Object.freeze({ packageName: "graph2agent-mcp-darwin-arm64", binary: "graph2agent-mcp" }),
  "darwin:x64": Object.freeze({ packageName: "graph2agent-mcp-darwin-x64", binary: "graph2agent-mcp" }),
  "linux:arm64": Object.freeze({ packageName: "graph2agent-mcp-linux-arm64", binary: "graph2agent-mcp" }),
  "linux:x64": Object.freeze({ packageName: "graph2agent-mcp-linux-x64", binary: "graph2agent-mcp" }),
  "win32:arm64": Object.freeze({ packageName: "graph2agent-mcp-win32-arm64", binary: "graph2agent-mcp.exe" }),
  "win32:x64": Object.freeze({ packageName: "graph2agent-mcp-win32-x64", binary: "graph2agent-mcp.exe" }),
});

function platformPackage(platform = process.platform, arch = process.arch) {
  const selected = PLATFORM_PACKAGES[`${platform}:${arch}`];
  if (!selected) {
    throw new Error(`unsupported platform ${platform}/${arch}; supported platforms are macOS, Linux, and Windows on arm64 or x64`);
  }
  return selected;
}

function sha256File(filename) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = fs.createReadStream(filename);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function resolveBinary(options = {}) {
  const selected = platformPackage(options.platform, options.arch);
  const rootDirectory = options.rootDirectory || path.resolve(__dirname, "..");
  const rootManifest = options.rootManifest || JSON.parse(fs.readFileSync(path.join(rootDirectory, "package.json"), "utf8"));
  const checksums = options.checksums || JSON.parse(fs.readFileSync(path.join(rootDirectory, "checksums.json"), "utf8"));
  const resolvePackage = options.resolvePackage || ((specifier) => require.resolve(specifier));

  let manifestPath;
  try {
    manifestPath = resolvePackage(`${selected.packageName}/package.json`);
  } catch (error) {
    const reason = error && error.code === "MODULE_NOT_FOUND" ? "is not installed" : "could not be resolved";
    throw new Error(`${selected.packageName} ${reason}; reinstall graph2agent-mcp with optional dependencies enabled`);
  }

  const platformManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (platformManifest.name !== selected.packageName || platformManifest.version !== rootManifest.version) {
    throw new Error(`${selected.packageName} version does not match graph2agent-mcp ${rootManifest.version}`);
  }

  const expected = checksums[selected.packageName];
  if (!expected || !/^[0-9a-f]{64}$/.test(expected.sha256) || expected.file !== selected.binary) {
    throw new Error(`graph2agent-mcp has no valid checksum contract for ${selected.packageName}`);
  }

  const binary = path.join(path.dirname(manifestPath), selected.binary);
  let details;
  try {
    details = fs.statSync(binary);
  } catch {
    throw new Error(`${selected.packageName} does not contain ${selected.binary}`);
  }
  if (!details.isFile()) {
    throw new Error(`${selected.packageName}/${selected.binary} is not a regular file`);
  }

  const actual = await sha256File(binary);
  if (!crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected.sha256, "hex"))) {
    throw new Error(`checksum verification failed for ${selected.packageName}/${selected.binary}`);
  }
  return binary;
}

function runBinary(binary, args = process.argv.slice(2), spawnProcess = spawn, signalSource = process) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(binary, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    const signals = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGHUP", "SIGINT", "SIGTERM"];
    const handlers = new Map(signals.map((signal) => [signal, () => {
      if (!child.killed) child.kill(signal);
    }]));
    for (const [signal, handler] of handlers) signalSource.on(signal, handler);
    const cleanup = () => {
      for (const [signal, handler] of handlers) signalSource.removeListener(signal, handler);
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      resolve({ code, signal });
    });
  });
}

async function main() {
  const binary = await resolveBinary();
  const result = await runBinary(binary);
  if (result.signal && process.platform !== "win32") {
    process.kill(process.pid, result.signal);
    return;
  }
  process.exitCode = result.code === null ? 1 : result.code;
}

if (require.main === module) {
  main().catch((error) => {
    const message = error && error.message ? error.message : String(error);
    process.stderr.write(`graph2agent-mcp: ${message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { PLATFORM_PACKAGES, platformPackage, resolveBinary, runBinary, sha256File };
