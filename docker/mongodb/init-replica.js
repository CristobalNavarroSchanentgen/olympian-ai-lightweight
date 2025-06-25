// MongoDB Replica Set Initialization Script for Olympian AI
// This script initializes a single-node replica set for development/testing
// For production, configure a proper 3-node replica set

print("🚀 Initializing MongoDB replica set for Olympian AI...");

try {
  // Initialize replica set with current instance as primary
  const config = {
    _id: "rs0",
    version: 1,
    members: [
      {
        _id: 0,
        host: "mongodb:27017",
        priority: 1
      }
    ]
  };

  // Check if replica set is already initialized
  try {
    const status = rs.status();
    print("✅ Replica set already initialized:", status.set);
  } catch (error) {
    if (error.message.includes("no replset config has been received")) {
      print("🔧 Initializing new replica set...");
      
      const result = rs.initiate(config);
      if (result.ok === 1) {
        print("✅ Replica set initialized successfully");
        
        // Wait for primary election
        print("⏳ Waiting for primary election...");
        let isPrimary = false;
        let attempts = 0;
        const maxAttempts = 30;
        
        while (!isPrimary && attempts < maxAttempts) {
          try {
            const hello = db.hello();
            isPrimary = hello.ismaster;
            if (!isPrimary) {
              print(`⏳ Attempt ${attempts + 1}/${maxAttempts}: Waiting for primary...`);
              sleep(1000);
            }
          } catch (e) {
            print(`⚠️ Error checking primary status: ${e.message}`);
          }
          attempts++;
        }
        
        if (isPrimary) {
          print("✅ Node is now primary");
          
          // Create application user
          try {
            print("👤 Creating application database and user...");
            
            // Switch to admin database for user creation
            const adminDb = db.getSiblingDB('admin');
            
            // Create application user with necessary permissions
            const userResult = adminDb.createUser({
              user: "olympian-app",
              pwd: "olympian-app-password", // Should be changed in production
              roles: [
                { role: "readWrite", db: "olympian-ai" },
                { role: "dbAdmin", db: "olympian-ai" }
              ]
            });
            
            print("✅ Application user created successfully");
            
            // Switch to application database
            const appDb = db.getSiblingDB('olympian-ai');
            
            // Create collections with validation schemas
            print("🎨 Creating artifacts collection with validation schema...");
            
            try {
              appDb.createCollection("artifacts", {
                validator: {
                  $jsonSchema: {
                    bsonType: "object",
                    required: ["id", "conversationId", "title", "type", "content", "version", "checksum", "metadata"],
                    properties: {
                      id: {
                        bsonType: "string",
                        description: "Client-compatible artifact ID - required"
                      },
                      conversationId: {
                        bsonType: "string", 
                        description: "Reference to conversation - required"
                      },
                      title: {
                        bsonType: "string",
                        minLength: 1,
                        maxLength: 200,
                        description: "Artifact title - required and non-empty"
                      },
                      type: {
                        enum: ["text", "code", "html", "react", "svg", "mermaid", "json", "csv", "markdown"],
                        description: "Artifact type - must be valid type"
                      },
                      content: {
                        bsonType: "string",
                        description: "Artifact content - required"
                      },
                      version: {
                        bsonType: "int",
                        minimum: 1,
                        description: "Version number - must be positive integer"
                      },
                      checksum: {
                        bsonType: "string",
                        minLength: 1,
                        description: "Content checksum for integrity verification"
                      },
                      metadata: {
                        bsonType: "object",
                        description: "Artifact metadata object"
                      }
                    }
                  }
                },
                validationAction: "error",
                validationLevel: "strict"
              });
              
              print("✅ Artifacts collection created with validation schema");
              
              // Create essential indexes
              print("📊 Creating essential indexes...");
              
              appDb.artifacts.createIndex({ id: 1 }, { unique: true, name: "artifacts_client_id_unique" });
              appDb.artifacts.createIndex({ conversationId: 1 }, { name: "artifacts_conversation_idx" });
              appDb.artifacts.createIndex({ conversationId: 1, createdAt: 1 }, { name: "artifacts_conversation_time_idx" });
              appDb.artifacts.createIndex({ checksum: 1 }, { name: "artifacts_checksum_idx" });
              
              print("✅ Essential indexes created");
              
            } catch (collectionError) {
              print(`⚠️ Collection creation warning: ${collectionError.message}`);
            }
            
          } catch (userError) {
            print(`⚠️ User creation warning: ${userError.message}`);
          }
          
        } else {
          print("❌ Failed to become primary after maximum attempts");
        }
        
      } else {
        print("❌ Failed to initialize replica set:", result);
      }
    } else {
      print("❌ Unexpected error checking replica set status:", error.message);
    }
  }
  
  print("🏁 MongoDB initialization script completed");
  
} catch (error) {
  print("❌ Error during MongoDB initialization:", error.message);
  print("Stack trace:", error.stack || "No stack trace available");
}
