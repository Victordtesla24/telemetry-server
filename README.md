# Tesla Telemetry Server

A real-time server for handling WebSocket connections from Tesla vehicles and streaming telemetry data to dashboard clients.

## Overview

The Tesla Telemetry Server has two primary functions:
1. Accept and maintain WebSocket connections from Tesla vehicles at the root path (`/`)
2. Stream the received telemetry data to authenticated dashboard clients at the `/stream` path

## Prerequisites

Before deploying this server, ensure:
- You have a valid Tesla developer account
- You have completed the partner registration process
- You have deployed the Public Key Server serving your public key at the required `.well-known` path
- You have the required environment variables (see Configuration)

## Installation

```bash
# Clone the repository
git clone [your-repo-url]
cd telemetry-server

# Install dependencies
npm install
```

## Configuration

The server requires the following environment variables:

### Required Environment Variables
- `JWT_SECRET` - Secret for signing JWT tokens for client authentication
- `TESLA_ACCESS_TOKEN` - Valid Tesla OAuth token for API access
- `TESLA_VIN` - Vehicle Identification Number for your Tesla
- `TESLA_API_BASE_URL` - Base URL for Tesla's Fleet API
- `PORT` - The port to run the server on (default: 3000)

### Optional Environment Variables (For Production)
- `CERT_PATH` - Path to SSL certificate
- `KEY_PATH` - Path to SSL private key
- `CA_PATH` - Path to CA certificate for mTLS
- `REQUEST_CLIENT_CERT` - Whether to request client certificates for mTLS (true/false)
- `NODE_ENV` - Environment (development/production)

## Development

```bash
# Run the development server
npm run dev

# Test the client WebSocket connection
npm run test-client

# Test the vehicle WebSocket connection (simulation)
npm run test-vehicle
```

## Deployment

### Fly.io Deployment (Recommended)

The easiest way to deploy this server is with Fly.io, which supports persistent WebSocket connections:

```bash
# Deploy to Fly.io
./deploy.sh
```

Flyctl will read the `fly.toml` configuration and deploy the application.

## Security

The Telemetry Server implements multiple security measures:
- HTTPS/TLS for all connections
- Optional mTLS for vehicle connections
- JWT authentication for dashboard clients
- Input validation for all incoming messages

## Architecture

- **Root Path (`/`):** WebSocket endpoint for Tesla vehicles. Accepts telemetry data streams from vehicles.
- **Stream Path (`/stream`):** WebSocket endpoint for dashboard clients. Requires JWT authentication.
- **Health Check (`/health`):** HTTP endpoint for monitoring the server status.

## Post-Deployment Steps

After deploying, you **MUST**:

1. Verify the server is running correctly by checking the health endpoint
2. Configure your Tesla vehicle to stream telemetry to the server using the Tesla Fleet API
   - This requires using the vehicle command HTTP proxy to sign the request with your private key
   - See Tesla's documentation for details on the `POST /fleet_telemetry_config` endpoint

## Adding Your Vehicle

To add your vehicle to the Telemetry Server:

1. Sign a request using your private key via Tesla's command proxy
2. Configure the vehicle to stream telemetry to your deployed server
3. Specify the host, port, and fields you want to receive

## Testing Manually

You can verify the server is working with:

```bash
# Check the health endpoint
curl https://<your-domain>/health

# Connect as a client (requires a valid JWT)
npm run test-client

# Simulate a vehicle connection
npm run test-vehicle
```

## References

For more information, see:
- Tesla Fleet API Documentation
- WebSocket Protocol (RFC 6455) 