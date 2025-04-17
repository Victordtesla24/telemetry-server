import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import TelemetryServer from './services/telemetryServer';
import ClientServer from './services/clientServer';
import AuthService from './services/auth';
import Logger from './utils/logger';
import { ServerConfig } from './types/telemetry';

// Load environment variables
dotenv.config();

// Define server configuration
const config: ServerConfig = {
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
  AuthService.validateJwtSecret();
  
  Logger.info('Environment variables validated successfully');
} catch (error) {
  if (error instanceof Error) {
    Logger.error(`CRITICAL ERROR: ${error.message}`);
  } else {
    Logger.error('CRITICAL ERROR: Unknown error validating environment variables');
  }
  process.exit(1);
}

// Create server - Fly.io proxy handles TLS termination, so we use HTTP internally.
let server: http.Server;

// Always create an HTTP server
server = http.createServer();
Logger.info('HTTP server created. Expecting TLS termination at proxy.');

// Initialize client and telemetry servers, passing the http.Server instance
const clientServer = new ClientServer(server);
const telemetryServer = new TelemetryServer(server, clientServer);

// Handle upgrade requests to determine which WebSocket server should handle them
server.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
  try {
    // Parse URL to determine which server should handle the request
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname : '/';
    
    // Handle client connections to /stream
    if (pathname === '/stream') {
      Logger.debug(`Client WebSocket connection attempt to ${pathname}`);
      clientServer.handleUpgrade(request, socket, head);
    } 
    // Handle vehicle connections to the root path
    else if (pathname === '/') {
      Logger.debug(`Vehicle WebSocket connection attempt to ${pathname}`);
      telemetryServer.handleUpgrade(request, socket, head);
    } 
    // Reject all other paths
    else {
      Logger.warn(`WebSocket connection attempt to invalid path: ${pathname}`);
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  } catch (error) {
    Logger.error(`Error handling WebSocket upgrade: ${error instanceof Error ? error.message : 'Unknown error'}`);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

// Start the client heartbeat
clientServer.startHeartbeat(30000);

// Start the server
// Listen on the port specified by Fly (process.env.PORT) or default (ensure default matches fly.toml internal_port)
const internalPort = parseInt(process.env.PORT || '8080', 10); // Use 8080 as default to match fly expectations

server.listen(internalPort, () => {
  Logger.info(`Telemetry server listening on internal port ${internalPort}`);
  // Log endpoints based on internal port, WSS assumes external TLS termination
  Logger.info(`Vehicle WebSocket endpoint expected externally at wss://<your-domain>/`);
  Logger.info(`Client WebSocket endpoint expected externally at wss://<your-domain>/stream`);
}); 