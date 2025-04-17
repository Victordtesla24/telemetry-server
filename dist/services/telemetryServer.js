"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const logger_1 = __importDefault(require("../utils/logger"));
const telemetry_1 = require("../types/telemetry");
/**
 * Service for managing WebSocket connections from Tesla vehicles
 */
class TelemetryServer {
    /**
     * Initialize the telemetry WebSocket server on the given HTTPS server
     */
    constructor(server, clientServer) {
        this.vehicleConnections = new Map();
        // Store reference to the client server for broadcasting
        this.clientServer = clientServer;
        // Create a WebSocket server with noServer option
        // This allows us to handle the upgrade ourselves
        this.wss = new ws_1.default.Server({
            noServer: true,
            // Optionally verify certificates if mTLS is enabled
            // this is set in the HTTPS server configuration
        });
        logger_1.default.info('Tesla Telemetry WebSocket server initialized');
        // Set up event handlers
        this.setupServerHandlers();
    }
    /**
     * Set up event handlers for the WebSocket server
     */
    setupServerHandlers() {
        // Handle new connections
        this.wss.on('connection', (socket, request) => {
            this.handleVehicleConnection(socket, request);
        });
        // Handle server errors
        this.wss.on('error', (error) => {
            logger_1.default.error(`Telemetry WebSocket server error: ${error.message}`);
        });
        logger_1.default.debug('Telemetry WebSocket server event handlers set up');
    }
    /**
     * Handle a new connection from a Tesla vehicle
     */
    handleVehicleConnection(socket, request) {
        // At this point we don't know which vehicle (VIN) is connecting
        // We'll get that from the first message
        logger_1.default.info(`Vehicle connected from: ${request.socket.remoteAddress}`);
        // If mTLS is enabled, we can check the client certificate
        this.checkClientCertificate(request);
        // Set up message handler
        socket.on('message', (data) => {
            this.handleVehicleMessage(socket, data);
        });
        // Handle disconnection
        socket.on('close', () => {
            // Try to find which vehicle disconnected
            let disconnectedVin;
            for (const [vin, conn] of this.vehicleConnections.entries()) {
                if (conn === socket) {
                    disconnectedVin = vin;
                    break;
                }
            }
            if (disconnectedVin) {
                this.vehicleConnections.delete(disconnectedVin);
                logger_1.default.info(`Vehicle ${disconnectedVin} disconnected`);
                // Notify clients that vehicle is disconnected
                const disconnectMessage = {
                    vin: disconnectedVin,
                    connectionId: '',
                    status: 'DISCONNECTED',
                    timestamp: new Date().toISOString()
                };
                this.clientServer.broadcastTelemetry(disconnectMessage);
            }
            else {
                logger_1.default.info('Unknown vehicle disconnected');
            }
        });
        // Handle errors
        socket.on('error', (error) => {
            logger_1.default.error(`Vehicle socket error: ${error.message}`);
        });
    }
    /**
     * If mTLS is enabled, check the client certificate
     */
    checkClientCertificate(request) {
        var _a, _b, _c, _d;
        try {
            const socket = request.socket;
            // Check if the socket has a peer certificate (mTLS)
            if (socket.getPeerCertificate && socket.authorized !== undefined) {
                const cert = socket.getPeerCertificate();
                if (socket.authorized) {
                    logger_1.default.info(`Vehicle provided valid certificate: Subject=${(_a = cert.subject) === null || _a === void 0 ? void 0 : _a.CN}, Issuer=${(_b = cert.issuer) === null || _b === void 0 ? void 0 : _b.CN}`);
                }
                else {
                    logger_1.default.warn(`Vehicle provided invalid certificate: Subject=${(_c = cert.subject) === null || _c === void 0 ? void 0 : _c.CN}, Issuer=${(_d = cert.issuer) === null || _d === void 0 ? void 0 : _d.CN}, Error=${socket.authorizationError}`);
                }
            }
            else {
                // mTLS not enabled or not using TLS
                logger_1.default.debug('No client certificate validation (mTLS not enabled)');
            }
        }
        catch (error) {
            logger_1.default.error(`Error checking client certificate: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Handle a message from a Tesla vehicle
     */
    handleVehicleMessage(socket, data) {
        try {
            // Parse the message
            let messageJson;
            // Determine if the message is binary (protobuf) or text (JSON)
            if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
                // Binary data - this would be protobuf format
                // In a production scenario we'd use a protobuf library to decode this
                // For now, we'll do minimal logging and let the message pass through
                logger_1.default.debug(`Received binary message from vehicle (${data.length} bytes)`);
                // For initial implementation, we'll assume a simple JSON format inside the binary
                // In a real implementation, this would use protobuf decoding
                const jsonString = Buffer.isBuffer(data)
                    ? data.toString('utf8')
                    : Buffer.from(data).toString('utf8');
                try {
                    // Try to parse as JSON, if it fails, we'll just log and return
                    messageJson = JSON.parse(jsonString);
                }
                catch (jsonError) {
                    logger_1.default.error(`Failed to parse binary message as JSON: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`);
                    return;
                }
            }
            else {
                // Text data - assume it's already JSON
                try {
                    messageJson = JSON.parse(data.toString());
                }
                catch (jsonError) {
                    logger_1.default.error(`Failed to parse text message: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`);
                    return;
                }
            }
            // Extract VIN from the message
            if (!messageJson || typeof messageJson !== 'object' || !('vin' in messageJson) || typeof messageJson.vin !== 'string') {
                logger_1.default.warn('Received message without valid VIN, ignoring');
                return;
            }
            const vin = messageJson.vin;
            // Map this socket to the VIN if not already done
            if (!this.vehicleConnections.has(vin)) {
                this.vehicleConnections.set(vin, socket);
                logger_1.default.info(`Vehicle identified: VIN=${vin}`);
                // Notify clients that a new vehicle is connected
                const connectMessage = {
                    vin: vin,
                    connectionId: '',
                    status: 'CONNECTED',
                    timestamp: new Date().toISOString()
                };
                this.clientServer.broadcastTelemetry(connectMessage);
            }
            // Try to convert to a strongly typed message
            let typedMessage;
            // Check for properties that indicate message type
            if ('data' in messageJson && Array.isArray(messageJson.data)) {
                typedMessage = messageJson;
            }
            else if ('status' in messageJson && (messageJson.status === 'CONNECTED' || messageJson.status === 'DISCONNECTED')) {
                typedMessage = messageJson;
            }
            else if ('errors' in messageJson && Array.isArray(messageJson.errors)) {
                typedMessage = messageJson;
            }
            else if ('alerts' in messageJson && Array.isArray(messageJson.alerts)) {
                typedMessage = messageJson;
            }
            else {
                // Unknown message type, but forward it anyway
                logger_1.default.warn(`Received unknown message type ${typeof messageJson === 'object' && 'vin' in messageJson ? `from VIN=${messageJson.vin}` : ''}`);
                typedMessage = messageJson;
            }
            // Handle different message types
            this.processMessage(typedMessage);
            // Send acknowledgment for the message (if delivery_policy requires it)
            this.sendAcknowledgment(socket, typedMessage);
        }
        catch (error) {
            logger_1.default.error(`Error handling vehicle message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Process a telemetry message based on its type
     */
    processMessage(message) {
        try {
            // Log message differently based on type
            if ((0, telemetry_1.isTelemetryDataMessage)(message)) {
                // Data message - most common
                logger_1.default.debug(`Received data message from VIN=${message.vin} with ${message.data.length} data points`);
                // Forward the data to connected clients
                this.clientServer.broadcastTelemetry(message);
            }
            else if ((0, telemetry_1.isTelemetryConnectivityMessage)(message)) {
                // Connectivity message
                logger_1.default.info(`Received connectivity message from VIN=${message.vin}: status=${message.status}`);
                // Forward the connectivity status to clients
                this.clientServer.broadcastTelemetry(message);
            }
            else if ((0, telemetry_1.isTelemetryErrorMessage)(message)) {
                // Error message
                logger_1.default.warn(`Received error message from VIN=${message.vin} with ${message.errors.length} errors`);
                message.errors.forEach(error => {
                    logger_1.default.warn(`Vehicle Error: Code=${error.code}, Message=${error.message}`);
                });
                // Forward the errors to clients
                this.clientServer.broadcastTelemetry(message);
            }
            else if ((0, telemetry_1.isTelemetryAlertMessage)(message)) {
                // Alert message
                logger_1.default.info(`Received alert message from VIN=${message.vin} with ${message.alerts.length} alerts`);
                // Forward the alerts to clients
                this.clientServer.broadcastTelemetry(message);
            }
            else {
                // Unknown message type, but forward it anyway
                logger_1.default.warn(`Received unknown message type ${typeof message === 'object' && 'vin' in message ? `from VIN=${message.vin}` : ''}`);
                this.clientServer.broadcastTelemetry(message);
            }
        }
        catch (error) {
            logger_1.default.error(`Error processing message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Send an acknowledgment for a telemetry message if needed
     */
    sendAcknowledgment(socket, message) {
        // Initially, we're using the default delivery policy which doesn't require acknowledgments
        // If delivery_policy is set to 'latest', we would need to send acks
        // For now, this is a minimal implementation to be expanded later
        try {
            // Only send acks for data messages
            if (!(0, telemetry_1.isTelemetryDataMessage)(message)) {
                return;
            }
            // In a real implementation, we would use protobuf to encode the ack
            // For now, we'll use a simple JSON format
            const ack = {
                type: 'ack',
                vin: message.vin,
                timestamp: new Date().toISOString()
            };
            // Send the ack if the socket is open
            if (socket.readyState === ws_1.default.OPEN) {
                socket.send(JSON.stringify(ack));
                logger_1.default.debug(`Sent acknowledgment to VIN=${message.vin}`);
            }
        }
        catch (error) {
            logger_1.default.error(`Error sending acknowledgment: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Get the current count of connected vehicles
     */
    getVehicleCount() {
        return this.vehicleConnections.size;
    }
    /**
     * Get a list of connected vehicle VINs
     */
    getConnectedVehicles() {
        return Array.from(this.vehicleConnections.keys());
    }
    /**
     * Handle an HTTP upgrade request to WebSocket for vehicle connections
     */
    handleUpgrade(request, socket, head) {
        // For vehicle connections, we don't do JWT authentication
        // Instead we rely on mTLS if enabled, and validate VIN on first message
        this.wss.handleUpgrade(request, socket, head, (ws) => {
            // Emit connection event to trigger our connection handler
            this.wss.emit('connection', ws, request);
        });
    }
}
exports.default = TelemetryServer;
