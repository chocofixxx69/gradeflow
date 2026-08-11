# Use an official Python image with Chromium/Playwright pre-installed
# This prevents "browser not found" errors and eliminates 15-minute apt-get build steps
FROM mcr.microsoft.com/playwright/python:v1.58.0-jammy

# Set work directory
WORKDIR /app

# Upgrade pip securely
RUN pip install --no-cache-dir --upgrade pip

# Copy the requirements file specifically
COPY requirements.txt .

# Install dependencies before code to cache Docker layers efficiently
RUN pip install --no-cache-dir -r requirements.txt

# Force Playwright to install the exact browser bins for this version
RUN playwright install chromium
RUN playwright install-deps chromium
# Copy all the backend app files
COPY . .

# Let Docker know we bind to the dynamic Render PORT env variable
EXPOSE $PORT

# Run our Python server/scraper wrapper with unflushed output so logs appear instantly
ENV PYTHONUNBUFFERED=1

CMD ["python", "render_server.py"]
