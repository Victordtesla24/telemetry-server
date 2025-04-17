import fetch from 'node-fetch';
import Logger from '../utils/logger';
import { TelemetryConfig, TelemetryConfigStatus } from '../types/telemetry';

/**
 * Service for interacting with Tesla's Fleet API
 */
class TeslaApiService {
  private static readonly API_BASE_URL = process.env.TESLA_API_BASE_URL || 'https://fleet-api.prd.na.vn.cloud.tesla.com/api/1';
  private static readonly ACCESS_TOKEN = process.env.TESLA_ACCESS_TOKEN || '';
  private static readonly VIN = process.env.TESLA_VIN || '';

  /**
   * Validates that required environment variables are set
   */
  public static validateConfig(): void {
    if (!this.ACCESS_TOKEN) {
      throw new Error('TESLA_ACCESS_TOKEN environment variable is not set');
    }
    if (!this.VIN) {
      throw new Error('TESLA_VIN environment variable is not set');
    }
  }

  /**
   * Makes an authenticated request to the Tesla API
   */
  private static async makeRequest(
    endpoint: string,
    method: string = 'GET',
    body?: object,
  ): Promise<any> {
    try {
      const url = `${this.API_BASE_URL}${endpoint}`;
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      };

      Logger.debug(`Making ${method} request to Tesla API: ${url}`);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tesla API Error (${response.status}): ${errorText}`);
      }

      // Parse the response as JSON
      return await response.json();
    } catch (error) {
      Logger.error(`Tesla API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get the vehicle ID/tag for the configured VIN
   * This is needed for other API calls that use vehicle_tag instead of VIN
   */
  public static async getVehicleTag(): Promise<string> {
    try {
      const response = await this.makeRequest('/vehicles');
      
      // Find the vehicle with the matching VIN
      const vehicle = response.response.find((v: any) => v.vin === this.VIN);
      
      if (!vehicle) {
        throw new Error(`Vehicle with VIN ${this.VIN} not found in Tesla account`);
      }
      
      Logger.info(`Found vehicle: ${vehicle.display_name} (${vehicle.vin})`);
      return vehicle.id_s;
    } catch (error) {
      Logger.error(`Failed to get vehicle tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Wake up the vehicle (required before sending commands)
   */
  public static async wakeUpVehicle(vehicleTag: string): Promise<void> {
    try {
      Logger.info(`Waking up vehicle ${this.VIN}...`);
      const response = await this.makeRequest(`/vehicles/${vehicleTag}/wake_up`, 'POST');
      
      // Check if the vehicle is awake
      if (response.response.state !== 'online') {
        Logger.info('Vehicle not yet online, waiting...');
        // In a production scenario, we might retry or wait, but for now, we'll assume it will wake up
      } else {
        Logger.info('Vehicle is now online');
      }
    } catch (error) {
      Logger.error(`Failed to wake up vehicle: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get the current telemetry configuration status for a vehicle
   */
  public static async getTelemetryConfigStatus(vehicleTag: string): Promise<TelemetryConfigStatus> {
    try {
      Logger.info(`Getting telemetry config status for vehicle ${this.VIN}...`);
      const response = await this.makeRequest(`/vehicles/${vehicleTag}/fleet_telemetry_config`);
      
      return response.response as TelemetryConfigStatus;
    } catch (error) {
      Logger.error(`Failed to get telemetry config status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Check for any telemetry errors reported by the vehicle
   */
  public static async getTelemetryErrors(vehicleTag: string): Promise<any> {
    try {
      Logger.info(`Checking telemetry errors for vehicle ${this.VIN}...`);
      const response = await this.makeRequest(`/vehicles/${vehicleTag}/fleet_telemetry_errors`);
      
      return response.response;
    } catch (error) {
      Logger.error(`Failed to get telemetry errors: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * IMPORTANT: This method requires using Tesla's vehicle command HTTP proxy to sign the request
   * with your private key or implementing JWS signing. It should NOT be called directly.
   * 
   * This is a placeholder to document the API - in production, use Tesla's proxy tool or implement JWS signing
   */
  public static async configureTelemetry(config: TelemetryConfig): Promise<void> {
    Logger.warn(`
      IMPORTANT: Direct telemetry configuration is not implemented here.
      
      You must use Tesla's vehicle command HTTP proxy tool or JWS signing to configure telemetry.
      Per Tesla's docs, the request must be signed with your private key.
      
      Command to use the proxy:
      
      1. Download the proxy tool from Tesla's developer site
      2. Run it with your config JSON:
         ./vehicle_command.bin -i vehicle_config.json
      
      See Tesla's documentation for details:
      https://developer.tesla.com/docs/fleet-api/endpoints/vehicle-endpoints#fleet-telemetry-config-create
    `);
    
    throw new Error('Direct telemetry configuration is not implemented - use Tesla proxy tool');
  }

  /**
   * Check the vehicle's online status
   */
  public static async checkVehicleStatus(vehicleTag: string): Promise<string> {
    try {
      const response = await this.makeRequest(`/vehicles/${vehicleTag}/fleet_status`);
      
      const status = response.response.online_state;
      Logger.info(`Vehicle online status: ${status}`);
      
      return status;
    } catch (error) {
      Logger.error(`Failed to check vehicle status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
}

export default TeslaApiService; 