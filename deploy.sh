#!/bin/bash
set -e

# Build the project
echo "Building Telemetry Server..."
npm run build

# Verify the server can be started
echo "Checking for required environment variables..."
if [ -z "$JWT_SECRET" ]; then
  echo "ERROR: JWT_SECRET environment variable is not set"
  exit 1
fi

if [ -z "$TESLA_ACCESS_TOKEN" ]; then
  echo "ERROR: TESLA_ACCESS_TOKEN environment variable is not set"
  exit 1
fi

if [ -z "$TESLA_VIN" ]; then
  echo "ERROR: TESLA_VIN environment variable is not set"
  exit 1
fi

echo "Environment variables validated successfully"

# Deploy to Fly.io (requires flyctl to be installed and authenticated)
echo "Deploying to Fly.io..."
# First, we set the required secrets
flyctl secrets set JWT_SECRET="$JWT_SECRET" \
  TESLA_ACCESS_TOKEN="$TESLA_ACCESS_TOKEN" \
  TESLA_VIN="$TESLA_VIN" \
  TESLA_API_BASE_URL="$TESLA_API_BASE_URL" \
  NODE_ENV="production"

# Then, deploy the application
flyctl deploy

echo "Deployment complete!"
echo ""
echo "IMPORTANT POST-DEPLOYMENT STEPS:"
echo "1. Verify the server is accessible at: https://<your-fly-domain>/health"
echo "2. Verify WebSocket endpoints:"
echo "   - Vehicle endpoint: wss://<your-fly-domain>/"
echo "   - Client endpoint: wss://<your-fly-domain>/stream"
echo "3. Call the POST .../fleet_telemetry_config endpoint to configure the vehicle to stream telemetry"
echo "   This requires using Tesla's vehicle command HTTP proxy tool to sign the request with your private key"
echo "" 