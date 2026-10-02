# Nautilus - Network Node Status Monitor

A real-time network monitoring dashboard built with React, TypeScript, and Node.js that displays the status of network nodes in an interactive radial map.

![Nautilus Dashboard](https://img.shields.io/badge/Status-Active-green) ![Node.js](https://img.shields.io/badge/Node.js-18%2B-green) ![React](https://img.shields.io/badge/React-TypeScript-blue) ![Docker](https://img.shields.io/badge/Docker-Ready-blue)

## ✨ Features

- 🎯 **Real-time network monitoring** with color-coded status indicators
- 🌳 **Interactive tree visualization** of your infrastructure
- 📱 **Mobile-responsive design** with dedicated mobile view
- � **Secure authentication** with server-side session management
- 🎨 **Customizable appearance** with themes and branding
- 🚀 **Network discovery** with automated CIDR scanning
- 📊 **Health check monitoring** with configurable intervals
- 🔔 **Webhook notifications** (Home Assistant integration)
- 🐳 **Docker ready** with volume persistence
- 🖥️ **One-line Proxmox install** for LXC deployment

## Radial workspace

Nautilus uses a dark network observatory. A single root is centered; multiple roots surround a presentation-only Network hub. Children extend outward, with curved connections showing their ancestry.

- Click a node to inspect its health, activity, addresses, and history. Use **Open service** to launch it with the configured overlay or new-tab preference.
- Expand branches with their count controls. Hidden descendants still contribute to health and activity totals. Large or deep networks initially fold locally to remain readable; **Show all** removes these automatic folds.
- Search and status filters highlight matches without rearranging the map. Selecting a result temporarily reveals its ancestors. **Focus branch** opens a subtree; **Network** restores the previous view.
- Phones start in a hierarchy list; **Map / List** switches views. The map supports pan, pointer-centered zoom, and touch pinch. Reduced-motion preferences are respected.
- **Edit network** enables drag reparenting. The inspector also provides a parent selector and sibling ordering controls for keyboard and touch use.
- Existing branding and service settings remain supported. Legacy accent, background, and card-shape fields survive configuration round-trips, but the new interface uses a fixed dark palette and circular nodes. Fonts are served locally.

### Redesign verification

`npm run build` checks TypeScript and builds the application. `npm run test:radial` runs geometry and aggregation checks (Node 22.18+ or Node 24). `npm run test:browser` exercises the UI with simulated API responses, including failed saves and the large sample network; it never writes live configuration or runs a real network scan.

Browser tests use installed Microsoft Edge on Windows and Playwright Chromium elsewhere. Set `PLAYWRIGHT_CHANNEL` to select another installed browser, or install Chromium with `npx playwright install chromium`. Screenshots and failure traces are written to the ignored `test-results/` directory. The optional local-topology check uses `config.json` only as a read-only fixture.

## TODO
- Non-recursive node removal: removing nodes within the tree without destroying its children. should be en optional button in the removal confirmation modal.
- Auto detect local network access; enable admin auth if detected by default.

## 🚀 Quick Installation

### Proxmox LXC (Recommended)

**One-command installation:**
```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/voenkogel/Nautilus/main/scripts/proxmox-install.sh)"
```

This creates a fully configured Ubuntu LXC container with Nautilus, Nginx, and all dependencies.

**One-command update** (run on the Proxmox host):
```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/voenkogel/Nautilus/main/scripts/proxmox-update.sh)"
```

### Docker Deployment

```bash
# Clone repository
git clone https://github.com/voenkogel/Nautilus.git
cd Nautilus

# Setup environment
cp .env.example .env
# Edit .env with your admin password

# Start with Docker Compose
docker-compose up -d
```

### Manual Installation

```bash
# Prerequisites: Node.js 18+ 
git clone https://github.com/voenkogel/Nautilus.git
cd Nautilus

# Setup environment
cp .env.example .env
# Edit .env with your settings

# Install and start
npm install
npm run dev:full
```

## 🔒 Security & Authentication

**Nautilus includes built-in authentication to protect configuration changes:**

- 🔐 **Admin authentication** required for settings and node editing
- 🛡️ **Server-side session management** with token validation
- 📋 **Read [SECURITY.md](./SECURITY.md)** for detailed setup instructions
- ⚠️ **Default password**: `1234` (MUST change for production)

### What's Protected
- ✅ Settings panel and configuration changes
- ✅ Node editing and network scanning  
- ✅ Webhook configuration
- ❌ Node viewing and status monitoring (public read-only)

## 🎯 Architecture Overview

### System Components

```
┌─────────────────┐    HTTP/REST API     ┌─────────────────┐
│   React Frontend│ ────────────────────▶ │   Node.js API   │
│   (TypeScript)  │                      │   (Express)     │
│                 │ ◀──────────────────── │                 │
└─────────────────┘    JSON Responses    └─────────────────┘
```

### Key Features

1. **Health Monitoring**: Server pings all configured nodes every 20 seconds
2. **Real-time Updates**: Frontend polls every 5 seconds for status changes  
3. **Network Discovery**: CIDR scanning to find new devices
4. **Webhook Integration**: Push notifications to external systems
5. **Configuration Management**: Persistent JSON-based configuration

## 📋 API Endpoints

### Public (No Authentication)
- `GET /api/config` - Get current configuration
- `GET /api/status` - Get all node statuses
- `GET /api/status/:id` - Get specific node status
- `GET /health` - API health check

### Protected (Authentication Required)
- `POST /api/config` - Update configuration
- `POST /api/auth/login` - Authenticate user
- `POST /api/network-scan/*` - Network scanning operations

## ⚙️ Configuration

### Environment Variables

Create `.env` from `.env.example`:

```bash
# Server Configuration
NAUTILUS_SERVER_PORT=3069
NAUTILUS_CLIENT_PORT=3070  
NAUTILUS_HOST=localhost

# Security (CHANGE FOR PRODUCTION!)
NAUTILUS_ADMIN_USERNAME=admin
NAUTILUS_ADMIN_PASSWORD=your_secure_password_here
```

### Node Configuration

Nodes are configured via the web interface or by editing `config.json`:

```json
{
  "tree": {
    "nodes": [
      {
        "id": "web-server",
        "title": "Web Server",
        "subtitle": "Production web server",
        "ip": "192.168.1.100",
        "url": "https://example.com",
        "icon": "server",
        "type": "square"
      }
    ]
  }
}
```

### Webhook Configuration

For Home Assistant or other webhook integrations:

```json
{
  "webhooks": {
    "statusNotifications": {
      "endpoint": "http://homeassistant.local:8123/api/webhook/nautilus",
      "notifyOffline": true,
      "notifyOnline": true
    }
  }
}
```

## 🛠️ Development

### Prerequisites
- Node.js 18.18.0 or higher
- npm or yarn package manager

### Development Scripts

```bash
# Start full development environment
npm run dev:full          # Both frontend & backend

# Individual components  
npm run dev               # Frontend only (Vite)
npm run server            # Backend only (Node.js)

# Building
npm run build             # Production build
npm run preview           # Preview production build
npm run lint              # Run ESLint
```

### Project Structure

```
├── src/                  # React frontend
│   ├── components/       # React components
│   ├── hooks/           # Custom React hooks  
│   ├── utils/           # Utility functions
│   └── types/           # TypeScript definitions
├── server/              # Node.js backend
│   ├── index.js         # Main server file
│   ├── network_scan_service.js
│   └── utils/           # Server utilities
├── scripts/             # Deployment scripts
│   ├── proxmox-install.sh
│   ├── proxmox-update.sh
│   └── proxmox-uninstall.sh
├── config.json          # Runtime configuration
├── defaultConfig.json   # Default/example config
└── docker-compose.yml   # Docker deployment
```

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

```yaml
version: '3.8'
services:
  nautilus:
    build: .
    ports:
      - "3069:3069"
    volumes:
      - ./data:/data
    environment:
      - NAUTILUS_ADMIN_PASSWORD=your_secure_password
      - NODE_ENV=production
```

### Build and Run

```bash
# Build image
docker build -t nautilus .

# Run container  
docker run -d \
  --name nautilus \
  -p 3069:3069 \
  -v $(pwd)/data:/data \
  -e NAUTILUS_ADMIN_PASSWORD=your_password \
  nautilus
```

## 🖥️ Proxmox Deployment

### Automated Installation

The one-line installer creates a complete LXC container:

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/voenkogel/Nautilus/main/scripts/proxmox-install.sh)"
```

**What it includes:**
- Ubuntu 22.04 LXC container  
- Node.js 18.x runtime
- Nginx reverse proxy
- Systemd service for auto-start
- Firewall configuration
- Automatic updates capability

### Updating

Run this on the Proxmox host to update an existing LXC installation to the latest version:

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/voenkogel/Nautilus/main/scripts/proxmox-update.sh)"
```

