// NEW: Enhanced streaming endpoint with thinking processing
router.post('/stream', async (req, res, next) => {
  try {
    // Validate input
    const validation = sendMessageSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, 'Invalid request body');
    }

    const { message, conversationId, model, visionModel, images } = validation.data;

    // Check if model is basic (no capabilities)
    const capabilities = await getModelCapabilitiesWithFallback(model);
    if (!isBasicModel(capabilities)) {
      throw new AppError(400, 'Streaming is only available for basic models (models without vision, tools, or reasoning capabilities)');
    }

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Send initial event to confirm connection
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\\n\\n`);

    try {
      // Get or create conversation
      let convId: string;
      let conversation: Conversation;
      
      if (conversationId) {
        // Validate existing conversation using proper ObjectId conversion
        const existingConv = await db.conversations.findOne({ 
          _id: toObjectId(conversationId) as any
        });
        if (!existingConv) {
          throw new AppError(404, 'Conversation not found');
        }
        convId = conversationId;
        conversation = formatConversation(existingConv);
      } else {
        // Create new conversation
        const newConversation: ConversationDoc = {
          title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
          model,
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: 0,
        };
        const result = await db.conversations.insertOne(newConversation as any);
        convId = result.insertedId.toString();
        conversation = formatConversation({
          ...newConversation,
          _id: result.insertedId,
        });
      }

      // Send conversation info
      res.write(`data: ${JSON.stringify({ 
        type: 'conversation', 
        conversation,
        conversationId: convId 
      })}\\n\\n`);

      // Process the request WITHOUT saving the user message first
      // This prevents duplicate messages in the conversation history
      const processedRequest = await streamliner.processRequest({
        content: message,
        model,
        visionModel,
        images,
        conversationId: convId,
      });

      // Send thinking state
      res.write(`data: ${JSON.stringify({ type: 'thinking', isThinking: true })}\\n\\n`);

      // Start streaming response
      let assistantContent = '';
      const startTime = Date.now();
      let tokenCount = 0;

      res.write(`data: ${JSON.stringify({ type: 'streaming_start' })}\\n\\n`);

      // ENHANCED: streamChat with thinking processing
      await streamliner.streamChat(
        processedRequest, 
        (token: string) => {
          assistantContent += token;
          tokenCount++;
          
          // Send each token as it comes
          res.write(`data: ${JSON.stringify({ 
            type: 'token', 
            token,
            content: assistantContent 
          })}\\n\\n`);
        },
        // ENHANCED: onComplete callback for thinking processing
        (result) => {
          console.log('🧠 [ChatAPI] Stream completed, processing thinking content...', {
            hasThinking: result.thinking?.hasThinking,
            thinkingContentLength: result.thinking?.thinkingContent?.length || 0,
            fullContentLength: result.fullContent.length
          });
          
          // Process thinking if present
          if (result.thinking?.hasThinking && result.thinking.thinkingData) {
            console.log(`✅ [ChatAPI] Thinking content detected and validated:`, {
              hasThinkingFlag: result.thinking.thinkingData.hasThinking,
              contentLength: result.thinking.thinkingData.content.length,
              processedAt: result.thinking.thinkingData.processedAt
            });
            
            // Send thinking content to client
            res.write(`data: ${JSON.stringify({ 
              type: 'thinking_detected',
              thinking: result.thinking.thinkingData
            })}\\n\\n`);
          } else {
            console.log('🧠 [ChatAPI] No thinking content detected in response');
          }
        }
      );

      // Send streaming end
      res.write(`data: ${JSON.stringify({ type: 'streaming_end' })}\\n\\n`);

      // NOW save both messages AFTER the response is generated
      // This ensures the conversation history is correct for the next request
      const userMessage: MessageDoc = {
        conversationId: convId,
        role: 'user' as const,
        content: message,
        images,
        createdAt: new Date(),
      };
      const userResult = await db.messages.insertOne(userMessage as any);
      const userMessageId = userResult.insertedId.toString();

      // ENHANCED: Process thinking content before saving assistant message
      const thinkingResult = parseThinkingFromContent(assistantContent);
      let finalAssistantContent = assistantContent;
      let thinkingData: ThinkingData | undefined = undefined;
      
      if (thinkingResult.hasThinking) {
        console.log(`🧠 [ChatAPI] Processing thinking content for database storage:`, {
          hasThinking: thinkingResult.hasThinking,
          thinkingContentLength: thinkingResult.thinkingContent.length,
          processedContentLength: thinkingResult.processedContent.length
        });
        
        finalAssistantContent = thinkingResult.processedContent;
        thinkingData = thinkingResult.thinkingData;
        
        // ENHANCED: Validate thinking data structure
        if (thinkingData) {
          thinkingData.hasThinking = true;
          thinkingData.content = thinkingResult.thinkingContent;
          thinkingData.processedAt = new Date();
          
          console.log(`🧠 [ChatAPI] Validated thinking data structure:`, {
            hasThinking: thinkingData.hasThinking,
            contentLength: thinkingData.content.length,
            processedAt: thinkingData.processedAt
          });
        }
      } else {
        console.log('🧠 [ChatAPI] No thinking content found in assistant response');
      }

      // Save assistant message and create artifacts
      const assistantMessageDoc: MessageDoc = {
        conversationId: convId,
        role: 'assistant' as const,
        content: finalAssistantContent, // Will be updated after artifact processing
        metadata: {
          model,
          visionModel,
          tokens: tokenCount,
          generationTime: Date.now() - startTime,
          // ENHANCED: Add thinking metadata with proper structure
          thinking: thinkingData,
          originalContentWithThinking: thinkingResult.hasThinking ? assistantContent : undefined,
        },
        createdAt: new Date(),
      };
      
      const assistantResult = await db.messages.insertOne(assistantMessageDoc as any);
      const assistantMessageId = assistantResult.insertedId.toString();

      // Create multi-artifacts and update message content
      console.log(`🎨 [ChatAPI] Processing assistant response for multi-artifacts...`);
      const artifactResult = await createMultiArtifactsFromResponse(
        finalAssistantContent, // Use content without thinking tags
        convId,
        assistantMessageId
      );

      // Update assistant message with multi-artifact metadata and processed content
      if (artifactResult.hasArtifact) {
        await db.messages.updateOne(
          { _id: toObjectId(assistantMessageId) as any },
          {
            $set: {
              content: artifactResult.processedContent,
              'metadata.artifacts': artifactResult.artifacts,
              'metadata.hasArtifact': true,
              'metadata.artifactCount': artifactResult.artifactCount,
              'metadata.artifactCreationStrategy': artifactResult.creationStrategy,
              'metadata.multipleCodeBlocks': artifactResult.artifactCount > 1,
              'metadata.originalContent': finalAssistantContent,
              'metadata.codeBlocksRemoved': true,
              // Legacy compatibility
              'metadata.artifactId': artifactResult.artifacts[0]?.artifactId,
              'metadata.artifactType': artifactResult.artifacts[0]?.artifactType,
              updatedAt: new Date()
            }
          }
        );

        console.log(`✅ [ChatAPI] Assistant message updated with ${artifactResult.artifactCount} artifacts`);
        
        // Send artifact creation notifications
        for (const artifact of artifactResult.artifacts) {
          res.write(`data: ${JSON.stringify({ 
            type: 'artifact_created',
            artifactId: artifact.artifactId,
            artifactType: artifact.artifactType,
            title: artifact.title,
            order: artifact.order
          })}\\n\\n`);
        }
      }

      // Update conversation
      await db.conversations.updateOne(
        { _id: toObjectId(convId) as any },
        {
          $set: { updatedAt: new Date() },
          $inc: { messageCount: 2 },
        }
      );

      // ENHANCED: Send final completion event with thinking data
      const completionMetadata = {
        ...assistantMessageDoc.metadata,
        artifacts: artifactResult.artifacts,
        hasArtifact: artifactResult.hasArtifact,
        artifactCount: artifactResult.artifactCount,
        artifactCreationStrategy: artifactResult.creationStrategy,
        multipleCodeBlocks: artifactResult.artifactCount > 1,
        originalContent: artifactResult.hasArtifact ? finalAssistantContent : undefined,
        codeBlocksRemoved: artifactResult.hasArtifact,
        // Legacy compatibility
        artifactId: artifactResult.artifacts[0]?.artifactId,
        artifactType: artifactResult.artifacts[0]?.artifactType,
        // ENHANCED: Include thinking data in response
        thinking: thinkingData,
        originalContentWithThinking: thinkingResult.hasThinking ? assistantContent : undefined
      };

      res.write(`data: ${JSON.stringify({ 
        type: 'complete',
        message: artifactResult.processedContent || finalAssistantContent,
        metadata: completionMetadata,
        conversationId: convId 
      })}\\n\\n`);

      console.log(`✅ [ChatAPI] Stream completed successfully with thinking processing`, {
        hasThinking: !!thinkingData,
        thinkingContentLength: thinkingData?.content?.length || 0,
        artifacts: artifactResult.artifactCount,
        finalContentLength: (artifactResult.processedContent || finalAssistantContent).length
      });

    } catch (streamError) {
      console.error('Streaming error:', streamError);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: streamError instanceof Error ? streamError.message : 'Unknown error' 
      })}\\n\\n`);
    }

    res.end();
  } catch (error) {
    next(error);
  }
});

