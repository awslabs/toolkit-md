# Toolkit for Markdown

[![npm version](https://badge.fury.io/js/%40awslabs%2Ftoolkit-md.svg)](https://badge.fury.io/js/%40awslabs%2Ftoolkit-md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

CLI tools for maintaining Markdown content like documentation and tutorials.

![Screenshot](./docs/screenshot.png)

## Features

- **🤖 AI-Powered Content Review** - Automatically review and improve your Markdown content using Amazon Bedrock
- **🌍 Multi-Language Translation** - Translate content between 8+ supported languages
- **❓ Intelligent Q&A** - Ask questions about your content and get AI-powered answers
- **📝 Style Guide Enforcement** - Maintain consistency with custom style guides
- **⚡ Rate Limiting** - Built-in rate limiting for API calls
- **🎯 Context-Aware Processing** - Smart content processing with configurable context strategies

## Installation

```bash
npm install -g @awslabs/toolkit-md
# or
yarn global add @awslabs/toolkit-md
```

## Quick Start

### Review Content

Analyze and improve all Markdown files in a directory using AI:

```bash
toolkit-md review ./docs
```

Write the changes directly back to the source files:

```bash
toolkit-md review --write ./docs
```

### Translate Content

Translate all Markdown content in a directory to French:

```bash
toolkit-md translate ./docs --to fr
```

### Ask Questions

Ask questions about content across an entire documentation directory:

```bash
toolkit-md ask ./docs --question "What are the main topics covered?"
```

## Configuration

Toolkit for Markdown supports configuration through:

1. Command line arguments
2. Environment variables
3. `.toolkit-mdrc` file

**Configuration Options:**

| Config Path            | CLI Flag             | Environment Variable         | Description                                                                                  | Default                                       |
| ---------------------- | -------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `baseDir`              | `--base-dir`         | `TKMD_BASE_DIR`              | Base directory for relative paths                                                            | `"."`                                         |
| `language`             | `--language`         | `TKMD_LANGUAGE`              | Source language code                                                                         | `"en"`                                        |
| `defaultLanguage`      | `--default-language` | `TKMD_DEFAULT_LANGUAGE`      | Language for files without explicit markers                                                  | `"en"`                                        |
| `ai.model`             | `--model`            | `TKMD_AI_MODEL`              | Amazon Bedrock model ID                                                                      | `"anthropic.claude-3-5-sonnet-20241022-v2:0"` |
| `ai.maxTokens`         | `--max-tokens`       | `TKMD_AI_MAX_TOKENS`         | Maximum output tokens                                                                        | `4096`                                        |
| `ai.write`             | `--write`            | `TKMD_AI_WRITE`              | Write changes directly to files                                                              | `false`                                       |
| `ai.rate.requests`     | `--request-rate`     | `TKMD_AI_REQUEST_RATE_LIMIT` | Max requests per minute (0 = unlimited)                                                      | `0`                                           |
| `ai.rate.tokens`       | `--token-rate`       | `TKMD_AI_TOKEN_RATE_LIMIT`   | Max tokens per minute (0 = unlimited)                                                        | `0`                                           |
| `ai.contextStrategy`   | `--context-strategy` | `TKMD_AI_CONTEXT_STRATEGY`   | Context inclusion: "siblings", "nothing", "everything"                                       | `"nothing"`                                   |
| `ai.exemplars`         | `--exemplar`         | `TKMD_AI_EXEMPLAR_*`         | Path to directory of content to use as an example to follow, can be specified multiple times | `[]`                                          |
| `ai.styleGuides`       | `--style-guide`      | `TKMD_AI_STYLE_GUIDE_*`      | Path to style guide file, can be specified multiple times                                    | `[]`                                          |
| `ai.translation.force` | `--force`            | `TKMD_AI_FORCE_TRANSLATION`  | Force translation even if source unchanged                                                   | `false`                                       |
| `ai.translation.check` | `--check`            | `TKMD_AI_CHECK_TRANSLATION`  | Only check if translation needed                                                             | `false`                                       |

**Note:** For array values (exemplars, styleGuides), the environment variable referenced above is treated as a prefix: `TKMD_AI_EXEMPLAR_FIRST`, `TKMD_AI_EXEMPLAR_SECOND`, etc.

### Configuration File Format

Create a `.toolkit-mdrc` file in JSON format:

```json
{
  "baseDir": ".",
  "language": "en",
  "defaultLanguage": "en",
  "ai": {
    "model": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "maxTokens": 4096,
    "write": false,
    "rate": {
      "requests": 10,
      "tokens": 10000
    },
    "contextStrategy": "siblings",
    "exemplars": ["./examples/good-example1", "./examples/good-example2"],
    "styleGuides": ["./guides/style-guide.md", "./guides/aws-terminology.md"],
    "translation": {
      "force": false,
      "check": false
    }
  }
}
```

### Style Guides

Style guides are intended to help provide context on how content should ideally be written. This is usually expressed as natural language in Markdown format. The `--style-guide` parameter is used to provide a path to the style guide:

```text
--style-guide ./style-guide.md
```

Multiple `--style-guide` parameters can be provided to use different style guide files.

```text
--style-guide ./style-guide.md --style-guide ./other-style-guide.md
```

The paths can be either:

1. **Individual file:** A single Markdown file
2. **Directory:** A directory which will be recursively loaded using the same logic as the main content loader

#### Using with Translations

Style guides can be used to model language-specific content guidance that works effectively with the translation command. When using the `translate` command and a style guide directory is provided the style guides for both the source and target language will be loaded in to context.

For example you could create a directory called `i18n`:

```
docs/
[...]
i18n/
├── style-guide.fr.md
└── style-guide.es.md
style-guide.md
```

When running this command:

```bash
toolkit-md translate ./docs --to fr --style-guide style-guide.md --style-guide i18n
```

The style guides that are loaded would be:

- `style-guide.md`: It is explicitly provided
- `style-guide.fr.md`: It is discovered from the `i18n` directory based on the target language

### Context Strategy

The `contextStrategy` setting controls how much surrounding content is included when processing files. This affects the AI's understanding of the document structure and relationships.

**Strategy Options:**

#### `"nothing"` (default)

Processes each file in isolation with no additional context:

```
docs/
├── guide/
│   ├── getting-started.md
│   ├── installation.md      ← **processing this file only**
│   └── configuration.md
└── api/
    ├── authentication.md
    └── endpoints.md
```

#### `"siblings"`

Includes the current file and its sibling files in the same directory:

```
docs/
├── guide/
│   ├── getting-started.md   ← included as context
│   ├── installation.md      ← **processing this file**
│   └── configuration.md     ← included as context
└── api/
    ├── authentication.md
    └── endpoints.md
```

#### `"everything"`

Includes all files in the entire directory tree as context:

```
docs/
├── guide/
│   ├── getting-started.md   ← included as context
│   ├── installation.md      ← **processing this file**
│   └── configuration.md     ← included as context
└── api/
    ├── authentication.md    ← included as context
    └── endpoints.md         ← included as context
```

**Recommendation:** Use `"siblings"` for most cases as it provides good context while keeping token usage reasonable. Use `"everything"` for small documentation sets where full context is valuable, and `"nothing"` for independent files or when minimizing token usage.

### AWS Bedrock Setup

Toolkit for Markdown uses AWS Bedrock for AI processing. Ensure the following is available:

- AWS credentials configured
- Access to Bedrock models in the appropriate AWS account

## Commands

### `review`

Analyzes Markdown content using AI to identify areas for improvement including grammar, clarity, structure, and adherence to style guides. The AI reviews each file individually or with contextual awareness of related files, providing suggestions or directly applying changes. Supports processing entire directory trees of Markdown files while respecting language markers and file organization.

**Example:**

```bash
toolkit-md review ./docs --write --style-guide ./guides/style.md --context-strategy siblings
```

**Options:**

- `--write`
- `--language`
- `--default-language`
- `--model`
- `--max-tokens`
- `--base-dir`
- `--request-rate`
- `--token-rate`
- `--context-strategy`
- `--exemplar`
- `--style-guide`

### `translate`

Translates Markdown content from one language to another while preserving formatting, frontmatter, and document structure. Includes intelligent change detection to avoid retranslating unchanged content and supports both checking for translation needs and forcing retranslation. Maintains translation metadata to track source content changes over time.

**Example:**

```bash
toolkit-md translate ./docs --to fr --write --exemplar ./examples/french-docs
```

**Options:**

- `--to` (required)
- `--write`
- `--language`
- `--default-language`
- `--model`
- `--max-tokens`
- `--base-dir`
- `--request-rate`
- `--token-rate`
- `--context-strategy`
- `--exemplar`
- `--style-guide`
- `--force`
- `--check`

### `ask`

Enables interactive querying of Markdown content using natural language questions. The AI analyzes the entire content tree to provide comprehensive answers about topics, structure, or specific information contained within the documentation. Useful for content discovery, summarization, and understanding complex documentation sets.

**Example:**

```bash
toolkit-md ask ./docs --question "What are the installation requirements and setup steps?"
```

**Options:**

- `--question` (required)
- `--language`
- `--default-language`
- `--model`
- `--max-tokens`
- `--base-dir`
- `--request-rate`
- `--token-rate`
- `--exemplar`
- `--style-guide`

## Development

```bash
# Install dependencies
yarn install

# Build the project
yarn build

# Run tests
yarn test

# Execute the tool
yarn start review ./docs
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
