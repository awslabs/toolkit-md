import { describe, expect, test } from "vitest";
import { substituteVariables } from "../../../src/ai/prompts/utils.js";

describe("builders", () => {
  describe("substituteVariables", () => {
    test("should replace a single placeholder with its value", () => {
      const template = "Hello, {{name}}!";
      const variables = { name: "World" };

      const result = substituteVariables(template, variables);

      expect(result).toBe("Hello, World!");
    });

    test("should replace multiple placeholders with their values", () => {
      const template = "{{greeting}}, {{name}}! Welcome to {{place}}.";
      const variables = {
        greeting: "Hello",
        name: "John",
        place: "Wonderland",
      };

      const result = substituteVariables(template, variables);

      expect(result).toBe("Hello, John! Welcome to Wonderland.");
    });

    test("should leave placeholders unchanged when no matching variable exists", () => {
      const template = "Hello, {{name}}! Welcome to {{place}}.";
      const variables = { name: "John" };

      const result = substituteVariables(template, variables);

      expect(result).toBe("Hello, John! Welcome to {{place}}.");
    });

    test("should return the template unchanged when it contains no placeholders", () => {
      const template = "Hello, World!";
      const variables = { name: "John" };

      const result = substituteVariables(template, variables);

      expect(result).toBe("Hello, World!");
    });

    test("should leave all placeholders unchanged when variables map is empty", () => {
      const template = "Hello, {{name}}! Welcome to {{place}}.";
      const variables = {};

      const result = substituteVariables(template, variables);

      expect(result).toBe("Hello, {{name}}! Welcome to {{place}}.");
    });
  });
});
