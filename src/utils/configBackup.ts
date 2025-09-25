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
      errors.push('File must contain a valid JSON object (not a string, number, or array at the root level)');
      return { isValid: false, errors };
    }

    // Check if it's an array instead of object
    if (Array.isArray(configData)) {
      errors.push('Configuration must be a JSON object, not an array');
      return { isValid: false, errors };
    }

    // Check for required top-level properties
    const requiredProperties = ['general', 'appearance', 'tree'];
    const missingProperties = requiredProperties.filter(prop => !configData[prop]);
    
    if (missingProperties.length > 0) {
      errors.push(`Missing required sections: ${missingProperties.join(', ')}`);
      errors.push('A valid Nautilus configuration must have general, appearance, and tree sections');
    }

    // Validate general section
    if (configData.general) {
      if (typeof configData.general !== 'object') {
        errors.push('The "general" section must be an object');
      } else if (Array.isArray(configData.general)) {
        errors.push('The "general" section must be an object, not an array');
      }
    }

    // Validate appearance section
    if (configData.appearance) {
      if (typeof configData.appearance !== 'object') {
        errors.push('The "appearance" section must be an object');
      } else if (Array.isArray(configData.appearance)) {
        errors.push('The "appearance" section must be an object, not an array');
      }
    }

    // Validate tree section
    if (configData.tree) {
      if (typeof configData.tree !== 'object') {
        errors.push('The "tree" section must be an object');
      } else if (Array.isArray(configData.tree)) {
        errors.push('The "tree" section must be an object with a "nodes" array property');
      } else if (!configData.tree.nodes) {
        errors.push('The "tree" section must contain a "nodes" property');
      } else if (!Array.isArray(configData.tree.nodes)) {
        errors.push('The "nodes" property in the tree section must be an array');
      }
    }

    // Check if this looks like a Nautilus backup
    const hasBackupMetadata = configData._backup?.application === 'Nautilus';
    const hasNautilusStructure = (
      configData.general?.title || 
      configData.appearance?.accentColor ||
      configData.tree?.nodes
    );
    
    if (!hasBackupMetadata && !hasNautilusStructure) {
      errors.push('File does not appear to be a valid Nautilus configuration');
      errors.push('Expected to find Nautilus-specific properties like accentColor, title, or nodes array');
    }

    // Additional helpful checks
    if (configData.general?.title && typeof configData.general.title !== 'string') {
      errors.push('Application title must be a string');
    }

    if (configData.appearance?.accentColor && typeof configData.appearance.accentColor !== 'string') {
      errors.push('Accent color must be a string');
    }

    return { isValid: errors.length === 0, errors };
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown validation error'}`);
    return { isValid: false, errors };
  }
};

/**
 * Processes an uploaded file and returns the configuration data
 */
export const loadConfigFromFile = (file: File): Promise<AppConfig> => {
  return new Promise((resolve, reject) => {
    // Validate file type first
    if (!file.name.toLowerCase().endsWith('.json')) {
      reject(new Error('Invalid file type. Please select a JSON file (.json)'));
      return;
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      reject(new Error(`File too large. Maximum size is 5MB (current: ${(file.size / 1024 / 1024).toFixed(2)}MB)`));
      return;
    }

    // Check if file is empty
    if (file.size === 0) {
      reject(new Error('File is empty. Please select a valid configuration file.'));
      return;
    }

    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const jsonString = event.target?.result as string;
        
        // Additional check for empty content
        if (!jsonString || jsonString.trim().length === 0) {
          reject(new Error('File appears to be empty or contains only whitespace.'));
          return;
        }

        const configData = JSON.parse(jsonString);
        
        // Validate the configuration
        const validation = validateConfigFile(configData);
        if (!validation.isValid) {
          reject(new Error(`Configuration file validation failed:\n\n${validation.errors.map(err => `• ${err}`).join('\n')}`));
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
        if (error instanceof SyntaxError) {
          reject(new Error(`Invalid JSON format: ${error.message}\n\nPlease ensure the file contains valid JSON data.`));
        } else {
          reject(new Error(`Failed to parse configuration file: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read the uploaded file. The file may be corrupted or inaccessible.'));
    };

    reader.readAsText(file, 'utf-8');
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