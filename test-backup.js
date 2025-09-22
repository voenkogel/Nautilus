// Test script for backup and restore functionality
// This can be run in the browser console to test the utility functions

// Test configuration object
const testConfig = {
  general: {
    title: "Test Nautilus",
    openNodesAsOverlay: true
  },
  server: {
    healthCheckInterval: 20000,
    corsOrigins: ["http://localhost:3070"]
  },
  client: {
    apiPollingInterval: 5000
  },
  appearance: {
    accentColor: "#34a00d",
    favicon: "",
    backgroundImage: "",
    logo: ""
  },
  tree: {
    nodes: [
      {
        id: "test_node_1",
        title: "Test Server",
        subtitle: "Test server description",
        ip: "192.168.1.100",
        icon: "server",
        type: "square",
        children: []
      }
    ]
  }
};

// Test JSON for restore
const testBackupJson = `{
  "general": {
    "title": "Restored Nautilus",
    "openNodesAsOverlay": false
  },
  "server": {
    "healthCheckInterval": 30000,
    "corsOrigins": ["http://localhost:3070"]
  },
  "client": {
    "apiPollingInterval": 10000
  },
  "appearance": {
    "accentColor": "#ff0000",
    "favicon": "",
    "backgroundImage": "",
    "logo": ""
  },
  "tree": {
    "nodes": [
      {
        "id": "restored_node",
        "title": "Restored Server",
        "subtitle": "This is a restored node",
        "ip": "10.0.0.1",
        "icon": "database",
        "type": "circular",
        "children": []
      }
    ]
  },
  "_backup": {
    "timestamp": "2025-09-22T10:00:00.000Z",
    "version": "1.0",
    "application": "Nautilus"
  }
}`;

console.log("Test configuration ready:");
console.log("- testConfig: Sample configuration object");
console.log("- testBackupJson: Sample backup JSON string");
console.log("");
console.log("To test backup/restore:");
console.log("1. Open Settings → General tab");
console.log("2. Click 'Save Backup' to download current config");
console.log("3. Click 'Clear Nodes' in Nodes tab to empty the configuration");
console.log("4. On the welcome screen, click 'Load Configuration'");
console.log("5. Upload the downloaded backup file");
console.log("6. Verify the configuration is restored");