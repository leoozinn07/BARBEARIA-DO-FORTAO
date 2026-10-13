# Imagem de produção do site (Node 22, sem dependências de desenvolvimento).
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY servidor ./servidor
COPY publico ./publico
COPY scripts/criar-admin.js ./scripts/
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/saude || exit 1
CMD ["node", "servidor/index.js"]
