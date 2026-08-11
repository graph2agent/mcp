import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const npmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(npmRoot, "..");
const root = JSON.parse(await readFile(path.join(npmRoot, "package.json"), "utf8"));
const releaseIdentity = JSON.parse(await readFile(path.join(repositoryRoot, "release.json"), "utf8"));

test("umbrella package is publish-safe and has exact optional versions", () => {
  assert.equal(root.name, "graph2agent-mcp");
  assert.equal(root.version, "0.4.0");
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

test("documentation distinguishes live npm platforms from the Windows release fallback", async () => {
  const readmes = await Promise.all([
    readFile(path.resolve(npmRoot, "..", "README.md"), "utf8"),
    readFile(path.join(npmRoot, "README.md"), "utf8"),
  ]);
  for (const readme of readmes) {
    assert.match(readme, /Live on npm for macOS and Linux/);
    assert.match(readme, /v0\.4\.0 GitHub Release/);
    assert.match(readme, /npm activation on Windows is pending npm review/);
    assert.doesNotMatch(readme, /not public yet|command above becomes live/);
  }
});

test("Go, workflow, npm, and linker release versions stay aligned", async () => {
  const [goMod, goreleaser, changelog, ci, releaseVerify, release, makefile, packScript] = await Promise.all([
    readFile(path.join(repositoryRoot, "go.mod"), "utf8"),
    readFile(path.join(repositoryRoot, ".goreleaser.yml"), "utf8"),
    readFile(path.join(repositoryRoot, "CHANGELOG.md"), "utf8"),
    readFile(path.join(repositoryRoot, ".github/workflows/ci.yml"), "utf8"),
    readFile(path.join(repositoryRoot, ".github/workflows/release-verify.yml"), "utf8"),
    readFile(path.join(repositoryRoot, ".github/workflows/release.yml"), "utf8"),
    readFile(path.join(repositoryRoot, "Makefile"), "utf8"),
    readFile(path.join(repositoryRoot, "npm/scripts/pack.mjs"), "utf8"),
  ]);

  assert.equal(releaseIdentity.version, `v${root.version}`);
  assert.match(releaseIdentity.core_commit, /^[0-9a-f]{40}$/);
  assert.match(releaseIdentity.action_commit, /^[0-9a-f]{40}$/);
  assert.match(releaseIdentity.core_source_sha256, /^[0-9a-f]{64}$/);
  assert.match(goMod, new RegExp(`github\\.com/graph2agent/graph2agent v${root.version.replaceAll(".", "\\.")}`));
  assert.match(goreleaser, /-X github\.com\/graph2agent\/mcp\/internal\/server\.Version=\{\{ \.Version \}\}/);
  assert.match(changelog, new RegExp(`^## \\[${root.version.replaceAll(".", "\\.")}\\]`, "m"));
  for (const workflow of [ci, releaseVerify]) {
    assert.match(workflow, new RegExp(`GRAPH2AGENT_CORE_VERSION: ${root.version.replaceAll(".", "\\.")}`));
    assert.match(workflow, new RegExp(`GRAPH2AGENT_CORE_TAG: v${root.version.replaceAll(".", "\\.")}`));
    assert.match(workflow, /GRAPH2AGENT_CORE_COMMIT: [0-9a-f]{40}/);
    assert.match(workflow, new RegExp(`GRAPH2AGENT_CORE_COMMIT: ${releaseIdentity.core_commit}`));
    assert.match(workflow, /ref: \$\{\{ env\.GRAPH2AGENT_CORE_COMMIT \}\}/);
    assert.doesNotMatch(workflow, /ref: \$\{\{ env\.GRAPH2AGENT_CORE_TAG \}\}/);
  }
  assert.match(release, /types: \[graph2agent-release\]/);
  assert.match(release, /repository: graph2agent\/graph2agent/);
  assert.match(release, /repository: graph2agent\/github-action/);
  assert.match(release, /jq -r \.version release\.json/);
  assert.match(release, /jq -r \.core_commit release\.json/);
  assert.match(release, /jq -r \.action_commit release\.json/);
  assert.match(release, /jq -r \.core_source_sha256 release\.json/);
  assert.match(release, /npm publish "\$tarball" --access public --provenance/);
  assert.match(release, /graph2agent-mcp-darwin-arm64/);
  assert.match(release, /graph2agent-mcp-linux-x64/);
  assert.doesNotMatch(release, /publish_or_verify graph2agent-mcp-win32/);
  assert.match(release, /npm\/test\/release-e2e\.mjs/);
  assert.match(release, /release --snapshot --clean --skip=publish/);
  assert.match(release, /release --clean --skip=publish/);
  assert.match(release, /npm install --global --ignore-scripts --no-audit --no-fund npm@11\.5\.1/);
  assert.match(release, /E404\|404 Not Found/);
  assert.match(release, /npm-checksums\.txt/);
  assert.doesNotMatch(release, /registry-url:/);
  assert.doesNotMatch(release, /--clobber/);
  assert.doesNotMatch(release, /path: \.release\//);
  assert.doesNotMatch(release, /npm init --yes --prefix/);
  assert.doesNotMatch(release, /replace_existing_artifacts:\s*true/);
  assert.match(release, /actions\/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1/);
  assert.match(release, /\/repos\/graph2agent\/homebrew-tap\/dispatches/);
  for (const use of release.matchAll(/^\s*uses:\s*([^\s#]+)\s*(?:#.*)?$/gm)) {
    assert.match(use[1].split("@").at(-1), /^[0-9a-f]{40}$/);
  }
  const exactGate = release.indexOf("Pack, verify, and exercise exact release bundles");
  const firstMutation = release.indexOf("Create or verify immutable MCP tag and release");
  const assets = release.indexOf("Create or verify immutable GitHub Release assets");
  const attest = release.indexOf("Attest native and npm release artifacts");
  const npmMutation = release.indexOf("Publish or verify npm packages with provenance");
  const publicRelease = release.indexOf("Publish or verify the complete MCP GitHub Release");
  const handoff = release.indexOf("Continue the release train with Homebrew");
  assert.ok(exactGate >= 0 && firstMutation > exactGate, "external mutation must follow the exact packed E2E gate");
  assert.ok(assets > firstMutation && attest > assets, "asset verification and attestation must follow the draft release");
  assert.ok(npmMutation > attest, "npm publication must follow immutable assets and attestations");
  assert.ok(publicRelease > npmMutation, "the GitHub Release must remain draft until npm publication succeeds");
  assert.ok(handoff > publicRelease, "Homebrew handoff must follow public release completion");
  assert.match(makefile, /npm\/scripts\/pack\.mjs dist\/npm dist\/npm-packages/);
  assert.doesNotMatch(makefile, /cp dist\/npm-packages\/checksums\.txt/);
  assert.match(packScript, /npm-checksums\.txt/);
});
