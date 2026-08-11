#!/bin/bash
# VTU Scraper — VPS Setup Script (Ubuntu 22.04)
# Run each section manually or as root

# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Python 3.11
sudo apt install -y python3.11 python3.11-venv python3-pip git curl unzip

# 3. Install Google Chrome
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/chrome.deb
sudo dpkg -i /tmp/chrome.deb
sudo apt -f install -y
google-chrome --version  # verify

# 4. Install Node.js + PM2 (to keep worker alive)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# 5. Create scraper folder and virtual environment
mkdir -p /srv/vtu-scraper
cd /srv/vtu-scraper
python3.11 -m venv venv
source venv/bin/activate

# 6. Copy scraper files here (from your project's scraper/ folder)
# Then install Python packages:
pip install -r requirements.txt

# 7. Create .env file
cat > /srv/vtu-scraper/.env << 'EOF'
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
CHROME_PATH=/usr/bin/google-chrome
HEADLESS=true
WORKERS=1
EOF

# 8. Test the scraper with one USN
python engine.py 2AB23CS043

# 9. Start worker with PM2
pm2 start "venv/bin/python worker.py" --name vtu-worker
pm2 save
pm2 startup  # follow the command it prints

# 10. Check status
pm2 status
pm2 logs vtu-worker --lines 50

# 11. Optional: install N8N
sudo npm install -g n8n
pm2 start "n8n start" --name n8n
pm2 save
