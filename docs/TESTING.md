# Testing Documentation

## 1. Testing Overview

This document covers the testing strategy, procedures, and guidelines for the ERP system.

## 2. Testing Strategy

### 2.1 Testing Pyramid

```
                    /\
                   /  \
                  / E2E\        <- End-to-End Tests (10%)
                 /------\
                / Integration\  <- Integration Tests (30%)
               /--------------\
              /   Unit Tests   \ <- Unit Tests (60%)
             /------------------\
```

### 2.2 Testing Levels

1. **Unit Tests**: Test individual functions and methods
2. **Integration Tests**: Test module interactions and API endpoints
3. **E2E Tests**: Test complete user workflows
4. **Performance Tests**: Test system performance under load
5. **Security Tests**: Test for security vulnerabilities

## 3. Unit Testing

### 3.1 Backend Unit Tests

**Framework:** Jest

**Location:** `src/**/*.spec.ts`

**Run Tests:**
```bash
cd backend
npm run test
```

**Example Unit Test:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ProductService } from './product.service';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('ProductService', () => {
  let service: ProductService;
  let repository: MockRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
    repository = module.get<MockRepository>(getRepositoryToken(Product));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of products', async () => {
      const result = [{ id: '1', name: 'Test Product' }];
      repository.find.mockResolvedValue(result);
      expect(await service.findAll()).toEqual(result);
    });
  });
});
```

### 3.2 Frontend Unit Tests

**Framework:** Jest + React Testing Library

**Location:** `src/**/*.test.tsx`

**Run Tests:**
```bash
cd frontend
npm run test
```

**Example Unit Test:**
```typescript
import { render, screen } from '@testing-library/react';
import ProductList from './ProductList';

describe('ProductList', () => {
  it('renders product list', () => {
    const products = [
      { id: '1', name: 'Product 1', sku: 'SKU-001' },
      { id: '2', name: 'Product 2', sku: 'SKU-002' },
    ];
    render(<ProductList products={products} />);
    expect(screen.getByText('Product 1')).toBeInTheDocument();
    expect(screen.getByText('Product 2')).toBeInTheDocument();
  });
});
```

## 4. Integration Testing

### 4.1 API Integration Tests

**Framework:** Jest + Supertest

**Location:** `test/*.e2e-spec.ts`

**Run Tests:**
```bash
cd backend
npm run test:e2e
```

**Example Integration Test:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Products (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/products (GET)', () => {
    it('should return list of products', () => {
      return request(app.getHttpServer())
        .get('/products')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toBeInstanceOf(Array);
        });
    });
  });

  describe('/products (POST)', () => {
    it('should create a new product', () => {
      return request(app.getHttpServer())
        .post('/products')
        .send({
          sku: 'TEST-001',
          name: 'Test Product',
          type: 'FINISHED_GOOD',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.data.sku).toBe('TEST-001');
        });
    });
  });
});
```

### 4.2 Database Integration Tests

**Framework:** Jest + TypeORM

**Location:** `src/**/*.repository.spec.ts`

**Example Database Test:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductRepository } from './product.repository';
import { Product } from './product.entity';

describe('ProductRepository', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Product],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Product]),
      ],
      providers: [ProductRepository],
    }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('should save and retrieve a product', async () => {
    const repository = module.get<ProductRepository>(ProductRepository);
    const product = new Product();
    product.sku = 'TEST-001';
    product.name = 'Test Product';

    const saved = await repository.save(product);
    const found = await repository.findOne({ where: { id: saved.id } });

    expect(found).toBeDefined();
    expect(found.sku).toBe('TEST-001');
  });
});
```

## 5. End-to-End Testing

### 5.1 E2E Test Framework

**Framework:** Cypress or Playwright

**Location:** `e2e/`

**Run Tests:**
```bash
# Using Cypress
cd frontend
npm run cypress:open

# Using Playwright
cd frontend
npm run test:e2e
```

### 5.2 Example E2E Test (Cypress)

```typescript
describe('Sales Order Flow', () => {
  beforeEach(() => {
    cy.login('admin@example.com', 'password');
  });

  it('should create a sales order', () => {
    // Navigate to Sales Orders
    cy.visit('/sales/orders');
    cy.get('[data-testid="create-order"]').click();

    // Select Customer
    cy.get('[data-testid="customer-select"]').click();
    cy.get('[data-testid="customer-option"]').first().click();

    // Add Line Item
    cy.get('[data-testid="add-line"]').click();
    cy.get('[data-testid="product-select"]').click();
    cy.get('[data-testid="product-option"]').first().click();
    cy.get('[data-testid="quantity-input"]').type('100');

    // Save Order
    cy.get('[data-testid="save-order"]').click();

    // Verify Success
    cy.get('[data-testid="success-message"]').should('be.visible');
    cy.url().should('include', '/sales/orders/');
  });
});
```

