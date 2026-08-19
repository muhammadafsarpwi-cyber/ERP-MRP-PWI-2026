# ERP System Architecture

## 1. System Overview

This is a production-grade, open-source Manufacturing ERP system designed for a manufacturing company. The system supports the complete business lifecycle from customer demand through production, delivery, and accounting.

## 2. Architecture Principles

### 2.1 Design Principles
- **Modularity**: Each module is self-contained with clear boundaries
- **Scalability**: Horizontal and vertical scaling capabilities
- **Maintainability**: Clean code, proper separation of concerns
- **Security**: Role-based access control, data encryption, audit trails
- **Data Integrity**: ACID transactions, referential integrity, validation
- **Auditability**: Complete audit trail for all business transactions
- **API-First**: RESTful APIs for all operations
- **Testability**: Comprehensive testing at all levels

### 2.2 Architecture Pattern
- **Backend**: Modular Monolith with clear module boundaries
- **Future Migration**: Can be decomposed into microservices if needed
- **Database**: Shared database with schema separation per module domain

## 3. Technology Stack

### 3.1 Backend
- **Runtime**: Node.js 20 LTS
- **Framework**: NestJS (TypeScript)
- **ORM**: TypeORM
- **Authentication**: JWT with Passport.js
- **Authorization**: Custom RBAC middleware
- **Validation**: class-validator, class-transformer
- **Documentation**: Swagger/OpenAPI 3.0

### 3.2 Database
- **Primary**: PostgreSQL 16
- **Cache**: Redis 7 (for sessions, caching)
- **Search**: PostgreSQL Full-Text Search (upgradeable to Elasticsearch)

### 3.3 Frontend
- **Framework**: React 18 with TypeScript
- **UI Library**: Ant Design 5
- **State Management**: Zustand or React Query
- **Form Management**: React Hook Form
- **Charts**: Recharts or Chart.js

### 3.4 Infrastructure
- **Containerization**: Docker, Docker Compose
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus, Grafana
- **Logging**: Winston, ELK Stack (optional)

## 4. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │  Web App    │  │  Mobile App │  │  API Client │            │
│  │  (React)    │  │  (Future)   │  │  (External) │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API GATEWAY                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Rate Limiting, Authentication, Authorization, CORS    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    NestJS Modules                       │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │   │
│  │  │ Company │ │  Users  │ │Products │ │Customers│     │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘     │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │   │
│  │  │  Sales  │ │Inventory│ │Procure- │ │Production│    │   │
│  │  │         │ │         │ │  ment   │ │         │     │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘     │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │   │
│  │  │   QC    │ │  Ware-  │ │Finance  │ │   HR    │     │   │
│  │  │         │ │  house  │ │         │ │         │     │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ PostgreSQL  │  │    Redis    │  │   File      │            │
│  │  (Primary)  │  │   (Cache)   │  │  Storage    │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Module Architecture

### 5.1 Module Structure Pattern
Each module follows a consistent structure:

```
src/modules/{module-name}/
├── {module-name}.module.ts          # Module definition
├── controllers/                     # API endpoints
│   └── {entity}.controller.ts
├── services/                        # Business logic
│   └── {entity}.service.ts
├── entities/                        # TypeORM entities
│   └── {entity}.entity.ts
├── dto/                             # Data Transfer Objects
│   ├── create-{entity}.dto.ts
│   ├── update-{entity}.dto.ts
│   └── query-{entity}.dto.ts
├── enums/                           # Module-specific enumerations
│   └── {entity}-status.enum.ts
├── interfaces/                      # Module-specific interfaces
│   └── {entity}.interface.ts
├── validators/                      # Custom validators
│   └── {entity}.validator.ts
├── subscribers/                     # Entity subscribers
│   └── {entity}.subscriber.ts
└── tests/                           # Module tests
    ├── {entity}.service.spec.ts
    └── {entity}.controller.spec.ts
```

### 5.2 Cross-Cutting Concerns
Located in `src/common/`:

