# Nautilus Proxmox Scripts

This directory contains helper scripts for easy installation and management of Nautilus on Proxmox VE.

## 🚀 Quick Install

Run this single command on your Proxmox host to install Nautilus:

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/voenkogel/Nautilus/main/scripts/proxmox-install.sh)"
```

## 📋 Available Scripts

### Installation Script (`proxmox-install.sh`)

**One-command installation** of Nautilus in an LXC container.

**Features:**
- ✅ Interactive setup (default or advanced settings)
- ✅ Automatic container creation and configuration
- ✅ Node.js 18.x installation
- ✅ Nginx reverse proxy setup
- ✅ Systemd service configuration
- ✅ Firewall configuration
- ✅ Professional output with progress indicators

**Usage:**
```bash
# Download and run
curl -s https://raw.githubusercontent.com/voenkogel/Nautilus/main/scripts/proxmox-install.sh | bash

# Or download first, then run
wget https://raw.githubusercontent.com/voenkogel/Nautilus/main/scripts/proxmox-install.sh
chmod +x proxmox-install.sh
./proxmox-install.sh
```

**What it creates:**
- Ubuntu 22.04 LXC container
- Nautilus application in `/opt/nautilus`
- Systemd service for auto-start
- Nginx reverse proxy on port 80
- Dedicated `nautilus` user
- Firewall rules (port 80, SSH)

### Update Script (`proxmox-update.sh`)

**Updates an existing Nautilus installation** to the latest version.

**Features:**
- ✅ Automatic backup of current configuration
- ✅ Git-based updates from main branch
- ✅ Service restart and verification
- ✅ Configuration preservation

**Usage:**
```bash
# Download and run
curl -s https://raw.githubusercontent.com/voenkogel/Nautilus/main/scripts/proxmox-update.sh | bash

# Or specify container ID
curl -s https://raw.githubusercontent.com/voenkogel/Nautilus/main/scripts/proxmox-update.sh | bash -s 200
```

### Uninstall Script (`proxmox-uninstall.sh`)

**Completely removes a Nautilus LXC container** with optional configuration backup.

**Features:**
- ✅ Configuration backup before removal
- ✅ Safe container destruction
- ✅ Force removal option for stuck containers
- ✅ Multiple safety confirmations

**Usage:**
```bash
# Download and run
curl -s https://raw.githubusercontent.com/voenkogel/Nautilus/main/scripts/proxmox-uninstall.sh | bash

# Or specify container ID
curl -s https://raw.githubusercontent.com/voenkogel/Nautilus/main/scripts/proxmox-uninstall.sh | bash -s 200
```

## 🔧 Container Management

### After Installation

**Access Nautilus:**
```bash
# Get container IP
pct exec 200 -- hostname -I

# Access web interface
http://[container-ip]
```

**Service Management:**
```bash
# Check status
pct exec 200 -- systemctl status nautilus

# Restart service
pct exec 200 -- systemctl restart nautilus

# View logs
pct exec 200 -- journalctl -u nautilus -f
```

**Container Management:**
```bash
# Start container
pct start 200

# Stop container
pct stop 200

# Enter container
pct enter 200

# Container info
pct config 200
```

### Manual Updates

```bash
# Update Nautilus manually
pct exec 200 -- su - nautilus -c "
  cd /opt/nautilus
  git pull
  npm install --production
  npm run build
"
pct exec 200 -- systemctl restart nautilus
```

## ⚙️ Default Configuration

### Container Specifications
- **OS:** Ubuntu 22.04 LTS
- **RAM:** 1024 MB
- **CPU Cores:** 2
- **Storage:** 8 GB
- **Network:** Bridge (vmbr0), DHCP

### Software Stack
- **Runtime:** Node.js 18.x
- **Web Server:** Nginx (reverse proxy)
- **Process Manager:** Systemd
- **Firewall:** UFW (ports 80, 22)

### Directory Structure
```
/opt/nautilus/           # Application directory
├── data/                # Configuration and data
├── src/                 # Frontend source
├── server/              # Backend source
├── dist/                # Built frontend
└── package.json         # Dependencies

/etc/systemd/system/nautilus.service  # Systemd service
/etc/nginx/sites-available/default    # Nginx config
```

## 🛡️ Requirements

- **Proxmox VE:** 6.2 or later
- **Storage:** 8 GB minimum available
- **Memory:** 1 GB RAM minimum for container
- **Network:** Internet connection for downloads
- **Permissions:** Root access on Proxmox host

## 🔍 Troubleshooting

### Installation Issues

**Template download fails:**
```bash
pveam update
pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst
```

**Container creation fails:**
```bash
# Check storage
pvesm status

# Check available IDs
pvesh get /cluster/nextid
```

### Service Issues

**Nautilus won't start:**
```bash
# Check logs
pct exec 200 -- journalctl -u nautilus -n 50

# Check configuration
pct exec 200 -- cat /opt/nautilus/data/config.json

# Rebuild application
pct exec 200 -- su - nautilus -c "cd /opt/nautilus && npm run build"
```

**Can't access web interface:**
```bash
# Check nginx status
pct exec 200 -- systemctl status nginx

# Check firewall
pct exec 200 -- ufw status

# Check container network
pct config 200 | grep net0
```

## 📝 Support

- **Repository:** [voenkogel/Nautilus](https://github.com/voenkogel/Nautilus)
- **Issues:** [GitHub Issues](https://github.com/voenkogel/Nautilus/issues)
- **Documentation:** [Project README](https://github.com/voenkogel/Nautilus#readme)

---

*These scripts are inspired by the excellent Proxmox Helper Scripts by tteck and the broader Proxmox community.*