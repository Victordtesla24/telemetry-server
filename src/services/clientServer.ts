import WebSocket from 'ws';
import { IncomingMessage, Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import AuthService from './auth';
import Logger from '../utils/logger';
import { TelemetryMessage } from '../types/telemetry';

/**
 * Service for managing WebSocket connections from dashboard clients
 */
class ClientServer {
  private wss: WebSocket.Server;
  private clients: Set<WebSocket> = new Set();
  
  /**
   * Initialize the client WebSocket server on the given HTTP or HTTPS server
   */
  constructor(server: HttpServer | HttpsServer) {
    // Create a WebSocket server on the /stream path
    this.wss = new WebSocket.Server({ 
      noServer: true
    });

    Logger.info('Client WebSocket server initialized');
    
    // Set up the event handlers
    this.setupSocketHandlers();
  }
  
  /**
   * Set up event handlers for new WebSocket connections
   */
  private setupSocketHandlers(): void {
    this.wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      // Add the client to our set
      this.clients.add(socket);
      Logger.info(`Client connected: ${request.socket.remoteAddress}, total clients: ${this.clients.size}`);
      
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
        Logger.info(`Client disconnected: ${request.socket.remoteAddress}, remaining clients: ${this.clients.size}`);
      });
      
      // Handle socket errors
      socket.on('error', (error) => {
        Logger.error(`Client socket error: ${error.message}`);
        this.clients.delete(socket);
      });
      
      // Handle pings to keep the connection alive (optional)
      socket.on('pong', () => {
        (socket as any).isAlive = true;
      });
    });
  }
  
  /**
   * Handle an HTTP upgrade request to WebSocket
   */
  public handleUpgrade(request: IncomingMessage, socket: any, head: Buffer): void {
    try {
      // Authenticate the request
      const authData = AuthService.authenticateWebSocketRequest(request);
      if (!authData) {
        // Authentication failed, close the connection
        Logger.warn(`Client authentication failed, rejecting WebSocket connection from ${request.socket.remoteAddress}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      
      // Authentication successful, upgrade the connection
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        // Store the auth data with the socket for later reference
        (ws as any).authData = authData;
        
        // Emit the connection event to trigger our connection handler
        this.wss.emit('connection', ws, request);
      });
    } catch (error) {
      Logger.error(`Error handling WebSocket upgrade: ${error instanceof Error ? error.message : 'Unknown error'}`);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }
  
  /**
   * Send a message to a specific client
   */
  private sendToClient(client: WebSocket, data: any): void {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    } catch (error) {
      Logger.error(`Error sending to client: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Broadcast a telemetry message to all connected clients
   */
  public broadcastTelemetry(telemetryMessage: TelemetryMessage): void {
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
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageJson);
          clientCount++;
        }
      }
      
      // Only log broadcast details in debug mode - these would be very frequent
      Logger.debug(`Broadcast telemetry to ${clientCount} clients`);
    } catch (error) {
      Logger.error(`Error broadcasting telemetry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Start a heartbeat to ping clients and detect disconnections
   */
  public startHeartbeat(interval: number = 30000): void {
    setInterval(() => {
      for (const client of this.clients) {
        if ((client as any).isAlive === false) {
          // Client hasn't responded to ping, terminate it
          client.terminate();
          this.clients.delete(client);
          continue;
        }
        
        // Mark as not alive until we get a pong
        (client as any).isAlive = false;
        
        // Send ping
        client.ping();
      }
    }, interval);
    
    Logger.info(`Started client heartbeat with interval: ${interval}ms`);
  }
  
  /**
   * Get the current count of connected clients
   */
  public getClientCount(): number {
    return this.clients.size;
  }
}

export default ClientServer; 