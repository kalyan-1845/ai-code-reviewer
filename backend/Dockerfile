FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN apk add --no-cache git

RUN npm install

COPY --chown=node:node . .

USER node

EXPOSE 5000

CMD ["npm", "start"]
