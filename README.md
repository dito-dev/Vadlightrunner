---
title: VadLightrunner Backend
emoji: ⚡
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# VadLightrunner — Extension Runner Backend

A self-contained Express server that runs Mangayomi JavaScript scraping extensions in Node's VM sandbox.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server (this will automatically sync extensions first):
   ```bash
   npm start
   ```

## Cloud Deployment

This repository is optimized for direct hosting on Hugging Face Spaces using the Docker SDK.
