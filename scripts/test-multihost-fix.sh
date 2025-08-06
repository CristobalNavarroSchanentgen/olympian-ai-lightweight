#!/bin/bash
echo "Testing multihost container fixes..."

# Clean up existing containers
docker-compose -f docker-compose.multihost.yml down -v

# Start only Redis and MongoDB to test
docker-compose -f docker-compose.multihost.yml up -d redis mongodb

# Wait for services
sleep 10

# Check Redis
echo "Testing Redis connection..."
docker exec olympian-redis redis-cli ping

# Check MongoDB
echo "Testing MongoDB connection..."
docker exec olympian-mongodb mongosh --eval "db.adminCommand('ping')"

echo "Test complete. Run 'docker-compose -f docker-compose.multihost.yml logs' to check for errors"
