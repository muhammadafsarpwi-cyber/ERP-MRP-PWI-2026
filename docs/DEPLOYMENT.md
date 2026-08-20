# Deployment Documentation

## 1. Deployment Overview

This document covers the deployment process for the ERP system in various environments.

## 2. Environment Setup

### 2.0 Local Development (Quick Start)

This is the recommended way to develop locally.

**Prerequisites:**
- Node.js 20+ (any compatible version)
- PowerShell 5.1+ (Windows)

**Start all services:**
```powershell
.\scripts\start-dev.ps1
```

This starts both backend (port 3001) and frontend (port 3000), detects existing processes to avoid duplicates, and verifies HTTP health with bounded timeouts.

**Stop all services:**
```powershell
.\scripts\stop-dev.ps1
```

**Options:**
```powershell
# Start only backend
.\scripts\start-dev.ps1 -SkipFrontend

# Start only frontend
.\scripts\start-dev.ps1 -SkipBackend

# Force stop (bypass graceful shutdown)
.\scripts\stop-dev.ps1 -Force
```

**URLs:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api/v1
- API docs: http://localhost:3001/api/docs
- Health check: http://localhost:3001/api/v1/health
- Development Status: http://localhost:3000/development/status

**Manual start (alternative):**
```powershell
# Terminal 1 — Backend
cd backend
npm install
npm run start:dev

# Terminal 2 — Frontend
cd frontend
npm install --legacy-peer-deps
npm start
```

### 2.1 Development Environment (Docker)

**Prerequisites:**
- Docker & Docker Compose
- Node.js 20+ (for local development)
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)

**Setup:**
```bash
# Clone repository
git clone https://github.com/your-org/erp-mrp-pwi-2026.git
cd erp-mrp-pwi-2026

# Start Docker services
docker-compose up -d

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Start development servers
cd backend && npm run start:dev
cd frontend && npm start
```

### 2.2 Staging Environment

**Prerequisites:**
- Docker & Docker Compose
- Domain name with SSL certificate
- SMTP server for emails

**Setup:**
1. Configure environment variables
2. Update docker-compose.yml for production
3. Set up SSL certificates
4. Configure reverse proxy (Nginx)

### 2.3 Production Environment

**Prerequisites:**
- Docker & Docker Compose (or Kubernetes)
- Load balancer
- SSL certificates
- Database server (managed PostgreSQL recommended)
- Redis server (managed Redis recommended)
- Backup storage
- Monitoring system

## 3. Configuration

### 3.1 Environment Variables

Create `.env` file in the project root:

```bash
# Application
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://erp.yourcompany.com

# Database
DB_HOST=your-db-host
DB_PORT=5432
DB_USERNAME=erp_user
DB_PASSWORD=secure_password
DB_DATABASE=erp_database
DB_SYNCHRONIZE=false
DB_LOGGING=false

# JWT
JWT_SECRET=your-secure-jwt-secret
JWT_EXPIRATION=1h
JWT_REFRESH_EXPIRATION=7d

# Redis
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=secure_redis_password

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@erp.yourcompany.com
```

### 3.2 Database Configuration

**Connection Pool Settings:**
```typescript
{
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  extra: {
    max: 20,
    min: 5,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  }
}
```

## 4. Docker Deployment

### 4.1 Build Images

```bash
# Build backend image
docker build -t erp-backend:latest ./backend

# Build frontend image
docker build -t erp-frontend:latest ./frontend
```

### 4.2 Docker Compose Production

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: ${DB_DATABASE}
      POSTGRES_USER: ${DB_USERNAME}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USERNAME}']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: always
    ports:
      - '3001:3001'
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: ${DB_USERNAME}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_DATABASE: ${DB_DATABASE}
      JWT_SECRET: ${JWT_SECRET}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: always
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - backend

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - backend
      - frontend

volumes:
  postgres_data:
  redis_data:
```

### 4.3 Deploy with Docker Compose

```bash
# Load environment variables
export $(cat .env | xargs)

# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

## 5. Kubernetes Deployment

