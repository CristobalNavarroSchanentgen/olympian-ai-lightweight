# MongoDB Replica Set Configuration for Multi-host Deployment

## Problem Solved

**Issue**: `MongoServerError: Transaction numbers are only allowed on a replica set member or mongos`

**Root Cause**: The ArtifactService requires MongoDB transactions for atomic operations when creating/updating artifacts and their associated message metadata. MongoDB standalone instances do not support transactions.

**Solution**: Configure MongoDB as a single-node replica set in subproject 3 (multi-host deployment).

## What Was Changed

### 1. Updated `docker-compose.prod.yml`

- **MongoDB Service**: Now runs with `--replSet rs0` flag
- **New Service**: `mongodb-replica-init` automatically initializes the replica set
- **Updated Dependencies**: Backend waits for replica set initialization
- **New Volume**: `mongodb-config` for replica set metadata
- **Updated Health Checks**: Verify replica set status

### 2. Updated `.env.example`

- **Clear Documentation**: Explains replica set requirements for subproject 3
- **Multiple Examples**: Various MongoDB URI configurations
- **Important Notes**: Why replica sets are critical for artifact functionality

## How It Works

1. **MongoDB starts** with replica set configuration (`--replSet rs0`)
2. **Initialization service** automatically runs `rs.initiate()` 
3. **Health checks** ensure replica set is ready
4. **Backend starts** only after replica set is operational
5. **ArtifactService** can now use transactions successfully

## Deployment Instructions

### For Containerized MongoDB (Recommended)

```bash
# Use the default configuration - no changes needed
make quick-docker-multi
```

The MongoDB URI will automatically be: `mongodb://mongodb:27017/olympian_ai_lite?replicaSet=rs0`

### For External MongoDB

If using external MongoDB, ensure it's configured as a replica set:

```bash
# 1. Start MongoDB with replica set
mongod --replSet rs0 --bind_ip_all

# 2. Initialize replica set
mongosh --eval "rs.initiate()"

# 3. Verify status
mongosh --eval "rs.status()"

# 4. Update your .env file
MONGODB_URI=mongodb://your-host:27017/olympian_ai_lite?replicaSet=rs0
```

## Verification

After deployment, check the logs for:

```
✅ Replica set initialized successfully
🎨 [ArtifactService] Creating artifact for conversation: xxx
✅ [ArtifactService] Artifact created with ID: xxx
```

## Why This Matters

**Artifact Consistency**: Without transactions, there's a risk of:
- Orphaned artifacts (artifact created but message not updated)
- Missing artifacts (message updated but artifact creation failed)
- Inconsistent state when users navigate to previous conversations

**Production Readiness**: Replica sets provide:
- Transaction support for ACID compliance
- Better error handling and recovery
- Foundation for future scaling and high availability

## Subproject Differences

| Subproject | MongoDB Config | Transactions | Use Case |
|------------|----------------|--------------|----------|
| 1 & 2 (same-host) | Standalone | ❌ Not supported | Simple deployments |
| 3 (multi-host) | Replica set (rs0) | ✅ Fully supported | Production-like |

## Troubleshooting

### Common Issues

1. **Startup Delays**: The replica set initialization adds ~10-30 seconds to startup time
2. **Volume Permissions**: Ensure MongoDB has write access to data volumes
3. **Network Connectivity**: Replica set requires stable network communication

### Debug Commands

```bash
# Check replica set status
docker exec olympian-mongodb mongosh --eval "rs.status()"

# View initialization logs
docker logs olympian-mongodb-replica-init

# Test transactions
docker exec olympian-mongodb mongosh --eval "
  session = db.getMongo().startSession();
  session.startTransaction();
  print('✅ Transactions supported');
  session.abortTransaction();
"
```

---

This configuration ensures **subproject 3** has robust artifact functionality with full data consistency guarantees.
