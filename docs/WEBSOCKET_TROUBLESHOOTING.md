# WebSocket Communication Troubleshooting Guide

## Multi-Host Deployment WebSocket Issues

### Quick Diagnosis

If model responses aren't reaching the frontend but backend logs show successful processing:

1. **Check browser console** for WebSocket connection errors
2. **Verify nginx configuration** is properly forwarding WebSocket connections
3. **Monitor backend logs** for Socket.IO event emission
4. **Test WebSocket connectivity** directly

### Common Issues & Solutions

#### 1. WebSocket Connection Fails

**Symptoms:**
- Frontend shows "model is thinking" indefinitely
- Browser console shows Socket.IO connection errors
- Backend logs show successful processing but no client connection

**Solutions:**
```bash
# Restart the multi-host deployment
make clean-build-multi
make quick-docker-multi

# Check nginx container logs
docker logs olympian-frontend

# Check backend container logs  
docker logs olympian-backend
```

#### 2. Connection Established But No Token Streaming

**Symptoms:**
- Backend logs show successful token generation
- Frontend WebSocket connects but doesn't receive tokens
- No browser console errors

**Debug Steps:**
```bash
# Enable detailed WebSocket logging
# In browser console, check:
window.webSocketChatService?.getConnectionInfo()

# Check backend WebSocket statistics via API
curl http://localhost:8080/api/health

# Monitor real-time nginx logs
docker logs -f olympian-frontend
```

#### 3. Transport Fallback Issues

**Symptoms:**
- WebSocket connection fails, no polling fallback
- Intermittent connection drops

**Solutions:**
- Ensure nginx WebSocket proxy configuration is correct
- Check firewall settings for WebSocket connections
- Verify client transport configuration allows fallback

### Debug Commands

#### Check Container Status
```bash
# Verify all containers are running
docker ps

# Check container health
docker inspect olympian-backend --format='{{.State.Health.Status}}'
docker inspect olympian-frontend --format='{{.State.Health.Status}}'
```

#### Test WebSocket Endpoint
```bash
# Test WebSocket handshake
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: test" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost:8080/socket.io/

# Should return HTTP 101 Switching Protocols
```

#### Monitor Network Traffic
```bash
# Monitor nginx access logs for WebSocket requests
docker logs olympian-frontend 2>&1 | grep socket.io

# Check for WebSocket upgrade requests
docker logs olympian-frontend 2>&1 | grep -i upgrade
```

### Enhanced Logging

#### Backend Logging
The enhanced WebSocketService now provides detailed logging:
- Socket connection/disconnection events
- Transport type and upgrades  
- Message routing and emission verification
- Token streaming progress
- Error conditions and recovery

#### Frontend Logging  
The enhanced client provides:
- Connection state monitoring
- Transport fallback tracking
- Message handler registration
- Reconnection attempts
- Performance metrics

### Configuration Verification

#### nginx.conf WebSocket Section
Verify this configuration exists in `docker/nginx/nginx.conf`:
```nginx
# SOCKET.IO WEBSOCKET & POLLING
location ~* ^/socket\.io/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    
    # Essential WebSocket headers
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Critical: Disable buffering
    proxy_buffering off;
    proxy_cache off;
    proxy_request_buffering off;
    
    # Extended timeouts for streaming
    proxy_connect_timeout 30s;
    proxy_send_timeout 3600s;
    proxy_read_timeout 3600s;
}
```

#### Backend Socket.IO Configuration
Verify server configuration in `packages/server/src/index.ts`:
```typescript
const io = new Server(httpServer, {
  cors: {
    origin: getCorsOrigin(),
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e8,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
});
```

### Performance Monitoring

#### Real-time Connection Status
```bash
# Check active WebSocket connections
curl http://localhost:8080/api/health | jq .websocket

# Monitor backend performance
curl http://localhost:8080/api/health | jq .
```

#### Browser DevTools Monitoring
1. Open DevTools → Network tab
2. Filter by "WS" to see WebSocket connections
3. Monitor WebSocket frames for token streaming
4. Check Console for detailed connection logs

### Recovery Procedures

#### Full Service Restart
```bash
# Complete rebuild and restart
make clean-build-multi
make quick-docker-multi

# Wait for all services to be healthy
make logs-backend
make logs-frontend
```

#### Selective Container Restart
```bash
# Restart just the frontend (nginx)
docker restart olympian-frontend

# Restart just the backend
docker restart olympian-backend
```

### Advanced Debugging

#### Enable Detailed Socket.IO Logging
In browser console:
```javascript
localStorage.debug = 'socket.io-client:*';
// Reload page to see detailed Socket.IO logs
```

#### Backend Debug Mode
Set environment variable:
```bash
DEBUG=socket.io:* make quick-docker-multi
```

#### Network Packet Capture
```bash
# Capture WebSocket traffic (if needed)
sudo tcpdump -i any -A 'port 8080 and (tcp[tcpflags] & tcp-syn != 0)'
```

## Escalation

If issues persist after following this guide:

1. **Collect logs:**
   ```bash
   # Save all relevant logs
   docker logs olympian-backend > backend.log 2>&1
   docker logs olympian-frontend > frontend.log 2>&1
   ```

2. **Document reproduction steps** with specific error messages

3. **Include environment details:**
   - Operating system
   - Docker version
   - Network configuration
   - Browser version and type

4. **Test with minimal configuration** to isolate the issue

## Related Documentation

- [Multi-host Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Architecture Overview](ARCHITECTURE.md)  
- [nginx Configuration](docs/nginx-configuration.md)
- [API Documentation](API.md)
