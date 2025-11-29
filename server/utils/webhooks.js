import fetch from 'node-fetch';

/**
 * Send a webhook notification for node status changes
 * 
 * @param {Object} config - The webhook configuration
 * @param {string} config.endpoint - The webhook endpoint URL
 * @param {boolean} config.notifyOffline - Whether to send notifications when nodes go offline
 * @param {boolean} config.notifyOnline - Whether to send notifications when nodes go online
 * @param {string} nodeName - The name of the node that changed status
 * @param {string} event - The event type ('online' or 'offline')
 * @param {Object} [details] - Optional structured details about the event
 * @returns {Promise<Object>} - The response from the webhook endpoint
 */
export async function sendStatusWebhook(config, nodeName, event, details = {}) {
  // Check if webhooks are configured and enabled for this event
  if (!config || !config.endpoint) {
    return { success: false, error: 'Webhook endpoint not configured' };
  }
  
  if (event === 'online' && !config.notifyOnline) {
    return { success: false, error: 'Online notifications disabled' };
  }
  
  if (event === 'offline' && !config.notifyOffline) {
    return { success: false, error: 'Offline notifications disabled' };
  }
  
  // Prepare the payload with emojis
  const emoji = event === 'online' ? '✅' : '❌';
  const message = details.messageOverride || (event === 'online' 
    ? `${emoji} ${nodeName} has come online` 
    : `${emoji} ${nodeName} has gone offline`);
    
  const payload = {
    message,
    timestamp: new Date().toISOString(),
    data: {
      node: nodeName,
      status: event,
      ...details
    }
  };
  
  try {
    const logMessage = event === 'online' 
      ? `📤 Sending webhook notification: ${nodeName} has come online`
      : `📤 Sending webhook notification: ${nodeName} has gone offline`;
      
    console.log(logMessage);
    
    // Send the webhook
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Nautilus-Monitor/1.0'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Webhook request failed with status ${response.status}`);
    }
    
    console.log(`✅ Webhook notification sent successfully to ${config.endpoint}`);
    
    return { 
      success: true, 
      status: response.status,
      statusText: response.statusText
    };
  } catch (error) {
    let errorMessage = 'Unknown error';
    
    if (error.name === 'AbortError') {
      errorMessage = 'Request timeout (5s)';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Host not found (DNS failed)';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused';
    } else if (error.code === 'ECONNRESET') {
      errorMessage = 'Connection reset';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Connection timeout';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    console.error(`❌ Error sending webhook notification: ${errorMessage}`);
    return { 
      success: false, 
      error: errorMessage
    };
  }
}
