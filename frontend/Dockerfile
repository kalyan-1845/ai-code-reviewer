FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

# Run in dev mode and expose host so it is accessible outside the container
CMD ["npm", "run", "dev", "--", "--host"]
