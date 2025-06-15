import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { DatabaseService } from '../services/DatabaseService';
import { ConnectionScanner } from '../services/ConnectionScanner';
import { Connection, ConnectionTestResult } from '@olympian/shared';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();
const db = DatabaseService.getInstance();
const scanner = new ConnectionScanner();

// Validation schemas
const createConnectionSchema = z.object({
  type: z.enum(['ollama', 'mcp', 'database']),
  name: z.string().min(1),
  endpoint: z.string().min(1),
  authentication: z.object({
    type: z.enum(['none', 'basic', 'token', 'certificate']),
    credentials: z.record(z.string()).optional(),
  }).optional(),
});

// Database document type (with ObjectId)
type ConnectionDoc = Omit<Connection, '_id'> & { _id?: ObjectId };

// Helper function to format connection document
function formatConnection(doc: any): Connection {
  return {
    ...doc,
    _id: doc._id?.toString ? doc._id.toString() : doc._id,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt),
  };
}

// Get all connections
router.get('/', async (_req, res, next) => {
  try {
    const connections = await db.connections.find({}).toArray();
    res.json({
      success: true,
      data: connections.map(formatConnection),
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Get connection by ID
router.get('/:id', async (req, res, next) => {
  try {
    const connection = await db.connections.findOne({
      _id: new ObjectId(req.params.id),
    } as any);

    if (!connection) {
      throw new AppError(404, 'Connection not found');
    }

    res.json({
      success: true,
      data: formatConnection(connection),
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Create manual connection
router.post('/', async (req, res, next) => {
  try {
    const validated = createConnectionSchema.parse(req.body);
    
    const connection: ConnectionDoc = {
      ...validated,
      status: 'offline',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      isManual: true,
    };

    const result = await db.connections.insertOne(connection as any);
    
    res.status(201).json({
      success: true,
      data: formatConnection({ ...connection, _id: result.insertedId }),
      timestamp: new Date(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid request data', 'VALIDATION_ERROR'));
    } else {
      next(error);
    }
  }
});

// Update connection
router.put('/:id', async (req, res, next) => {
  try {
    const validated = createConnectionSchema.partial().parse(req.body);
    
    const result = await db.connections.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) } as any,
      {
        $set: {
          ...validated,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new AppError(404, 'Connection not found');
    }

    res.json({
      success: true,
      data: formatConnection(result),
      timestamp: new Date(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid request data', 'VALIDATION_ERROR'));
    } else {
      next(error);
    }
  }
});

// Delete connection
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await db.connections.deleteOne({
      _id: new ObjectId(req.params.id),
    } as any);

    if (result.deletedCount === 0) {
      throw new AppError(404, 'Connection not found');
    }

    res.json({
      success: true,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Test connection
router.post('/:id/test', async (req, res, next) => {
  try {
    const connection = await db.connections.findOne({
      _id: new ObjectId(req.params.id),
    } as any);

    if (!connection) {
      throw new AppError(404, 'Connection not found');
    }

    const startTime = Date.now();
    const isOnline = await scanner.testConnection(connection);
    const latency = Date.now() - startTime;

    // Update connection status
    await db.connections.updateOne(
      { _id: new ObjectId(req.params.id) } as any,
      {
        $set: {
          status: isOnline ? 'online' : 'offline',
          lastChecked: new Date(),
        },
      }
    );

    const result: ConnectionTestResult = {
      success: isOnline,
      message: isOnline ? 'Connection successful' : 'Connection failed',
      latency,
    };

    res.json({
      success: true,
      data: result,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Scan for connections
router.post('/scan', async (req, res, next) => {
  try {
    const { types } = req.body;
    const results = await scanner.scan(types);

    // Save results to database
    for (const result of results) {
      await db.connections.updateOne(
        { endpoint: result.endpoint } as any,
        {
          $set: {
            ...result,
            updatedAt: new Date(),
            isManual: false,
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    res.json({
      success: true,
      data: results,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

export { router as connectionsRouter };
