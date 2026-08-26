# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build application from a clean output directory. The repository previously
# contained a TypeScript incremental-build cache, which can cause a clean Docker
# build to skip emitting files that are not present in `dist`.
RUN rm -rf dist tsconfig.tsbuildinfo \
    && npm run build \
    && test -f dist/main.js \
    && test -f dist/app.controller.js

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Change ownership
RUN chown -R nestjs:nodejs /app

USER nestjs

# Expose port
EXPOSE 3001

# Start application
CMD ["node", "dist/main"]
