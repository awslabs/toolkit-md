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

export class Language {
  public constructor(
    public readonly code: string,
    public readonly name: string,
  ) {}

  public static getLanguages() {
    return [
      new Language("en", "English (United States)"),
      new Language("de", "Deutsch"),
      new Language("es", "Español (Estados Unidos)"),
      new Language("fr", "Français"),
      new Language("id", "Bahasa Indonesia"),
      new Language("it", "Italiano"),
      new Language("ja", "日本語"),
      new Language("ko", "한국어"),
      new Language("nl", "Nederlands"),
      new Language("pl", "Polski"),
      new Language("pt", "Brazilian Português"),
      new Language("uk", "украї́нська"),
      new Language("zh-CN", "中文(简体)"),
      new Language("zh-TW", "中文(繁體)"),
    ];
  }

  public static getLanguageMap() {
    return new Map(Language.getLanguages().map((i) => [i.code, i]));
  }

  public static getLanguage(code: string) {
    return Language.getLanguageMap().get(code);
  }
}
