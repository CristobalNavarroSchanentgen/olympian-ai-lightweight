#!/bin/bash

# MCP Shutdown Diagnostic Script
echo "=== MCP Shutdown Diagnostics ==="
echo "Starting diagnostic monitoring..."

# Create logs directory if not exists
mkdir -p logs/mcp

# Function to check backend health
check_backend() {
    curl -s http://localhost:3000/api/mcp/health > /dev/null 2>&1
    return $?
}

# Function to capture diagnostic info
capture_diagnostics() {
    echo ""
    echo "[$(date)] Capturing diagnostics..."
    
    # Check docker containers
    echo "Docker containers status:"
    docker ps --filter "name=olympian" --format "table {{.Names}}	{{.Status}}	{{.Ports}}"
    
    # Check backend logs
    echo ""
    echo "Recent backend logs:"
    docker logs olympian-backend --tail 20 2>&1 | grep -E "(MCP|error|shutdown|exit)"
    
    # Check system resources
    echo ""
    echo "System resources:"
    echo "Memory: $(docker stats --no-stream olympian-backend --format "{{.MemUsage}}" 2>/dev/null)"
    echo "CPU: $(docker stats --no-stream olympian-backend --format "{{.CPUPerc}}" 2>/dev/null)"
    
    # Check MCP diagnostic endpoint
    echo ""
    echo "MCP Diagnostics:"
    curl -s http://localhost:3000/api/mcp/diagnostics 2>/dev/null | jq '.' || echo "API unavailable"
}

# Monitor loop
BACKEND_DOWN=false
COUNTER=0

while true; do
    if check_backend; then
        if [ "$BACKEND_DOWN" = true ]; then
            echo "[$(date)] Backend recovered!"
            capture_diagnostics
            BACKEND_DOWN=false
        fi
        
        # Periodic health check
        if [ $((COUNTER % 30)) -eq 0 ]; then
            echo -n "."
        fi
    else
        if [ "$BACKEND_DOWN" = false ]; then
            echo ""
            echo "[$(date)] Backend appears to be down or restarting!"
            capture_diagnostics
            BACKEND_DOWN=true
        fi
    fi
    
    COUNTER=$((COUNTER + 1))
    sleep 2
done
