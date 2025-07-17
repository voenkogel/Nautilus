import { spawn } from 'child_process';

export class NetworkScanService {
  constructor() {
    this._scanProcess = null;
    this._cancelled = false;
    this._progress = { status: 'idle' };
    this._logs = [];
  }

  start_scan(params = {}) {
    if (this._scanProcess) throw new Error('Scan already running');
    this._cancelled = false;
    this._logs = [];
    this._progress = { status: 'starting' };
    const cmd = 'unbuffer';
    const subnet = params.subnet || '10.20.148.0/16';
    const args = ['nmap', '-sn', '-PE', '-T4', '--stats-every', '5s', subnet];
    let progressPercent = 0;
    this._logs.push(`[network-scan] Starting process: ${cmd} ${args.join(' ')}\n`);
    this._progress = { status: 'starting', output: `[network-scan] Starting process: ${cmd} ${args.join(' ')}` };
    let buffer = '';
    try {
      this._scanProcess = spawn(cmd, args);
    } catch (err) {
      const errorMsg = `[network-scan] Failed to start process: ${err.message}`;
      this._logs.push(errorMsg + '\n');
      this._progress = { status: 'error', error: errorMsg };
      try { process.stderr.write(errorMsg + '\n'); } catch (e) { console.error(errorMsg); }
      return;
    }
    this._logs.push('[network-scan] Process started successfully\n');
    this._progress = { status: 'scanning', output: '[network-scan] Process started successfully' };
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
          this._logs.push(line + '\n');
          this._progress = { status: 'scanning', output: line, progress: progressPercent };
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
        this._progress = { status: 'scanning', output: buffer };
        buffer = '';
      }
      if (this._logs.length <= 2) {
        const noOutputMsg = '[network-scan] No output received from nmap. Check installation and permissions.';
        this._logs.push(noOutputMsg + '\n');
        try { process.stdout.write(noOutputMsg + '\n'); } catch (e) { console.log(noOutputMsg); }
      }
      const closeMsg = `[network-scan] Process closed with exit code ${code}`;
      this._logs.push(closeMsg + '\n');
      try { process.stdout.write(closeMsg + '\n'); } catch (e) { console.log(closeMsg); }
      if (this._cancelled) {
        this._progress = { status: 'cancelled' };
      } else {
        this._progress = { status: 'completed', code };
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
    // Return both progress and all logs
    return { ...this._progress, logs: [...this._logs] };
  }

  get_logs() {
    return this._logs;
  }
}
