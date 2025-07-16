const fs = require('fs');

// Read the file
let content = fs.readFileSync('packages/server/src/api/config.ts', 'utf8');

// Remove the duplicate lines from line 49 onwards
const lines = content.split('
');
const cleanLines = [];
let skipDuplicates = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Check if we've hit the duplicate section around line 49
  if (i === 48 && line.includes('});')) {
    cleanLines.push(line);
    // Skip the duplicate block that follows
    skipDuplicates = true;
    continue;
  }
  
  // Stop skipping once we see a proper function start or similar
  if (skipDuplicates && (line.startsWith('router.') || line.trim() === '')) {
    skipDuplicates = false;
  }
  
  if (!skipDuplicates) {
    cleanLines.push(line);
  }
}

// Write the cleaned content back
fs.writeFileSync('packages/server/src/api/config.ts', cleanLines.join('
'));
