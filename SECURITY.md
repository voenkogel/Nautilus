# Nautilus Security Setup Guide

## 🔒 Security Overview

Nautilus now includes **server-side authentication** to protect configuration changes and node editing. This document explains the security features and setup.

## 🚨 Important Security Information

### Default Configuration
- **Default Password**: `1234` (for development only)
- **Production**: **MUST** change the password immediately

### What's Protected
- ✅ **Settings Panel**: Requires authentication
- ✅ **Node Editing**: Requires authentication  
- ✅ **Configuration Changes**: Server-side validation
- ✅ **Session Management**: Server-side token validation
- ❌ **Node Viewing**: Public (read-only)
- ❌ **Status Monitoring**: Public (read-only)

## 🛠️ Setup Instructions

### 1. Environment Variables

Create or update your `.env` file:

```bash
# Copy the example file
cp .env.example .env
```

**Required Security Variables:**
```bash
# CRITICAL: Change this password for production!
NAUTILUS_ADMIN_PASSWORD=your_secure_password_here

# Optional: Other settings
NAUTILUS_SERVER_PORT=3069
NAUTILUS_CLIENT_PORT=3070
NAUTILUS_HOST=localhost
```

### 2. Production Security Checklist

**Before deploying to production:**

1. **Change the admin password**:
   ```bash
   # In .env file
   NAUTILUS_ADMIN_PASSWORD=YourSuperSecurePasswordHere123!
   ```

2. **Use HTTPS** (recommended):
   - Deploy behind a reverse proxy (nginx, Apache)
   - Use SSL certificates
   - Update CORS origins if needed

3. **Network Security**:
   - Restrict access to admin ports
   - Use firewalls appropriately
   - Consider VPN access for admin functions

### 3. Authentication Flow

1. **First Access**: User attempts to open settings or edit nodes
2. **Password Prompt**: Browser prompts for admin password
3. **Server Validation**: Password validated server-side
4. **Session Token**: Server issues secure session token
5. **Authenticated Requests**: All config changes use the token
6. **Session Expiry**: Tokens expire after 24 hours

### 4. API Endpoints

#### Public (No Authentication Required)
- `GET /api/config` - Read configuration
- `GET /api/status` - Node status monitoring
- `GET /api/status/:id` - Individual node status

#### Protected (Authentication Required)
- `PUT /api/config` - Update configuration
- `POST /api/auth/login` - Authenticate user
- `POST /api/auth/logout` - End session
- `GET /api/auth/validate` - Check session validity

## 🔧 Development vs Production

### Development Mode
- Uses `.env` file for configuration
- Default password: `1234`
- Session tokens stored in browser sessionStorage
- Detailed error messages

### Production Recommendations
- **Strong password** (12+ characters, mixed case, numbers, symbols)
- **Environment variables** set at system level
- **HTTPS only**
- **Restricted network access**
- **Regular password rotation**

## 🛡️ Security Features

### Server-Side Authentication
- ✅ Passwords validated server-side only
- ✅ Secure session token generation (crypto.randomBytes)
- ✅ Token-based API authentication
- ✅ Automatic session cleanup (24-hour expiry)
- ✅ Brute force protection (1-second delay on wrong password)

### Client-Side Security
- ✅ No passwords stored in browser
- ✅ Session tokens in sessionStorage (cleared on browser close)
- ✅ Automatic token validation
- ✅ Graceful authentication failures
- ✅ Manual logout functionality

### Input Validation
- ✅ Configuration structure validation
- ✅ Required field validation
- ✅ Type checking for critical fields
- ✅ Error handling and user feedback

## 🚨 Security Limitations

### Current Limitations
- ❌ **No user management**: Single admin password only
- ❌ **No rate limiting**: Basic delay only
- ❌ **In-memory sessions**: Lost on server restart
- ❌ **No audit logging**: No change history tracking
- ❌ **No 2FA**: Password-only authentication

### Future Enhancements (Roadmap)
- Multi-user support with roles
- Database-backed session storage
- Audit logging for all changes
- Rate limiting and IP blocking
- Two-factor authentication
- LDAP/OAuth integration

## 🆘 Troubleshooting

### Common Issues

**"Authentication required" errors:**
- Check if password is correct
- Verify `.env` file configuration
- Restart server after changing environment variables

**Session expired messages:**
- Sessions expire after 24 hours
- Manually logout and login again
- Check browser sessionStorage if issues persist

**Can't access settings:**
- Ensure server is running
- Check network connectivity
- Verify API endpoints are accessible

### Security Logs

Check server console for security-related messages:
- `✅ Authentication successful`
- `❌ Invalid password attempt`
- `🔄 Session token generated`
- `⚠️ Session expired`

## 📞 Support

For security-related questions or issues:
1. Check this documentation first
2. Review server console logs
3. Verify environment configuration
4. Test authentication flow manually

Remember: **Security is only as strong as your weakest configuration.** Always use strong passwords and keep your environment secure!
