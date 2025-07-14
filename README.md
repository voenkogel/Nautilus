# Nautilus - Network Node Status Monitor

A real-time network monitoring dashboard built with React, TypeScript, and Node.js that displays the status of network nodes in a tree structure.

## 🔒 Security Notice

**Nautilus now includes authentication to protect configuration changes.**

- 🔐 **Admin password required** for settings and node editing
- 🛡️ **Server-side authentication** with session management  
- 📋 **Read [SECURITY.md](./SECURITY.md)** for setup instructions
- ⚠️ **Change default password (`1234`) for production use**

## Architecture Overview

### How the Server and Frontend Communicate

The application consists of two main components:

1. **Backend Server** (`server/index.js`) - Runs on `http://localhost:3001`
2. **Frontend React App** (`src/`) - Runs on `http://localhost:5173` (Vite dev server)

### Communication Flow

```
┌─────────────────┐    HTTP Requests     ┌─────────────────┐
│   React App     │ ────────────────────▶ │   Node.js API   │
│ (localhost:5173)│                      │ (localhost:3001) │
│                 │ ◀──────────────────── │                 │
└─────────────────┘    JSON Responses    └─────────────────┘
```

### API Endpoints

The backend provides these REST API endpoints:

- `GET /api/status` - Returns status of all monitored nodes
- `GET /api/status/:ip` - Returns status of a specific node by IP
- `POST /api/reload-config` - Reloads the tree configuration and updates monitored nodes
- `GET /health` - Health check for the monitoring server itself

### Data Flow

1. **Configuration Loading**: The server reads IP addresses from `config.json` on startup
2. **Health Monitoring**: Server pings all configured IPs every 20 seconds
3. **Frontend Polling**: React app polls the server every 5 seconds for status updates
4. **Real-time Updates**: Frontend displays color-coded node statuses based on server response

### Why They Don't Connect Immediately

When you run `npm run dev`, here's what happens:

1. **Vite starts** (frontend) - Usually starts first and faster
2. **Node.js server starts** (backend) - Takes a moment to initialize
3. **Initial connection attempts fail** - Frontend tries to connect before backend is ready
4. **Connection established** - Once both are running, polling begins

## Development Setup

### Prerequisites
- Node.js 18.18.0 or higher
1. **Copy environment file**:
   ```bash
   cp .env.example .env
   ```
4. **Port and Host Management**: Server and client ports/host are now managed by environment variables, not config
5. **Real-time Updates**: Frontend displays color-coded node statuses based on server response
2. **Set admin password** (change from default):
   ```bash
   # Edit .env file
### Customizing Polling Intervals
- **Backend health checks**: Edit `healthCheckInterval` in `config.json` (default: 20 seconds)
- **Frontend polling**: Edit `apiPollingInterval` in `config.json` (default: 5 seconds)

3. **Read security documentation**:
   ```bash
server: {
  healthCheckInterval: 20000,    // Health check frequency (20 seconds)
  corsOrigins: ['http://localhost:5173', ...] // Allowed frontend origins
}
```bash
npm run dev:full
```
This runs both the backend server and frontend development server concurrently.
client: {
  apiPollingInterval: 5000,      // How often frontend polls server (5 seconds)
}
# Terminal 2 - Start the frontend
npm run dev
```

### Scripts

- `npm run dev` - Start Vite development server (frontend only)
- `npm run server` - Start Node.js monitoring server (backend only)
- `npm run dev:full` - Start both server and frontend concurrently
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Configuration

### Adding New Nodes

To monitor additional nodes, edit `config.json` and add nodes with their IP addresses. The server will automatically pick up all IP addresses from this configuration file.

Example:
```typescript
{
  id: "new-node",
  title: "New Service",
  subtitle: "Description of the service",
  ip: "192.168.1.100",  // This IP will be monitored
  url: "https://new-service.example.com"
}
```

After updating the configuration, you can either:
1. Restart the server, or
2. Send a POST request to `/api/reload-config` to reload without restart

### Customizing Polling Intervals

- **Backend health checks**: Edit the `setInterval` value in `server/index.js` (default: 20 seconds)
- **Frontend polling**: Edit the interval in `src/hooks/useNodeStatus.ts` (default: 5 seconds)

## Project Structure

```
├── server/
│   └── index.js              # Backend monitoring server
├── src/
│   ├── components/
│   │   ├── Canvas.tsx        # Main tree visualization
│   │   ├── Card.tsx          # Individual node cards
│   │   └── StatusCard.tsx    # Status indicator component
│   ├── config/
│   │   └── appConfig.ts      # Centralized configuration (IPs, ports, intervals)
│   ├── hooks/
│   │   └── useNodeStatus.ts  # Status polling hook
│   └── ...
└── package.json
```

## Troubleshooting

### Frontend Can't Connect to Backend

1. **Check if backend is running**: Visit `http://localhost:3001/health`
2. **Check for CORS issues**: Backend has CORS enabled for all origins
3. **Check ports**: Ensure no other services are using ports 3001 or 5173
4. **Wait a moment**: Backend takes a few seconds to start up

### No Status Updates

1. **Check network connectivity**: The app simulates node health checks
2. **Check browser console**: Look for error messages in developer tools
3. **Verify configuration**: Ensure `appConfig.ts` has valid IP addresses

### PowerShell Execution Policy Issues

If you encounter script execution errors on Windows:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
