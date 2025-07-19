import { spawn } from 'child_process';
import http from 'http';
import https from 'https';

export class NetworkScanService {
  constructor() {
    this._scanProcess = null;
    this._cancelled = false;
    this._progress = { status: 'idle' };
    this._logs = [];
    this._activeHosts = [];
    this._openPorts = {}; // Store open ports per host
    this._webGuis = {}; // Store discovered web GUIs per host
    this._currentPhase = 'idle'; // 'ping', 'port', 'probe', 'completed'
    this._stepStartTime = null; // Track when each step starts for minimum duration
    
    // Overall progress tracking for large subnets
    this._totalExpectedHosts = 0; // Total hosts to scan based on CIDR
    this._totalHostsScanned = 0; // Cumulative hosts scanned across all chunks
    this._currentChunk = 0; // Current chunk number (for debugging)
    this._totalChunks = 0; // Estimated total chunks
  }

  // Common ports to scan - focused on web services and common applications
  static COMMON_PORTS = [
    // SSH and basic services
    22, 53, 67, 68,
    // Web services
    80, 443, 8080, 8081, 8443, 8001, 8002, 8003, 8004, 8005, 8008, 8009, 8010, 8011, 8012,
    // Mail services
    25, 465, 587,
    // Common application ports
    111, 161, 162, 546, 547, 2049, 3128, 3260, 5353, 5432, 8042, 8333, 51820,
    // Media servers and applications
    32400, 8096, 8112, 8123, 7878, 8989, 9117, 8686, 8787, 9696, 6767, 9091, 7575, 5055,
    // Monitoring and management
    5601, 9090, 9092, 9093, 9094, 9095, 9100, 10000, 8090, 6666, 35357, 8086, 8687, 7474,
    // Proxmox and virtualization
    8006, 8007, 5404, 5405, 32469, 8324,
    // Custom application ranges
    6201, 6225, 6227, 6240, 6244, 6255, 6257, 6260, 6262, 6343, 6346, 6379, 6389,
    6432, 6436, 6437, 6444, 6445, 6463, 6464, 6465, 6466, 6467, 6468, 6469, 6470, 6471, 6472,
    6502, 6513, 6514, 6515, 6522, 6543, 6556,
    // Security and networking
    5666, 5665, 9191
  ];

  // SECURITY: Input validation for subnet parameter
  _validateSubnet(subnet) {
    if (!subnet || typeof subnet !== 'string') {
      return false;
    }
    
    // Allow only valid CIDR notation: IP/CIDR
    const cidrRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
    const match = subnet.match(cidrRegex);
    
    if (!match) {
      return false;
    }
    
    // Validate IP octets (0-255)
    const [, octet1, octet2, octet3, octet4, cidr] = match;
    const octets = [octet1, octet2, octet3, octet4].map(Number);
    const cidrNum = Number(cidr);
    
    // Check IP octet ranges
    if (octets.some(octet => octet < 0 || octet > 255)) {
      return false;
    }
    
    // Check CIDR range
    if (cidrNum < 8 || cidrNum > 32) {
      return false;
    }
    
    // Block scanning public IP ranges for security
    const ip = `${octet1}.${octet2}.${octet3}.${octet4}`;
    if (!this._isPrivateIP(ip)) {
      return false;
    }
    
    return true;
  }
  
  // Check if IP is in private ranges (RFC 1918)
  _isPrivateIP(ip) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets;
    
    // 10.0.0.0/8
    if (a === 10) return true;
    
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    
    // Allow localhost range
    if (a === 127) return true;
    