### 5.1 Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: erp-system
```

### 5.2 Backend Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: erp-backend
  namespace: erp-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: erp-backend
  template:
    metadata:
      labels:
        app: erp-backend
    spec:
      containers:
        - name: backend
          image: erp-backend:latest
          ports:
            - containerPort: 3001
          env:
            - name: NODE_ENV
              value: production
            - name: DB_HOST
              valueFrom:
                secretKeyRef:
                  name: erp-secrets
                  key: db-host
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

### 5.3 Frontend Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: erp-frontend
  namespace: erp-system
spec:
  replicas: 2
  selector:
    matchLabels:
      app: erp-frontend
  template:
    metadata:
      labels:
        app: erp-frontend
    spec:
      containers:
        - name: frontend
          image: erp-frontend:latest
          ports:
            - containerPort: 80
```

## 6. Database Migration

### 6.1 Run Migrations

```bash
# Run migrations
docker-compose exec backend npm run migration:run

# Check migration status
docker-compose exec backend npm run migration:show
```

### 6.2 Backup Before Migration

```bash
# Backup database
docker-compose exec postgres pg_dump -U postgres erp_database > backup_$(date +%Y%m%d_%H%M%S).sql
```

## 7. SSL Configuration

### 7.1 Let's Encrypt

```bash
# Install certbot
sudo apt-get install certbot

# Get certificate
sudo certbot certonly --standalone -d erp.yourcompany.com

# Certificate location
/etc/letsencrypt/live/erp.yourcompany.com/fullchain.pem
/etc/letsencrypt/live/erp.yourcompany.com/privkey.pem
```

### 7.2 Nginx SSL Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name erp.yourcompany.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # ... rest of configuration
}

server {
    listen 80;
    server_name erp.yourcompany.com;
    return 301 https://$server_name$request_uri;
}
```

## 8. Monitoring

### 8.1 Health Checks

```bash
# Backend health check
curl http://localhost:3001/api/v1/health

# Database health check
docker-compose exec postgres pg_isready -U postgres
```

### 8.2 Logging

```bash
# View backend logs
docker-compose logs -f backend

# View all logs
docker-compose logs -f
```

### 8.3 Metrics

- **Prometheus**: Collect metrics from backend
- **Grafana**: Visualize metrics and create dashboards
- **Alerts**: Set up alerts for critical metrics

## 9. Backup Strategy

### 9.1 Database Backup

```bash
# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backups/postgres
docker-compose exec postgres pg_dump -U postgres erp_database > $BACKUP_DIR/backup_$DATE.sql
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
```

### 9.2 Backup Schedule

- **Daily**: Full database backup at 2:00 AM
- **Hourly**: Transaction log backup
- **Weekly**: Full system backup

### 9.3 Restore Procedure

```bash
# Restore from backup
docker-compose exec -T postgres psql -U postgres erp_database < backup_20260818_020000.sql
```

## 10. Scaling

### 10.1 Horizontal Scaling

- Add more backend instances behind load balancer
- Add read replicas for database
- Add Redis cluster for caching

### 10.2 Vertical Scaling

- Increase CPU/memory for existing instances
- Upgrade database server resources
- Increase storage capacity

## 11. Security Checklist

- [ ] Change default passwords
- [ ] Enable SSL/TLS
- [ ] Configure firewall rules
- [ ] Set up intrusion detection
- [ ] Enable audit logging
- [ ] Configure rate limiting
- [ ] Set up backup encryption
- [ ] Review and update dependencies
- [ ] Conduct security audit
- [ ] Document incident response plan

## 12. Troubleshooting

### 12.1 Common Issues

**Database Connection Issues:**
```bash
# Check database status
docker-compose exec postgres pg_isready -U postgres

# Check database logs
docker-compose logs postgres
```

**Application Issues:**
```bash
# Check application logs
docker-compose logs backend

# Restart application
docker-compose restart backend
```

**Memory Issues:**
```bash
# Check memory usage
docker stats

# Restart if needed
docker-compose restart
```

### 12.2 Performance Issues

1. Check slow query logs
2. Monitor database connections
3. Check Redis cache hit rate
4. Review application logs
5. Monitor system resources
