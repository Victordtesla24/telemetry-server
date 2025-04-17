"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Service for interacting with Tesla's Fleet API
 */
class TeslaApiService {
    /**
     * Validates that required environment variables are set
     */
    static validateConfig() {
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
    static async makeRequest(endpoint, method = 'GET', body) {
        try {
            const url = `${this.API_BASE_URL}${endpoint}`;
            const headers = {
                'Authorization': `Bearer ${this.ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            };
            logger_1.default.debug(`Making ${method} request to Tesla API: ${url}`);
            const response = await (0, node_fetch_1.default)(url, {
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
        }
        catch (error) {
            logger_1.default.error(`Tesla API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    /**
     * Get the vehicle ID/tag for the configured VIN
     * This is needed for other API calls that use vehicle_tag instead of VIN
     */
    static async getVehicleTag() {
        try {
            const response = await this.makeRequest('/vehicles');
            // Find the vehicle with the matching VIN
            const vehicle = response.response.find((v) => v.vin === this.VIN);
            if (!vehicle) {
                throw new Error(`Vehicle with VIN ${this.VIN} not found in Tesla account`);
            }
            logger_1.default.info(`Found vehicle: ${vehicle.display_name} (${vehicle.vin})`);
            return vehicle.id_s;
        }
        catch (error) {
            logger_1.default.error(`Failed to get vehicle tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    /**
     * Wake up the vehicle (required before sending commands)
     */
    static async wakeUpVehicle(vehicleTag) {
        try {
            logger_1.default.info(`Waking up vehicle ${this.VIN}...`);
            const response = await this.makeRequest(`/vehicles/${vehicleTag}/wake_up`, 'POST');
            // Check if the vehicle is awake
            if (response.response.state !== 'online') {
                logger_1.default.info('Vehicle not yet online, waiting...');
                // In a production scenario, we might retry or wait, but for now, we'll assume it will wake up
            }
            else {
                logger_1.default.info('Vehicle is now online');
            }
        }
        catch (error) {
            logger_1.default.error(`Failed to wake up vehicle: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    /**
     * Get the current telemetry configuration status for a vehicle
     */
    static async getTelemetryConfigStatus(vehicleTag) {
        try {
            logger_1.default.info(`Getting telemetry config status for vehicle ${this.VIN}...`);
            const response = await this.makeRequest(`/vehicles/${vehicleTag}/fleet_telemetry_config`);
            return response.response;
        }
        catch (error) {
            logger_1.default.error(`Failed to get telemetry config status: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    /**
     * Check for any telemetry errors reported by the vehicle
     */
    static async getTelemetryErrors(vehicleTag) {
        try {
            logger_1.default.info(`Checking telemetry errors for vehicle ${this.VIN}...`);
            const response = await this.makeRequest(`/vehicles/${vehicleTag}/fleet_telemetry_errors`);
            return response.response;
        }
        catch (error) {
            logger_1.default.error(`Failed to get telemetry errors: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    /**
     * IMPORTANT: This method requires using Tesla's vehicle command HTTP proxy to sign the request
     * with your private key or implementing JWS signing. It should NOT be called directly.
     *
     * This is a placeholder to document the API - in production, use Tesla's proxy tool or implement JWS signing
     */
    static async configureTelemetry(config) {
        logger_1.default.warn(`
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
    static async checkVehicleStatus(vehicleTag) {
        try {
            const response = await this.makeRequest(`/vehicles/${vehicleTag}/fleet_status`);
            const status = response.response.online_state;
            logger_1.default.info(`Vehicle online status: ${status}`);
            return status;
        }
        catch (error) {
            logger_1.default.error(`Failed to check vehicle status: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
}
TeslaApiService.API_BASE_URL = process.env.TESLA_API_BASE_URL || 'https://fleet-api.prd.na.vn.cloud.tesla.com/api/1';
TeslaApiService.ACCESS_TOKEN = process.env.TESLA_ACCESS_TOKEN || '';
TeslaApiService.VIN = process.env.TESLA_VIN || '';
exports.default = TeslaApiService;
