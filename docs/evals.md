# Eval Guide

This guide explains how the eval mechanism works, how to write new eval
cases, and how to run evals. For the rationale and design decisions behind
the mechanism, see [eval-design.md](eval-design.md).

## Purpose

The unit test suite verifies that the review and translate pipelines are
plumbed correctly, but every model interaction in those tests is a fake.
Evals close the remaining gap: they run a fixed corpus of realistic inputs
through the real pipelines against real Bedrock models, score the outputs
with deterministic checks and optional model-graded rubrics, and compare
the results against a stored baseline. This makes it possible to assess
prompt changes, tool schema changes, edit-mode changes, and model upgrades
for quality regressions before they land.

Evals are deliberately separate from `yarn test`: they call real Bedrock,
cost real money, and produce scores rather than pass/fail assertions.

## How evals work

### Layout

```
evals/
├── corpus/            # Fixed input fixtures (checked in)
│   ├── review/        # One case = one directory containing a
│   │   └── ...        #   case.json manifest and a content/ tree
│   └── translate/
└── runs/              # Result artifacts (gitignored)
    └── baselines/     # Named baselines (checked in)
```

The harness, graders, and reporting code also live under `evals/`.

### Execution model

A run is the product of three axes: the corpus cases, the edit modes
(`write` and `edits`, unless a case pins one), and a repetition count.
For every point in that matrix the harness:

1. Loads the case content into an in-memory content tree, so runs never
   touch the corpus on disk.
2. Invokes the real review or translate pipeline exactly the way the CLI
   does, against a live Bedrock client.
3. Captures everything observable: per-file input/output pairs, token
   usage (including cache reads and writes), the per-turn tool dispatch
   trace, and wall-clock duration.
4. Runs the graders over the captured execution and records a result.

Every case executes inside a try/catch. A pipeline error (turn
exhaustion, truncation, API failure) is recorded as a failed result with
its error class and message rather than aborting the run. A case going
from "works" to "throws" is the most important signal a comparison can
produce, so failures are first-class data.

Each run is stamped with provenance metadata: the model ID, judge model
ID, toolkit version, and MD5 hashes of the prompt template source files.
Comparisons check this metadata and report which axis moved, so a drifted
comparison (different model, edited prompt) is detected rather than
silently misleading.

### Grading tiers

Graders produce named metrics on a 0-1 scale plus raw counts. They run in
three tiers, cheapest first.

**Tier 1 - structural (deterministic, free).** Runs on every case:

| Metric | Meaning |
| ------ | ------- |
| `integrity` | No leaked trailing argument tags (the `</content>` class of corruption), frontmatter parses, output non-empty |
| `whitespace` | Review only: trailing newline preserved, no whitespace-only changes |
| `translationHash` | Translate only: output carries `tmdTranslationSourceHash` matching the source hash, legacy key absent |
| `seededRecall` | Fraction of `mustFix` seeded errors that were fixed |
| `preservation` | Fraction of `mustPreserve` patterns that survived untouched |
| `shouldChange` / `shouldNotChange` | Files changed (or left alone) as the manifest expects |
| `checkRegression` | Lint and spell issue count on output did not exceed the input |

**Tier 2 - behavioral (deterministic, from events and traces).**

| Metric | Meaning |
| ------ | ------- |
| `toolReliability` | 1 minus the tool error rate (edit misses, validation rejections) parsed from the debug trace |
| `noopDiscipline` | Clean-file review cases: fraction of files that were correctly left unchanged |
| `completion` | 1 when the pipeline completed, 0 when it threw |
| counts | `turns`, `toolCalls`, `toolErrors`, `inputTokens`, `outputTokens`, cache tokens, `durationMs` |

The token counts are what answer questions like "does edit mode actually
save output tokens" - compare the `write` and `edits` rows for the same
case in the report.

**Tier 3 - model-graded rubrics (LLM judge, costs tokens).** Disabled by
default; enable with `--rubric all`. A pinned judge model, independent of
the model under test, scores each changed file 1-5 per dimension through
structured output. Scores are normalized to 0-1 and averaged per case.

- Review rubric: `judgeImprovement`, `judgeMeaningPreservation`,
  `judgeStyleConsistency`.