    return false;
  }


  // Helper method to calculate total expected hosts from subnet
  _calculateExpectedHosts(subnet) {
    try {
      const [, cidr] = subnet.split('/');
      if (!cidr) return 0;
      
      const cidrNum = parseInt(cidr, 10);
      if (cidrNum < 1 || cidrNum > 32) return 0;
      
      // Calculate total addressable hosts (subtract network and broadcast addresses)
      const totalHosts = Math.max(2 ** (32 - cidrNum) - 2, 1);
      
      // Estimate chunks (nmap typically uses 4096 host chunks for large subnets)
      const NMAP_CHUNK_SIZE = 4096;
      this._totalChunks = Math.ceil(totalHosts / NMAP_CHUNK_SIZE);
      
      this._logs.push(`[network-scan] Subnet analysis: /${cidr} = ${totalHosts} hosts, estimated ${this._totalChunks} chunk(s)\n`);
      
      return totalHosts;
    } catch (error) {
      this._logs.push(`[network-scan] Error calculating expected hosts: ${error.message}\n`);
      return 0;
    }
  }

  start_scan(params = {}) {
    if (this._scanProcess) throw new Error('Scan already running');
    this._cancelled = false;
    this._logs = [];
    this._activeHosts = [];
    this._openPorts = {};
    this._webGuis = {};
    this._currentPhase = 'ping';
    this._stepStartTime = Date.now();
    this._progress = { status: 'starting' };
    
    // Initialize overall progress tracking
    const subnet = params.subnet || '10.20.148.0/16';
    this._totalExpectedHosts = this._calculateExpectedHosts(subnet);
    this._totalHostsScanned = 0;
    this._currentChunk = 0;
    
    // Start with ping scan
    this._startPingScan(params);
  }

  async _ensureMinimumStepDuration() {
    const MINIMUM_STEP_DURATION = 2000; // 2 seconds
    if (this._stepStartTime) {
      const elapsed = Date.now() - this._stepStartTime;
      if (elapsed < MINIMUM_STEP_DURATION) {
        await new Promise(resolve => setTimeout(resolve, MINIMUM_STEP_DURATION - elapsed));
      }
    }
  }

  _startPingScan(params = {}) {
    const cmd = 'unbuffer';
    const subnet = params.subnet || '10.20.148.0/16';
    
    // SECURITY: Validate subnet input to prevent command injection
    if (!this._validateSubnet(subnet)) {
      const errorMsg = `[network-scan] Invalid subnet format: ${subnet}`;
      this._logs.push(errorMsg + '\n');
      this._progress = { status: 'error', error: errorMsg };
      return;
    }
    
    const args = ['nmap', '-sn', '-PE', '-T4', '--stats-every', '3s', subnet];
    let progressPercent = 0;
    this._logs.push(`[network-scan] Step 1: Discovering active hosts - ${cmd} ${args.join(' ')}\n`);
    this._progress = { status: 'scanning', phase: 'ping', output: `[network-scan] Step 1: Discovering active hosts - ${cmd} ${args.join(' ')}` };
    let buffer = '';
    try {
      this._scanProcess = spawn(cmd, args);
    } catch (err) {
      const errorMsg = `[network-scan] Failed to start ping scan: ${err.message}`;
      this._logs.push(errorMsg + '\n');
      this._progress = { status: 'error', error: errorMsg };
      try { process.stderr.write(errorMsg + '\n'); } catch (e) { console.error(errorMsg); }
      return;
    }
    this._logs.push('[network-scan] Step 1 started successfully\n');
    this._progress = { status: 'scanning', phase: 'ping', output: '[network-scan] Step 1 started successfully' };
    const handleOutput = (data) => {
      buffer += data.toString();
      let lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (line.trim() !== '') {
          // Parse nmap stats line for progress
          let percent = null;
          let overallPercent = null;
          
          // Track chunk completion and overall progress
          const statsMatch = line.match(/Stats:.*?(\d+) hosts completed \((\d+)%\)/);
          if (statsMatch) {
            const hostsCompletedThisChunk = parseInt(statsMatch[1], 10);
            const chunkPercent = parseInt(statsMatch[2], 10);
            
            // Calculate overall progress if we know total expected hosts
            if (this._totalExpectedHosts > 0) {
              // Estimate current chunk's total hosts scanned so far
              this._totalHostsScanned = Math.max(this._totalHostsScanned, 
                (this._currentChunk * 4096) + hostsCompletedThisChunk);
              
              overallPercent = Math.round((this._totalHostsScanned / this._totalExpectedHosts) * 100);
              overallPercent = Math.min(overallPercent, 95); // Cap to avoid showing 100% too early
              
              this._logs.push(`[network-scan] Overall progress: ${overallPercent}% (${this._totalHostsScanned}/${this._totalExpectedHosts} hosts, chunk ${this._currentChunk + 1}/${this._totalChunks})\n`);
            }
            
            percent = chunkPercent;
          }
          
          const pingTimingMatch = line.match(/Ping Scan Timing: About ([\d.]+)% done;/);
          if (pingTimingMatch) {
            percent = Math.round(parseFloat(pingTimingMatch[1]));
          }
          
          // Detect chunk transitions (when nmap restarts scanning from a new range)
          const newChunkMatch = line.match(/Starting Nmap.*against (\d+) hosts/);
          if (newChunkMatch) {
            this._currentChunk++;
            this._logs.push(`[network-scan] Starting chunk ${this._currentChunk + 1}/${this._totalChunks}\n`);
          }
          
          // For ping scans, also track based on ETA if available
          const etaMatch = line.match(/ETA: (\d+):(\d+):(\d+)/);
          if (etaMatch && percent === null) {
            // Estimate progress based on time - this is a rough estimate
            const elapsed = (Date.now() - this._stepStartTime) / 1000;
            const totalEta = parseInt(etaMatch[1]) * 3600 + parseInt(etaMatch[2]) * 60 + parseInt(etaMatch[3]);
            if (totalEta > 0) {
              percent = Math.round((elapsed / (elapsed + totalEta)) * 100);
              percent = Math.min(percent, 95); // Cap at 95% to avoid showing 100% too early
            }
          }
          
          // Use overall progress if available, otherwise fall back to chunk progress
          const displayPercent = overallPercent !== null ? overallPercent : (percent !== null ? Math.min(percent, 100) : progressPercent);
          if (displayPercent !== progressPercent) {
            progressPercent = displayPercent;
          }

          // Extract active hosts from ping scan output
          const hostUpMatch = line.match(/Nmap scan report for (.+)/);
          if (hostUpMatch) {
            const host = hostUpMatch[1].trim();
            // Extract IP address if it's in format "hostname (ip)"
            const ipMatch = host.match(/\(([0-9.]+)\)$/);
            const ip = ipMatch ? ipMatch[1] : host;
            if (!this._activeHosts.includes(ip)) {
              this._activeHosts.push(ip);
              this._logs.push(`[network-scan] Found active host: ${ip}\n`);
              try {
                process.stdout.write(`[network-scan] Found active host: ${ip}\n`);
              } catch (e) {
                console.log(`[network-scan] Found active host: ${ip}`);
              }
            }
          }

          this._logs.push(line + '\n');
          this._progress = { 
            status: 'scanning', 
            phase: 'ping', 
            output: line, 
            progress: progressPercent,
            totalExpectedHosts: this._totalExpectedHosts,
            totalHostsScanned: this._totalHostsScanned,
            currentChunk: this._currentChunk + 1,
            totalChunks: this._totalChunks
          };
          // Print to Docker logs
          try {
            process.stdout.write(line + '\n');
          } catch (e) {
            console.log(line);
          }
        }
      }
    };
    this._scanProcess.stdout.on('data', handleOutput);
    this._scanProcess.stderr.on('data', handleOutput);
    this._scanProcess.on('close', async (code) => {
      if (buffer && buffer.trim() !== '') {
        this._logs.push(buffer + '\n');
        this._progress = { status: 'scanning', phase: 'ping', output: buffer };
        buffer = '';
      }
      if (this._logs.length <= 2) {
        const noOutputMsg = '[network-scan] No output received from ping scan. Check installation and permissions.';
        this._logs.push(noOutputMsg + '\n');
        try { process.stdout.write(noOutputMsg + '\n'); } catch (e) { console.log(noOutputMsg); }
      }
      
      // Ensure minimum step duration before proceeding
      await this._ensureMinimumStepDuration();
      
      const closeMsg = `[network-scan] Step 1 completed with exit code ${code}. Found ${this._activeHosts.length} active hosts.`;
      this._logs.push(closeMsg + '\n');
      try { process.stdout.write(closeMsg + '\n'); } catch (e) { console.log(closeMsg); }
      
      if (this._cancelled) {
        this._progress = { status: 'cancelled' };
        this._scanProcess = null;
        return;
      }

      if (code !== 0) {
        this._progress = { status: 'error', error: `Ping scan failed with exit code ${code}` };
        this._scanProcess = null;
        return;
      }

      // Start port scan if we found any active hosts
      if (this._activeHosts.length > 0) {
        this._scanProcess = null;
        this._startPortScan();
      } else {
        this._generateFinalReport();
        this._progress = { 
          status: 'completed', 
          code, 
          phase: 'ping', 
          activeHosts: this._activeHosts,
          totalExpectedHosts: this._totalExpectedHosts,
          totalHostsScanned: this._totalHostsScanned,
          currentChunk: this._currentChunk + 1,
          totalChunks: this._totalChunks
        };
        this._scanProcess = null;
      }
    });
    this._scanProcess.on('error', (err) => {
      this._progress = { status: 'error', error: err.message };
      this._scanProcess = null;
    });
  }

  _startPortScan() {
    if (this._activeHosts.length === 0) {
      this._progress = { status: 'completed', phase: 'port', activeHosts: this._activeHosts };
      return;
    }

    this._currentPhase = 'port';
    this._stepStartTime = Date.now(); // Reset timer for this step
    const cmd = 'unbuffer';
    const hostList = this._activeHosts.join(' ');
    
    // Use our custom port list instead of nmap's top-ports
    const portList = NetworkScanService.COMMON_PORTS.join(',');
    const args = ['nmap', '-sT', '-T4', '-p', portList, '--stats-every', '5s', ...this._activeHosts];
    let progressPercent = 0;
    let totalHosts = this._activeHosts.length;
    let completedHosts = 0;
    
    this._logs.push(`[network-scan] Step 2: Identifying active ports on ${this._activeHosts.length} hosts: ${cmd} nmap -sT -p ${portList} --stats-every 5s ${hostList}\n`);
    this._logs.push(`[network-scan] Scanning ${NetworkScanService.COMMON_PORTS.length} custom ports: ${NetworkScanService.COMMON_PORTS.slice(0, 10).join(', ')}...\n`);
    this._progress = { status: 'scanning', phase: 'port', output: `[network-scan] Step 2: Identifying active ports on ${this._activeHosts.length} hosts` };
    
    let buffer = '';
    try {
      this._scanProcess = spawn(cmd, args);
    } catch (err) {
      const errorMsg = `[network-scan] Failed to start port scan: ${err.message}`;
      this._logs.push(errorMsg + '\n');
      this._progress = { status: 'error', error: errorMsg };
      try { process.stderr.write(errorMsg + '\n'); } catch (e) { console.error(errorMsg); }
      return;
    }
    
    this._logs.push('[network-scan] Step 2 started successfully\n');
    this._progress = { status: 'scanning', phase: 'port', output: '[network-scan] Step 2 started successfully' };
    
    const handleOutput = (data) => {
      buffer += data.toString();
      let lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (line.trim() !== '') {
          // Parse nmap stats line for progress - multiple patterns
          let percent = null;
          
          // Primary: Stats line with percentage
          const statsMatch = line.match(/Stats:.*?(\d+) hosts completed \((\d+)%\)/);
          if (statsMatch) {
            completedHosts = parseInt(statsMatch[1], 10);
            percent = parseInt(statsMatch[2], 10);
            this._logs.push(`[network-scan] Progress: ${percent}% (${completedHosts}/${totalHosts} hosts)\n`);
          }
          
          // Secondary: Connect scan timing
          const connectTimingMatch = line.match(/Connect Scan Timing: About ([\d.]+)% done/);
          if (connectTimingMatch) {
            percent = Math.round(parseFloat(connectTimingMatch[1]));
            this._logs.push(`[network-scan] Scan timing: ${percent}% complete\n`);
          }
          
          // Tertiary: Overall timing percentage if available
          const overallTimingMatch = line.match(/(\d+)% done/);
          if (overallTimingMatch && !connectTimingMatch) {
            const candidatePercent = parseInt(overallTimingMatch[1], 10);
            if (candidatePercent <= 100) {
              percent = candidatePercent;
            }
          }
          
          // Alternative progress calculation based on hosts scanned
          if (percent === null && completedHosts > 0) {
            percent = Math.round((completedHosts / totalHosts) * 100);
          }
          
          if (percent !== null) {
            progressPercent = Math.min(percent, 100); // Cap at 100%
          }

          // Extract open ports and log IP-port combinations
          const portMatch = line.match(/^(\d+\/\w+)\s+open/);
          const scanReportMatch = line.match(/Nmap scan report for (.+)/);
          
          if (scanReportMatch) {
            // Track current host being scanned
            this._currentScanHost = scanReportMatch[1].trim();
            const ipMatch = this._currentScanHost.match(/\(([0-9.]+)\)$/);
            this._currentScanIP = ipMatch ? ipMatch[1] : this._currentScanHost;
            // Initialize ports array for this host if not exists
            if (!this._openPorts[this._currentScanIP]) {
              this._openPorts[this._currentScanIP] = [];
            }
            
            // Update progress based on hosts being processed
            const hostIndex = this._activeHosts.indexOf(this._currentScanIP);
            if (hostIndex !== -1) {
              const hostProgress = Math.round(((hostIndex + 1) / totalHosts) * 100);
              if (hostProgress > progressPercent) {
                progressPercent = hostProgress;
              }
            }
          } else if (portMatch && this._currentScanIP) {
            const port = portMatch[1];
            const portNum = port.split('/')[0]; // Extract just the port number
            const result = `${this._currentScanIP} - ${port}`;
            
            // Store the port for this host
            if (!this._openPorts[this._currentScanIP].includes(portNum)) {
              this._openPorts[this._currentScanIP].push(portNum);
            }
            
            this._logs.push(`[network-scan] Found open port: ${result}\n`);
            try {
              process.stdout.write(`[network-scan] Found open port: ${result}\n`);
            } catch (e) {
              console.log(`[network-scan] Found open port: ${result}`);
            }
          }

          this._logs.push(line + '\n');
          this._progress = { 
            status: 'scanning', 
            phase: 'port', 
            output: line, 
            progress: progressPercent,
            totalExpectedHosts: this._totalExpectedHosts,
            totalHostsScanned: this._totalHostsScanned,
            currentChunk: this._currentChunk + 1,
            totalChunks: this._totalChunks
          };
          // Print to Docker logs
          try {
            process.stdout.write(line + '\n');
          } catch (e) {
            console.log(line);
          }
        }
      }
    };
    
    this._scanProcess.stdout.on('data', handleOutput);
    this._scanProcess.stderr.on('data', handleOutput);
    this._scanProcess.on('close', async (code) => {
      if (buffer && buffer.trim() !== '') {
        this._logs.push(buffer + '\n');
        this._progress = { status: 'scanning', phase: 'port', output: buffer };
        buffer = '';
      }
      
      // Ensure minimum step duration before proceeding
      await this._ensureMinimumStepDuration();
      
      const closeMsg = `[network-scan] Step 2 completed with exit code ${code}`;
      this._logs.push(closeMsg + '\n');
      try { process.stdout.write(closeMsg + '\n'); } catch (e) { console.log(closeMsg); }
      
      if (this._cancelled) {
        this._progress = { status: 'cancelled' };
        this._scanProcess = null;
        return;
      }

      if (code !== 0) {
        this._progress = { status: 'error', error: `Port scan failed with exit code ${code}` };
        this._scanProcess = null;
        return;
      }

      // Start HTTP/HTTPS probing if we found any open ports
      const hasOpenPorts = Object.keys(this._openPorts).some(host => this._openPorts[host].length > 0);
      if (hasOpenPorts) {
        this._scanProcess = null;
        this._startHttpProbe();
      } else {
        this._generateFinalReport();
        this._progress = { 
          status: 'completed', 
          code, 
          phase: 'port', 
          activeHosts: this._activeHosts,
          totalExpectedHosts: this._totalExpectedHosts,
          totalHostsScanned: this._totalHostsScanned,
          currentChunk: this._currentChunk + 1,
          totalChunks: this._totalChunks
        };
        this._scanProcess = null;
      }
    });
    
    this._scanProcess.on('error', (err) => {
      this._progress = { status: 'error', error: err.message };
      this._scanProcess = null;
    });
  }

  async _startHttpProbe() {
    this._currentPhase = 'probe';
    this._stepStartTime = Date.now(); // Reset timer for this step
    this._logs.push('[network-scan] Step 3: Probing for web interfaces\n');
    this._progress = { status: 'scanning', phase: 'probe', output: '[network-scan] Step 3: Probing for web interfaces', progress: 0 };

    let totalProbes = 0;
    let completedProbes = 0;

    // Count total probes needed and log what we're about to probe
    this._logs.push('[network-scan] Analyzing all discovered open ports for web services:\n');
    for (const host of Object.keys(this._openPorts)) {
      const allPorts = this._openPorts[host];
      if (allPorts.length > 0) {
        this._logs.push(`[network-scan] ${host}: Will probe all ${allPorts.length} open ports [${allPorts.join(', ')}]\n`);
        totalProbes += allPorts.length * 2; // HTTP + HTTPS for each port
      } else {
        this._logs.push(`[network-scan] ${host}: No open ports to probe\n`);
      }
    }

    if (totalProbes === 0) {
      this._logs.push('[network-scan] No open ports found to probe for web services\n');
      // Still enforce minimum duration even if no probes needed
      await this._ensureMinimumStepDuration();
      this._generateFinalReport();
      this._progress = { 
        status: 'completed', 
        phase: 'probe', 
        activeHosts: this._activeHosts,
        totalExpectedHosts: this._totalExpectedHosts,
        totalHostsScanned: this._totalHostsScanned,
        currentChunk: this._currentChunk + 1,
        totalChunks: this._totalChunks
      };
      return;
    }

    this._logs.push(`[network-scan] Starting ${totalProbes} web interface probes (HTTP + HTTPS on all open ports)\n`);

    // Initialize web GUIs storage
    for (const host of Object.keys(this._openPorts)) {
      this._webGuis[host] = [];
    }

    // Probe each host/port combination - ALL discovered ports, not just "common" ones
    for (const host of Object.keys(this._openPorts)) {
      for (const port of this._openPorts[host]) {
        if (!this._cancelled) {
          // Try HTTP
          await this._probeHttpEndpoint(host, port, 'http');
          completedProbes++;
          
          const httpProgress = Math.round((completedProbes / totalProbes) * 100);
          this._progress = { 
            status: 'scanning', 
            phase: 'probe', 
            output: `[network-scan] Probing HTTP ${host}:${port}`, 
            progress: httpProgress,
            totalExpectedHosts: this._totalExpectedHosts,
            totalHostsScanned: this._totalHostsScanned,
            currentChunk: this._currentChunk + 1,
            totalChunks: this._totalChunks
          };
          
          // Try HTTPS
          await this._probeHttpEndpoint(host, port, 'https');
          completedProbes++;
          
          const httpsProgress = Math.round((completedProbes / totalProbes) * 100);
          this._progress = { 
            status: 'scanning', 
            phase: 'probe', 
            output: `[network-scan] Probing HTTPS ${host}:${port}`, 
            progress: httpsProgress,
            totalExpectedHosts: this._totalExpectedHosts,
            totalHostsScanned: this._totalHostsScanned,
            currentChunk: this._currentChunk + 1,
            totalChunks: this._totalChunks
          };
          
          // Small delay to avoid overwhelming services
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    if (!this._cancelled) {
      // Ensure minimum step duration before completing
      await this._ensureMinimumStepDuration();
      this._generateFinalReport();
      this._progress = { 
        status: 'completed', 
        phase: 'probe', 
        activeHosts: this._activeHosts, 
        progress: 100,
        totalExpectedHosts: this._totalExpectedHosts,
        totalHostsScanned: this._totalHostsScanned,
        currentChunk: this._currentChunk + 1,
        totalChunks: this._totalChunks
      };
    }
  }

  _processResponse(url, host, port, protocol, statusCode, headers, responseBody, resolve) {
    try {
      this._logs.push(`[network-scan] ${url} - HTTP response received (${statusCode})\n`);
      
      // Enhanced detection logic
      let isWebInterface = false;
      let detectionReason = '';
      let pageTitle = null;
      
      // Check status codes that indicate web services
      if (statusCode && (
        (statusCode >= 200 && statusCode < 400) || // Success and redirects
        statusCode === 401 || // Unauthorized (auth required)
        statusCode === 403 || // Forbidden (access denied but service exists)
        statusCode === 404 || // Not found (but web server is responding)
        statusCode === 405 || // Method not allowed (but server responding)
        statusCode === 500 || // Internal server error (but web server exists)
        statusCode === 502 || // Bad gateway (reverse proxy exists)
        statusCode === 503    // Service unavailable (web server exists but overloaded)
      )) {
        isWebInterface = true;
        detectionReason = `HTTP status ${statusCode}`;
      }
      
      // Check for web server headers
      if (headers) {
        const serverHeader = headers.server || headers.Server || '';
        const contentType = headers['content-type'] || headers['Content-Type'] || '';
        const setCookie = headers['set-cookie'] || headers['Set-Cookie'] || '';
        
        if (serverHeader.toLowerCase().includes('nginx') || 
            serverHeader.toLowerCase().includes('apache') ||
            serverHeader.toLowerCase().includes('iis') ||
            serverHeader.toLowerCase().includes('lighttpd') ||
            serverHeader.toLowerCase().includes('caddy') ||
            serverHeader.toLowerCase().includes('express') ||
            contentType.includes('text/html') ||
            contentType.includes('application/json') ||
            setCookie.length > 0) {
          isWebInterface = true;
          detectionReason += detectionReason ? `, server headers` : 'server headers';
        }
      }
      
      // Simple title extraction
      if (responseBody && responseBody.toLowerCase().includes('<title')) {
        const titleMatch = responseBody.match(/<title[^>]*>\s*(.*?)\s*<\/title>/is);
        if (titleMatch && titleMatch[1]) {
          pageTitle = titleMatch[1].trim()
            .replace(/<[^>]*>/g, '')
            .replace(/&[a-zA-Z0-9#]+;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (pageTitle.length > 80) {
            pageTitle = pageTitle.substring(0, 77) + '...';
          }
          
          if (pageTitle.length < 2) {
            pageTitle = null;
          } else {
            this._logs.push(`[network-scan] ${url} - Found title: "${pageTitle}"\n`);
          }
        }
      }
      
      // Check for web content indicators
      if (responseBody) {
        const bodyLower = responseBody.toLowerCase();
        if (bodyLower.includes('<html') || 
            bodyLower.includes('<!doctype html') ||
            bodyLower.includes('<body') ||
            bodyLower.includes('<title') ||
            bodyLower.includes('<script') ||
            bodyLower.includes('<link') ||
            bodyLower.includes('application/json') ||
            bodyLower.includes('api') ||
            bodyLower.includes('login') ||
            bodyLower.includes('dashboard')) {
          isWebInterface = true;
          detectionReason += detectionReason ? `, HTML content` : 'HTML content';
        }
      }
      
      if (isWebInterface) {
        // Store as structured object in the webGuis format
        const guiInfo = {
          protocol: protocol,
          host: host,
          port: port,
          url: url,
          status: statusCode,
          reason: detectionReason,
          title: pageTitle
        };
        
        // Check if this exact URL already exists
        const existingGui = this._webGuis[host].find(gui => 
          gui.protocol === protocol && gui.port === port
        );
        
        if (!existingGui) {
          this._webGuis[host].push(guiInfo);
          
          // Enhanced logging with title information
          const titleInfo = pageTitle ? ` - Title: "${pageTitle}"` : '';
          const logMessage = `[network-scan] ✓ Found web interface: ${url} (Status: ${statusCode}, ${detectionReason})${titleInfo}\n`;
          this._logs.push(logMessage);
          try {
            process.stdout.write(logMessage);
          } catch (e) {
            console.log(logMessage.replace('\n', ''));
          }
        }
      } else {
        this._logs.push(`[network-scan] ${url} - Not a web interface (Status: ${statusCode})\n`);
      }
      
      resolve();
    } catch (error) {
      this._logs.push(`[network-scan] ${url} - Error processing response: ${error.message}\n`);
      resolve();
    }
  }

  async _probeHttpEndpoint(host, port, protocol) {
    return new Promise((resolve) => {
      const timeout = 12000; // Increased to 12 seconds for better title extraction
      const url = `${protocol}://${host}:${port}`;
      
      // Use a simple HTTP request approach that works in Node.js
      const options = {
        hostname: host,
        port: parseInt(port),
        path: '/',
        method: 'GET',
        timeout: timeout,
        rejectUnauthorized: false, // Allow self-signed certificates
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'identity', // Avoid compression to ensure we can read the response
          'Connection': 'close',
          'Cache-Control': 'no-cache'
        }
      };

      this._logs.push(`[network-scan] Probing ${url}...\n`);

      try {
        const module = protocol === 'https' ? https : http;
        
        // Declare these variables in outer scope so they're accessible in all handlers
        let statusCode, headers, responseBody = '';
        let earlyTermination = false;
        
        const req = module.request(options, (res) => {
          statusCode = res.statusCode;
          headers = res.headers;
          
          // Collect response body for analysis with size limit
          const maxBodySize = 50000; // 50KB limit for title extraction
          let bodySizeExceeded = false;
          
          res.on('data', (chunk) => {
            if (responseBody.length < maxBodySize) {
              responseBody += chunk.toString();
              // If we have enough content and found a title tag, we can stop early
              if (responseBody.length > 2000 && responseBody.toLowerCase().includes('</title>')) {
                // We have enough content with a title, no need to wait for more
                this._logs.push(`[network-scan] ${url} - Early termination, found title in first 2KB\n`);
                earlyTermination = true;
                req.destroy();
                return;
              }
            } else if (!bodySizeExceeded) {
              bodySizeExceeded = true;
              earlyTermination = true;
              this._logs.push(`[network-scan] ${url} - Response too large, truncating for title extraction\n`);
              req.destroy();
              return;
            }
          });
          
          res.on('end', () => {
            this._logs.push(`[network-scan] ${url} responded with status ${statusCode}, body length: ${responseBody.length}\n`);
            
            // Debug: Log content type and response info
            const contentType = headers['content-type'] || headers['Content-Type'] || 'unknown';
            this._logs.push(`[network-scan] ${url} content-type: ${contentType}\n`);
            
            // Enhanced detection logic
            let isWebInterface = false;
            let detectionReason = '';
            let pageTitle = null;
            
            // Check status codes that indicate web services
            if (statusCode && (
              (statusCode >= 200 && statusCode < 400) || // Success and redirects
              statusCode === 401 || // Unauthorized (auth required)
              statusCode === 403 || // Forbidden (access denied but service exists)
              statusCode === 404 || // Not found (but web server is responding)
              statusCode === 405 || // Method not allowed (but server responding)
              statusCode === 500 || // Internal server error (but web server exists)
              statusCode === 502 || // Bad gateway (reverse proxy exists)
              statusCode === 503    // Service unavailable (web server exists but overloaded)
            )) {
              isWebInterface = true;
              detectionReason = `HTTP status ${statusCode}`;
            }
            
            // Check for web server headers
            if (headers) {
              const serverHeader = headers.server || headers.Server || '';
              const contentType = headers['content-type'] || headers['Content-Type'] || '';
              const setCookie = headers['set-cookie'] || headers['Set-Cookie'] || '';
              
              if (serverHeader.toLowerCase().includes('nginx') || 
                  serverHeader.toLowerCase().includes('apache') ||
                  serverHeader.toLowerCase().includes('iis') ||
                  serverHeader.toLowerCase().includes('lighttpd') ||
                  serverHeader.toLowerCase().includes('caddy') ||
                  serverHeader.toLowerCase().includes('express') ||
                  contentType.includes('text/html') ||
                  contentType.includes('application/json') ||
                  setCookie.length > 0) {
                isWebInterface = true;
                detectionReason += detectionReason ? `, server headers` : 'server headers';
              }
            }
            
            // Check response body for web content indicators and extract title
            if (responseBody) {
              const bodyLower = responseBody.toLowerCase();
              
              // More robust title extraction with multiple fallback methods
              if (bodyLower.includes('<title')) {
                // Try multiple title extraction patterns
                let titleMatch = null;
                
                // Pattern 1: Standard title tags (most common)
                titleMatch = responseBody.match(/<title[^>]*>\s*(.*?)\s*<\/title>/is);
                
                // Pattern 2: Title with attributes or multiline
                if (!titleMatch || !titleMatch[1]?.trim()) {
                  titleMatch = responseBody.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                }
                
                // Pattern 3: Self-closing title (rare but possible)
                if (!titleMatch || !titleMatch[1]?.trim()) {
                  titleMatch = responseBody.match(/<title[^>]*\/>/i);
                }
                
                if (titleMatch && titleMatch[1]) {
                  pageTitle = titleMatch[1].trim();
                  
                  // Debug logging for title extraction
                  this._logs.push(`[network-scan] Raw title found: "${titleMatch[1]}"\n`);
                  
                  // Enhanced title cleaning
                  pageTitle = pageTitle
                    // Remove HTML tags that might be inside title
                    .replace(/<[^>]*>/g, '')
                    // Decode common HTML entities
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&apos;/g, "'")
                    .replace(/&nbsp;/g, ' ')
                    // Decode numeric HTML entities
                    .replace(/&#(\d+);/g, (match, num) => String.fromCharCode(parseInt(num, 10)))
                    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
                    // Clean up whitespace
                    .replace(/\s+/g, ' ')
                    .replace(/\n/g, ' ')
                    .replace(/\r/g, ' ')
                    .replace(/\t/g, ' ')
                    .trim();
                  
                  // Limit title length for display
                  if (pageTitle.length > 80) {
                    pageTitle = pageTitle.substring(0, 77) + '...';
                  }
                  
                  // Don't use empty or very short titles
                  if (pageTitle.length < 2) {
                    this._logs.push(`[network-scan] Title too short, discarding: "${pageTitle}"\n`);
                    pageTitle = null;
                  } else {
                    this._logs.push(`[network-scan] Cleaned title: "${pageTitle}"\n`);
                  }
                } else {
                  this._logs.push(`[network-scan] Title tag found but no content extracted\n`);
                }
              }
              
              // Fallback title extraction from meta tags or common patterns
              if (!pageTitle) {
                // Try to extract from Open Graph title
                const ogTitleMatch = responseBody.match(/<meta[^>]*property\s*=\s*['"]\s*og:title\s*['"]\s*content\s*=\s*['"]([^'"]*)['"]/i);
                if (ogTitleMatch && ogTitleMatch[1]?.trim()) {
                  pageTitle = ogTitleMatch[1].trim();
                  this._logs.push(`[network-scan] Using OG title: "${pageTitle}"\n`);
                }
                
                // Try to extract from Twitter title
                if (!pageTitle) {
                  const twitterTitleMatch = responseBody.match(/<meta[^>]*name\s*=\s*['"]\s*twitter:title\s*['"]\s*content\s*=\s*['"]([^'"]*)['"]/i);
                  if (twitterTitleMatch && twitterTitleMatch[1]?.trim()) {
                    pageTitle = twitterTitleMatch[1].trim();
                    this._logs.push(`[network-scan] Using Twitter title: "${pageTitle}"\n`);
                  }
                }
                
                // Try to extract from first h1 tag
                if (!pageTitle) {
                  const h1Match = responseBody.match(/<h1[^>]*>\s*(.*?)\s*<\/h1>/is);
                  if (h1Match && h1Match[1]?.trim()) {
                    let h1Title = h1Match[1].replace(/<[^>]*>/g, '').trim();
                    if (h1Title.length > 2 && h1Title.length < 100) {
                      pageTitle = h1Title;
                      this._logs.push(`[network-scan] Using H1 as title: "${pageTitle}"\n`);
                    }
                  }
                }
                
                // Try common application patterns and API endpoints
                if (!pageTitle) {
                  // Look for JSON API responses that might indicate the service type
                  if (contentType.includes('application/json')) {
                    try {
                      const jsonData = JSON.parse(responseBody);
                      // Look for common service identifier fields
                      const possibleTitles = [
                        jsonData.name,
                        jsonData.title,
                        jsonData.service,
                        jsonData.application,
                        jsonData.app_name,
                        jsonData.product_name,
                        jsonData.server_name
                      ].filter(Boolean);
                      
                      if (possibleTitles.length > 0) {
                        pageTitle = possibleTitles[0].toString().trim();
                        this._logs.push(`[network-scan] Using JSON service name: "${pageTitle}"\n`);
                      }
                    } catch (e) {
                      // JSON parsing failed, continue with other methods
                    }
                  }
                  
                  // Look for common service indicators in URL or headers
                  if (!pageTitle) {
                    const serverHeader = (headers.server || headers.Server || '').toLowerCase();
                    const commonServices = {
                      'nginx': 'Nginx Web Server',
                      'apache': 'Apache Web Server',
                      'iis': 'IIS Web Server',
                      'traefik': 'Traefik Proxy',
                      'caddy': 'Caddy Web Server',
                      'plex': 'Plex Media Server',
                      'jellyfin': 'Jellyfin Media Server',
                      'emby': 'Emby Media Server',
                      'sonarr': 'Sonarr',
                      'radarr': 'Radarr',
                      'lidarr': 'Lidarr',
                      'prowlarr': 'Prowlarr',
                      'nzbget': 'NZBGet',
                      'sabnzbd': 'SABnzbd',
                      'portainer': 'Portainer',
                      'grafana': 'Grafana',
                      'prometheus': 'Prometheus',
                      'kibana': 'Kibana',
                      'elasticsearch': 'Elasticsearch'
                    };
                    
                    for (const [key, name] of Object.entries(commonServices)) {
                      if (serverHeader.includes(key) || bodyLower.includes(key)) {
                        pageTitle = name;
                        this._logs.push(`[network-scan] Using service detection: "${pageTitle}"\n`);
                        break;
                      }
                    }
                  }
                }
                
                // Clean up fallback titles
                if (pageTitle) {
                  pageTitle = pageTitle
                    .replace(/<[^>]*>/g, '')
                    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                    
                  if (pageTitle.length > 80) {
                    pageTitle = pageTitle.substring(0, 77) + '...';
                  }
                  
                  if (pageTitle.length < 2) {
                    pageTitle = null;
                  }
                }
              }
              
              // Check for web content indicators
              if (bodyLower.includes('<html') || 
                  bodyLower.includes('<!doctype html') ||
                  bodyLower.includes('<body') ||
                  bodyLower.includes('<title') ||
                  bodyLower.includes('<script') ||
                  bodyLower.includes('<link') ||
                  bodyLower.includes('application/json') ||
                  bodyLower.includes('api') ||
                  bodyLower.includes('login') ||
                  bodyLower.includes('dashboard')) {
                isWebInterface = true;
                detectionReason += detectionReason ? `, HTML content` : 'HTML content';
              }
            }
            
            if (isWebInterface) {
              // Store as structured object instead of string
              const guiInfo = {
                protocol: protocol,
                host: host,
                port: port,
                url: url,
                status: statusCode,
                reason: detectionReason,
                title: pageTitle // Add the extracted title
              };
              
              // Check if this exact URL already exists
              const existingGui = this._webGuis[host].find(gui => 
                gui.protocol === protocol && gui.port === port
              );
              
              if (!existingGui) {
                this._webGuis[host].push(guiInfo);
                
                // Enhanced logging with title information
                const titleInfo = pageTitle ? ` - Title: "${pageTitle}"` : '';
                const logMessage = `[network-scan] ✓ Found web interface: ${url} (Status: ${statusCode}, ${detectionReason})${titleInfo}\n`;
                this._logs.push(logMessage);
                try {
                  process.stdout.write(logMessage);
                } catch (e) {
                  console.log(logMessage.replace('\n', ''));
                }
              }
            } else {
              this._logs.push(`[network-scan] ${url} - Not a web interface (Status: ${statusCode})\n`);
            }
            
            resolve();
          });
        });

        req.on('error', (err) => {
          // More detailed error logging for debugging
          const errorCode = err.code || 'UNKNOWN';
          const errorMessage = err.message || 'Unknown error';
          this._logs.push(`[network-scan] ${url} - Connection failed: ${errorCode} - ${errorMessage}\n`);
          
          // Some error codes might still indicate a service exists
          if (errorCode === 'ECONNRESET' || errorCode === 'EPIPE') {
            this._logs.push(`[network-scan] ${url} - Service might exist but dropped connection\n`);
          }
          
          resolve();
        });

        req.on('close', () => {
          // Handle early termination due to size limits or title found
          if (earlyTermination) {
            this._logs.push(`[network-scan] ${url} - Request closed early, processing available data\n`);
            // Process the response data we have if we have valid response data
            if (statusCode && headers) {
              this._processResponse(url, host, port, protocol, statusCode, headers, responseBody, resolve);
            } else {
              // No valid response data, just resolve
              resolve();
            }
          }
        });

        req.on('timeout', () => {
          this._logs.push(`[network-scan] ${url} - Timeout after ${timeout}ms\n`);
          req.destroy();
          resolve();
        });

        req.setTimeout(timeout);
        req.end();
      } catch (error) {
        this._logs.push(`[network-scan] ${url} - Request error: ${error.message}\n`);
        resolve();
      }
    });
  }

  _generateFinalReport() {
    this._logs.push('\n[network-scan] =================== SCAN COMPLETE ===================\n');
    this._logs.push('[network-scan] Final Report:\n');
    this._logs.push('[network-scan] \n');

    if (this._activeHosts.length === 0) {
      this._logs.push('[network-scan] No active hosts found.\n');
    } else {
      // Calculate totals
      const totalOpenPorts = Object.values(this._openPorts).reduce((total, ports) => total + ports.length, 0);
      const totalWebServices = Object.values(this._webGuis).reduce((total, guis) => total + guis.length, 0);
      
      this._logs.push(`[network-scan] Summary: ${this._activeHosts.length} active host(s), ${totalOpenPorts} open port(s), ${totalWebServices} web service(s)\n`);
      this._logs.push('[network-scan] \n');

      for (const host of this._activeHosts) {
        this._logs.push(`[network-scan] ┌─ Host: ${host}\n`);
        
        // Show open ports
        const ports = this._openPorts[host] || [];
        if (ports.length > 0) {
          this._logs.push(`[network-scan] │  Open Ports: ${ports.join(', ')}\n`);
        } else {
          this._logs.push('[network-scan] │  Open Ports: None detected\n');
        }
        
        // Show web interfaces with more detail including titles
        const guis = this._webGuis[host] || [];
        if (guis.length > 0) {
          this._logs.push(`[network-scan] │  Web Services:\n`);
          for (const gui of guis) {
            const status = gui.status ? ` (${gui.status})` : '';
            const reason = gui.reason ? ` - ${gui.reason}` : '';
            const title = gui.title ? ` - "${gui.title}"` : '';
            this._logs.push(`[network-scan] │    ↳ ${gui.url}${status}${reason}${title}\n`);
          }
        } else {
          this._logs.push('[network-scan] │  Web Services: None detected\n');
        }
        
        this._logs.push('[network-scan] └─\n');
      }
      
      // Quick access section if web services found
      if (totalWebServices > 0) {
        this._logs.push('[network-scan] \n');
        this._logs.push('[network-scan] Quick Access URLs:\n');
        for (const host of Object.keys(this._webGuis)) {
          for (const gui of this._webGuis[host]) {
            const title = gui.title ? ` - ${gui.title}` : '';
            this._logs.push(`[network-scan] • ${gui.url}${title}\n`);
          }
        }
      }
    }

    this._logs.push('[network-scan] =====================================================\n');
    
    // Output to console as well
    const reportLines = this._logs.slice(-30); // Get more lines for the enhanced report
    for (const line of reportLines) {
      try {
        process.stdout.write(line);
      } catch (e) {
        console.log(line.replace('\n', ''));
      }
    }
  }

  cancel_scan() {
    if (this._scanProcess) {
      this._cancelled = true;
      this._scanProcess.kill();
    }
  }

  get_progress() {
    // Return both progress and all logs, including active hosts and enhanced tracking
    return { 
      ...this._progress, 
      logs: [...this._logs],
      activeHosts: [...this._activeHosts],
      openPorts: { ...this._openPorts },
      webGuis: { ...this._webGuis },
      currentPhase: this._currentPhase,
      totalExpectedHosts: this._totalExpectedHosts,
      totalHostsScanned: this._totalHostsScanned,
      currentChunk: this._currentChunk + 1, // Display as 1-based
      totalChunks: this._totalChunks
    };
  }

  get_logs() {
    return this._logs;
  }
}
