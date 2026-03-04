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

import type { z } from "zod";

/**
 * Options for creating a tool definition.
 * The execute function receives the validated and typed input.
 */
export interface ToolOptions<T extends z.ZodType> {
  name: string;
  description: string;
  parameters: T;
  execute: (input: z.infer<T>) => string;
}

/**
 * A tool definition that can be passed to the Bedrock client.
 * The execute function accepts unknown input since the client passes raw model output.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: z.ZodType;
  readonly execute: (input: unknown) => string;
}

/**
 * Creates a typed tool definition from the given options.
 * The parameters schema is used to validate and parse input at execution time.
 */
export function createTool<T extends z.ZodType>(
  options: ToolOptions<T>,
): ToolDefinition {
  return {
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    execute: (input: unknown) =>
      options.execute(options.parameters.parse(input)),
  };
}
