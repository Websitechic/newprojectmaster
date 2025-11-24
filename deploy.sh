
#!/bin/bash

echo "========================================="
echo "Deploying PM Tool to VPS"
echo "========================================="

# Pull latest code
echo "Pulling latest code from Git..."
git pull origin main

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the application
echo "Building application..."
npm run build

# Migrations will run automatically on restart due to server/index.ts
echo "Restarting application (migrations will run automatically)..."

# If using PM2
if command -v pm2 &> /dev/null; then
    pm2 restart pm-tool || pm2 start ecosystem.config.js
# If using systemd
elif systemctl is-active --quiet pm-tool; then
    sudo systemctl restart pm-tool
# If running directly
else
    # Kill old process
    pkill -f "node.*server/index.ts" || true
    # Start new process in background
    NODE_ENV=production nohup npm start > app.log 2>&1 &
fi

echo "========================================="
echo "Deployment complete!"
echo "Migrations ran automatically on startup"
echo "========================================="
