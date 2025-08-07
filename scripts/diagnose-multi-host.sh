#!/bin/bash

# Multi-Host Deployment Diagnostic Script for Olympian AI Lightweight
# This script helps diagnose common issues with the multi-host deployment

set -e

# Colors for output
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

echo -e "${CYAN}🔍 Multi-Host Deployment Diagnostics${RESET}"
echo ""

# Check if we're in multi-host mode
if [ "${DEPLOYMENT_MODE}" != "docker-multi-host" ]; then
    echo -e "${RED}❌ Not in multi-host mode. Current mode: ${DEPLOYMENT_MODE}${RESET}"
    echo "Run 'make env-docker-multi-interactive' to configure multi-host deployment"
    exit 1
fi

echo -e "${GREEN}✅ Multi-host deployment mode detected${RESET}"
echo ""

    local service_name="$1"
    local container_name="$2"
    
    echo -e "${CYAN}🔍 Checking ${service_name}...${RESET}"
    
    if docker ps | grep -q "${container_name}"; then
        local running=$(docker inspect --format='{{.State.Status}}' "${container_name}")
        
        echo "  Status: ${running}"
        if [ "${status}" != "no-healthcheck" ]; then
        fi
        
        if [ "${running}" != "running" ]; then
            echo -e "  ${RED}❌ Container not running${RESET}"
            return 1
            return 1
        else
            return 0
        fi
    else
        echo -e "  ${RED}❌ Container not found${RESET}"
        return 1
    fi
}

# Function to check resource usage
check_resource_usage() {
    local container_name="$1"
    echo -e "${CYAN}📊 Resource usage for ${container_name}:${RESET}"
    
    if docker ps | grep -q "${container_name}"; then
        docker stats --no-stream --format "  CPU: {{.CPUPerc}} | Memory: {{.MemUsage}} | Net I/O: {{.NetIO}}" "${container_name}"
    else
        echo -e "  ${RED}❌ Container not running${RESET}"
    fi
}

# Function to test connectivity
test_connectivity() {
    local service_name="$1"
    local url="$2"
    
    echo -e "${CYAN}🌐 Testing connectivity to ${service_name}...${RESET}"
    
    if curl -sf "${url}" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✅ ${service_name} accessible at ${url}${RESET}"
        return 0
    else
        echo -e "  ${RED}❌ ${service_name} not accessible at ${url}${RESET}"
        return 1
    fi
}

# Function to check logs for errors
check_logs_for_errors() {
    local container_name="$1"
    echo -e "${CYAN}📋 Recent errors in ${container_name} logs:${RESET}"
    
    if docker ps | grep -q "${container_name}"; then
        local error_count=$(docker logs --tail=100 "${container_name}" 2>&1 | grep -i "error\|failed\|exception" | wc -l)
        if [ "${error_count}" -gt 0 ]; then
            echo -e "  ${YELLOW}⚠️  Found ${error_count} error(s) in last 100 log lines${RESET}"
            docker logs --tail=100 "${container_name}" 2>&1 | grep -i "error\|failed\|exception" | tail -5 | sed 's/^/    /'
        else
            echo -e "  ${GREEN}✅ No recent errors found${RESET}"
        fi
    else
        echo -e "  ${RED}❌ Container not running${RESET}"
    fi
}

# Main diagnostic checks
echo "=================="

backend_healthy=true
frontend_healthy=true
mongodb_healthy=true

    backend_healthy=false
fi
echo ""

    frontend_healthy=false
fi
echo ""

    mongodb_healthy=false
fi
echo ""

echo -e "${CYAN}📊 Resource Usage${RESET}"
echo "==================="
check_resource_usage "olympian-backend"
check_resource_usage "olympian-frontend"
check_resource_usage "olympian-mongodb"
echo ""

echo -e "${CYAN}🌐 Connectivity Tests${RESET}"
echo "======================="

connectivity_issues=false

# Test local frontend
if ! test_connectivity "Frontend" "http://localhost:${APP_PORT:-8080}/health"; then
    connectivity_issues=true
fi

# Test backend API
if ! test_connectivity "Backend API" "http://localhost:4000/api/health"; then
    connectivity_issues=true
fi

# Test Ollama connectivity (if configured)
if [ -n "${OLLAMA_HOST}" ]; then
    if ! test_connectivity "External Ollama" "${OLLAMA_HOST}/api/tags"; then
        connectivity_issues=true
    fi
fi
echo ""

echo -e "${CYAN}📋 Log Analysis${RESET}"
echo "=================="
check_logs_for_errors "olympian-backend"
echo ""
check_logs_for_errors "olympian-frontend"
echo ""

# Configuration validation
echo -e "${CYAN}⚙️  Configuration Validation${RESET}"
echo "================================"

config_issues=false

if [ -z "${OLLAMA_HOST}" ]; then
    echo -e "${RED}❌ OLLAMA_HOST not configured${RESET}"
    config_issues=true
else
    echo -e "${GREEN}✅ OLLAMA_HOST: ${OLLAMA_HOST}${RESET}"
fi

if [ -z "${MONGODB_URI}" ]; then
    echo -e "${RED}❌ MONGODB_URI not configured${RESET}"
    config_issues=true
else
    echo -e "${GREEN}✅ MONGODB_URI configured${RESET}"
fi

if [ -z "${JWT_SECRET}" ] || [ "${JWT_SECRET}" = "your-jwt-secret-key-here-replace-in-production" ]; then
    echo -e "${YELLOW}⚠️  JWT_SECRET not properly configured${RESET}"
fi
echo ""

# Summary and recommendations
echo -e "${CYAN}📋 Summary & Recommendations${RESET}"
echo "=================================="

if [ "${backend_healthy}" = true ] && [ "${frontend_healthy}" = true ] && [ "${mongodb_healthy}" = true ] && [ "${connectivity_issues}" = false ] && [ "${config_issues}" = false ]; then
    echo -e "${GREEN}🎉 All systems operational!${RESET}"
else
    echo -e "${YELLOW}⚠️  Issues detected:${RESET}"
    
    if [ "${backend_healthy}" = false ]; then
        echo "  • Backend container issues - check: make logs-backend"
    fi
    
    if [ "${frontend_healthy}" = false ]; then
        echo "  • Frontend container issues - check: make logs-frontend"
    fi
    
    if [ "${mongodb_healthy}" = false ]; then
        echo "  • MongoDB container issues - check: make logs-mongodb"
    fi
    
    if [ "${connectivity_issues}" = true ]; then
        echo "  • Network connectivity issues - check firewall and DNS"
    fi
    
    if [ "${config_issues}" = true ]; then
        echo "  • Configuration issues - run: make env-docker-multi-interactive"
    fi
    
    echo ""
    echo -e "${CYAN}🔧 Suggested fixes:${RESET}"
    echo "  1. Restart services: make restart-prod"
    echo "  2. Rebuild containers: make build-prod-clean && make up-prod"
    echo "  3. Check detailed logs: make logs-backend"
    echo "  4. Verify .env configuration"
fi

echo ""
echo -e "${CYAN}📊 Quick Stats${RESET}"
echo "==============="
echo "Deployment mode: ${DEPLOYMENT_MODE}"
echo "App port: ${APP_PORT:-8080}"
echo "Ollama host: ${OLLAMA_HOST:-Not configured}"
echo "Containers running: $(docker ps --filter "label=com.docker.compose.project=olympian-ai-lightweight" --format "{{.Names}}" | wc -l)"
