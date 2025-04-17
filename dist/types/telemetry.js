"use strict";
/**
 * Types for Tesla telemetry data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTelemetryDataMessage = isTelemetryDataMessage;
exports.isTelemetryConnectivityMessage = isTelemetryConnectivityMessage;
exports.isTelemetryErrorMessage = isTelemetryErrorMessage;
exports.isTelemetryAlertMessage = isTelemetryAlertMessage;
// Helper function to determine message type
function isTelemetryDataMessage(message) {
    return 'data' in message;
}
function isTelemetryConnectivityMessage(message) {
    return 'status' in message;
}
function isTelemetryErrorMessage(message) {
    return 'errors' in message;
}
function isTelemetryAlertMessage(message) {
    return 'alerts' in message;
}
