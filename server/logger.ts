/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { PROJECT_ROOT } from "./config";

/**
 * Log levels supported by the Mersin AgriTech Digital Assistant logger.
 */
export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR";

/**
 * Log modules representing different subsystems of the agricultural architecture.
 */
export type LogModule = "SYSTEM" | "DATABASE" | "AI" | "RAG" | "WEATHER" | "AUTH" | "FINANCE";

/**
 * Professional multi-file Logging System.
 * Automatically organizes logs into specialized target files as requested:
 * - logs/system.log (System orchestration & lifecycle)
 * - logs/database.log (CRUD, query speeds, backup results)
 * - logs/ai.log (Gemini models prompts, vision diagnostics, token metrics)
 * - logs/rag.log (Document vectorizing, chunks, retrievals)
 * - logs/weather.log (External APIs weather polls, frost alerts)
 * - logs/error.log (Centralized error storage for debugging)
 */
class Logger {
  private logDir: string;

  constructor() {
    this.logDir = path.join(PROJECT_ROOT, "logs");
    this.ensureLogDirectoryExists();
  }

  /**
   * Helper method to ensure the logs folder exists on disk.
   */
  private ensureLogDirectoryExists(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error("FATAL: Failed to create logging directory:", error);
    }
  }

  /**
   * Appends a log line asynchronously to the target log file.
   * Ensures high performance and zero-blocking on main API loops.
   */
  private async writeToFile(fileName: string, content: string): Promise<void> {
    const filePath = path.join(this.logDir, fileName);
    try {
      await fs.promises.appendFile(filePath, content + "\n", "utf8");
    } catch (error) {
      console.error(`ERROR: Failed writing to log file ${fileName}:`, error);
    }
  }

  /**
   * Formats and routes log messages to console and specific logs on disk.
   * @param level LogLevel (DEBUG, INFO, WARNING, ERROR)
   * @param module LogModule (SYSTEM, DATABASE, AI, etc.)
   * @param message Detailed message string
   * @param extra Optional metadata object for context
   */
  public log(level: LogLevel, module: LogModule, message: string, extra?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const formattedMeta = extra ? ` | Meta: ${JSON.stringify(extra)}` : "";
    const logLine = `[${timestamp}] [${level}] [${module}] ${message}${formattedMeta}`;

    // 1. Console Output with beautiful formatting for local server developer awareness
    const consoleColor =
      level === "ERROR"
        ? "\x1b[31m" // Red
        : level === "WARNING"
        ? "\x1b[33m" // Yellow
        : level === "DEBUG"
        ? "\x1b[36m" // Cyan
        : "\x1b[32m"; // Green
    const resetColor = "\x1b[0m";

    console.log(`${consoleColor}[${level}]${resetColor} [${module}] ${message}`);

    // 2. Route asynchronously to specific log files as mandated by Stage 1 specifications
    const moduleFileMap: Record<LogModule, string> = {
      SYSTEM: "system.log",
      DATABASE: "database.log",
      AI: "ai.log",
      RAG: "rag.log",
      WEATHER: "weather.log",
      AUTH: "system.log", // Auth details are routed to system log
      FINANCE: "system.log",
    };

    const targetFile = moduleFileMap[module] || "system.log";
    this.writeToFile(targetFile, logLine);

    // 3. Centralize all warnings and errors to error.log for unified health monitoring
    if (level === "ERROR" || level === "WARNING") {
      this.writeToFile("error.log", logLine);
    }
  }

  /**
   * Log Info helper.
   */
  public info(module: LogModule, message: string, extra?: Record<string, unknown>): void {
    this.log("INFO", module, message, extra);
  }

  /**
   * Log Warning helper.
   */
  public warn(module: LogModule, message: string, extra?: Record<string, unknown>): void {
    this.log("WARNING", module, message, extra);
  }

  /**
   * Log Error helper.
   */
  public error(module: LogModule, message: string, errorObj?: unknown, extra?: Record<string, unknown>): void {
    const errorMsg = errorObj instanceof Error ? errorObj.stack || errorObj.message : String(errorObj);
    const combinedMessage = `${message} | Error Details: ${errorMsg}`;
    this.log("ERROR", module, combinedMessage, extra);
  }

  /**
   * Log Debug helper.
   */
  public debug(module: LogModule, message: string, extra?: Record<string, unknown>): void {
    this.log("DEBUG", module, message, extra);
  }
}

export const logger = new Logger();
