import type { AppConfig } from '../types/config';

/**
 * Utility functions for backing up and restoring configuration
 */

/**
 * Downloads the current configuration as a JSON file
 */
export const downloadConfigBackup = (config: AppConfig, filename?: string): void => {
  try {
    // Create a clean copy of the config for backup
    const backupData = {
      ...config,
      // Add metadata for the backup
      _backup: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        application: 'Nautilus'
      }
    };

    // Convert to JSON with nice formatting
    const jsonString = JSON.stringify(backupData, null, 2);
    
    // Create blob and download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `nautilus-config-${new Date().toISOString().split('T')[0]}.json`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up URL
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download config backup:', error);
    throw new Error('Failed to create configuration backup');
  }
};

/**
 * Validates that an uploaded file contains a valid Nautilus configuration
 */
export const validateConfigFile = (configData: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  try {
    // Check if it's an object
    if (!configData || typeof configData !== 'object') {
      errors.push('Configuration file must contain a valid JSON object');
      return { isValid: false, errors };
    }

    // Check for required top-level properties
    const requiredProperties = ['general', 'appearance', 'tree'];
    for (const prop of requiredProperties) {
      if (!configData[prop]) {
        errors.push(`Missing required property: ${prop}`);
      }
    }

    // Validate general section
    if (configData.general && typeof configData.general !== 'object') {
      errors.push('General configuration must be an object');
    }

    // Validate appearance section
    if (configData.appearance && typeof configData.appearance !== 'object') {
      errors.push('Appearance configuration must be an object');
    }

    // Validate tree section
    if (configData.tree) {
      if (typeof configData.tree !== 'object') {
        errors.push('Tree configuration must be an object');
      } else if (!Array.isArray(configData.tree.nodes)) {
        errors.push('Tree nodes must be an array');
      }
    }

    // Check if this looks like a Nautilus backup
    const hasBackupMetadata = configData._backup?.application === 'Nautilus';
    const hasNautilusStructure = configData.general?.title || configData.appearance?.accentColor;
    
    if (!hasBackupMetadata && !hasNautilusStructure) {
      errors.push('This does not appear to be a valid Nautilus configuration file');
    }

    return { isValid: errors.length === 0, errors };
  } catch (error) {
    errors.push('Invalid JSON format or corrupted file');
    return { isValid: false, errors };
  }
};

/**
 * Processes an uploaded file and returns the configuration data
 */
export const loadConfigFromFile = (file: File): Promise<AppConfig> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const jsonString = event.target?.result as string;
        const configData = JSON.parse(jsonString);
        
        // Validate the configuration
        const validation = validateConfigFile(configData);
        if (!validation.isValid) {
          reject(new Error(`Invalid configuration file:\n${validation.errors.join('\n')}`));
          return;
        }

        // Remove backup metadata if present
        const { _backup, ...cleanConfig } = configData;
        
        // Ensure we have a complete config with defaults
        const restoredConfig: AppConfig = {
          general: {
            title: cleanConfig.general?.title || 'Nautilus',
            openNodesAsOverlay: cleanConfig.general?.openNodesAsOverlay ?? true,
          },
          server: {
            healthCheckInterval: cleanConfig.server?.healthCheckInterval || 20000,
            corsOrigins: cleanConfig.server?.corsOrigins || ['http://localhost:3070']
          },
          client: {
            apiPollingInterval: cleanConfig.client?.apiPollingInterval || 5000
          },
          appearance: {
            accentColor: cleanConfig.appearance?.accentColor || '#34a00d',
            favicon: cleanConfig.appearance?.favicon || '',
            backgroundImage: cleanConfig.appearance?.backgroundImage || '',
            logo: cleanConfig.appearance?.logo || ''
          },
          tree: {
            nodes: cleanConfig.tree?.nodes || []
          },
          webhooks: cleanConfig.webhooks || undefined
        };

        resolve(restoredConfig);
      } catch (error) {
        reject(new Error('Failed to parse configuration file. Please ensure it\'s a valid JSON file.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read the uploaded file'));
    };

    reader.readAsText(file);
  });
};

/**
 * Creates a file input element for uploading configuration files
 */
export const createConfigFileInput = (onFileLoad: (config: AppConfig) => void, onError: (error: string) => void): HTMLInputElement => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.style.display = 'none';
  
  input.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    try {
      const config = await loadConfigFromFile(file);
      onFileLoad(config);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to load configuration file');
    }
    
    // Reset the input so the same file can be selected again
    input.value = '';
  });
  
  return input;
};