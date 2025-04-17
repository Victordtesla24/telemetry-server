# Use an official Node.js runtime as a parent image
FROM node:18-alpine AS base

# Set the working directory in the container
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
# Copy package.json and package-lock.json first
COPY package.json package-lock.json* ./
# Install production dependencies
RUN npm install --omit=dev

# Rebuild the source code only when needed
FROM base AS builder
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
# Compile TypeScript source code
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
ENV NODE_ENV production

# Set user
USER node
WORKDIR /app

# Copy built application artifacts
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/src/protos ./dist/protos

# Expose port 8443 (or the one specified in env)
# Fly.io will map internal port 8443 to external 443 (WSS)
EXPOSE 8443

# Run the application
CMD ["node", "dist/index.js"] 