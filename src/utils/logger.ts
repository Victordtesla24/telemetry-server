/**
 * Simple logging utility for the Telemetry Server.
 * Provides consistent formatting and log levels.
 */

enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG'
}

/**
 * Logger class for handling application logging
 */
class Logger {
  private static formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  /**
   * Log an informational message
   */
  public static info(message: string): void {
    console.log(this.formatMessage(LogLevel.INFO, message));
  }

  /**
   * Log a warning message
   */
  public static warn(message: string): void {
    console.warn(this.formatMessage(LogLevel.WARN, message));
  }

  /**
   * Log an error message
   */
  public static error(message: string): void {
    console.error(this.formatMessage(LogLevel.ERROR, message));
  }

  /**
   * Log a debug message (only shown in development)
   */
  public static debug(message: string): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.formatMessage(LogLevel.DEBUG, message));
    }
  }
}

export default Logger; 