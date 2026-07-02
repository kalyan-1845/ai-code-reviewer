# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

# Stage 2: Production
FROM node:20-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache git

COPY --chown=node:node --from=builder /usr/src/app .

USER node

EXPOSE 5000

CMD ["npm", "start"]
