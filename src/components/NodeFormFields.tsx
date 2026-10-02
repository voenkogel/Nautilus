import { Disclosure } from './ui/Disclosure';
import React, { useState, useEffect, useRef } from 'react';
import type { TreeNode, BackupWindow } from '../types/config';
import * as LucideIcons from 'lucide-react';
import { IconPicker } from './IconPicker';
import Switch from './Switch';
import { getAuthHeaders } from '../utils/auth';
import { iconRegistry } from '../utils/iconUtils';
import { FormInput } from './ui/FormInput';
import { describeBackupWindow, minutesToHHMM, hhmmToMinutes, DEFAULT_BACKUP_WINDOW, DAYS } from '../utils/backupWindow';

interface NodeFormFieldsProps {
  node: TreeNode;
  onChange: (updates: Partial<TreeNode>) => void;
}

type ConnectionTestStatus = 'idle' | 'testing' | 'online' | 'offline';

export const NodeFormFields: React.FC<NodeFormFieldsProps> = ({ node, onChange }) => {
  const accentColor = '#65d7e8';
  // UX-4: inline validation for the per-node check interval (must be >= 5 seconds)
  const MIN_CHECK_INTERVAL = 5000;
  const intervalInvalid = typeof node.healthCheckInterval === 'number' && node.healthCheckInterval < MIN_CHECK_INTERVAL;
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionTestStatus>('idle');
  const [connectionDetails, setConnectionDetails] = useState<string>('');
  const testTimeoutRef = useRef<number | null>(null);
  const lastTestedConfigRef = useRef<string>('');

  // Backup window (optional, advanced). Any edit marks the window as 'manual' so
  // server-side autodetection stops overriding it.
  const bw = node.backupWindow;
  const updateBackup = (patch: Partial<BackupWindow>) =>
    onChange({ backupWindow: { ...DEFAULT_BACKUP_WINDOW, ...bw, source: 'manual', ...patch } });

  // Test connection function
  const testConnection = async (nodeToTest: TreeNode) => {
    setConnectionStatus('testing');
    setConnectionDetails('');
    
    try {
      const response = await fetch('api/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(nodeToTest)
      });
      
      const result = await response.json();
      
      if (response.ok && result.status === 'online') {
        setConnectionStatus('online');
        let details = '';
        if (result.streams !== undefined) details = `${result.streams} active stream${result.streams !== 1 ? 's' : ''}`;
        else if (result.players) details = `${result.players.online}/${result.players.max} players`;
        setConnectionDetails(details);
      } else {
        setConnectionStatus('offline');
        setConnectionDetails(result.error || 'Cannot be reached');
      }
    } catch (error) {
      setConnectionStatus('offline');
      setConnectionDetails(error instanceof Error ? error.message : 'Connection failed');
    }
  };

  // Debounced connection test on field changes
  useEffect(() => {
    // Only test if we have an internal address and health checking is enabled
    const hasAddress = !!node.internalAddress || (node.ip && node.healthCheckPort);
    const isDisabled = node.healthCheckType === 'disabled' || node.disableHealthCheck;
    
    if (!hasAddress || isDisabled) {
      setConnectionStatus('idle');
      setConnectionDetails('');
      return;
    }

    // Create a config signature to detect changes
    const configSignature = JSON.stringify({
      internalAddress: node.internalAddress,
      ip: node.ip,
      healthCheckPort: node.healthCheckPort,
      healthCheckType: node.healthCheckType,
      plexToken: node.plexToken,
      jellyfinApiKey: node.jellyfinApiKey,
      disableHealthCheck: node.disableHealthCheck,
      healthCheckInterval: node.healthCheckInterval,
    });

    // Don't retest if config hasn't changed
    if (configSignature === lastTestedConfigRef.current) {
      return;
    }

    lastTestedConfigRef.current = configSignature;

    // Clear existing timeout
    if (testTimeoutRef.current) {
      clearTimeout(testTimeoutRef.current);
    }

    // Set new timeout for debounced test (1 second cooldown)
    testTimeoutRef.current = setTimeout(() => {
      testConnection(node);
    }, 1000);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (testTimeoutRef.current) {
        clearTimeout(testTimeoutRef.current);
      }
    };
  }, [
    node.internalAddress, 
    node.ip, 
    node.healthCheckPort, 
    node.healthCheckType, 
    node.plexToken,
    node.jellyfinApiKey,
    node.disableHealthCheck
  ]);
  
  // Helper to convert kebab-case to PascalCase
  const kebabToPascal = (kebabCase: string): string => {
    return kebabCase
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  };

  const renderIconPreview = (iconName: string, size: number = 16) => {
    if (!iconName) return <LucideIcons.Server size={size} />;
    
    try {
      const pascalCaseName = kebabToPascal(iconName);
      const IconComponent = iconRegistry[pascalCaseName];
      if (IconComponent) {
        return <IconComponent size={size} />;
      }
    } catch {
      // Ignore error
    }
    return <LucideIcons.HelpCircle size={size} className="text-muted" />;
  };

  // Get connection status bar color and text
  const getConnectionStatusDisplay = () => {
    switch (connectionStatus) {
      case 'testing':
        return {
          color: '#3b82f6',
          text: 'Testing connection...',
          icon: <LucideIcons.Loader2 size={14} className="animate-spin" />
        };
      case 'online':
        return {
          color: '#10b981',
          text: connectionDetails || 'Online',
          icon: <LucideIcons.CheckCircle2 size={14} />
        };
      case 'offline':
        return {
          color: '#ef4444',
          text: connectionDetails || 'Cannot be reached',
          icon: <LucideIcons.XCircle size={14} />
        };
      default:
        return null;
    }
  };

  const statusDisplay = getConnectionStatusDisplay();
  const checksEnabled = node.healthCheckType !== 'disabled' && !node.disableHealthCheck;
  const internalAddress = node.internalAddress || (node.ip ? (node.healthCheckPort ? `${node.ip}:${node.healthCheckPort}` : node.ip) : '');
  const ring = { '--tw-ring-color': accentColor } as React.CSSProperties;
  const selectClass = 'w-full px-3 py-2 border border-line rounded-md focus:outline-none focus:ring-2';

  // Groups are separated by space and a hairline rather than headings; labels carry the meaning.
  return (
    <div className="node-form">
      {/* Identity: the icon tile sits beside the title it belongs to. */}
      <div className="node-form-group">
        <div className="node-form-identity">
          <button type="button" className="node-form-icon" onClick={() => setShowIconPicker(true)} title="Change icon" aria-label={`Icon: ${node.icon || 'none'}. Change icon`}>
            {node.icon ? renderIconPreview(node.icon, 22) : <LucideIcons.ImagePlus size={20} />}
          </button>
          <div className="node-form-field">
            <label htmlFor={`${node.id}-title`}>Title</label>
            <FormInput id={`${node.id}-title`} accentColor={accentColor} type="text" value={node.title} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
        </div>
        <div className="node-form-field">
          <label htmlFor={`${node.id}-subtitle`}>Subtitle</label>
          <FormInput id={`${node.id}-subtitle`} accentColor={accentColor} type="text" value={node.subtitle} placeholder="Optional" onChange={(e) => onChange({ subtitle: e.target.value })} />
        </div>
        {showIconPicker && (
          <IconPicker currentIcon={node.icon || ''} onSelect={(iconName) => onChange({ icon: iconName })} onClose={() => setShowIconPicker(false)} />
        )}
      </div>

      {/* Monitoring: where to check, how, and how often. */}
      <div className="node-form-group">
        <div className="node-form-field">
          <label htmlFor={`${node.id}-internalAddress`}>Address</label>
          <FormInput
            id={`${node.id}-internalAddress`}
            accentColor={accentColor}
            type="text"
            value={internalAddress}
            onChange={(e) => onChange({
              internalAddress: e.target.value || undefined,
              // Clear legacy fields to complete migration for this node
              ip: undefined,
              healthCheckPort: undefined
            })}
            placeholder="192.168.1.100:8080"
          />
          {statusDisplay && <p className="node-form-status" style={{ color: statusDisplay.color }}>{statusDisplay.icon}<span>{statusDisplay.text}</span></p>}
        </div>
        <div className="node-form-row">
          <div className="node-form-field">
            <label htmlFor={`${node.id}-healthCheckType`}>Health check</label>
            <select
              id={`${node.id}-healthCheckType`}
              value={node.healthCheckType || (node.disableHealthCheck ? 'disabled' : 'http')}
              onChange={(e) => {
                const type = e.target.value as NonNullable<TreeNode['healthCheckType']>;
                onChange({ healthCheckType: type, disableHealthCheck: type === 'disabled' }); // Keep legacy field in sync
              }}
              className={selectClass}
              style={ring}
            >
              <option value="http">HTTP / TCP</option>
              <option value="ping">Ping</option>
              <option value="minecraft">Minecraft</option>
              <option value="plex">Plex</option>
              <option value="jellyfin">Jellyfin</option>
              <option value="disabled">Off</option>
            </select>
          </div>
          {checksEnabled && (
            <div className="node-form-field">
              <label htmlFor={`${node.id}-checkInterval`}>Interval</label>
              <div className="node-form-suffixed">
                <FormInput
                  id={`${node.id}-checkInterval`}
                  accentColor={intervalInvalid ? undefined : accentColor}
                  type="number"
                  min={MIN_CHECK_INTERVAL / 1000}
                  step={1}
                  value={node.healthCheckInterval ? node.healthCheckInterval / 1000 : ''}
                  onChange={(e) => {
                    const seconds = parseFloat(e.target.value);
                    onChange({ healthCheckInterval: seconds > 0 ? Math.round(seconds * 1000) : undefined });
                  }}
                  placeholder="Default"
                  aria-invalid={intervalInvalid}
                  aria-describedby={intervalInvalid ? `${node.id}-checkInterval-help` : undefined}
                  className={intervalInvalid ? 'border-red-400 focus:ring-red-300' : ''}
                />
                <span aria-hidden="true">s</span>
              </div>
            </div>
          )}
        </div>
        {intervalInvalid && <p id={`${node.id}-checkInterval-help`} className="node-form-hint is-error">Use at least 5 seconds.</p>}
        {(node.healthCheckType === 'plex' || node.healthCheckType === 'jellyfin') && (() => {
          const secret = node.healthCheckType === 'plex'
            ? { field: 'plexToken' as const, label: 'Plex token', placeholder: 'X-Plex-Token, for stream counts' }
            : { field: 'jellyfinApiKey' as const, label: 'Jellyfin API key', placeholder: 'Dashboard → API Keys, for stream counts' };
          return (
          <div className="node-form-field">
            <label htmlFor={`${node.id}-${secret.field}`}>{secret.label}</label>
            <div className="relative">
              <FormInput
                id={`${node.id}-${secret.field}`}
                accentColor={accentColor}
                className="pr-10"
                type={showSecret ? 'text' : 'password'}
                value={node[secret.field] || ''}
                onChange={(e) => onChange({ [secret.field]: e.target.value })}
                placeholder={secret.placeholder}
              />
              <button
                type="button"
                aria-label={showSecret ? 'Hide token' : 'Show token'}
                onClick={() => setShowSecret(!showSecret)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted focus:outline-none"
              >
                {showSecret ? <LucideIcons.EyeOff size={16} /> : <LucideIcons.Eye size={16} />}
              </button>
            </div>
          </div>
          );
        })()}
      </div>

      {/* Interaction: whether clicking opens the service, and where. */}
      <div className="node-form-group">
        <div className="node-form-toggle">
          <label htmlFor={`isInteractable-${node.id}`}>Interactable</label>
          <Switch id={`isInteractable-${node.id}`} checked={node.isInteractable !== false} onChange={(checked) => onChange({ isInteractable: checked })} accentColor={accentColor} />
        </div>
        {node.isInteractable !== false && (
          <div className="node-form-field">
            <label htmlFor={`${node.id}-externalAddress`}>Open URL</label>
            <FormInput
              id={`${node.id}-externalAddress`}
              accentColor={accentColor}
              type="text"
              value={node.externalAddress || node.url || ''}
              onChange={(e) => onChange({
                externalAddress: e.target.value || undefined,
                // Clear legacy field
                url: undefined
              })}
              placeholder={!internalAddress ? 'https://myapp.com' : internalAddress.includes('://') ? internalAddress : `http://${internalAddress}`}
            />
          </div>
        )}
      </div>

      {/* Backup window (advanced, optional): collapsed by default. */}
      <Disclosure title={<>Backup window{bw?.enabled && <small>{bw.source === 'auto' ? 'Detected' : 'On'}</small>}</>}>
        <div className="node-form-group is-nested">
          <div className="node-form-toggle">
            <label htmlFor={`backupEnabled-${node.id}`}>Quiet during backups</label>
            <Switch id={`backupEnabled-${node.id}`} checked={!!bw?.enabled} onChange={(checked) => updateBackup({ enabled: checked })} accentColor={accentColor} />
          </div>
          {!bw?.enabled && <p className="node-form-hint">Downtime inside the window shows as backing up, without alerts. Left off, windows are detected automatically.</p>}
          {bw?.enabled && <>
            {bw.source === 'auto' && (
              <p className="node-form-hint">
                Detected{bw.detectedAt ? ` ${new Date(bw.detectedAt).toLocaleDateString()}` : ''}; editing makes it manual.{' '}
                <button type="button" className="underline" onClick={() => onChange({ backupWindow: undefined, disableBackupDetection: true })}>Stop detecting</button>
              </p>
            )}
            <div className="node-form-row">
              <div className="node-form-field">
                <label htmlFor={`${node.id}-backupRepeat`}>Repeat</label>
                <select id={`${node.id}-backupRepeat`} value={bw.frequency} onChange={(e) => updateBackup({ frequency: e.target.value as BackupWindow['frequency'] })} className={selectClass} style={ring}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              {bw.frequency === 'weekly' && (
                <div className="node-form-field">
                  <label htmlFor={`${node.id}-backupDay`}>Day</label>
                  <select id={`${node.id}-backupDay`} value={bw.dayOfWeek ?? 0} onChange={(e) => updateBackup({ dayOfWeek: parseInt(e.target.value) })} className={selectClass} style={ring}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="node-form-row">
              <div className="node-form-field">
                <label htmlFor={`${node.id}-backupStart`}>Start</label>
                <input
                  id={`${node.id}-backupStart`}
                  type="time"
                  value={minutesToHHMM(bw.startMinute)}
                  onChange={(e) => {
                    // Ignore a cleared/invalid field so it can't silently snap to 00:00.
                    const mins = hhmmToMinutes(e.target.value);
                    if (mins !== null) updateBackup({ startMinute: mins });
                  }}
                  className={selectClass}
                  style={ring}
                />
              </div>
              <div className="node-form-field">
                <label htmlFor={`${node.id}-backupDuration`}>Duration</label>
                <div className="node-form-suffixed">
                  <FormInput id={`${node.id}-backupDuration`} accentColor={accentColor} type="number" min={1} step={15} value={bw.durationMinutes} onChange={(e) => updateBackup({ durationMinutes: Math.max(1, parseInt(e.target.value) || 0) })} />
                  <span aria-hidden="true">min</span>
                </div>
              </div>
            </div>
            <p className="node-form-hint">{describeBackupWindow(bw)} · server time</p>
          </>}
        </div>
      </Disclosure>
    </div>
  );
};
