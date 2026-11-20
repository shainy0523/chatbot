FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# install production dependencies first so this layer is cached
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src

# run as the unprivileged user that ships with the image
USER node

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
