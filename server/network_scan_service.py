import asyncio
import threading
import time
from typing import Optional, Dict, Any

class NetworkScanService:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._cancel_event = threading.Event()
        self._progress: Dict[str, Any] = {}
        self._params: Dict[str, Any] = {}
        self._logs: list = []
        self._lock = threading.Lock()

    def start_scan(self, params: Dict[str, Any]):
        """
        Start the network scan asynchronously. If a scan is already running, it will not start another.
        """
        if self._task and not self._task.done():
            raise RuntimeError("Scan already running")
        self._cancel_event.clear()
        self._params = params
        self._logs = []
        loop = asyncio.get_event_loop()
        self._task = loop.create_task(self._run_scan())

    async def _run_scan(self):
        # Run nmap command and log output to console
        cmd = ["nmap", "-sn", "-T4", "10.20.148.0/16"]
        startup_msg = f"Starting network scan: {' '.join(cmd)}"
        self._append_log(startup_msg)
        self._set_progress({'status': 'starting', 'cmd': ' '.join(cmd), 'logs': self._logs})
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
        except Exception as e:
            error_msg = f"Failed to start nmap: {e}"
            self._append_log(error_msg)
            self._set_progress({'status': 'error', 'error': str(e), 'logs': self._logs})
            print(error_msg)
            return
        try:
            while True:
                if self._cancel_event.is_set():
                    process.terminate()
                    cancel_msg = "Scan cancelled."
                    self._append_log(cancel_msg)
                    self._set_progress({'status': 'cancelled', 'logs': self._logs})
                    print(cancel_msg)
                    return
                line = await process.stdout.readline()
                if not line:
                    break
                decoded = line.decode().rstrip()
                self._append_log(decoded)
                print(decoded)
                self._set_progress({'status': 'scanning', 'output': decoded, 'logs': self._logs})
            await process.wait()
            success_msg = "Scan completed."
            self._append_log(success_msg)
            self._set_progress({'status': 'completed', 'logs': self._logs})
            print(success_msg)
        except Exception as e:
            error_msg = f"Scan error: {e}"
            self._append_log(error_msg)
            self._set_progress({'status': 'error', 'error': str(e), 'logs': self._logs})
            print(error_msg)

    def cancel_scan(self):
        """
        Cancel the running scan.
        """
        self._cancel_event.set()

    def get_progress(self) -> Dict[str, Any]:
        """
        Get the current progress data, including logs.
        """
        with self._lock:
            progress = dict(self._progress)
            progress['logs'] = list(self._logs)
            return progress
    def _append_log(self, log: str):
        with self._lock:
            self._logs.append(log)

    def get_params(self) -> Dict[str, Any]:
        """
        Get the parameters for the current scan.
        """
        return dict(self._params)

    def _set_progress(self, progress: Dict[str, Any]):
        with self._lock:
            self._progress = progress

# Example usage (to be integrated with API endpoints):
# service = NetworkScanService()
# service.start_scan({'steps': 20})
# ...
# service.cancel_scan()
# progress = service.get_progress()
# params = service.get_params()
