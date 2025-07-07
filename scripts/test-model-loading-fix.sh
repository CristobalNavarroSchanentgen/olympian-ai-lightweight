#!/bin/bash

# Test script for subproject 3 model loading fix
# This script tests the /api/models/list endpoint to ensure it returns the correct format

echo "🧪 Testing Model Loading Fix for Subproject 3"
echo "============================================"

# Default to localhost:4000 for multi-host deployment
API_URL="${API_URL:-http://localhost:4000}"

echo "📡 Testing endpoint: $API_URL/api/models/list"
echo ""

# Make the request and store response
RESPONSE=$(curl -s -X GET "$API_URL/api/models/list" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json")

# Check if curl succeeded
if [ $? -ne 0 ]; then
  echo "❌ Failed to connect to API endpoint"
  exit 1
fi

# Pretty print the response
echo "📥 Response received:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Validate response format
if echo "$RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
  if [ "$SUCCESS" = "true" ]; then
    echo "✅ Response has correct format with success=true"
    
    # Check for data array
    if echo "$RESPONSE" | jq -e '.data | type == "array"' >/dev/null 2>&1; then
      MODEL_COUNT=$(echo "$RESPONSE" | jq '.data | length')
      echo "✅ Data field is an array with $MODEL_COUNT models"
      
      # List first 5 models if any
      if [ "$MODEL_COUNT" -gt 0 ]; then
        echo ""
        echo "📋 First few models:"
        echo "$RESPONSE" | jq -r '.data[:5][]' | sed 's/^/   - /'
      fi
    else
      echo "❌ Data field is not an array"
      exit 1
    fi
    
    # Check for timestamp
    if echo "$RESPONSE" | jq -e '.timestamp' >/dev/null 2>&1; then
      TIMESTAMP=$(echo "$RESPONSE" | jq -r '.timestamp')
      echo "✅ Timestamp present: $TIMESTAMP"
    else
      echo "⚠️  No timestamp field found"
    fi
    
  else
    echo "❌ Response has success=false"
    ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
    echo "   Error: $ERROR"
    exit 1
  fi
else
  echo "❌ Response does not have expected format (missing 'success' field)"
  echo "   This might be the old format. Response structure:"
  echo "$RESPONSE" | jq 'keys' 2>/dev/null || echo "   Could not parse response"
  exit 1
fi

echo ""
echo "🎉 Model loading fix verified successfully!"
