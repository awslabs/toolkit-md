# AI Coding Assistant Guide

> **Note to AI Assistants**: Keep this document updated when making structural changes to the repository, adding new directories, changing test locations, or modifying validation scripts.

## Repository Overview

This is **Toolkit for Markdown** (`@aws/toolkit-md`), a CLI tool for maintaining Markdown content with AI-powered features including content review, translation, and Q&A capabilities using Amazon Bedrock.

## Project Structure

```
src/                    # Source code
├── cli.ts             # CLI entry point
├── commands/          # CLI command implementations (thin shells over core/)
│   ├── optionBridge.ts # Zod config schema to Commander option bridge
│   ├── format.ts      # Terminal output formatting (diffs, token usage)
│   └── utils.ts       # CLI plumbing (error handling, spinner, option accessors)
├── core/              # Transport-agnostic application layer
│   ├── workspace.ts   # Project bootstrap (config, languages, trees, style guides)
│   ├── review.ts      # Review pipeline service
│   ├── translate.ts   # Translation pipeline service
│   ├── ask.ts         # Question answering service
│   ├── fileWriteTool.ts # Shared write_file agent tool
│   ├── fileEditSession.ts # Delta-edit tool session (edit_file, finish_review)
│   └── logger.ts      # LogWriter interface and implementations
├── mcp/               # Model Context Protocol server tools (built on core/)
├── ai/                # AI model integration and prompts
│   ├── model/         # Bedrock client, tool use loop, rate limiting
│   └── prompts/       # Prompt templates for various operations
├── check/             # Content validation (lint, links, images, formatting)
├── content/           # Content processing
│   ├── tree/          # Content tree, link resolution, tree rendering
│   ├── providers/     # Content providers (FileSystem, Mock)
│   └── utils/         # Content utilities (markdown, language)
├── config/            # Configuration management
└── languages/         # Language support

tests/                 # Test files (mirrors src/ structure)
├── ai/
│   ├── model/
│   └── prompts/
├── check/
├── content/
│   ├── tree/
│   ├── providers/
│   └── utils/
├── config/
├── core/
└── evals/             # Hermetic tests for the eval harness and graders

evals/                 # Eval mechanism (see docs/eval-design.md)
├── corpus/            # Fixed input fixtures, one directory per case
│   ├── review/        #   case.json manifest + content/ markdown tree
│   └── translate/
├── graders/           # Tier 1 structural, Tier 2 behavioral, Tier 3 judge
├── runs/              # Result artifacts (gitignored except baselines/)
├── types.ts           # Case manifest schema and result types
├── caseLoader.ts      # Corpus discovery and loading
├── harness.ts         # Runner: corpus x config matrix -> results
├── report.ts          # Aggregation, baseline comparison, rendering
└── run.ts             # CLI entry point (yarn eval)
```

## Test File Location

Tests mirror the source structure in a parallel `tests/` directory:

- Source: `src/ai/model/client.ts` → Test: `tests/ai/model/client.test.ts`
- Source: `src/content/tree/ContentTree.ts` → Test: `tests/content/tree/ContentTree.test.ts`
- Source: `src/config/manager.ts` → Test: `tests/config/manager.test.ts`

All test files use the `.test.ts` extension.

## Configuration System

The project uses a hierarchical configuration system that loads settings from:

1. `.toolkit-mdrc` configuration file (optional)
2. Environment variables
3. CLI arguments (highest priority)

**Schema Definition**: `src/config/schema.ts` defines the complete configuration schema using Zod, including validation rules and metadata for CLI/environment variable mapping.

**Typed Access**: `ConfigManager.resolve()` returns the fully resolved configuration as the inferred `Config` type. `Workspace.settings` exposes this to commands and services; prefer `workspace.settings.ai.model` over stringly-typed `config.get<T>("path")` calls, which remain only for the CLI option bridge and internal resolution.

**IMPORTANT**: When modifying the configuration schema in `src/config/schema.ts`, you MUST update the user-facing documentation in `README.md` to reflect the changes. This includes adding/removing/modifying configuration options and their descriptions.

## Code Style Requirements

**Comments**: ONLY add TSDoc comments to source files. NEVER add inline comments, block comments, or any other comment types. Code should be self-documenting through clear naming and structure.

**Documentation**: Markdown documentation should NEVER include emojis. Use clear, professional language without decorative elements.

## Testing Requirements

**Always update unit tests when modifying code.** When making changes:

- Update existing tests to reflect modified behavior
- Add new tests for new functionality
- Ensure tests cover edge cases and error conditions
- Maintain test coverage for all changes

## Validation Scripts

Run these commands **in order** to validate changes:

```bash
# 1. Build the project (compiles TypeScript)
yarn build

# 2. Biome check
yarn check:fix

# 3. Run all tests
yarn test
```

When running these commands ALWAYS assume you're already in the correct directory and just run the plain command. Only try to change directories if that doesn't work.

## Evals

The `evals/` directory contains a corpus-based eval mechanism for measuring model output quality. See [docs/evals.md](docs/evals.md) for how evals work, how to write new eval cases, and how to run them; the design rationale is in [docs/eval-design.md](docs/eval-design.md).

Key points:

- Run with `yarn eval` - it calls real Bedrock models and costs money, so it is deliberately not part of `yarn test`.
- The hermetic tests for the harness and graders live in `tests/evals/` and run as part of the normal test suite.
- When changing prompts, tool schemas, or edit modes, run `yarn eval --compare <baseline>` before landing and re-baseline with `yarn eval --baseline <name>` after.
- When a bug in model output behavior is diagnosed, add a corpus case under `evals/corpus/` that reproduces it - the corpus is the regression suite for model behavior.

## Key Technologies

- TypeScript (ES modules)
- Vitest for testing
- AWS SDK (Bedrock Runtime)
- Commander.js for CLI
- Biome for linting
- Yarn 4.12.0 package manager

## Development Notes

- Entry point: `src/cli.ts` (development), `dist/cli.js` (production)
- Use `yarn start` to run CLI during development
- Use `yarn debug` for debugging with inspector
- Configuration file: `.toolkit-mdrc` (optional)
