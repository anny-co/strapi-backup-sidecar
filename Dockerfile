FROM node:lts-alpine

RUN yarn install

CMD [ "npm", "start" ]