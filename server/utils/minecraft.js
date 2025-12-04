import util from 'minecraft-server-util';

/**
 * Queries a Minecraft Java Edition server.
 * @param {string} host - The server IP or hostname.
 * @param {number} port - The server port (default: 25565).
 * @returns {Promise<object>} - The server status.
 */
export const queryJavaServer = async (host, port = 25565) => {
  try {
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
  } catch (error) {
    console.error(`Failed to query Java server ${host}:${port}:`, error.message);
    throw error;
  }
};

/**
 * Queries a Minecraft Bedrock Edition server.
 * @param {string} host - The server IP or hostname.
 * @param {number} port - The server port (default: 19132).
 * @returns {Promise<object>} - The server status.
 */
export const queryBedrockServer = async (host, port = 19132) => {
  try {
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
  } catch (error) {
    console.error(`Failed to query Bedrock server ${host}:${port}:`, error.message);
    throw error;
  }
};
