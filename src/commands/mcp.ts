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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Command } from "commander";
import {
  registerBestPracticesTool,
  registerContentSummaryTool,
  registerReviewGuidanceTool,
  registerRunChecksTool,
  registerTranslationGuidanceTool,
} from "../ai/mcp/index.js";
import type { ToolContext } from "../ai/mcp/types.js";
import { VERSION } from "../cli.js";
import { Language } from "../languages/index.js";
import { ConsoleErrorLogger, NoopLogger } from "./logger.js";
import { commonOptions, languageOptions } from "./options.js";
import * as utils from "./utils.js";

export function createMcpCommand(): Command {
  const command = new Command("mcp");

  commonOptions(command);
  languageOptions(command);

  command.description("Runs an MCP server").action(executeAction);

  return command;
}

// biome-ignore lint/suspicious/noExplicitAny: Need a better way to handle CLI options
async function executeAction(options: any): Promise<void> {
  const logger = new ConsoleErrorLogger();

  logger.message("Starting MCP server...");

  const server = new McpServer({
    name: "toolkit-md-server",
    version: VERSION,
  });

  const cwd = utils.getCwd(options);

  logger.message(`Working directory is: ${cwd}`);

  const context: ToolContext = {
    cwd,
    languages: [...Language.getLanguages().map((e) => e.code)].join(", "),
    noopLogger: new NoopLogger(),
    options,
  };

  registerBestPracticesTool(server, context);
  registerContentSummaryTool(server, context);
  registerReviewGuidanceTool(server, context);
  registerTranslationGuidanceTool(server, context);
  registerRunChecksTool(server, context);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
