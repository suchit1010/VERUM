/**
 * Basket Vault Keeper Bot Logger
 * Production-grade logging with structured output
 */

import * as fs from "fs";
import * as path from "path";

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component: string;
  data?: Record<string, unknown>;
  error?: string;
}

export class Logger {
  private logFile: string;
  private logLevel: LogLevel;
  private component: string;

  constructor(component: string, logFile?: string) {
    this.component = component;
    this.logFile =
      logFile ||
      path.join(
        process.cwd(),
        `keeper-${new Date().toISOString().split("T")[0]}.log`
      );
    this.logLevel = this.parseLogLevel(process.env.LOG_LEVEL || "INFO");

    // Ensure log directory exists
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private parseLogLevel(level: string): LogLevel {
    const levels: Record<string, LogLevel> = {
      DEBUG: LogLevel.DEBUG,
      INFO: LogLevel.INFO,
      WARN: LogLevel.WARN,
      ERROR: LogLevel.ERROR,
      CRITICAL: LogLevel.CRITICAL,
    };
    return levels[level.toUpperCase()] || LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
      [LogLevel.CRITICAL]: 4,
    };
    return levels[level] >= levels[this.logLevel];
  }

  private formatLog(entry: LogEntry): string {
    const base = `[${entry.timestamp}] [${entry.level}] [${entry.component}] ${entry.message}`;
    if (entry.data && Object.keys(entry.data).length > 0) {
      return `${base} | ${JSON.stringify(entry.data)}`;
    }
    if (entry.error) {
      return `${base} | ERROR: ${entry.error}`;
    }
    return base;
  }

  private write(entry: LogEntry): void {
    const formatted = this.formatLog(entry);
    console.log(formatted);

    try {
      fs.appendFileSync(this.logFile, formatted + "\n");
    } catch (error) {
      console.error(`Failed to write to log file: ${error}`);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.write({
        timestamp: new Date().toISOString(),
        level: LogLevel.DEBUG,
        message,
        component: this.component,
        data,
      });
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.write({
        timestamp: new Date().toISOString(),
        level: LogLevel.INFO,
        message,
        component: this.component,
        data,
      });
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.write({
        timestamp: new Date().toISOString(),
        level: LogLevel.WARN,
        message,
        component: this.component,
        data,
      });
    }
  }

  error(message: string, error?: Error | string, data?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: LogLevel.ERROR,
        message,
        component: this.component,
        data,
      };

      if (error instanceof Error) {
        entry.error = `${error.name}: ${error.message}\n${error.stack}`;
      } else if (typeof error === "string") {
        entry.error = error;
      }

      this.write(entry);
    }
  }

  critical(
    message: string,
    error?: Error | string,
    data?: Record<string, unknown>
  ): void {
    if (this.shouldLog(LogLevel.CRITICAL)) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: LogLevel.CRITICAL,
        message,
        component: this.component,
        data,
      };

      if (error instanceof Error) {
        entry.error = `${error.name}: ${error.message}\n${error.stack}`;
      } else if (typeof error === "string") {
        entry.error = error;
      }

      this.write(entry);
    }
  }
}

export default Logger;
