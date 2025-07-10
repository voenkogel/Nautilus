// Quick test script for authentication
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3069';

async function quickTest() {
  try {
    console.log('🔐 Quick Authentication Test\n');
    
    // Step 1: Login
    console.log('1. Logging in...');
    const authResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '1234' })
    });
    
    if (!authResponse.ok) {
      console.log('❌ Login failed:', await authResponse.text());
      return;
    }
    
    const authData = await authResponse.json();
    console.log('✅ Login successful, token received');
    
    // Step 2: Test protected endpoint
    console.log('\n2. Testing protected config update...');
    const configResponse = await fetch(`${BASE_URL}/api/config`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.token}`
      },
      body: JSON.stringify({
        server: { port: 3069, healthCheckInterval: 20000, corsOrigins: [] },
        client: { port: 3070, host: 'localhost', apiPollingInterval: 5000 },
        tree: { nodes: [] },
        appearance: { title: 'Security Test', accentColor: '#3b82f6' }
      })
    });
    
    if (configResponse.ok) {
      console.log('✅ Protected endpoint works with authentication');
    } else {
      console.log('❌ Protected endpoint failed:', await configResponse.text());
    }
    
    // Step 3: Test without auth
    console.log('\n3. Testing without authentication...');
    const noAuthResponse = await fetch(`${BASE_URL}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'should fail' })
    });
    
    if (noAuthResponse.status === 401) {
      console.log('✅ Unauth request correctly blocked');
    } else {
      console.log('❌ Security bypass detected!');
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

quickTest();
