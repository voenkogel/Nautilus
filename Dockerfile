# Dockerfile

# --- Stage 1: Build the Frontend ---
# Use a specific Node.js version for consistency
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and lock files first to leverage Docker cache
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the React frontend for production
# This will create an optimized 'dist' folder
RUN npm run build


# --- Stage 2: Production Image ---
# Use a fresh, lightweight Node.js image for the final stage
FROM node:18-alpine

# Set the working directory for the server
WORKDIR /app

# Set all environment variables with their default values.
# This makes the image self-contained and documents its configuration.
# These can all be overridden at runtime.
ENV NAUTILUS_SERVER_PORT=3069
ENV NAUTILUS_CLIENT_PORT=3070
ENV NAUTILUS_PAGE_TITLE="Nautilus"
ENV NAUTILUS_HEALTH_CHECK_INTERVAL=20000
ENV NAUTILUS_API_POLLING_INTERVAL=5000
ENV NAUTILUS_HOST="localhost"
ENV NODE_ENV=production

# Copy the root package.json and install production server dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy server source code and the final config.json
COPY server/ ./server/
COPY config.json ./server/

# Copy the built frontend from the 'builder' stage
# This places the optimized React app into a 'public' directory that the server will use
COPY --from=builder /app/dist ./server/public

# Expose the port the server will run on
EXPOSE ${NAUTILUS_SERVER_PORT}

# The command to run the application
# This starts the Node.js server, which will also serve the frontend
CMD ["node", "server/index.js"]
