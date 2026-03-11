FROM node:20-alpine AS builder

WORKDIR /app

# 1. Copy workspace config
COPY package*.json ./

# 2. Copy the SDK and Backend source code
COPY sdk/core ./sdk/core
COPY backend ./backend

# 3. Install all dependencies from the root (this leverages npm workspaces and hoists dependencies)
RUN npm install --ignore-scripts

# 4. Build both packages
RUN npm run build --workspace=sdk/core
RUN npm run build --workspace=backend

FROM node:20-alpine AS runtime

WORKDIR /app

# Copy root workspace files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy SDK runtime files
COPY --from=builder /app/sdk/core/package.json ./sdk/core/
COPY --from=builder /app/sdk/core/dist ./sdk/core/dist

# Copy Backend runtime files
COPY --from=builder /app/backend/package.json ./backend/
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/.env* ./backend/ 

EXPOSE 3001 3002 3003 3004

WORKDIR /app/backend
CMD ["node", "dist/services/mint-burn/index.js"]
