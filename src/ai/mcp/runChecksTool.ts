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
import { checkNode } from "../../check/index.js";
import type { CheckOptions } from "../../check/types.js";
import * as utils from "../../commands/utils.js";
import { ConfigManager } from "../../config/index.js";
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
        "Runs lint, link, and image checks on specified Markdown content files. Files must be specified as paths relative to the content directory.",
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
          .array(z.enum(["lint", "link", "image"]))
          .describe("Check categories to run, overrides project config")
          .optional(),
      },
    },
    async ({ projectDirectory, files, minSeverity, categories }) => {
      utils.validatePathWithinCwd(projectDirectory, cwd);

      const config = new ConfigManager(projectDirectory);
      await config.initialize(options);

      const { language, defaultLanguage } = utils.getLanguages(config);

      const contentDir = utils.getContentDir(config) ?? projectDirectory;

      const tree = await utils.buildContentTree(
        contentDir,
        defaultLanguage,
        language,
      );

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
        ...utils.getCheckConfig(config, contentDir, contentDir),
        contentTree: tree,
        ...(minSeverity && { minSeverity }),
        ...(categories && { categories }),
      };

      const results: string[] = [];
      let totalErrors = 0;
      let totalWarnings = 0;

      for (const node of matchedNodes) {
        const result = await checkNode(node, checkOpts);

        if (!result) {
          continue;
        }

        for (const issue of result.issues) {
          if (issue.severity === "error") {
            totalErrors++;
          } else {
            totalWarnings++;
          }
        }

        if (result.issues.length === 0) {
          continue;
        }

        results.push(result.filePath);
        for (const issue of result.issues) {
          results.push(
            `  ${issue.line}:${issue.column}  ${issue.severity}  ${issue.rule}  ${issue.message}  (${issue.category})`,
          );
        }
      }

      const summary = [];
      if (totalErrors > 0) {
        summary.push(`${totalErrors} error${totalErrors !== 1 ? "s" : ""}`);
      }
      if (totalWarnings > 0) {
        summary.push(
          `${totalWarnings} warning${totalWarnings !== 1 ? "s" : ""}`,
        );
      }

      const fileCount = matchedNodes.length;
      if (summary.length > 0) {
        results.push(
          `\nResults: ${summary.join(", ")} in ${fileCount} file${fileCount !== 1 ? "s" : ""}`,
        );
      } else {
        results.push(
          `\nAll ${fileCount} file${fileCount !== 1 ? "s" : ""} passed`,
        );
      }

      return { content: [{ type: "text" as const, text: results.join("\n") }] };
    },
  );
}