The script will detect your Nautilus container automatically, back up your config, pull the latest code, rebuild, and restart the service. Your configuration and data are preserved.

### Manual Proxmox Setup

See [scripts/README.md](./scripts/README.md) for detailed Proxmox deployment documentation.

## 🔧 Troubleshooting

### Common Issues

**Frontend can't connect to backend:**
1. Check if backend is running: `http://localhost:3069/health`
2. Verify environment variables in `.env`
3. Check for port conflicts
4. Wait for backend initialization (a few seconds)

**Authentication issues:**
1. Verify password in `.env` file
2. Check server logs for authentication failures  
3. Clear browser sessionStorage if needed
4. Restart server after changing `.env`

**No status updates:**
1. Check network connectivity to monitored nodes
2. Verify node IP addresses in configuration
3. Check browser console for JavaScript errors
4. Confirm API polling is working: Network tab in DevTools

### Logs and Debugging

```bash
# View server logs
docker logs nautilus

# Or for manual installation  
npm run server  # Check console output

# Check container status (Proxmox)
pct exec 200 -- systemctl status nautilus
pct exec 200 -- journalctl -u nautilus -f
```

## 📚 Documentation

- [Security Setup Guide](./SECURITY.md) - Authentication and security configuration
- [Proxmox Scripts Documentation](./scripts/README.md) - LXC deployment details
- [Configuration Reference](./CONFIG.md) - Complete configuration options

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/voenkogel/Nautilus/issues)
- **Discussions**: [GitHub Discussions](https://github.com/voenkogel/Nautilus/discussions)
- **Documentation**: [Project Wiki](https://github.com/voenkogel/Nautilus/wiki)

---

**Made with ❤️ for infrastructure monitoring. Star ⭐ if this project helps you!**


### Live UI development in Docker

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Open http://localhost:3071 for the hot-reloading frontend. It proxies API requests to the normal Nautilus backend on port 3069, using the existing configuration volume. Source, public assets, and frontend configuration are mounted read-only; Docker keeps its Linux dependencies separate from local dependencies. Polling supports Docker Desktop file changes on Windows.

UI edits update automatically. Rebuild the frontend image after changing dependencies. Backend changes still require rebuilding the normal Nautilus service.

To start only the live frontend when the backend is already running:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --no-deps frontend
```

To stop live preview while leaving Nautilus running:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml stop frontend
```
