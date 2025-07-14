# Centralized Configuration

All application settings are now managed in a single file: `config.json`

## Configuration Structure

### Server Configuration
```typescript
server: {
  healthCheckInterval: 20000,    // Health check frequency (20 seconds)
  corsOrigins: ['http://localhost:5173', ...] // Allowed frontend origins
}
```

### Client Configuration
```typescript
client: {
  apiPollingInterval: 5000,      // How often frontend polls server (5 seconds)
}
```

### Tree Configuration
```typescript
tree: {
  nodes: [...]                   // Complete node tree structure with IPs
}
```

## How Components Use the Config

### Server (`server/index.js`)
- Reads configuration at startup
- Uses fallback ports automatically if primary port is busy
- Monitors all IPs found in the tree structure
- Health check interval from config

### Frontend Hook (`src/hooks/useNodeStatus.ts`)
- Uses `getServerUrl()` helper to connect to server
- Polling interval from config
- Automatically handles server port detection

### Vite Configuration (`vite.config.ts`)
- Uses client port configuration
- Allows fallback ports

## Adding New Nodes

Simply add nodes to the `tree.nodes` array in `config.json`:

```typescript
{
  id: "new-node",
  title: "New Service",
  subtitle: "Description",
  ip: "newservice.lan:8080",
  url: "https://newservice.example.com",
  children: [...]
}
```

The server will automatically:
- Extract the IP address
- Start monitoring it
- Include it in health checks

No code changes needed elsewhere!

## Benefits

✅ **Single source of truth** - All config in one place  
✅ **No scattered files** - Eliminated server-port.txt and separate tree config  
✅ **Automatic port fallback** - Both server and client handle busy ports via environment variables  
✅ **Dynamic IP extraction** - Server reads IPs directly from tree structure  
✅ **Easy maintenance** - Change ports/intervals in one place  
