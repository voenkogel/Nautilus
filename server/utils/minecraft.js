import util from 'minecraft-server-util';

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
 * @param {string} host - The server IP or hostname.
 * @param {number} port - The server port (default: 25565).
 * @returns {Promise<object>} - The server status.
 */
export const queryJavaServer = async (host, port = 25565, retries = 1) => {
  return queryWithRetry(`Java server ${host}:${port}`, async () => {
    const result = await util.status(host, port, {
      timeout: 5000, // 5 second timeout
      enableSRV: true // Enable SRV record lookup
    });

    return {
      online: true,
      type: 'java',
      version: result.version.name,
      players: {
        online: result.players.online,
        max: result.players.max,
        list: result.players.sample || []
      },
      motd: result.motd.clean,
      favicon: result.favicon,
      latency: result.roundTripLatency
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
    const result = await util.statusBedrock(host, port, {
      timeout: 5000 // 5 second timeout
    });

    return {
      online: true,
      type: 'bedrock',
      version: result.version.name,
      players: {
        online: result.players.online,
        max: result.players.max
      },
      motd: result.motd.clean,
      latency: result.roundTripLatency
    };
  }, retries);
};
