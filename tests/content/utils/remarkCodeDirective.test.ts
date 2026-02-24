/**
 * Copyright 2025 Amazon.com, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { remark } from "remark";
import remarkDirective from "remark-directive";
import { describe, expect, test } from "vitest";
import remarkCodeDirective from "../../../src/content/utils/remarkCodeDirective.js";

function process(input: string): string {
  return remark()
    .use(remarkDirective)
    .use(remarkCodeDirective)
    .processSync(input)
    .toString();
}

describe("remarkCodeDirective", () => {
  test("should convert :::code directive to fenced code block", () => {
    const input = ":::code\nprint('hello')\n:::\n";
    const output = process(input);
    expect(output).toContain("```");
    expect(output).toContain("print('hello')");
  });

  test("should preserve lang attribute", () => {
    const input = ":::code{lang=python}\nprint('hello')\n:::\n";
    const output = process(input);
    expect(output).toContain("```python");
    expect(output).toContain("print('hello')");
  });

  test("should support language attribute as alias for lang", () => {
    const input = ":::code{language=javascript}\nconsole.log('hi')\n:::\n";
    const output = process(input);
    expect(output).toContain("```javascript");
    expect(output).toContain("console.log('hi')");
  });

  test("should not transform non-code directives", () => {
    const input = ":::note\nThis is a note.\n:::\n";
    const output = process(input);
    expect(output).not.toContain("```");
    expect(output).toContain("note");
  });

  test("should handle empty code directive", () => {
    const input = ":::code\n:::\n";
    const output = process(input);
    expect(output).toContain("```");
  });

  test("should leave surrounding content intact", () => {
    const input =
      "# Heading\n\nSome text.\n\n:::code{lang=bash}\necho hi\n:::\n\nMore text.\n";
    const output = process(input);
    expect(output).toContain("# Heading");
    expect(output).toContain("Some text.");
    expect(output).toContain("```bash");
    expect(output).toContain("echo hi");
    expect(output).toContain("More text.");
  });

  test("should handle multiple code directives", () => {
    const input =
      ":::code{lang=python}\nprint(1)\n:::\n\n:::code{lang=ruby}\nputs 2\n:::\n";
    const output = process(input);
    expect(output).toContain("```python");
    expect(output).toContain("print(1)");
    expect(output).toContain("```ruby");
    expect(output).toContain("puts 2");
  });
});