## 6. Performance Testing

### 6.1 Load Testing

**Tool:** k6 or Artillery

**Location:** `performance/`

**Example k6 Script:**
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
};

export default function () {
  const res = http.get('http://localhost:3001/api/v1/products');
  check(res, { 'status was 200': (r) => r.status == 200 });
  sleep(1);
}
```

### 6.2 Performance Metrics

- **Response Time**: < 200ms for API calls
- **Throughput**: > 100 requests/second
- **Error Rate**: < 1%
- **CPU Usage**: < 80%
- **Memory Usage**: < 80%

## 7. Security Testing

### 7.1 Security Scan

**Tool:** OWASP ZAP or Snyk

**Run Scan:**
```bash
# Using OWASP ZAP
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t http://localhost:3001

# Using Snyk
npm audit
```

### 7.2 Security Checklist

- [ ] SQL Injection Prevention
- [ ] XSS Prevention
- [ ] CSRF Protection
- [ ] Authentication Bypass
- [ ] Authorization Bypass
- [ ] Sensitive Data Exposure
- [ ] Broken Access Control
- [ ] Security Misconfiguration

## 8. Test Data Management

### 8.1 Test Data Strategy

1. **Unit Tests**: Mock data, no database
2. **Integration Tests**: Test database, seeded data
3. **E2E Tests**: Test environment, realistic data
4. **Performance Tests**: Production-like data

### 8.2 Test Data Factory

```typescript
// src/common/factories/product.factory.ts
export class ProductFactory {
  static create(overrides?: Partial<Product>): Product {
    return {
      id: uuid(),
      sku: `SKU-${Math.random().toString(36).substr(2, 9)}`,
      name: 'Test Product',
      type: ProductType.FINISHED_GOOD,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }
}
```

## 9. Continuous Integration

### 9.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: test_db
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - name: Use Node.js 20
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd backend && npm ci
          cd ../frontend && npm ci

      - name: Run backend tests
        run: cd backend && npm test
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_USERNAME: test_user
          DB_PASSWORD: test_password
          DB_DATABASE: test_db

      - name: Run frontend tests
        run: cd frontend && npm test

      - name: Run E2E tests
        run: cd backend && npm run test:e2e
```

## 10. Test Coverage

### 10.1 Coverage Goals

- **Unit Tests**: 80% code coverage
- **Integration Tests**: 60% API coverage
- **E2E Tests**: Critical user flows

### 10.2 Generate Coverage Report

```bash
# Backend coverage
cd backend
npm run test:cov

# Frontend coverage
cd frontend
npm run test -- --coverage
```

### 10.3 Coverage Configuration

```json
{
  "coverageDirectory": "../coverage",
  "collectCoverageFrom": [
    "src/**/*.(t|j)s",
    "!src/main.ts",
    "!src/**/*.module.ts"
  ],
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

## 11. Test Reporting

### 11.1 Test Reports

- **JUnit XML**: For CI/CD integration
- **HTML Reports**: For human review
- **Coverage Reports**: For coverage tracking

### 11.2 Report Generation

```bash
# Generate JUnit report
npm run test -- --reporters=default --reporters=jest-junit

# Generate HTML report
npm run test -- --reporters=default --reporters=jest-html-reporter
```

## 12. Debugging Tests

### 12.1 Debug Backend Tests

```bash
# Debug specific test
npm run test -- --testNamePattern="should create product"

# Debug with VS Code
# Add to .vscode/launch.json:
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### 12.2 Debug Frontend Tests

```bash
# Debug specific test
npm run test -- --testNamePattern="ProductList"

# Debug with browser
npm run test -- --debug
```

## 13. Best Practices

### 13.1 Test Organization

1. **Arrange**: Set up test data and dependencies
2. **Act**: Execute the code being tested
3. **Assert**: Verify the expected outcome

### 13.2 Test Naming

```typescript
describe('ProductService', () => {
  describe('create', () => {
    it('should create a product with valid data', () => {});
    it('should throw error when SKU already exists', () => {});
    it('should validate required fields', () => {});
  });
});
```

### 13.3 Test Isolation

1. Each test should be independent
2. Clean up after each test
3. Use factories for test data
4. Mock external dependencies

### 13.4 Test Maintenance

1. Update tests when code changes
2. Remove obsolete tests
3. Keep tests simple and focused
4. Document complex test scenarios
