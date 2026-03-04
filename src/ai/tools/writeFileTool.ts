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

import { z } from "zod";
import { createTool } from "./types.js";

const writeFileInputSchema = z.object({
  path: z.string().describe("The file path to write to."),
  content: z
    .string()
    .max(12000)
    .describe(
      "The content to write to the file. Keep each chunk to roughly 3000 tokens (~12000 characters).",
    ),
  mode: z
    .enum(["create", "append"])
    .describe(
      "The write mode. 'create' to create or overwrite the file, 'append' to add content to the end.",
    ),
});

/**
 * Creates a write_file tool instance with its own file storage.
 */
export function createWriteFileTool() {
  const files = new Map<string, string>();

  const tool = createTool({
    name: "write_file",
    description:
      "Write content to a file. Use mode 'create' to create or overwrite a file, and 'append' to add content to an existing file.",
    parameters: writeFileInputSchema,
    execute(input) {
      const { path: filePath, content, mode } = input;

      if (mode === "create") {
        files.set(filePath, content);
      } else if (mode === "append") {
        const existing = files.get(filePath) ?? "";
        files.set(filePath, existing + content);
      }

      return `File ${mode}d: ${filePath}`;
    },
  });

  return { ...tool, files };
}