// ENHANCED: Send message endpoint with thinking processing
router.post('/send', async (req, res, next) => {
  try {
    // Validate input
    const validation = sendMessageSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, 'Invalid request body');
    }

    const { message, conversationId, model, visionModel, images } = validation.data;

    // Get or create conversation
    let convId: string;
    let conversation: Conversation;
    
    if (conversationId) {
      // Validate existing conversation using proper ObjectId conversion
      const existingConv = await db.conversations.findOne({ 
        _id: toObjectId(conversationId) as any
      });
      if (!existingConv) {
        throw new AppError(404, 'Conversation not found');
      }
      convId = conversationId;
      conversation = formatConversation(existingConv);
    } else {
      // Create new conversation
      const newConversation: ConversationDoc = {
        title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        model,
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 0,
      };
      const result = await db.conversations.insertOne(newConversation as any);
      convId = result.insertedId.toString();
      conversation = formatConversation({
        ...newConversation,
        _id: result.insertedId,
      });
    }

    // Process the request WITHOUT saving the user message first
    const processedRequest = await streamliner.processRequest({
      content: message,
      model,
      visionModel,
      images,
      conversationId: convId,
    });

    // Get response from Ollama (non-streaming for HTTP)
    let assistantContent = '';
    const startTime = Date.now();
    let tokenCount = 0;
    let thinkingData: ThinkingData | undefined = undefined;

    // ENHANCED: streamChat with thinking processing for non-streaming endpoint
    await streamliner.streamChat(
      processedRequest, 
      (token: string) => {
        assistantContent += token;
        tokenCount++;
      },
      // ENHANCED: onComplete callback for thinking processing
      (result) => {
        console.log('🧠 [ChatAPI] Non-streaming request completed, processing thinking content...', {
          hasThinking: result.thinking?.hasThinking,
          thinkingContentLength: result.thinking?.thinkingContent?.length || 0,
          fullContentLength: result.fullContent.length
        });
        
        if (result.thinking?.hasThinking && result.thinking.thinkingData) {
          console.log(`✅ [ChatAPI] Thinking content detected and validated:`, {
            hasThinkingFlag: result.thinking.thinkingData.hasThinking,
            contentLength: result.thinking.thinkingData.content.length,
            processedAt: result.thinking.thinkingData.processedAt
          });
          thinkingData = result.thinking.thinkingData;
        }
      }
    );

    // ENHANCED: Process thinking content
    const thinkingResult = parseThinkingFromContent(assistantContent);
    let finalAssistantContent = assistantContent;
    
    if (thinkingResult.hasThinking) {
      console.log(`🧠 [ChatAPI] Processing thinking content for database storage:`, {
        hasThinking: thinkingResult.hasThinking,
        thinkingContentLength: thinkingResult.thinkingContent.length,
        processedContentLength: thinkingResult.processedContent.length
      });
      
      finalAssistantContent = thinkingResult.processedContent;
      thinkingData = thinkingResult.thinkingData;
      
      // ENHANCED: Validate thinking data structure
      if (thinkingData) {
        thinkingData.hasThinking = true;
        thinkingData.content = thinkingResult.thinkingContent;
        thinkingData.processedAt = new Date();
        
        console.log(`🧠 [ChatAPI] Validated thinking data structure:`, {
          hasThinking: thinkingData.hasThinking,
          contentLength: thinkingData.content.length,
          processedAt: thinkingData.processedAt
        });
      }
    }

    // Save both messages AFTER generating the response
    const userMessage: MessageDoc = {
      conversationId: convId,
      role: 'user' as const,
      content: message,
      images,
      createdAt: new Date(),
    };
    await db.messages.insertOne(userMessage as any);

    // Save assistant message
    const assistantMessageDoc: MessageDoc = {
      conversationId: convId,
      role: 'assistant' as const,
      content: finalAssistantContent,
      metadata: {
        model,
        visionModel,
        tokens: tokenCount,
        generationTime: Date.now() - startTime,
        // ENHANCED: Add thinking metadata with proper structure
        thinking: thinkingData,
        originalContentWithThinking: thinkingResult.hasThinking ? assistantContent : undefined,
      },
      createdAt: new Date(),
    };
    
    const assistantResult = await db.messages.insertOne(assistantMessageDoc as any);
    const assistantMessageId = assistantResult.insertedId.toString();

    // Create multi-artifacts and update message content
    console.log(`🎨 [ChatAPI] Processing assistant response for multi-artifacts...`);
    const artifactResult = await createMultiArtifactsFromResponse(
      finalAssistantContent, // Use content without thinking tags
      convId,
      assistantMessageId
    );

    // Update assistant message with multi-artifact metadata if artifacts were created
    let finalContent = finalAssistantContent;
    let finalMetadata = assistantMessageDoc.metadata;
    
    if (artifactResult.hasArtifact) {
      finalContent = artifactResult.processedContent;
      finalMetadata = {
        ...assistantMessageDoc.metadata,
        artifacts: artifactResult.artifacts,
        hasArtifact: true,
        artifactCount: artifactResult.artifactCount,
        artifactCreationStrategy: artifactResult.creationStrategy,
        multipleCodeBlocks: artifactResult.artifactCount > 1,
        originalContent: finalAssistantContent,
        codeBlocksRemoved: true,
        // Legacy compatibility
        artifactId: artifactResult.artifacts[0]?.artifactId,
        artifactType: artifactResult.artifacts[0]?.artifactType
      };

      await db.messages.updateOne(
        { _id: toObjectId(assistantMessageId) as any },
        {
          $set: {
            content: finalContent,
            metadata: finalMetadata,
            updatedAt: new Date()
          }
        }
      );

      console.log(`✅ [ChatAPI] Assistant message updated with ${artifactResult.artifactCount} artifacts`);
    }

    // Update conversation
    await db.conversations.updateOne(
      { _id: toObjectId(convId) as any },
      {
        $set: { updatedAt: new Date() },
        $inc: { messageCount: 2 },
      }
    );

    // ENHANCED: Return response with proper conversation object and thinking data
    const responseData = {
      conversation,
      conversationId: convId,
      message: finalContent,
      metadata: finalMetadata,
      // Include multi-artifact information in response
      artifacts: artifactResult.hasArtifact ? artifactResult.artifacts : undefined,
      artifactCount: artifactResult.artifactCount,
      // Legacy artifact information for backward compatibility
      artifact: artifactResult.hasArtifact ? {
        id: artifactResult.artifacts[0]?.artifactId,
        type: artifactResult.artifacts[0]?.artifactType
      } : undefined,
      // ENHANCED: Include thinking data in response
      thinking: thinkingData,
      originalContentWithThinking: thinkingResult.hasThinking ? assistantContent : undefined
    };

    console.log(`✅ [ChatAPI] Send completed successfully with thinking processing`, {
      hasThinking: !!thinkingData,
      thinkingContentLength: thinkingData?.content?.length || 0,
      artifacts: artifactResult.artifactCount,
      finalContentLength: finalContent.length
    });

    res.json({
      success: true,
      data: responseData,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});
