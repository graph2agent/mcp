# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0] - 2026-08-10

### Added

- Publish a no-install-script `graph2agent-mcp` npm launcher with exact,
  platform-restricted native binary packages for macOS, Linux, and Windows on
  arm64 and x64.
- Verify the selected native binary's package version and SHA-256 before every
  MCP server start.
- Add through-wrapper MCP initialization, tool discovery, and tool-call release
  smoke tests.

## [0.1.0] - 2026-08-10

### Added

- Initial stdio MCP server.
- Read-only, idempotent `describe_mermaid` tool.
- Strict `core-contract-v2` compilation for all five graph2agent diagram families.
- Structured compiler metadata and deterministic text content.
