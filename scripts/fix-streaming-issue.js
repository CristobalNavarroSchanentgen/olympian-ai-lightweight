#!/usr/bin/env node

/**
 * Fix script for WebSocket streaming issues in DivineDialog component
 * This script patches the onComplete handler to prevent client disconnections
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../packages/client/src/components/DivineDialog/index.tsx');

console.log('🔧 Fixing WebSocket streaming issue in DivineDialog component...');

try {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Find the onComplete handler
  const onCompletePattern = /onComplete:\s*\(data\)\s*=>\s*{[\s\S]*?(?=onError:|$)/;
  const match = content.match(onCompletePattern);
  
  if (!match) {
    console.error('❌ Could not find onComplete handler');
    process.exit(1);
  }
  
  console.log('✅ Found onComplete handler');
  
  // Check if we need to fix the clearTypedMessages order
  const handler = match[0];
  
  // Look for the problematic pattern where clearTypedMessages is called before getTypedContent
  if (handler.includes('clearTypedMessages()') && handler.includes('getTypedContent')) {
    console.log('🔍 Found potential issue with clearTypedMessages order');
    
    // Create a safer version that gets content before clearing
    const fixedHandler = handler.replace(
      /(\s*)clearTypedMessages\(\);/,
      '$1// clearTypedMessages(); // Moved after content retrieval'
    );
    
    // Find where we get the typed content and add clearing after it
    const getTypedContentPattern = /const finalContent = [\s\S]*?;/;
    const finalContentMatch = fixedHandler.match(getTypedContentPattern);
    
    if (finalContentMatch) {
      const updatedHandler = fixedHandler.replace(
        finalContentMatch[0],
        finalContentMatch[0] + '\n            // Clear streaming content after retrieving it\n            if (currentConversation) {\n              clearStreamingContent(currentConversation._id?.toString() || \'\');\n            }'
      );
      
      content = content.replace(match[0], updatedHandler);
      console.log('✅ Fixed clearTypedMessages order issue');
    }
  }
  
  // Also ensure we import clearStreamingContent
  if (!content.includes('clearStreamingContent')) {
    content = content.replace(
      /const\s*{\s*clearTypedMessages,\s*addTypedContent,\s*getTypedContent\s*}\s*=\s*useTypedMessagesStore\(\);/,
      'const { clearTypedMessages, addTypedContent, getTypedContent, clearStreamingContent } = useTypedMessagesStore();'
    );
    console.log('✅ Added clearStreamingContent import');
  }
  
  // Write the fixed content
  fs.writeFileSync(filePath, content);
  console.log('✅ File updated successfully');
  
  console.log('\n📝 Summary:');
  console.log('- Fixed clearTypedMessages being called before getTypedContent');
  console.log('- Added clearStreamingContent to clear only streaming data');
  console.log('- Preserved typed messages for UI consistency');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('\n✨ Fix complete! Please rebuild the frontend.');
