import WebSocket from 'ws';
import { IncomingMessage, Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import path from 'path';
import * as protobuf from 'protobufjs';
import Logger from '../utils/logger';
import ClientServer from './clientServer';
import { 
  TelemetryMessage, 
  TelemetryDataMessage,
  TelemetryConnectivityMessage,
  isTelemetryDataMessage,
  isTelemetryConnectivityMessage,
  isTelemetryErrorMessage,
  isTelemetryAlertMessage
} from '../types/telemetry';

/**
 * Service for managing WebSocket connections from Tesla vehicles
 */
class TelemetryServer {
  private wss: WebSocket.Server;
  private clientServer: ClientServer;
  private vehicleConnections: Map<string, WebSocket> = new Map();
  private protoRoot: protobuf.Root | null = null;
  private PayloadType: protobuf.Type | null = null;
  
  /**
   * Initialize the telemetry WebSocket server on the given HTTP or HTTPS server
   */
  constructor(server: HttpServer | HttpsServer, clientServer: ClientServer) {
    // Store reference to the client server for broadcasting
    this.clientServer = clientServer;
    
    // Create a WebSocket server with noServer option
    // This allows us to handle the upgrade ourselves
    this.wss = new WebSocket.Server({ 
      noServer: true,
      // Optionally verify certificates if mTLS is enabled
      // this is set in the HTTPS server configuration
    });
    
    Logger.info('Tesla Telemetry WebSocket server initialized');
    
    // Load protobuf definitions asynchronously
    this.loadProtoDefinitions();
    
    // Set up event handlers
    this.setupServerHandlers();
  }
  
  /**
   * Set up event handlers for the WebSocket server
   */
  private setupServerHandlers(): void {
    // Handle new connections
    this.wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      this.handleVehicleConnection(socket, request);
    });
    
    // Handle server errors
    this.wss.on('error', (error) => {
      Logger.error(`Telemetry WebSocket server error: ${error.message}`);
    });
    
    Logger.debug('Telemetry WebSocket server event handlers set up');
  }
  
  /**
   * Handle a new connection from a Tesla vehicle
   */
  private handleVehicleConnection(socket: WebSocket, request: IncomingMessage): void {
    // At this point we don't know which vehicle (VIN) is connecting
    // We'll get that from the first message
    Logger.info(`Vehicle connected from: ${request.socket.remoteAddress}`);
    
    // If mTLS is enabled, we can check the client certificate
    this.checkClientCertificate(request);
    
    // Set up message handler
    socket.on('message', (data: WebSocket.Data) => {
      this.handleVehicleMessage(socket, data);
    });
    
    // Handle disconnection
    socket.on('close', () => {
      // Try to find which vehicle disconnected
      let disconnectedVin: string | undefined;
      
      for (const [vin, conn] of this.vehicleConnections.entries()) {
        if (conn === socket) {
          disconnectedVin = vin;
          break;
        }
      }
      
      if (disconnectedVin) {
        this.vehicleConnections.delete(disconnectedVin);
        Logger.info(`Vehicle ${disconnectedVin} disconnected`);
        
        // Notify clients that vehicle is disconnected
        const disconnectMessage: TelemetryConnectivityMessage = {
          vin: disconnectedVin,
          connectionId: '',
          status: 'DISCONNECTED',
          timestamp: new Date().toISOString()
        };
        this.clientServer.broadcastTelemetry(disconnectMessage);
      } else {
        Logger.info('Unknown vehicle disconnected');
      }
    });
    
    // Handle errors
    socket.on('error', (error) => {
      Logger.error(`Vehicle socket error: ${error.message}`);
    });
  }
  
  /**
   * If mTLS is enabled, check the client certificate
   */
  private checkClientCertificate(request: IncomingMessage): void {
    try {
      const socket = request.socket as any;
      
      // Check if the socket has a peer certificate (mTLS)
      if (socket.getPeerCertificate && socket.authorized !== undefined) {
        const cert = socket.getPeerCertificate();
        
        if (socket.authorized) {
          Logger.info(`Vehicle provided valid certificate: Subject=${cert.subject?.CN}, Issuer=${cert.issuer?.CN}`);
        } else {
          Logger.warn(`Vehicle provided invalid certificate: Subject=${cert.subject?.CN}, Issuer=${cert.issuer?.CN}, Error=${socket.authorizationError}`);
        }
      } else {
        // mTLS not enabled or not using TLS
        Logger.debug('No client certificate validation (mTLS not enabled)');
      }
    } catch (error) {
      Logger.error(`Error checking client certificate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Handle a message from a Tesla vehicle
   */
  private handleVehicleMessage(socket: WebSocket, data: WebSocket.Data): void {
    try {
      // Check if protobuf definitions are loaded
      if (!this.PayloadType) {
        Logger.error('Protobuf definitions not loaded, cannot process message.');
        return;
      }

      // Parse the message
      let messageObject: any;

      // Determine if the message is binary (protobuf) or text (JSON)
      if (Buffer.isBuffer(data)) {
        // Binary data - assumed to be protobuf
        try {
          // Decode the buffer using the loaded Payload type
          const decodedMessage = this.PayloadType.decode(data);
          // Convert the decoded message to a plain JavaScript object
          messageObject = this.PayloadType.toObject(decodedMessage, {
            longs: String, // Represent 64-bit integers as strings
            enums: String, // Represent enums as strings
            bytes: String, // Represent bytes as base64 strings
            defaults: true, // Include default values
            arrays: true, // Copy arrays
            objects: true, // Copy objects
            oneofs: true // Represent oneofs as virtual fields
          });
          Logger.debug(`Received and decoded protobuf message from vehicle (${data.length} bytes)`);
        } catch (protoError) {
          Logger.error(`Failed to decode protobuf message: ${protoError instanceof Error ? protoError.message : 'Unknown error'}`);
          // Optionally log the raw buffer (hex) for debugging, be mindful of size/PII
          // Logger.debug(`Raw buffer: ${data.toString('hex')}`)
          return; // Stop processing if decoding fails
        }
      } else if (typeof data === 'string') {
        // Text data - assume it's JSON (less likely from vehicle but handle)
        try {
          messageObject = JSON.parse(data);
          Logger.debug('Received text message (assumed JSON) from vehicle');
        } catch (jsonError) {
          Logger.error(`Failed to parse text message: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`);
          return;
        }
      } else {
        Logger.warn('Received message of unknown type, ignoring.');
        return;
      }

      // Extract VIN from the message
      if (!messageObject || typeof messageObject !== 'object' || !('vin' in messageObject) || typeof messageObject.vin !== 'string') {
        Logger.warn('Received message without valid VIN, ignoring');
        return;
      }
      
      const vin = messageObject.vin;
      
      // Map this socket to the VIN if not already done
      if (!this.vehicleConnections.has(vin)) {
        this.vehicleConnections.set(vin, socket);
        Logger.info(`Vehicle identified: VIN=${vin}`);
        
        // Notify clients that a new vehicle is connected
        const connectMessage: TelemetryConnectivityMessage = {
          vin: vin,
          connectionId: '',
          status: 'CONNECTED',
          timestamp: new Date().toISOString()
        };
        this.clientServer.broadcastTelemetry(connectMessage);
      }
      
      // Try to convert to a strongly typed message
      let typedMessage: TelemetryMessage;
      
      // Check for properties that indicate message type
      if ('data' in messageObject && Array.isArray(messageObject.data)) {
        typedMessage = messageObject as TelemetryDataMessage;
      } else if ('status' in messageObject && (messageObject.status === 'CONNECTED' || messageObject.status === 'DISCONNECTED')) {
        typedMessage = messageObject as TelemetryConnectivityMessage;
      } else if ('errors' in messageObject && Array.isArray(messageObject.errors)) {
        typedMessage = messageObject as TelemetryMessage;
      } else if ('alerts' in messageObject && Array.isArray(messageObject.alerts)) {
        typedMessage = messageObject as TelemetryMessage;
      } else {
        // Unknown message type, but forward it anyway
        Logger.warn(`Received unknown message type ${typeof messageObject === 'object' && 'vin' in messageObject ? `from VIN=${messageObject.vin}` : ''}`);
        typedMessage = messageObject as TelemetryMessage;
      }
      
      // Handle different message types
      this.processMessage(typedMessage);
      
      // Send acknowledgment for the message (if delivery_policy requires it)
      this.sendAcknowledgment(socket, typedMessage);
      
    } catch (error) {
      Logger.error(`Error handling vehicle message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Process a telemetry message based on its type
   */
  private processMessage(message: TelemetryMessage): void {
    try {
      // Log message differently based on type
      if (isTelemetryDataMessage(message)) {
        // Data message - most common
        Logger.debug(`Received data message from VIN=${message.vin} with ${message.data.length} data points`);
        
        // Forward the data to connected clients
        this.clientServer.broadcastTelemetry(message);
      }
      else if (isTelemetryConnectivityMessage(message)) {
        // Connectivity message
        Logger.info(`Received connectivity message from VIN=${message.vin}: status=${message.status}`);
        
        // Forward the connectivity status to clients
        this.clientServer.broadcastTelemetry(message);
      }
      else if (isTelemetryErrorMessage(message)) {
        // Error message
        Logger.warn(`Received error message from VIN=${message.vin} with ${message.errors.length} errors`);
        message.errors.forEach(error => {
          Logger.warn(`Vehicle Error: Code=${error.code}, Message=${error.message}`);
        });
        
        // Forward the errors to clients
        this.clientServer.broadcastTelemetry(message);
      }
      else if (isTelemetryAlertMessage(message)) {
        // Alert message
        Logger.info(`Received alert message from VIN=${message.vin} with ${message.alerts.length} alerts`);
        
        // Forward the alerts to clients
        this.clientServer.broadcastTelemetry(message);
      }
      else {
        // Unknown message type, but forward it anyway
        Logger.warn(`Received unknown message type ${typeof message === 'object' && 'vin' in message ? `from VIN=${(message as {vin: string}).vin}` : ''}`);
        this.clientServer.broadcastTelemetry(message);
      }
    } catch (error) {
      Logger.error(`Error processing message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Send an acknowledgment for a telemetry message if needed
   */
  private sendAcknowledgment(socket: WebSocket, message: TelemetryMessage): void {
    // Initially, we're using the default delivery policy which doesn't require acknowledgments
    // If delivery_policy is set to 'latest', we would need to send acks
    // For now, this is a minimal implementation to be expanded later
    
    try {
      // Only send acks for data messages
      if (!isTelemetryDataMessage(message)) {
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
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(ack));
        Logger.debug(`Sent acknowledgment to VIN=${message.vin}`);
      }
    } catch (error) {
      Logger.error(`Error sending acknowledgment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Get the current count of connected vehicles
   */
  public getVehicleCount(): number {
    return this.vehicleConnections.size;
  }
  
  /**
   * Get a list of connected vehicle VINs
   */
  public getConnectedVehicles(): string[] {
    return Array.from(this.vehicleConnections.keys());
  }
  
  /**
   * Handle an HTTP upgrade request to WebSocket for vehicle connections
   */
  public handleUpgrade(request: IncomingMessage, socket: any, head: Buffer): void {
    // For vehicle connections, we don't do JWT authentication
    // Instead we rely on mTLS if enabled, and validate VIN on first message
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      // Emit connection event to trigger our connection handler
      this.wss.emit('connection', ws, request);
    });
  }
  
  /**
   * Asynchronously load protobuf definitions
   */
  private async loadProtoDefinitions(): Promise<void> {
    try {
      const protoPath = path.join(__dirname, '../protos/vehicle_data.proto');
      this.protoRoot = await protobuf.load(protoPath);
      this.PayloadType = this.protoRoot.lookupType("telemetry.vehicle_data.Payload");
      Logger.info('Protobuf definitions loaded successfully.');
    } catch (error) {
      Logger.error(`CRITICAL ERROR: Failed to load protobuf definitions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Consider exiting if protos are essential and fail to load
      process.exit(1);
    }
  }
}

export default TelemetryServer; 