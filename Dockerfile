FROM node:lts-slim

WORKDIR /app

COPY package.json .
COPY yarn.lock .

RUN yarn install --production

COPY . .

CMD [ "npm", "start" ]