- Translate rubric: `judgeFluency`, `judgeAccuracy`, `judgeCodeHandling`,
  `judgeTerminologyConsistency`. For re-translation cases the judge also
  sees the previous translation so terminology drift is scored.

The judge sees the original and the output, never another run's scores,
so there is no anchoring between runs; comparison happens in the report
layer.

### Repetitions and regression detection

Single-sample LLM metrics are noise. The default is 3 repetitions per
case x mode point. The report aggregates each metric into mean, min, and
max. A comparison flags a score as a regression only when the candidate's
range falls entirely below the baseline's range (and as an improvement
only when it rises entirely above). This is crude but resistant to judge
noise without requiring large repetition counts. Failure transitions
(works to throws, and the reverse) are always flagged regardless of
ranges.

## Writing eval cases

Every case is a directory under `evals/corpus/review/` or
`evals/corpus/translate/` containing a `case.json` manifest and a
`content/` directory of markdown fixtures.

The corpus is the regression suite for model behavior: when a
field-reported bug in review or translation output is diagnosed, add a
corpus case that reproduces it before (or alongside) the fix.

### Case manifest

```jsonc
// evals/corpus/review/typos-basic/case.json
{
  "operation": "review",                 // "review" or "translate"
  "description": "Common typos and grammar errors across three pages",
  "settings": {
    "contextStrategy": "nothing",        // optional: siblings | nothing | everything
    "editMode": "write",                 // optional: pin one mode instead of running the matrix
    "instructions": "...",               // optional: extra reviewer instructions
    "force": false,                      // optional, translate only: force retranslation
    "styleGuides": ["style-guide.md"]    // optional: style guide files, relative to the case directory
  },
  "expectations": {
    "shouldChange": ["guide.md"],        // files the operation must modify
    "shouldNotChange": ["reference.md"], // files the operation must leave alone
    "mustFix": [                         // seeded errors the operation must fix
      { "file": "guide.md", "pattern": "\\brecieve\\b", "replacedBy": "receive" }
    ],
    "mustPreserve": [                    // content that must survive untouched
      { "file": "guide.md", "pattern": "```bash[\\s\\S]*?```" }
    ]
  },
  "rubric": "review-quality",            // review-quality | translate-quality | none
  "targetLanguage": "fr",                // required for translate cases
  "sourceLanguage": "en"                 // optional, defaults to en
}
```

The manifest is validated when the corpus loads; an invalid manifest
fails the run with a descriptive error.

Expectation semantics:

- `mustFix` patterns are regular expressions tested against the output.
  The case passes when the pattern no longer matches; when `replacedBy`
  is given, that string must also appear. These are the backbone of the
  corpus: because the mistakes are planted, recall is computable
  deterministically.
- `mustPreserve` patterns are matched against the *input*; every match
  must appear verbatim in the output. Use these to pin down code blocks,
  frontmatter fields, and commands that reviews and translations must
  not disturb.
- `shouldNotChange` measures false positives. Clean-file review cases
  (no `shouldChange`, no `mustFix`) additionally get the
  `noopDiscipline` metric automatically.
- `rubric: "none"` opts a case out of Tier 3 judging even when the run
  enables it. Use it for cases that only test mechanics (noop
  discipline, integrity) where judge tokens would be wasted.

### Content fixtures

The `content/` directory holds the markdown tree, using the same language
suffix conventions as real content (`guide.md` is the default language,
`guide.fr.md` is French).

For **review** cases, seed a small number of unambiguous errors and
declare every one of them in `mustFix`. Keep some surrounding content
clean so precision problems (the model "improving" things it should not
touch) show up in `mustPreserve` and `shouldNotChange` failures.

To validate **style guide** handling, place a style guide file in the
case directory (outside `content/`, so it is not treated as content to
review), list it in `settings.styleGuides`, and seed the content with
violations of the guide's rules declared as `mustFix` expectations. The
case then measures whether the pipeline actually applies the guide: the
seeded violations are only fixable by following it. See
`evals/corpus/review/style-guide/` for the pattern.

