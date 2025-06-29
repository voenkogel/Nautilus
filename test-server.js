// Quick test to check if the server works
import fetch from 'node-fetch';

async function testServer() {
  try {
    const response = await fetch('http://localhost:3001/health');
    const data = await response.json();
    console.log('Server health:', data);
    
    const statusResponse = await fetch('http://localhost:3001/api/status');
    const statusData = await statusResponse.json();
    console.log('Status data:', statusData);
  } catch (error) {
    console.error('Server not running or error:', error.message);
  }
}

testServer();
