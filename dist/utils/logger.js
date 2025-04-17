"use strict";
/**
 * Simple logging utility for the Telemetry Server.
 * Provides consistent formatting and log levels.
 */
Object.defineProperty(exports, "__esModule", { value: true });
var LogLevel;
(function (LogLevel) {
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
    LogLevel["DEBUG"] = "DEBUG";
})(LogLevel || (LogLevel = {}));
/**
 * Logger class for handling application logging
 */
class Logger {
    static formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] ${message}`;
    }
    /**
     * Log an informational message
     */
    static info(message) {
        console.log(this.formatMessage(LogLevel.INFO, message));
    }
    /**
     * Log a warning message
     */
    static warn(message) {
        console.warn(this.formatMessage(LogLevel.WARN, message));
    }
    /**
     * Log an error message
     */
    static error(message) {
        console.error(this.formatMessage(LogLevel.ERROR, message));
    }
    /**
     * Log a debug message (only shown in development)
     */
    static debug(message) {
        if (process.env.NODE_ENV !== 'production') {
            console.debug(this.formatMessage(LogLevel.DEBUG, message));
        }
    }
}
exports.default = Logger;