The same works for translation: mandate target-language terminology
that differs from the rendering a model would choose by default, and
declare the mandated terms as `mustFix` expectations against the
source-language words. See `evals/corpus/translate/style-guide/`,
where the guide requires "grappe" instead of keeping the English
"cluster" as French technical writing usually does.

For **translate** cases:

- A *new translation* case contains only source files.
- A *re-translation* case also contains a target-language file (for
  example `guide.fr.md`) whose frontmatter carries a deliberately stale
  `tmdTranslationSourceHash`, which makes the pipeline detect the source
  change and retranslate. See
  `evals/corpus/translate/retranslate-small-change/` for the pattern.
- An *up-to-date* file (correct hash) will be skipped by the pipeline,
  which is itself testable: the hash grader re-derives the expected hash
  from the source fixture.

Guidelines that keep cases useful:

- Keep files in the 0.5-4 KB range unless the case specifically
  stresses long content.
- Make each case test one behavior. A case that seeds typos, broken
  links, and code preservation at once produces scores that are hard to
  attribute.
- Prefer content resembling real workshop material (commands, YAML,
  tables) over lorem ipsum; the failure modes being hunted are
  formatting-sensitive.
- Anonymized excerpts of real content where the tool misbehaved make the
  best cases.

### Verifying a new case

The hermetic tests in `tests/evals/` load the entire corpus, so
`yarn test` will catch a malformed manifest or an empty content
directory. To exercise the case against a real model without running
everything else:

```bash
yarn eval --cases <case-name> --repetitions 1 --mode write
```

## Running evals

### Prerequisites

AWS credentials with Bedrock invoke access in the default credential
chain, the same as running the CLI itself.

### Commands

```bash
# Full corpus, both edit modes, 3 repetitions, no judge (default)
yarn eval

# Subset of cases (substring match on the case id, e.g. review/typos-basic)
yarn eval --cases typos

# Single mode, single repetition - the cheap iteration loop
yarn eval --cases typos-basic --mode write --repetitions 1

# Enable Tier 3 judging
yarn eval --rubric all

# Different model under test, or judge
yarn eval --model <bedrock-model-id>
yarn eval --rubric all --judge-model <bedrock-model-id>

# Rate limiting (per minute), reusing the pipelines' own limiters
yarn eval --request-rate 30 --token-rate 100000
```

Every run writes a timestamped JSON artifact to `evals/runs/` (gitignored)
and prints a report of per-case scores, failures, and token counts.

### Baseline workflow

Baselines are stored runs, checked in under `evals/runs/baselines/` like
a lockfile for quality.

```bash
# Store the current state as the baseline
yarn eval --baseline main

# Before landing a prompt/tool/mode change: compare against it
yarn eval --compare main
```

The comparison report lists:

- **Drift** - model, judge, toolkit version, or prompt template changes
  between the runs. Expected when you are testing a prompt change;
  suspicious when you are not.
- **New failures and resolved failures** - cases that changed completion
  behavior.
- **Regressions and improvements** - metrics whose ranges no longer
  overlap the baseline.
- **Token deltas** - mean output tokens per case, for measuring the cost
  impact of a change.

After a change lands, re-baseline so the next comparison measures the
next change:

```bash
yarn eval --baseline main
```

Model upgrades get the same treatment with the model axis varied: run
`--compare main --model <candidate>` to see what the candidate changes,
then re-baseline with the new model once adopted.

### Cost expectations

Tier 1 and 2 grading is free (no extra model calls). Judging is the
dominant cost, which is why `--rubric` defaults to `none`. A full run of
the starter corpus at 3 repetitions with judging enabled is roughly
150-250 model calls - single-digit dollars on Sonnet-class models. Use
`--cases` and `--repetitions 1` while iterating.

## Extending the mechanism

- **New metrics**: add a grader alongside the existing ones and wire it
  into the harness. Scores must be on a 0-1 scale with raw counts
  alongside; the report layer aggregates and compares them
  automatically.
- **New rubric dimensions**: extend the judge rubric schemas; structured
  output enforces them.
- **New manifest fields**: extend the manifest schema and honor the new
  field in the harness. Do not add settings the harness does not read.
- **Hermetic tests**: everything except the live model calls is testable
  offline; add tests under `tests/evals/` alongside the existing ones,
  which show the fake-client pattern for driving the harness.
