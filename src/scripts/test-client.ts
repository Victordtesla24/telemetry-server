/**
 * Test client script to connect to the Telemetry Server
 * This simulates a dashboard client connecting to receive vehicle telemetry
 */

import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import readline from 'readline';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// JWT secret for signing tokens
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key';

// Server URL (default to localhost for testing)
const SERVER_URL = process.env.TELEMETRY_SERVER_URL || 'ws://localhost:3001/stream';

// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Generate a test JWT token
function generateToken(): string {
  const payload = {
    userId: 'test-client',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiration
  };
  
  return jwt.sign(payload, JWT_SECRET);
}

// Connect to the server
function connectToServer() {
  console.log(`Connecting to Telemetry Server at ${SERVER_URL}`);
  
  // Generate JWT token
  const token = generateToken();
  console.log(`Generated JWT token: ${token}`);
  
  // Create WebSocket connection with token
  const url = `${SERVER_URL}?token=${token}`;
  const ws = new WebSocket(url);
  
  // Handle connection open
  ws.on('open', () => {
    console.log('Connected to Telemetry Server');
    
    // Prompt user for actions
    showMenu(ws);
  });
  
  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('\nReceived message:');
      console.log(JSON.stringify(message, null, 2));
      
      // Show menu again after receiving a message
      showMenu(ws);
    } catch (error) {
      console.error('Error parsing message:', error);
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

// Show menu for user actions
function showMenu(ws: WebSocket) {
  rl.question('\nOptions:\n1. Stay connected (wait for messages)\n2. Send ping\n3. Disconnect\nChoose an option: ', (answer) => {
    switch (answer) {
      case '1':
        console.log('Waiting for messages...');
        break;
      
      case '2':
        console.log('Sending ping...');
        ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
        break;
      
      case '3':
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

// Start the connection
connectToServer(); 