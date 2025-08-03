import { spawn } from 'child_process';

export class NetworkScanService {
  constructor() {
    this._scanProcess = null;
    this._cancelled = false;
    this._progress = { status: 'idle' };
    this._logs = [];
    this._activeHosts = [];
    this._currentPhase = 'idle'; // 'ping', 'port', 'completed'
  }

  start_scan(params = {}) {
    if (this._scanProcess) throw new Error('Scan already running');
    this._cancelled = false;
    this._logs = [];
    this._activeHosts = [];
    this._currentPhase = 'ping';
    this._progress = { status: 'starting' };
    
    // Start with ping scan
    this._startPingScan(params);
  }

  _startPingScan(params = {}) {
    const cmd = 'unbuffer';
    const subnet = params.subnet || '10.20.148.0/16';
    const args = ['nmap', '-sn', '-PE', '-T4', '--stats-every', '5s', subnet];
    let progressPercent = 0;
    this._logs.push(`[network-scan] Starting ping scan: ${cmd} ${args.join(' ')}\n`);
    this._progress = { status: 'scanning', phase: 'ping', output: `[network-scan] Starting ping scan: ${cmd} ${args.join(' ')}` };
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
    this._logs.push('[network-scan] Ping scan started successfully\n');
    this._progress = { status: 'scanning', phase: 'ping', output: '[network-scan] Ping scan started successfully' };
    const handleOutput = (data) => {
      buffer += data.toString();
      let lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (line.trim() !== '') {
          // Parse nmap stats line for progress
          let percent = null;
          const statsMatch = line.match(/Stats:.*?(\d+) hosts completed \((\d+)%\)/);
          if (statsMatch) {
            percent = parseInt(statsMatch[2], 10);
          }
          const pingTimingMatch = line.match(/Ping Scan Timing: About ([\d.]+)% done;/);
          if (pingTimingMatch) {
            percent = Math.round(parseFloat(pingTimingMatch[1]));
          }
          if (percent !== null) {
            progressPercent = percent;
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
          this._progress = { status: 'scanning', phase: 'ping', output: line, progress: progressPercent };
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
    this._scanProcess.on('close', (code) => {
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
      const closeMsg = `[network-scan] Ping scan completed with exit code ${code}. Found ${this._activeHosts.length} active hosts.`;
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
        this._progress = { status: 'completed', code, phase: 'ping', activeHosts: this._activeHosts };
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
    const cmd = 'unbuffer';
    const hostList = this._activeHosts.join(' ');
    const args = ['nmap', '-sT', '-T4', '--top-ports', '200', '--stats-every', '5s', ...this._activeHosts];
    let progressPercent = 0;
    
    this._logs.push(`[network-scan] Starting port scan on ${this._activeHosts.length} hosts: ${cmd} nmap -sT -T4 --top-ports 200 --stats-every 5s ${hostList}\n`);
    this._progress = { status: 'scanning', phase: 'port', output: `[network-scan] Starting port scan on ${this._activeHosts.length} hosts` };
    
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
    
    this._logs.push('[network-scan] Port scan started successfully\n');
    this._progress = { status: 'scanning', phase: 'port', output: '[network-scan] Port scan started successfully' };
    
    const handleOutput = (data) => {
      buffer += data.toString();
      let lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (line.trim() !== '') {
          // Parse nmap stats line for progress
          let percent = null;
          const statsMatch = line.match(/Stats:.*?(\d+) hosts completed \((\d+)%\)/);
          if (statsMatch) {
            percent = parseInt(statsMatch[2], 10);
          }
          const connectTimingMatch = line.match(/Connect Scan Timing: About ([\d.]+)% done;/);
          if (connectTimingMatch) {
            percent = Math.round(parseFloat(connectTimingMatch[1]));
          }
          if (percent !== null) {
            progressPercent = percent;
          }

          // Extract open ports and log IP-port combinations
          const portMatch = line.match(/^(\d+\/\w+)\s+open/);
          const scanReportMatch = line.match(/Nmap scan report for (.+)/);
          
          if (scanReportMatch) {
            // Track current host being scanned
            this._currentScanHost = scanReportMatch[1].trim();
            const ipMatch = this._currentScanHost.match(/\(([0-9.]+)\)$/);
            this._currentScanIP = ipMatch ? ipMatch[1] : this._currentScanHost;
          } else if (portMatch && this._currentScanIP) {
            const port = portMatch[1];
            const result = `${this._currentScanIP} - ${port}`;
            this._logs.push(`[network-scan] Found open port: ${result}\n`);
            try {
              process.stdout.write(`[network-scan] Found open port: ${result}\n`);
            } catch (e) {
              console.log(`[network-scan] Found open port: ${result}`);
            }
          }

          this._logs.push(line + '\n');
          this._progress = { status: 'scanning', phase: 'port', output: line, progress: progressPercent };
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
    this._scanProcess.on('close', (code) => {
      if (buffer && buffer.trim() !== '') {
        this._logs.push(buffer + '\n');
        this._progress = { status: 'scanning', phase: 'port', output: buffer };
        buffer = '';
      }
      
      const closeMsg = `[network-scan] Port scan completed with exit code ${code}`;
      this._logs.push(closeMsg + '\n');
      try { process.stdout.write(closeMsg + '\n'); } catch (e) { console.log(closeMsg); }
      
      if (this._cancelled) {
        this._progress = { status: 'cancelled' };
      } else {
        this._progress = { status: 'completed', code, phase: 'port', activeHosts: this._activeHosts };
      }
      this._scanProcess = null;
    });
    
    this._scanProcess.on('error', (err) => {
      this._progress = { status: 'error', error: err.message };
      this._scanProcess = null;
    });
  }

  cancel_scan() {
    if (this._scanProcess) {
      this._cancelled = true;
      this._scanProcess.kill();
    }
  }

  get_progress() {
    // Return both progress and all logs, including active hosts
    return { 
      ...this._progress, 
      logs: [...this._logs],
      activeHosts: [...this._activeHosts],
      currentPhase: this._currentPhase
    };
  }

  get_logs() {
    return this._logs;
  }
}
