# Nautilus Security Setup Guide

## 🔒 Security Overview

Nautilus now includes **server-side authentication** to protect configuration changes and node editing. This document explains the security features and setup.

## 🚨 Important Security Information

### Default Configuration
- **No default password.** The server **refuses to start** unless `NAUTILUS_ADMIN_PASSWORD` is set, and it explicitly rejects the insecure value `1234`.
- **Production**: use a strong, unique password (12+ chars). It is read from the environment only and is never committed (`.env` is git-ignored).

### What's Protected
- ✅ **Settings Panel**: Requires authentication
- ✅ **Node Editing**: Requires authentication  
- ✅ **Configuration Changes**: Server-side validation
- ✅ **Session Management**: Server-side token validation
- ✅ **Webhook Configuration**: Requires authentication
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

> ⚠️ **Internet-exposed deployments.** The read endpoints listed below are public at the application layer, and `GET /api/config` currently includes node **addresses** (internal IPs/ports, needed for status correlation). Until status/history are re-keyed to hide addresses (roadmap), you **must** front Nautilus with a reverse proxy that:
> - enforces **HTTPS + HSTS** (terminate TLS at the proxy; redirect HTTP→HTTPS), and
> - **restricts who can reach it** — proxy auth, an IP allow-list, or a VPN.
>
> The single shared admin password is the only application-layer gate, so a brute-force-resistant proxy front (and/or fail2ban on the login route) is strongly recommended.

> 💾 **Persistent data.** Set `NAUTILUS_DATA_DIR` to a path **outside the git working tree** so the history database survives `git reset --hard` deploys. `history.db*` and `config.json` are git-ignored and must never be committed.

### 3. Authentication Flow

1. **First Access**: User attempts to open settings or edit nodes
2. **Password Prompt**: Browser prompts for admin password
3. **Server Validation**: Password validated server-side
4. **Session Token**: Server issues secure session token
5. **Authenticated Requests**: All config changes use the token
6. **Session Expiry**: Tokens expire after 24 hours

### 4. API Endpoints

#### Public (No Authentication Required)
- `GET /api/config` - Read configuration (⚠️ currently includes node addresses — see Limitations)
- `GET /api/status` - Node status monitoring
- `GET /api/status/:id` - Individual node status
- `GET /api/history`, `GET /api/history/:id` - Status history
- `GET /api/network-scan/status` - Whether a scan is currently active
- `GET /api/version` - Build version (git sha/tag)
- `GET /health` - Basic health check

#### Protected (Authentication Required)
- `POST /api/config` - Update configuration
- `POST /api/auth/login` - Authenticate user
- `POST /api/auth/logout` - End session
- `GET /api/auth/validate` - Check session validity
- `POST /api/network-scan/start` - Start network scan
- `GET /api/network-scan/progress` - Get scan progress
- `POST /api/network-scan/cancel` - Cancel network scan
- `GET /api/minecraft/status` - Query a Minecraft server (now requires auth — closes an unauthenticated SSRF)
- `POST /api/test-connection` - Test a node configuration

## 🔧 Development vs Production

### Development Mode
- Uses `.env` file for configuration
- A password is still required — the server will not start without `NAUTILUS_ADMIN_PASSWORD` (and `1234` is rejected)
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
- ✅ Rate limiting protection (5 attempts per 15 minutes)
- ✅ IP-based brute force protection

### Network Security
- ✅ Input validation for network scans (CIDR validation)
- ✅ Private IP range restrictions (RFC 1918)
- ✅ Command injection protection
- ✅ Network scan authentication required

### Client-Side Security
- ✅ No passwords stored in browser
- ✅ Session tokens in sessionStorage (cleared on browser close)
- ✅ Automatic token validation
- ✅ Graceful authentication failures
- ✅ Manual logout functionality

### HTTP Security Headers
- ✅ X-Content-Type-Options: nosniff
- ✅ X-Frame-Options: DENY
- ✅ X-XSS-Protection: 1; mode=block
- ✅ Content-Security-Policy configured
- ✅ Server information hiding

### Input Validation
- ✅ Configuration structure validation
- ✅ Required field validation
- ✅ Type checking for critical fields
- ✅ Error handling and user feedback
- ✅ Subnet format validation
- ✅ Private IP range enforcement

## � Webhook Integration

Nautilus provides webhook notifications for node status changes:

### Webhook Features
- ✅ **Status Notifications**: Send webhooks when nodes go online or offline
- ✅ **Configurable Endpoints**: Set custom webhook URLs
- ✅ **Selective Events**: Choose which events trigger notifications
- ✅ **JSON Payloads**: Simple message with timestamp

### Security Considerations
- ⚠️ **Authentication**: Webhook endpoints should implement authentication
- ⚠️ **HTTPS Recommended**: Use secure endpoints for webhook delivery
- ⚠️ **Validation**: Verify webhook source in your receiving application

### Webhook Payload Example
```json
{
  "message": "❌ Server-01 has gone offline",
  "timestamp": "2025-07-10T14:30:45.123Z"
}
```

Status indicators:
- ✅ Green checkmark for nodes coming online
- ❌ Red X for nodes going offline

## �🚨 Security Limitations

### Current Limitations
- ❌ **No user management**: Single admin password only
- ⚠️ **Rate limiting is login-only**: failed logins are rate-limited (5 attempts per IP → 15-minute lockout, plus a fixed 1s delay per failure), but the public read endpoints are **not** rate-limited yet
- ❌ **In-memory sessions**: Lost on server restart
- ❌ **No audit logging**: No change history tracking
- ❌ **No 2FA**: Password-only authentication
- ⚠️ **Public reads expose node addresses**: `GET /api/config` currently includes internal addresses/ports (needed for status correlation). Restrict access at the proxy until this is re-keyed (see roadmap).

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
