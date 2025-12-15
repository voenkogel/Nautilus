import fetch from 'node-fetch';
import https from 'https';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * Queries a Plex Media Server for active session count.
 * 
 * @param {string} host - The hostname or IP of the Plex server.
 * @param {number} port - The port (default 32400).
 * @param {string} token - The Plex X-Plex-Token.
 * @param {string} protocol - The protocol (http or https).
 * @returns {Promise<Object>} - Status object with { status, streams, ... }
 */
export async function queryPlexServer(host, port = 32400, token, protocol = 'http') {
  if (!token) {
    throw new Error('Plex Token is required');
  }

  const url = `${protocol}://${host}:${port}/status/sessions`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Token': token
      },
      agent: protocol === 'https' ? httpsAgent : undefined,
      timeout: 5000 // 5s timeout
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized (Invalid Token)');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // The active stream count is in MediaContainer.size
    // If Metadata is missing or size is 0, it means 0 streams.
    const streamCount = data.MediaContainer ? (data.MediaContainer.size || 0) : 0;
    
    // Also try to get server info if possible, but sessions is the main goal
    // We could fetch /identity for version/name but let's keep it simple for now.

    return {
      status: 'online',
      streams: streamCount,
      // We could add 'transcoding' count later if needed by iterating Metadata
    };

  } catch (error) {
    throw error;
  }
}
