import { fetch, Agent } from 'undici';

// Same rationale as plex.js: undici's own fetch + Agent so the self-signed
// certificate override is honoured on Node 20.
const insecureDispatcher = new Agent({
  connect: { rejectUnauthorized: false }
});

// Sessions idle longer than this are stale clients, not viewers.
const ACTIVE_WITHIN_SECONDS = 960;

/**
 * Queries a Jellyfin server for the number of sessions currently playing media.
 *
 * @param {string} host - The hostname or IP of the Jellyfin server.
 * @param {number} port - The port (default 8096).
 * @param {string} apiKey - A Jellyfin API key (Dashboard → API Keys).
 * @param {string} protocol - The protocol (http or https).
 * @returns {Promise<Object>} - Status object with { status, streams }
 */
export async function queryJellyfinServer(host, port = 8096, apiKey, protocol = 'http') {
  if (!apiKey) {
    throw new Error('Jellyfin API key is required');
  }

  const url = `${protocol}://${host}:${port}/Sessions?activeWithinSeconds=${ACTIVE_WITHIN_SECONDS}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        // The MediaBrowser scheme is the supported form; legacy X-Emby-Token
        // can be disabled on newer Jellyfin releases.
        'Authorization': `MediaBrowser Token="${apiKey}"`
      },
      dispatcher: protocol === 'https' ? insecureDispatcher : undefined,
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized (Invalid API key)');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const sessions = await response.json();

    // A session is a stream only while it has something loaded; idle clients
    // (an open app on the home screen) have no NowPlayingItem.
    const streamCount = Array.isArray(sessions)
      ? sessions.filter(session => session && session.NowPlayingItem).length
      : 0;

    return {
      status: 'online',
      streams: streamCount,
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout (5s)');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
