FROM node:24-alpine

WORKDIR /app

ARG APP_BASE_PATH=/explorer
ENV PORT=8080
ENV HOST=0.0.0.0
ENV APP_BASE_PATH=${APP_BASE_PATH}
ENV VITE_APP_BASE_PATH=${APP_BASE_PATH}
ENV RYU_STATIC_DIR=/app/client/dist

COPY package*.json ./
COPY tsconfig.base.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm ci

COPY shared ./shared
COPY server ./server
COPY client ./client

RUN npm --workspace server run build
RUN npm --workspace client run build

ENV NODE_ENV=production

EXPOSE 8080

USER node

CMD ["npm", "--workspace", "server", "run", "start"]
