FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm install
RUN cd client && npm install

COPY . .
RUN cd client && npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/ecosystem.config.cjs ./

ENV NODE_ENV=production
ENV PORT=7777

EXPOSE 7777
CMD ["node", "server/index.js"]
