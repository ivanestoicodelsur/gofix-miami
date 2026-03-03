FROM node:18-bullseye-slim

WORKDIR /app

# Copiar primero los archivos de dependencias Y prisma
FROM node:18-bullseye AS builder

WORKDIR /app

# copy package files first for better caching
COPY package.json package-lock.json* ./

# install all dependencies (including dev) to build
RUN npm ci

# copy source and build
COPY . .

# generate prisma client and build the project
RUN npx prisma generate && npm run build

FROM node:18-bullseye-slim AS runner
WORKDIR /app

# install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --production

# copy build artifacts and prisma client files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/server.js"]