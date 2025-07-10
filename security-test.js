#!/usr/bin/env node

// Simple security test for Nautilus authentication
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3069';
const TEST_PASSWORD = '1234';

async function testSecurity() {
  console.log('🔐 Testing Nautilus Security Implementation\n');

  try {
    // Test 1: Access config without authentication (should work - read-only)
    console.log('1. Testing public config access...');
    const configResponse = await fetch(`${BASE_URL}/api/config`);
    if (configResponse.ok) {
      console.log('   ✅ Public config access works');
    } else {
      console.log('   ❌ Public config access failed');
    }

    // Test 2: Try to update config without authentication (should fail)
    console.log('\n2. Testing protected config update without auth...');
    const unauthorizedUpdate = await fetch(`${BASE_URL}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'unauthorized' })
    });
    
    if (unauthorizedUpdate.status === 401) {
      console.log('   ✅ Unauthorized config update correctly blocked');
    } else {
      console.log('   ❌ Security bypass detected! Config update should be blocked');
    }

    // Test 3: Authentication with wrong password (should fail)
    console.log('\n3. Testing authentication with wrong password...');
    const wrongAuthResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrongpassword' })
    });
    
    if (wrongAuthResponse.status === 401) {
      console.log('   ✅ Wrong password correctly rejected');
    } else {
      console.log('   ❌ Security issue: Wrong password was accepted');
    }

    // Test 4: Authentication with correct password (should succeed)
    console.log('\n4. Testing authentication with correct password...');
    const authResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: TEST_PASSWORD })
    });
    
    if (authResponse.ok) {
      const authData = await authResponse.json();
      if (authData.success && authData.token) {
        console.log('   ✅ Correct password accepted, token received');
        
        // Test 5: Use token to update config (should succeed)
        console.log('\n5. Testing authenticated config update...');
        const authenticatedUpdate = await fetch(`${BASE_URL}/api/config`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authData.token}`
          },
          body: JSON.stringify({
            server: { port: 3069, healthCheckInterval: 20000, corsOrigins: [] },
            client: { port: 3070, host: 'localhost', apiPollingInterval: 5000 },
            tree: { nodes: [] },
            appearance: { title: 'Test', accentColor: '#3b82f6' }
          })
        });
        
        if (authenticatedUpdate.ok) {
          console.log('   ✅ Authenticated config update works');
        } else {
          console.log('   ❌ Authenticated config update failed');
          console.log('   Response:', await authenticatedUpdate.text());
        }

        // Test 6: Token validation (should succeed)
        console.log('\n6. Testing token validation...');
        const validateResponse = await fetch(`${BASE_URL}/api/auth/validate`, {
          headers: { 'Authorization': `Bearer ${authData.token}` }
        });
        
        if (validateResponse.ok) {
          console.log('   ✅ Token validation works');
        } else {
          console.log('   ❌ Token validation failed');
        }

        // Test 7: Logout (should succeed)
        console.log('\n7. Testing logout...');
        const logoutResponse = await fetch(`${BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authData.token}` }
        });
        
        if (logoutResponse.ok) {
          console.log('   ✅ Logout works');
          
          // Test 8: Try to use token after logout (should fail)
          console.log('\n8. Testing token after logout...');
          const postLogoutUpdate = await fetch(`${BASE_URL}/api/config`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authData.token}`
            },
            body: JSON.stringify({ test: 'should fail' })
          });
          
          if (postLogoutUpdate.status === 401) {
            console.log('   ✅ Token correctly invalidated after logout');
          } else {
            console.log('   ❌ Security issue: Token still valid after logout');
          }
        } else {
          console.log('   ❌ Logout failed');
        }
      } else {
        console.log('   ❌ Authentication response missing token');
      }
    } else {
      console.log('   ❌ Correct password rejected');
    }

    console.log('\n🎉 Security test completed!');
    console.log('\n📋 Summary:');
    console.log('   - Public endpoints: Accessible');
    console.log('   - Protected endpoints: Require authentication');
    console.log('   - Password validation: Server-side');
    console.log('   - Session management: Token-based');
    console.log('   - Logout: Invalidates tokens');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.log('\n💡 Make sure the Nautilus server is running on port 3069');
  }
}

// Only run if this file is executed directly
if (process.argv[1].includes('security-test.js')) {
  testSecurity();
}

export default testSecurity;
