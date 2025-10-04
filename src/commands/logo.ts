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

import chalk from "chalk";

export const logoText = `

████████╗ ██████╗  ██████╗ ██╗     ██╗  ██╗██╗████████╗    ███╗   ███╗██████╗ 
╚══██╔══╝██╔═══██╗██╔═══██╗██║     ██║ ██╔╝██║╚══██╔══╝    ████╗ ████║██╔══██╗
   ██║   ██║   ██║██║   ██║██║     █████╔╝ ██║   ██║       ██╔████╔██║██║  ██║
   ██║   ██║   ██║██║   ██║██║     ██╔═██╗ ██║   ██║       ██║╚██╔╝██║██║  ██║
   ██║   ╚██████╔╝╚██████╔╝███████╗██║  ██╗██║   ██║       ██║ ╚═╝ ██║██████╔╝
   ╚═╝    ╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝   ╚═╝       ╚═╝     ╚═╝╚═════╝ 
                                    

`;

export function logo() {
  console.log(rainbowText(logoText));
}

/**
 * Renders text with a blue gradient effect that spans across the entire text
 *
 * @param text - The input string to be colorized
 * @param options - Optional configuration for the gradient effect
 * @param options.startColor - Starting color of the gradient (default: dark blue)
 * @param options.endColor - Ending color of the gradient (default: light blue)
 * @param options.saturation - Color saturation percentage (0-100, default: 70)
 * @returns The input text with blue gradient effect applied
 *
 * @example
 * ```typescript
 * console.log(rainbowText("Hello, World!"));
 * console.log(rainbowText("Custom gradient!", {
 *   startColor: { hue: 220, lightness: 20 },
 *   endColor: { hue: 195, lightness: 70 }
 * }));
 * ```
 */
export function rainbowText(
  text: string,
  options: {
    startColor?: { hue?: number; lightness?: number };
    endColor?: { hue?: number; lightness?: number };
    saturation?: number;
  } = {},
): string {
  // Default to a dark blue to light blue gradient
  const startHue = options.startColor?.hue ?? 230;
  const startLightness = options.startColor?.lightness ?? 25;
  const endHue = options.endColor?.hue ?? 210;
  const endLightness = options.endColor?.lightness ?? 70;
  const saturation = options.saturation ?? 70;

  // Count visible characters (excluding newlines)
  const visibleChars = text.replace(/\n/g, "").length;
  if (visibleChars === 0) return "";

  let result = "";
  let visibleIndex = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      // Don't colorize newlines
      result += text[i];
    } else {
      // Calculate the progress through the visible characters (0 to 1)
      const progress = visibleChars > 1 ? visibleIndex / (visibleChars - 1) : 0;

      // Interpolate between start and end colors
      const hue = Math.floor(startHue + progress * (endHue - startHue));
      const lightness = Math.floor(
        startLightness + progress * (endLightness - startLightness),
      );

      // Apply the color to the current character
      result += chalk.hex(hslToHex(hue, saturation, lightness))(text[i]);

      visibleIndex++;
    }
  }

  return result;
}

/**
 * Converts HSL color values to hexadecimal color code
 *
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns Hexadecimal color code
 * @private
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  // Convert to hex
  const toHex = (value: number) => {
    const hex = Math.round((value + m) * 255).toString(16);
    return hex.length === 1 ? ("0" as const) + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
