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

- Node.js 20+ (any compatible version)
- PowerShell 5.1+ (Windows)

### Quick Start

The fastest way to start the full development environment:

```powershell
# Start both backend and frontend
.\scripts\start-dev.ps1

# Stop both services
.\scripts\stop-dev.ps1
```

The startup script:
- Detects existing processes to avoid duplicates
- Starts backend on port 3001 and frontend on port 3000
- Verifies HTTP health with bounded timeouts
- Saves PIDs for clean shutdown

Options:
```powershell
# Start only backend
.\scripts\start-dev.ps1 -SkipFrontend

# Start only frontend
.\scripts\start-dev.ps1 -SkipBackend

# Force stop (bypass graceful shutdown)
.\scripts\stop-dev.ps1 -Force
```

### Manual Start (Alternative)

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

### URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api/v1
- **Swagger Docs**: http://localhost:3001/api/docs
- **Health Check**: http://localhost:3001/api/v1/health

### Database

The backend connects to PostgreSQL via environment variables in `backend/.env`. The default configuration uses Supabase pooler. If PostgreSQL is unreachable, the backend starts in offline mode (health endpoints respond but database operations are unavailable).

### Login

Authentication uses Supabase Auth. See [docs/DEVELOPMENT_CREDENTIALS.md](docs/DEVELOPMENT_CREDENTIALS.md) for development login setup.

### Development Status Page

In development mode, navigate to http://localhost:3000/development/status for system status.

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
│   │   │   ├── user/         # User management
│   │   │   ├── products/     # Product management
│   │   │   ├── customers/    # Customer management
│   │   │   ├── sales/        # Sales management
│   │   │   ├── inventory/    # Inventory management
│   │   │   ├── production/   # Production management
│   │   │   ├── procurement/  # Procurement management
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
├── scripts/                    # Development scripts
│   ├── start-dev.ps1         # Start dev environment
│   └── stop-dev.ps1          # Stop dev environment
├── supabase/                  # Database migrations
│   ├── migrations/           # Version-controlled migrations
│   └── README.md             # Migration and seed data docs
├── docs/                      # Documentation
│   ├── DEVELOPMENT_CREDENTIALS.md  # Dev login setup
│   ├── DEPLOYMENT.md          # Deployment guide
│   ├── architecture/        # Architecture docs
│   └── api/                # API documentation
└── docker-compose.yml        # Docker configuration
```

## Documentation

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Module Boundaries](docs/architecture/MODULES.md)
- [Database Design](docs/architecture/DATABASE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Development Credentials](docs/DEVELOPMENT_CREDENTIALS.md)
- [Supabase Migrations](supabase/README.md)

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