```
src/common/
├── decorators/                      # Custom decorators
├── filters/                         # Exception filters
├── guards/                          # Auth guards
├── interceptors/                    # Logging, transform
├── middleware/                      # Custom middleware
├── pipes/                           # Validation pipes
├── base.entity.ts                   # Base entity with audit fields
├── base.controller.ts               # Base CRUD controller
├── base.service.ts                  # Base CRUD service
└── pagination.interface.ts          # Pagination types
```

## 6. Database Design Principles

### 6.1 Naming Conventions
- **Tables**: snake_case, plural (e.g., `sales_orders`, `products`)
- **Columns**: snake_case (e.g., `created_at`, `order_number`)
- **Primary Keys**: `id` (UUID)
- **Foreign Keys**: `{referenced_table}_id` (e.g., `customer_id`)
- **Indexes**: `idx_{table}_{column}` for frequently queried columns
- **Unique Constraints**: `uniq_{table}_{column}`

### 6.2 Audit Fields
Every entity must have:
```typescript
id: UUID              // Primary key
created_at: timestamp // Creation timestamp
updated_at: timestamp // Last update timestamp
created_by: UUID      // User who created the record
updated_by: UUID      // User who last updated the record
is_active: boolean    // Soft delete flag
```

### 6.3 Transaction Management
- All business operations that modify multiple tables must use database transactions
- Use `@Transaction()` decorator for service methods
- Implement proper rollback on errors
- Log all transaction outcomes

## 7. Security Architecture

### 7.1 Authentication
- JWT-based authentication
- Token expiry: 1 hour (access), 7 days (refresh)
- Password hashing: bcrypt with salt rounds 12
- Multi-factor authentication (optional)

### 7.2 Authorization
- Role-Based Access Control (RBAC)
- Permissions at module and action level
- Resource-level permissions (own data vs. all data)
- Permission hierarchy: Super Admin > Admin > Manager > User

### 7.3 Data Security
- SQL injection prevention via parameterized queries
- XSS protection via input sanitization
- CSRF protection via tokens
- Sensitive data encryption at rest
- Audit logging for all data changes

## 8. API Design Principles

### 8.1 RESTful Conventions
- `GET /api/v1/{resources}` - List resources
- `GET /api/v1/{resources}/:id` - Get single resource
- `POST /api/v1/{resources}` - Create resource
- `PATCH /api/v1/{resources}/:id` - Update resource
- `DELETE /api/v1/{resources}/:id` - Soft delete resource

### 8.2 Response Format
```json
{
  "success": true,
  "data": {},
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20
  },
  "message": "Success"
}
```

### 8.3 Error Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": []
  }
}
```

## 9. Deployment Architecture

### 9.1 Development
- Docker Compose for local development
- Hot reload for backend and frontend
- Local PostgreSQL and Redis instances

### 9.2 Production
- Docker containers orchestrated via Docker Compose or Kubernetes
- Nginx as reverse proxy
- SSL/TLS termination
- Database backups to cloud storage
- Monitoring and alerting

## 10. Performance Considerations

### 10.1 Database Optimization
- Proper indexing on frequently queried columns
- Query optimization and EXPLAIN analysis
- Connection pooling
- Read replicas for reporting queries

### 10.2 Caching Strategy
- Redis for session management
- Query result caching for frequent reads
- CDN for static assets
- API response caching where appropriate

### 10.3 Scalability Path
- Vertical scaling: Increase server resources
- Horizontal scaling: Add application servers
- Database sharding (future consideration)
- Microservices decomposition (if needed)

## 11. Monitoring and Logging

### 11.1 Application Logs
- Structured logging (JSON format)
- Log levels: ERROR, WARN, INFO, DEBUG
- Request/response logging
- Business transaction logging

### 11.2 Metrics
- API response times
- Database query performance
- Error rates
- Resource utilization

### 11.3 Alerts
- High error rates
- Performance degradation
- Resource exhaustion
- Security incidents
