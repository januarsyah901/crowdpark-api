FROM node:20-slim

# Install OpenSSL for Prisma + curl for healthcheck
RUN apt-get update -y && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run migrations then seed then start (migrate deploy is idempotent, safe for deploy dev)
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js || true && npm start"]
