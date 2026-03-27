# Deployment Guide

This guide provides the necessary environment variable configurations for the Chat App when deploying the frontend on Vercel and the backend on Render.

## API Connectivity (Frontend & Backend)

To ensure the frontend can communicate with the backend and to avoid CORS issues, you must configure the following environment variables:

### 1. Vercel (Frontend)

In your Vercel project settings, go to **Settings > Environment Variables** and add:

- **Key**: `VITE_API_URL`
- **Value**: `https://your-backend.onrender.com/api` (Replace with your actual Render service URL)

### 2. Render (Backend)

In your Render service settings, go to **Environment** and add:

- **Key**: `CLIENT_URL`
- **Value**: `https://your-frontend.vercel.app` (Replace with your actual Vercel app URL)
- **Key**: `CLIENT_URLS`
- **Value**: Optional comma-separated additional allowed frontend origins
- **Key**: `NODE_ENV`
- **Value**: `production`
- **Key**: `JWT_ACCESS_SECRET`
- **Value**: A unique secret at least 32 characters long
- **Key**: `JWT_REFRESH_SECRET`
- **Value**: A different unique secret at least 32 characters long
- **Key**: `JWT_ISSUER`
- **Value**: `chatapp` or your deployment-specific issuer name
- **Key**: `MONGODB_FALLBACK_TO_MEMORY`
- **Value**: `false`
- **Key**: `REDIS_REQUIRED`
- **Value**: `true`
- **Key**: `INSTANCE_ID`
- **Value**: Set per instance/pod (for Kubernetes use the pod name)
- **Key**: `METRICS_ENABLED`
- **Value**: `true`

---

## Backend Build And Start

Use the following Render commands:

1. **Build Command**: `npm install && npm run build`
2. **Start Command**: `npm start`

The backend start script expects the production bundle at `server/dist/server.js`, so the build step must run before startup.

## Scale-Specific Notes

- Redis is now part of the production control plane, not just an optional cache:
  - Socket.IO cross-instance room fanout
  - Distributed presence tracking
  - BullMQ push/call queues
  - Scheduled-message leader election
- Expose and scrape `GET /metrics` with Prometheus.
- Reference Kubernetes manifests live in `infrastructure/kubernetes/server.yaml`.

## Troubleshooting

### CORS Errors
If you still see CORS errors in the browser console after setting `CLIENT_URL`:
1. Double-check that the URL in `CLIENT_URL` exactly matches the origin in the browser (including `https://` and no trailing slash).
2. Ensure you have redeployed the backend after changing environment variables.

### Image Not Loading
The `LandingPage.png` is now linked using a direct raw GitHub URL. If it still doesn't load:
1. Check if the URL `https://raw.githubusercontent.com/DevStack06/images/master/ChatImages/LandingPage.png` is accessible in your browser.
2. Consider downloading the image and placing it in `client/public/LandingPage.png` and updating `styles.css` to use `url('/LandingPage.png')`.

### API Timeout
The API timeout has been increased to 60 seconds to accommodate Render's free tier "cold starts." If you still experience cancellations:
1. Try the request again after a few seconds.
2. Consider upgrading your Render plan for faster spin-up times.
