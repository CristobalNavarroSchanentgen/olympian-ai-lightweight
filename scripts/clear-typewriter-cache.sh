#!/bin/bash

# Clear Typewriter Effect Cache Script
# This script helps clear the persisted typewriter state if issues persist

echo "🔧 Olympian AI - Clear Typewriter Effect Cache"
echo "=============================================="
echo ""
echo "This script will clear the typewriter effect cache from your browser's localStorage."
echo "Use this if the typewriter effect is still not working after the fix."
echo ""

# Create an HTML file that clears the localStorage
cat > /tmp/clear-typewriter-cache.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Clear Typewriter Cache - Olympian AI</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #1a1a1a;
            color: #e0e0e0;
        }
        .container {
            background: #2a2a2a;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }
        h1 {
            color: #4a9eff;
            margin-bottom: 20px;
        }
        .status {
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .success {
            background: #1e4620;
            border: 1px solid #2d6a2f;
            color: #90ee90;
        }
        .error {
            background: #4a1e1e;
            border: 1px solid #6a2d2d;
            color: #ff9090;
        }
        .info {
            background: #1e3a4a;
            border: 1px solid #2d5a6a;
            color: #90d4ee;
        }
        button {
            background: #4a9eff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            margin: 10px 5px;
        }
        button:hover {
            background: #3a8eef;
        }
        .log {
            background: #1a1a1a;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            margin-top: 10px;
            max-height: 200px;
            overflow-y: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔧 Clear Typewriter Effect Cache</h1>
        
        <div id="status" class="status info">
            Click the button below to clear the typewriter effect cache.
        </div>
        
        <button onclick="clearCache()">Clear Typewriter Cache</button>
        <button onclick="clearAllOlympianData()">Clear All Olympian Data</button>
        <button onclick="window.location.reload()">Reload Page</button>
        
        <div id="log" class="log" style="display: none;"></div>
    </div>

    <script>
        function log(message) {
            const logDiv = document.getElementById('log');
            logDiv.style.display = 'block';
            logDiv.innerHTML += message + '<br>';
            logDiv.scrollTop = logDiv.scrollHeight;
        }

        function clearCache() {
            const statusDiv = document.getElementById('status');
            try {
                // Get current data
                const currentData = localStorage.getItem('typed-messages-storage');
                if (currentData) {
                    log('Found existing typewriter cache: ' + currentData.substring(0, 100) + '...');
                } else {
                    log('No existing typewriter cache found');
                }

                // Clear the typewriter cache
                localStorage.removeItem('typed-messages-storage');
                log('✓ Cleared typed-messages-storage');

                // Show success
                statusDiv.className = 'status success';
                statusDiv.innerHTML = '✓ Typewriter cache cleared successfully!<br>Please return to Olympian AI and refresh the page.';
                
            } catch (error) {
                statusDiv.className = 'status error';
                statusDiv.innerHTML = '✗ Error clearing cache: ' + error.message;
                log('Error: ' + error.message);
            }
        }

        function clearAllOlympianData() {
            const statusDiv = document.getElementById('status');
            if (confirm('This will clear ALL Olympian AI data including conversations. Are you sure?')) {
                try {
                    let clearedCount = 0;
                    
                    // List of Olympian AI localStorage keys
                    const olympianKeys = [
                        'typed-messages-storage',
                        'olympian-dialog-layout',
                        'model-settings',
                        'conversation-settings',
                        'artifact-storage'
                    ];
                    
                    // Clear known keys
                    olympianKeys.forEach(key => {
                        if (localStorage.getItem(key)) {
                            localStorage.removeItem(key);
                            log('✓ Cleared ' + key);
                            clearedCount++;
                        }
                    });
                    
                    // Clear any other olympian-related keys
                    Object.keys(localStorage).forEach(key => {
                        if (key.toLowerCase().includes('olympian')) {
                            localStorage.removeItem(key);
                            log('✓ Cleared ' + key);
                            clearedCount++;
                        }
                    });
                    
                    statusDiv.className = 'status success';
                    statusDiv.innerHTML = '✓ Cleared ' + clearedCount + ' Olympian AI data entries!<br>Please return to Olympian AI and refresh the page.';
                    
                } catch (error) {
                    statusDiv.className = 'status error';
                    statusDiv.innerHTML = '✗ Error clearing data: ' + error.message;
                    log('Error: ' + error.message);
                }
            }
        }

        // Show current status on load
        window.onload = function() {
            const hasCache = localStorage.getItem('typed-messages-storage') !== null;
            if (hasCache) {
                log('Typewriter cache is present in localStorage');
            } else {
                log('No typewriter cache found in localStorage');
            }
        };
    </script>
</body>
</html>
EOF

echo "📝 Created clear-typewriter-cache.html in /tmp/"
echo ""
echo "To clear the cache:"
echo "1. Open the file in your browser:"
echo "   file:///tmp/clear-typewriter-cache.html"
echo ""
echo "2. Click 'Clear Typewriter Cache'"
echo ""
echo "3. Return to Olympian AI and refresh the page"
echo ""
echo "Note: Make sure you're using the same browser where Olympian AI is running."
echo ""

# Try to open in default browser
if command -v open &> /dev/null; then
    echo "Opening in your default browser..."
    open /tmp/clear-typewriter-cache.html
elif command -v xdg-open &> /dev/null; then
    echo "Opening in your default browser..."
    xdg-open /tmp/clear-typewriter-cache.html
else
    echo "Please manually open: file:///tmp/clear-typewriter-cache.html"
fi
