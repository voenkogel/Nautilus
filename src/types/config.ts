export interface TreeNode {
  id: string;
  title: string;
  subtitle: string;
  
  // Separated concerns for better architecture
  internalAddress?: string; // Internal address for health checking (e.g. "192.168.1.100:8080")
  externalAddress?: string; // External address for user access (e.g. "https://myapp.com")
  
  // Legacy fields (kept for migration)
  ip?: string;          
  healthCheckPort?: number; 
  url?: string;         
  
  disableHealthCheck?: boolean; // Explicitly disable health checking even if port is provided
  healthCheckType?: 'http' | 'ping' | 'minecraft' | 'plex' | 'disabled'; // Type of health check to perform
  healthCheckInterval?: number; // Per-node check interval in ms — overrides the global setting
  disableEmbedded?: boolean; // Force opening in new tab instead of embedded iframe
  isInteractable?: boolean; // Whether the node can be clicked to open a URL
  
  icon?: string; // Optional icon name from lucide-react
  type?: 'square' | 'circular' | 'angular'; // Square (normal cards), circular (pill-shaped cards), or angular (diamond-sided cards)
  
  collapsed?: boolean; // Whether the node's children are hidden (persisted state)

  // Layout-internal, transient: set by getVisibleTree on a collapsed node that
  // actually has children, so calculateTreeLayout reserves a row for the
  // "N hidden nodes" pill rendered below it. Never persisted.
  hasHiddenChildren?: boolean;

  monitored?: boolean; // Server-derived: present only in sanitized API responses; never persisted
  
  plexToken?: string; // Optional Plex Media Server token (only stored on server, never sent to client)

  // Backup window: during this recurring window the node is reported as 'backup'
  // (violet) instead of offline and status notifications are suppressed. A manual
  // window (source:'manual') lives in config.json; an auto-detected window
  // (source:'auto') is injected server-side for display and never persisted here.
  backupWindow?: BackupWindow;
  disableBackupDetection?: boolean; // Opt this node out of backup-window autodetection

  children?: TreeNode[];
}

export interface BackupWindow {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  startMinute: number;          // minutes since local midnight, 0..1439
  durationMinutes: number;      // window length (auto: already includes drift padding)
  dayOfWeek?: number;           // 0=Sun..6=Sat, weekly only
  source?: 'manual' | 'auto';   // manual takes precedence over auto
  detectedAt?: string;          // ISO timestamp, set by autodetection
}

export interface ServerConfig {
  healthCheckInterval: number;
  corsOrigins: string[];
}

export interface ClientConfig {
  apiPollingInterval: number;
}


export interface AppearanceConfig {
  favicon?: string; // base64 encoded favicon
  logo?: string; // base64 encoded logo image (falls back to favicon if not set)
  accentColor: string;
  backgroundImage?: string; // base64 encoded background image
  disableBackground?: boolean; // when true, the background image is not rendered
}

export interface GeneralConfig {
  title: string;
  openNodesAsOverlay: boolean;
}

export interface AppConfig {
  general: GeneralConfig;
  server: ServerConfig;
  client: ClientConfig;
  appearance: AppearanceConfig;
  tree: {
    nodes: TreeNode[];
  };
  webhooks?: WebhookSettings;
  backupDetection?: BackupDetectionConfig;
}

export interface BackupDetectionConfig {
  enabled: boolean;         // master switch for backup-window autodetection
  minEvents: number;        // downtime events required before arming (default 3)
  timezone?: string;        // IANA tz for window math; default = resolved server tz
  lookbackDays: number;     // history window to analyse (default 30)
  minDurationMs: number;    // ignore downtimes shorter than this (noise)
  maxDurationMs: number;    // ignore downtimes longer than this (real outages)
}

export interface NodeStatus {
  status: 'online' | 'offline' | 'checking' | 'backup';
  lastChecked: string;
  statusChangedAt?: string; // Timestamp when status last changed
  responseTime?: number;
  error?: string;
  players?: {
    online: number;
    max: number;
  };
  version?: string;
  motd?: string;
  favicon?: string;
  streams?: number;
}

export interface WebhookConfig {
  endpoint: string;
  notifyOffline: boolean;
  notifyOnline: boolean;
  notifyAfterSeconds?: number; // Delay before sending offline notifications (0 = immediate)
}

export interface WebhookSettings {
  statusNotifications: WebhookConfig;
}
