/**
 * Test vehicle script to simulate a Tesla vehicle sending telemetry data
 * This script connects to the telemetry server and sends various types of telemetry messages
 */

import WebSocket from 'ws';
import readline from 'readline';
import dotenv from 'dotenv';
import { 
  TelemetryDataMessage, 
  TelemetryDataPoint, 
  TelemetryConnectivityMessage,
  TelemetryErrorMessage,
  TelemetryAlertMessage 
} from '../types/telemetry';

// Load environment variables
dotenv.config();

// Server URL (default to localhost for testing)
const SERVER_URL = process.env.TELEMETRY_SERVER_URL || 'ws://localhost:8443/';
const TESLA_VIN = process.env.TESLA_VIN || 'TESTSAMPLE12345DEMO';

// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Connect to the telemetry server
 */
function connectToServer() {
  console.log(`Connecting to Telemetry Server at ${SERVER_URL} as vehicle ${TESLA_VIN}`);
  
  // Create WebSocket connection
  const ws = new WebSocket(SERVER_URL);
  
  // Handle connection open
  ws.on('open', () => {
    console.log('Connected to Telemetry Server');
    
    // Send initial connectivity message
    const connectMessage: TelemetryConnectivityMessage = {
      vin: TESLA_VIN,
      connectionId: `conn-${Date.now()}`,
      status: 'CONNECTED',
      timestamp: new Date().toISOString()
    };
    
    ws.send(JSON.stringify(connectMessage));
    console.log('Sent connection message');
    
    // Show menu
    showMenu(ws);
  });
  
  // Handle incoming messages (acknowledgments)
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('\nReceived acknowledgment:');
      console.log(JSON.stringify(message, null, 2));
      
      // Show menu again after receiving a message
      showMenu(ws);
    } catch (error) {
      console.error('Error parsing acknowledgment:', error);
    }
  });
  
  // Handle connection close
  ws.on('close', () => {
    console.log('Disconnected from Telemetry Server');
    process.exit(0);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    process.exit(1);
  });
}

/**
 * Show menu for user actions
 */
function showMenu(ws: WebSocket) {
  rl.question('\nOptions:\n1. Send telemetry data\n2. Send error message\n3. Send alert message\n4. Send disconnect\n5. Exit\nChoose an option: ', (answer) => {
    switch (answer) {
      case '1':
        sendTelemetryData(ws);
        break;
      
      case '2':
        sendErrorMessage(ws);
        break;
      
      case '3':
        sendAlertMessage(ws);
        break;
      
      case '4':
        sendDisconnectMessage(ws);
        break;
      
      case '5':
        console.log('Disconnecting...');
        ws.close();
        rl.close();
        break;
      
      default:
        console.log('Invalid option, please try again');
        showMenu(ws);
        break;
    }
  });
}

/**
 * Generate random telemetry data message
 */
function sendTelemetryData(ws: WebSocket) {
  // Create data points
  const dataPoints: TelemetryDataPoint[] = [
    {
      key: 'vehicle/state/soc',
      value: {
        doubleValue: Math.round(Math.random() * 100)
      }
    },
    {
      key: 'vehicle/state/speed',
      value: {
        doubleValue: Math.round(Math.random() * 120)
      }
    },
    {
      key: 'vehicle/state/odometer',
      value: {
        doubleValue: 12345.6 + (Math.random() * 10)
      }
    },
    {
      key: 'vehicle/state/charging',
      value: {
        boolValue: Math.random() > 0.8
      }
    },
    {
      key: 'vehicle/climate/temperature',
      value: {
        doubleValue: 20 + (Math.random() * 10)
      }
    },
    {
      key: 'vehicle/location/latitude',
      value: {
        doubleValue: 37.7749 + (Math.random() * 0.01)
      }
    },
    {
      key: 'vehicle/location/longitude',
      value: {
        doubleValue: -122.4194 + (Math.random() * 0.01)
      }
    }
  ];
  
  // Create telemetry data message
  const message: TelemetryDataMessage = {
    vin: TESLA_VIN,
    data: dataPoints,
    createdAt: new Date().toISOString()
  };
  
  // Send the message
  ws.send(JSON.stringify(message));
  console.log('Sent telemetry data');
  
  // Show menu after a short delay
  setTimeout(() => showMenu(ws), 500);
}

/**
 * Send an error message
 */
function sendErrorMessage(ws: WebSocket) {
  const errorMessage: TelemetryErrorMessage = {
    vin: TESLA_VIN,
    errors: [
      {
        code: 'ERR_CONNECTIVITY',
        message: 'Temporary connection issue',
        timestamp: new Date().toISOString()
      }
    ]
  };
  
  // Send the message
  ws.send(JSON.stringify(errorMessage));
  console.log('Sent error message');
  
  // Show menu after a short delay
  setTimeout(() => showMenu(ws), 500);
}

/**
 * Send an alert message
 */
function sendAlertMessage(ws: WebSocket) {
  const alertMessage: TelemetryAlertMessage = {
    vin: TESLA_VIN,
    alerts: [
      {
        type: 'TIRE_PRESSURE',
        message: 'Low tire pressure detected',
        timestamp: new Date().toISOString()
      }
    ]
  };
  
  // Send the message
  ws.send(JSON.stringify(alertMessage));
  console.log('Sent alert message');
  
  // Show menu after a short delay
  setTimeout(() => showMenu(ws), 500);
}

/**
 * Send a disconnect message
 */
function sendDisconnectMessage(ws: WebSocket) {
  const disconnectMessage: TelemetryConnectivityMessage = {
    vin: TESLA_VIN,
    connectionId: `conn-${Date.now()}`,
    status: 'DISCONNECTED',
    timestamp: new Date().toISOString()
  };
  
  // Send the message
  ws.send(JSON.stringify(disconnectMessage));
  console.log('Sent disconnect message');
  
  // Show menu after a short delay
  setTimeout(() => showMenu(ws), 500);
}

// Start the connection
connectToServer(); 