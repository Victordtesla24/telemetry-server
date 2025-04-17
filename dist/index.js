"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
const url_1 = require("url");
const telemetryServer_1 = __importDefault(require("./services/telemetryServer"));
const clientServer_1 = __importDefault(require("./services/clientServer"));
const auth_1 = __importDefault(require("./services/auth"));
const logger_1 = __importDefault(require("./utils/logger"));
// Load environment variables
dotenv_1.default.config();
// Define server configuration
const config = {
    port: parseInt(process.env.PORT || '8443', 10),
    certPath: process.env.CERT_PATH,
    keyPath: process.env.KEY_PATH,
    caPath: process.env.CA_PATH,
    requestClientCert: process.env.REQUEST_CLIENT_CERT === 'true',
    jwtSecret: process.env.JWT_SECRET || '',
};
// Validate required environment variables
try {
    // Validate JWT secret is set
    auth_1.default.validateJwtSecret();
    logger_1.default.info('Environment variables validated successfully');
}
catch (error) {
    if (error instanceof Error) {
        logger_1.default.error(`CRITICAL ERROR: ${error.message}`);
    }
    else {
        logger_1.default.error('CRITICAL ERROR: Unknown error validating environment variables');
    }
    process.exit(1);
}
// Create HTTPS server if certificates are provided, otherwise fallback to HTTP (for development only)
let server;
if (config.certPath && config.keyPath && fs_1.default.existsSync(config.certPath) && fs_1.default.existsSync(config.keyPath)) {
    // HTTPS server options
    const httpsOptions = {
        key: fs_1.default.readFileSync(config.keyPath),
        cert: fs_1.default.readFileSync(config.certPath),
        // Only include CA if provided and exists
        ca: config.caPath && fs_1.default.existsSync(config.caPath)
            ? fs_1.default.readFileSync(config.caPath)
            : undefined,
        // Only request client certificates if specified
        requestCert: config.requestClientCert,
        rejectUnauthorized: false, // Accept even unverified client certificates, but log them
    };
    server = https_1.default.createServer(httpsOptions);
    logger_1.default.info('HTTPS server created with TLS certificates');
}
else {
    // Development-only HTTP server
    if (process.env.NODE_ENV === 'production') {
        logger_1.default.error('CRITICAL ERROR: Production environment requires TLS certificates');
        process.exit(1);
    }
    server = http_1.default.createServer();
    logger_1.default.warn('Development mode: Using HTTP server without TLS (not secure for production)');
}
// Initialize client and telemetry servers
const clientServer = new clientServer_1.default(server);
const telemetryServer = new telemetryServer_1.default(server, clientServer);
// Handle upgrade requests to determine which WebSocket server should handle them
server.on('upgrade', (request, socket, head) => {
    try {
        // Parse URL to determine which server should handle the request
        const pathname = request.url ? new url_1.URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname : '/';
        // Handle client connections to /stream
        if (pathname === '/stream') {
            logger_1.default.debug(`Client WebSocket connection attempt to ${pathname}`);
            clientServer.handleUpgrade(request, socket, head);
        }
        // Handle vehicle connections to the root path
        else if (pathname === '/') {
            logger_1.default.debug(`Vehicle WebSocket connection attempt to ${pathname}`);
            telemetryServer.handleUpgrade(request, socket, head);
        }
        // Reject all other paths
        else {
            logger_1.default.warn(`WebSocket connection attempt to invalid path: ${pathname}`);
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
        }
    }
    catch (error) {
        logger_1.default.error(`Error handling WebSocket upgrade: ${error instanceof Error ? error.message : 'Unknown error'}`);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
    }
});
// Start the client heartbeat
clientServer.startHeartbeat(30000);
// Start the server
server.listen(config.port, () => {
    logger_1.default.info(`Telemetry server listening on port ${config.port}`);
    logger_1.default.info(`Vehicle WebSocket endpoint: ${config.certPath ? 'wss' : 'ws'}://localhost:${config.port}/`);
    logger_1.default.info(`Client WebSocket endpoint: ${config.certPath ? 'wss' : 'ws'}://localhost:${config.port}/stream`);
});
