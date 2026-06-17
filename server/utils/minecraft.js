import { GameDig } from 'gamedig';

/**
 * Runs a query function, retrying with a fixed 2s backoff on failure.
 * Shared by the Java and Bedrock query helpers.
 * @param {string} label - Human-readable target for log messages.
 * @param {() => Promise<object>} queryFn - The query to attempt.
 * @param {number} retries - Remaining retry attempts.
 * @returns {Promise<object>}
 */
const queryWithRetry = async (label, queryFn, retries) => {
  try {
    return await queryFn();
  } catch (error) {
    if (retries > 0) {
      console.warn(`⚠️  ${label} query failed, retrying in 2s... (${retries} attempt(s) left)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return queryWithRetry(label, queryFn, retries - 1);
    }
    console.error(`Failed to query ${label}:`, error.message);
    throw error;
  }
};

/**
 * Queries a Minecraft Java Edition server.
 *
 * Uses gamedig's `minecraft` protocol, which performs SRV record resolution
 * (_minecraft._tcp) automatically, so no explicit enableSRV flag is needed.
 *
 * @param {string} host - The server IP or hostname.
 * @param {number} port - The server port (default: 25565).
 * @returns {Promise<object>} - The server status.
 */
export const queryJavaServer = async (host, port = 25565, retries = 1) => {
  return queryWithRetry(`Java server ${host}:${port}`, async () => {
    const result = await GameDig.query({
      type: 'minecraft',
      host,
      port,
      socketTimeout: 5000 // 5 second timeout per socket attempt
    });

    return {
      online: true,
      type: 'java',
      version: result.version,
      players: {
        online: result.numplayers,
        max: result.maxplayers,
        // gamedig returns Player objects ({ name, raw }); the sample list may be
        // truncated by the server just as it was with minecraft-server-util.
        list: result.players || []
      },
      motd: result.name, // gamedig strips color codes / extra spaces from the MOTD
      // The favicon (data URI) lives in the raw vanilla status payload.
      favicon: result.raw?.vanilla?.raw?.favicon,
      latency: result.ping
    };
  }, retries);
};

/**
 * Queries a Minecraft Bedrock Edition server.
 * @param {string} host - The server IP or hostname.
 * @param {number} port - The server port (default: 19132).
 * @returns {Promise<object>} - The server status.
 */
export const queryBedrockServer = async (host, port = 19132, retries = 1) => {
  return queryWithRetry(`Bedrock server ${host}:${port}`, async () => {
    const result = await GameDig.query({
      type: 'mbe', // gamedig's id for Minecraft: Bedrock Edition
      host,
      port,
      socketTimeout: 5000 // 5 second timeout per socket attempt
    });

    return {
      online: true,
      type: 'bedrock',
      version: result.version,
      players: {
        online: result.numplayers,
        max: result.maxplayers
      },
      motd: result.name,
      latency: result.ping
    };
  }, retries);
};
