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

export interface LogWriter {
  message(message: string): void;

  error(message: string): void;
}

export class ConsoleLogger implements LogWriter {
  message(message: string): void {
    console.log(message);
  }

  error(message: string): void {
    console.error(message);
  }
}

export class ConsoleErrorLogger implements LogWriter {
  message(message: string): void {
    console.error(message);
  }

  error(message: string): void {
    console.error(message);
  }
}

export class NoopLogger implements LogWriter {
  message(_message: string): void {
    // Do nothing
  }

  error(_message: string): void {
    // Do nothing
  }
}
