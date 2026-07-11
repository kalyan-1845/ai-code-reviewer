# Stage 1: Build the React + TypeScript app
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies first (layer cache-friendly)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Serve the static bundle with nginx
FROM nginx:alpine

# Copy custom nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the production build from the builder stage
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

RUN echo '#!/bin/sh' > /docker-entrypoint.d/40-env-config.sh && \
    echo 'echo "window.__RUNTIME_API_URL__ = \"${VITE_API_URL}\";" > /usr/share/nginx/html/config.js' >> /docker-entrypoint.d/40-env-config.sh && \
    chmod +x /docker-entrypoint.d/40-env-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
