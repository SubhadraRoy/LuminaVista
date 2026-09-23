# LuminaVista OS — Production Deployment Guide

This guide covers deploying **LuminaVista OS** to Vercel and configuring upstream cloud services.

---

## 1. Prerequisites
- A [Vercel](https://vercel.com) account.
- An [Upstash Redis](https://upstash.com) serverless database (free tier supported).
- (Optional) An [E2B.dev](https://e2b.dev) account for Firecracker microVM execution.
- (Optional) An [OpenRouter](https://openrouter.ai) or Ollama cloud endpoint for LLM completion.

---

## 2. Upstash Redis Setup
1. Create a free Redis database in the [Upstash Console](https://console.upstash.com).
2. Under **REST API**, copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## 3. Vercel Deployment
1. Push your repository to GitHub.
2. In the Vercel Dashboard, click **Add New Project** and import `LuminaVista`.
3. In **Settings -> Environment Variables**, configure:

| Key | Example Value | Description |
| :--- | :--- | :--- |
| `ADMIN_PASSWORD` | `YourSecretMasterPassword123!` | Master passphrase for dashboard access |
| `UPSTASH_REDIS_REST_URL` | `https://your-db.upstash.io` | Upstash Redis HTTPS URL |
| `UPSTASH_REDIS_REST_TOKEN` | `AXX...` | Upstash Redis REST Token |
| `OLLAMA_ENDPOINT` | `https://openrouter.ai/api/v1/chat/completions` | AI Provider Endpoint |
| `OLLAMA_API_KEY` | `sk-or-v1-...` | AI Provider API Key |
| `E2B_API_KEY` | `e2b_...` | (Optional) E2B MicroVM Token |
| `GITHUB_STORAGE_TOKEN` | `ghp_...` | (Optional) GitHub Storage Token |
| `GITHUB_STORAGE_REPO` | `Username/Repo` | (Optional) GitHub Storage Repo |

4. Click **Deploy**. Vercel will build and launch your deployment with automatic SSL and edge routing.

---

## 4. Local Development
To test and develop locally without Vercel:

```bash
# Clone repository
git clone https://github.com/SubhadraRoy/LuminaVista.git
cd LuminaVista

# Install test dependencies
npm install

# Run the DOM integration test suite
npm test

# Run Google Chrome headless CDP browser verification
npm run test:browser

# Start the local development server on http://127.0.0.1:3000
npm start
```
