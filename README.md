# ERP-MRP-PWI-2026

A production-grade, open-source Manufacturing ERP system for managing the complete business lifecycle from customer demand through production, delivery, and accounting.

## Features

- **Sales Management**: Quotations, Sales Orders, Invoicing
- **Inventory Management**: Stock levels, Movements, Reservations
- **Production Management**: BOM, Production Orders, Work Orders
- **Quality Control**: Inspection plans, Tests, Non-conformance
- **Procurement**: Purchase Requisitions, Orders, Goods Receipt
- **Finance**: Accounts Receivable, Payable, General Ledger
- **HR & Payroll**: Employee management, Attendance, Payroll

## Tech Stack

### Backend
- Node.js 20 LTS
- NestJS (TypeScript)
- TypeORM
- PostgreSQL 16
- Redis 7

### Frontend
- React 18
- TypeScript
- Ant Design 5
- Zustand

## Getting Started

### Prerequisites

- Node.js 20+ (or any compatible version)
- Docker & Docker Compose (optional, for database)

### Local Development Setup

#### 1. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend (in a separate terminal)
cd frontend
npm install --legacy-peer-deps
```

#### 2. Configure Environment

Backend `.env` (copy from `.env.example` and configure):
```bash
cd backend
cp .env.example .env
# Edit .env with your database settings
```

Frontend `.env` (already configured for local development):
```
REACT_APP_API_URL=http://localhost:3001/api/v1
```

#### 3. Start Services

**Option A: Local development (without Docker)**
```bash
# Terminal 1 — Backend
cd backend
npm run start:dev

# Terminal 2 — Frontend
cd frontend
npm start
```

**Option B: Docker (for database only)**
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Then start backend and frontend as above
```

**Option C: Full Docker stack**
```bash
docker-compose up -d
```

#### 4. Open in Browser

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api/v1
- **Swagger Docs**: http://localhost:3001/api/docs
- **Health Check**: http://localhost:3001/api/v1/health

### Database Configuration

The backend connects to PostgreSQL via the `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, and `DB_DATABASE` environment variables. If PostgreSQL is not reachable, the backend starts in **offline mode** (health endpoints respond but database operations are unavailable).

#### Supabase Configuration

For Supabase-hosted database, set these in `backend/.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

### Development Status Page

In development mode, a **Development Status** page is available at:
- **URL**: http://localhost:3000/development/status
- **Menu**: Development > Development Status (visible only in development mode)

This page shows:
- Frontend connection status
- Backend connection status
- Database connection status
- Supabase configuration status
- Project information

### Hot Reload

Both frontend and backend support hot reload in development mode:
- **Frontend**: React dev server with webpack HMR — changes to `src/` auto-rebuild and refresh
- **Backend**: NestJS with `--watch` mode — TypeScript changes trigger automatic restart

## Project Structure

```
erp-mrp-pwi-2026/
├── backend/                    # NestJS backend API
│   ├── src/
│   │   ├── common/            # Shared utilities
│   │   ├── config/           # Configuration
│   │   ├── modules/          # Feature modules
│   │   │   ├── auth/         # Authentication
│   │   │   ├── users/        # User management
│   │   │   ├── products/     # Product management
│   │   │   ├── customers/    # Customer management
│   │   │   ├── sales/        # Sales management
│   │   │   ├── inventory/    # Inventory management
│   │   │   ├── production/   # Production management
│   │   │   └── ...
│   │   ├── app.module.ts
│   │   └── main.ts
│   └── ...
├── frontend/                  # React frontend
│   ├── src/
│   │   ├── components/       # Reusable components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API services
│   │   ├── stores/          # State management
│   │   ├── types/           # TypeScript types
│   │   └── utils/           # Utility functions
│   └── ...
├── docs/                      # Documentation
│   ├── architecture/        # Architecture docs
│   ├── modules/            # Module documentation
│   └── api/                # API documentation
└── docker-compose.yml        # Docker configuration
```

## Documentation

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Module Boundaries](docs/architecture/MODULES.md)
- [Database Design](docs/architecture/DATABASE.md)

## Development

### Code Style

- ESLint for linting
- Prettier for formatting
- Husky for git hooks

### Testing

```bash
# Backend tests
cd backend
npm run test

# Frontend tests
cd frontend
npm run test
```

### Database Migrations

```bash
cd backend
npm run migration:generate -- --name=MigrationName
npm run migration:run
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, email support@erp-system.com or create an issue in the repository.
