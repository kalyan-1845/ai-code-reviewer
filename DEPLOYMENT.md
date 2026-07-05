# 🚀 RepoSage Deployment Guide

This guide explains how to easily deploy all three parts of RepoSage for free.

## 1. Frontend (React + Vite) ➜ Vercel
Vercel is the best place to host the frontend. We have already added a `vercel.json` file to handle routing properly.

1. Create a free account at [vercel.com](https://vercel.com/) and connect your GitHub.
2. Click **"Add New Project"** and select the `ai-code-reviewer` repository.
3. Important: Open the **"Framework Preset"** section and ensure it says **Vite**.
4. Open the **"Root Directory"** setting and type `frontend`.
5. Under **Environment Variables**, add:
    * `GROQ_API_KEY`: *(Your Groq API key - server-side only, never exposed to clients)*
   * `VITE_API_BASE_URL`: *(The URL of your deployed backend, e.g., `https://reposage-backend.onrender.com`)*
6. Click **Deploy**.

## 2. Backend & AI Engine ➜ Render
Render is perfect for our Node.js and Python services because they run continuously and won't time out during heavy repository analysis. We have provided a `render.yaml` file to make this a 1-click deployment!

1. Create a free account at [render.com](https://render.com/) and connect your GitHub.
2. Go to the dashboard and click **"New"** ➜ **"Blueprint"**.
3. Select your `ai-code-reviewer` repository.
4. Render will automatically read the `render.yaml` file and prepare **both** the Node.js Backend and the Python AI Engine.
5. It will ask you to fill in the environment variables:
   * `GROQ_API_KEY`: *(Your Groq API key)*
   * `FRONTEND_URL`: *(The URL of your deployed Vercel frontend, e.g., `https://reposage-frontend.vercel.app`)*
6. Click **Apply**.

### 🎉 That's it!
Every time you or a GSSoC contributor pushes code to the `main` branch, Vercel and Render will automatically rebuild and deploy the updates!
