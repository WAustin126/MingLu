FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public
ENV NODE_ENV=production
ENV PORT=8081
ENV HOST=0.0.0.0
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8081/health >/dev/null || exit 1
CMD ["node", "server.js"]
