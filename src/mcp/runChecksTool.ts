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

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import { checkAll, formatCheckResults } from "../check/index.js";
import type { CheckOptions } from "../check/types.js";
import { validatePathWithinCwd, Workspace } from "../core/workspace.js";
import type { ToolContext } from "./types.js";

export function registerRunChecksTool(
  server: McpServer,
  context: ToolContext,
): void {
  const { cwd, options } = context;

  server.registerTool(
    "run_checks",
    {
      title: "Run Content Checks",
      description:
        "Runs lint, link, image, and spell checks on specified Markdown content files. Files must be specified as paths relative to the content directory.",
      inputSchema: {
        projectDirectory: z
          .string()
          .describe("Absolute path to base/root directory of the project"),
        files: z
          .array(z.string())
          .describe(
            "List of file paths relative to the content directory to check",
          ),
        minSeverity: z
          .enum(["error", "warning"])
          .describe(
            "Minimum severity level to report, overrides project config",
          )
          .optional(),
        categories: z
          .array(z.enum(["lint", "link", "image", "spell"]))
          .describe("Check categories to run, overrides project config")
          .optional(),
      },
    },
    async ({ projectDirectory, files, minSeverity, categories }) => {
      validatePathWithinCwd(projectDirectory, cwd);

      const workspace = await Workspace.create(projectDirectory, {
        cliOptions: options,
      });

      const { language } = workspace;

      const contentDir = workspace.getContentDir() ?? projectDirectory;

      const tree = await workspace.buildTree(contentDir);

      const allNodes = tree.getFlattenedTree();

      const matchedNodes = files.map((file) => {
        const node = allNodes.find((n) => {
          return n.filePath === file || n.filePath === `/${file}`;
        });
        if (!node) {
          throw new Error(`File not found in content tree: ${file}`);
        }
        return node;
      });

      const checkOpts: CheckOptions = {
        ...(await workspace.getCheckConfig(contentDir, {
          rootContentDir: contentDir,
          locale: language.code,
        })),
        contentTree: tree,
        ...(minSeverity && { minSeverity }),
        ...(categories && { categories }),
      };

      const result = await checkAll(matchedNodes, checkOpts);

      return {
        content: [
          {
            type: "text" as const,
            text: formatCheckResults(result),
          },
        ],
      };
    },
  );
}
