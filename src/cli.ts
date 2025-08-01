#!/usr/bin/env node
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

import { Command } from "commander";
import {
  createAskCommand,
  createReviewCommand,
  createTranslateCommand,
} from "./commands/index.js";
import { logoText, rainbowText } from "./utils.js";

// x-release-please-start-version
export const VERSION = "0.1.5";
// x-release-please-end

console.log(rainbowText(logoText));

process.on("SIGINT", () => {
  console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
  process.exit(0);
});

const program = new Command();
program
  .description("Various tools to help maintain Markdown content")
  .version(VERSION)
  .addCommand(createReviewCommand())
  .addCommand(createTranslateCommand())
  .addCommand(createAskCommand());

await program.parse();
