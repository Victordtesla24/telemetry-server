/**
 * Types for Tesla telemetry data
 */

// Tesla telemetry value can be one of several types
export interface TelemetryStringValue {
  stringValue: string;
}

export interface TelemetryDoubleValue {
  doubleValue: number;
}

export interface TelemetryBoolValue {
  boolValue: boolean;
}

export interface TelemetryIntValue {
  intValue: number;
}

export type TelemetryValue = 
  | TelemetryStringValue 
  | TelemetryDoubleValue 
  | TelemetryBoolValue 
  | TelemetryIntValue;

// Single data point in telemetry message
export interface TelemetryDataPoint {
  key: string;
  value: TelemetryValue;
}

// Main data message structure
export interface TelemetryDataMessage {
  data: TelemetryDataPoint[];
  vin: string;
  createdAt: string;
}

// Connectivity status message
export interface TelemetryConnectivityMessage {
  vin: string;
  connectionId: string;
  status: 'CONNECTED' | 'DISCONNECTED';
  timestamp: string;
}

// Error message structure
export interface TelemetryErrorMessage {
  vin: string;
  errors: Array<{
    code: string;
    message: string;
    timestamp: string;
  }>;
}

// Alert message structure
export interface TelemetryAlertMessage {
  vin: string;
  alerts: Array<{
    type: string;
    message: string;
    timestamp: string;
  }>;
}

// Union type for all telemetry message types
export type TelemetryMessage = 
  | TelemetryDataMessage 
  | TelemetryConnectivityMessage 
  | TelemetryErrorMessage 
  | TelemetryAlertMessage;

// Config for the telemetry stream
export interface TelemetryConfig {
  vins: string[];
  config: {
    hostname: string;
    port: number;
    ca: string;
    fields: {
      [fieldName: string]: {
        interval_seconds: number;
      };
    };
    prefer_typed: boolean;
    delivery_policy?: 'drop' | 'latest';
  };
}

// Response from checking telemetry config status
export interface TelemetryConfigStatus {
  vin: string;
  synced: boolean;
  last_sync_time?: string;
  config?: {
    hostname: string;
    port: number;
    fields: string[];
  };
}

// Helper function to determine message type
export function isTelemetryDataMessage(message: TelemetryMessage): message is TelemetryDataMessage {
  return 'data' in message;
}

export function isTelemetryConnectivityMessage(message: TelemetryMessage): message is TelemetryConnectivityMessage {
  return 'status' in message;
}

export function isTelemetryErrorMessage(message: TelemetryMessage): message is TelemetryErrorMessage {
  return 'errors' in message;
}

export function isTelemetryAlertMessage(message: TelemetryMessage): message is TelemetryAlertMessage {
  return 'alerts' in message;
}

// Credentials for authenticating dashboard clients
export interface ClientCredentials {
  token: string;
}

// Configuration options for the server
export interface ServerConfig {
  port: number;
  certPath?: string;
  keyPath?: string;
  caPath?: string;
  requestClientCert: boolean;
  jwtSecret: string;
} 