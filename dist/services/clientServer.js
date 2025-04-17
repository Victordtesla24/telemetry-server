"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const auth_1 = __importDefault(require("./auth"));
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Service for managing WebSocket connections from dashboard clients
 */
class ClientServer {
    /**
     * Initialize the client WebSocket server on the given HTTP/HTTPS server
     */
    constructor(server) {
        this.clients = new Set();
        // Create a WebSocket server on the /stream path
        this.wss = new ws_1.default.Server({
            noServer: true
        });
        logger_1.default.info('Client WebSocket server initialized');
        // Set up the event handlers
        this.setupSocketHandlers();
    }
    /**
     * Set up event handlers for new WebSocket connections
     */
    setupSocketHandlers() {
        this.wss.on('connection', (socket, request) => {
            // Add the client to our set
            this.clients.add(socket);
            logger_1.default.info(`Client connected: ${request.socket.remoteAddress}, total clients: ${this.clients.size}`);
            // Send a welcome message
            this.sendToClient(socket, {
                type: 'connection_status',
                connected: true,
                timestamp: new Date().toISOString(),
                message: 'Connected to Tesla Telemetry Server'
            });
            // Handle socket closure
            socket.on('close', () => {
                this.clients.delete(socket);
                logger_1.default.info(`Client disconnected: ${request.socket.remoteAddress}, remaining clients: ${this.clients.size}`);
            });
            // Handle socket errors
            socket.on('error', (error) => {
                logger_1.default.error(`Client socket error: ${error.message}`);
                this.clients.delete(socket);
            });
            // Handle pings to keep the connection alive (optional)
            socket.on('pong', () => {
                socket.isAlive = true;
            });
        });
    }
    /**
     * Handle an HTTP upgrade request to WebSocket
     */
    handleUpgrade(request, socket, head) {
        try {
            // Authenticate the request
            const authData = auth_1.default.authenticateWebSocketRequest(request);
            if (!authData) {
                // Authentication failed, close the connection
                logger_1.default.warn(`Client authentication failed, rejecting WebSocket connection from ${request.socket.remoteAddress}`);
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
            // Authentication successful, upgrade the connection
            this.wss.handleUpgrade(request, socket, head, (ws) => {
                // Store the auth data with the socket for later reference
                ws.authData = authData;
                // Emit the connection event to trigger our connection handler
                this.wss.emit('connection', ws, request);
            });
        }
        catch (error) {
            logger_1.default.error(`Error handling WebSocket upgrade: ${error instanceof Error ? error.message : 'Unknown error'}`);
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
        }
    }
    /**
     * Send a message to a specific client
     */
    sendToClient(client, data) {
        try {
            if (client.readyState === ws_1.default.OPEN) {
                client.send(JSON.stringify(data));
            }
        }
        catch (error) {
            logger_1.default.error(`Error sending to client: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Broadcast a telemetry message to all connected clients
     */
    broadcastTelemetry(telemetryMessage) {
        if (this.clients.size === 0) {
            // No clients connected, no need to serialize the message
            return;
        }
        try {
            // Convert the message to a JSON string once
            const messageJson = JSON.stringify(telemetryMessage);
            // Send to all connected clients
            let clientCount = 0;
            for (const client of this.clients) {
                if (client.readyState === ws_1.default.OPEN) {
                    client.send(messageJson);
                    clientCount++;
                }
            }
            // Only log broadcast details in debug mode - these would be very frequent
            logger_1.default.debug(`Broadcast telemetry to ${clientCount} clients`);
        }
        catch (error) {
            logger_1.default.error(`Error broadcasting telemetry: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Start a heartbeat to ping clients and detect disconnections
     */
    startHeartbeat(interval = 30000) {
        setInterval(() => {
            for (const client of this.clients) {
                if (client.isAlive === false) {
                    // Client hasn't responded to ping, terminate it
                    client.terminate();
                    this.clients.delete(client);
                    continue;
                }
                // Mark as not alive until we get a pong
                client.isAlive = false;
                // Send ping
                client.ping();
            }
        }, interval);
        logger_1.default.info(`Started client heartbeat with interval: ${interval}ms`);
    }
    /**
     * Get the current count of connected clients
     */
    getClientCount() {
        return this.clients.size;
    }
}
exports.default = ClientServer;
