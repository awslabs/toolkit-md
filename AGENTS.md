# AI Coding Assistant Guide

> **Note to AI Assistants**: Keep this document updated when making structural changes to the repository, adding new directories, changing test locations, or modifying validation scripts.

## Repository Overview

This is **Toolkit for Markdown** (`@aws/toolkit-md`), a CLI tool for maintaining Markdown content with AI-powered features including content review, translation, and Q&A capabilities using Amazon Bedrock.

## Project Structure

```
src/                    # Source code
├── cli.ts             # CLI entry point
├── commands/          # CLI command implementations
├── ai/                # AI model integration and prompts
│   ├── model/         # Bedrock client and rate limiting
│   ├── prompts/       # Prompt templates for various operations
│   └── mcp/           # Model Context Protocol server
├── content/           # Content processing
│   ├── tree/          # Content tree data structures
│   ├── providers/     # Content providers (FileSystem, Mock)
│   └── utils/         # Content utilities (markdown, language)
├── config/            # Configuration management
└── languages/         # Language support

tests/                 # Test files (mirrors src/ structure)
├── ai/
│   ├── model/
│   └── prompts/
├── content/
│   ├── tree/
│   ├── providers/
│   └── utils/
└── config/
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
