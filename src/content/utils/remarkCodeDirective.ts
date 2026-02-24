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

/**
 * @fileoverview Remark plugin that converts :::code container directives
 * into standard fenced code blocks.
 *
 * When used with remark-directive, a block like:
 *
 *   :::code{lang=python}
 *   print("hello")
 *   :::
 *
 * is parsed as a containerDirective node with name "code". This plugin
 * replaces those nodes with standard mdast `code` nodes so downstream
 * processors (serializers, linters) see regular fenced code blocks.
 */

import type { Code, Root, RootContent } from "mdast";
import type { ContainerDirective } from "mdast-util-directive";
import { visit } from "unist-util-visit";

/**
 * Remark plugin that transforms :::code directives into fenced code blocks.
 */
export default function remarkCodeDirective() {
  return (tree: Root) => {
    visit(tree, "containerDirective", (node, index, parent) => {
      const directive = node as ContainerDirective;
      if (directive.name !== "code" || index == null || !parent) {
        return;
      }

      const lang =
        directive.attributes?.lang ?? directive.attributes?.language ?? null;

      const textParts: string[] = [];
      for (const child of directive.children) {
        if (child.type === "paragraph") {
          const paragraphText = child.children
            .map((c) => ("value" in c ? (c.value ?? "") : ""))
            .join("");
          textParts.push(paragraphText);
        } else if ("value" in child && child.value != null) {
          textParts.push(child.value);
        }
      }

      const codeNode: Code = {
        type: "code",
        lang,
        meta: null,
        value: textParts.join("\n"),
        position: node.position,
      };

      parent.children[index] = codeNode as RootContent;
    });
  };
}
