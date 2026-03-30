any different soundswhere i can i want this settings ok if i start import and navigating awayok after impor i see that # StyleSeat Guardian - AWS Deployment Guide

## Executive Summary

**Goal**: Deploy StyleSeat Guardian (test management web app) to AWS for 10-50 internal users

**Approach**: Manual deployment with DevOps team support

**Estimated Cost**: ~$50/month

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Target AWS Architecture](#target-aws-architecture)
3. [Questions for DevOps Team](#questions-for-devops-team)
4. [Phase 1: Code Preparation (Week 1-2)](#phase-1-code-preparation-week-1-2)
5. [Phase 2: AWS Infrastructure Setup (Week 2)](#phase-2-aws-infrastructure-setup-week-2)
6. [Phase 3: Database Migration (Week 2-3)](#phase-3-database-migration-week-2-3)
7. [Phase 4: Application Deployment (Week 3)](#phase-4-application-deployment-week-3)
8. [Phase 5: Testing & Go-Live (Week 3-4)](#phase-5-testing--go-live-week-3-4)
9. [Deployment Checklist](#deployment-checklist)
10. [Troubleshooting Guide](#troubleshooting-guide)
11. [Maintenance Procedures](#maintenance-procedures)
12. [Future Enhancements](#future-enhancements)

---

## Current State Analysis

### What Works Now (Development)
- **Backend**: Flask REST API on `localhost:5001`
  - Uses SQLite database (`app.db`) with WAL mode and foreign key enforcement
  - JWT authentication with file-backed secret persistence (`_stable_jwt_secret()`)
  - Rate limiting on auth endpoints (login: 5/min, register: 3/min, avatar: 10/min)
  - File uploads stored locally in `uploads/avatars/` (UUID filenames, magic-byte validation)
  - Security headers on all responses (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy)
  - Global error handlers (400, 404, 405, 413, 429, 500) — prevents stack trace leaks
  - Audit logging module (`app/audit.py`)
  - Scheduled jobs via APScheduler: data retention cleanup (daily 2 AM), Cypress sync (daily midnight)
  - CircleCI integration: import workflow results, attribution fields on test runs
  - Suite-path derivation engine (`suite_utils.py`) for Cypress ↔ suite mapping
  - DB backup/restore utilities (`backup_db.py`, `restore_db.py`)
  - Email domain restriction (`@styleseat.com` only)

- **Frontend**: React 19 SPA on `localhost:5173`
  - Vite dev server
  - API calls to hardcoded `http://localhost:5001/api`
  - Auth state via `AuthContext` with `localStorage` + `sessionStorage` support
  - Sends `X-Timezone` header on every API request
  - Vitest + @testing-library/react test suite
  - Playwright E2E tests in `e2e/` directory

### What Needs to Change for Production

**Critical Issues**:
1. ❌ Using Flask development server (not production-ready) — need Gunicorn
2. ❌ SQLite database (can't handle concurrent users) — need PostgreSQL
3. ❌ Hardcoded `localhost` URLs in frontend (`services/api.js`) and backend CORS (`__init__.py`)
4. ❌ No environment-based config switching (single `Config` class, no prod/dev split)
5. ❌ Local file storage for avatars (won't work with multiple servers) — need S3
6. ❌ No health check endpoint (required for ALB target group)
7. ✅ ~~No production logging~~ — audit logging and error handlers already in place; need to add Gunicorn-level structured logging

**Files That Need Updates**:
- `backend/config.py` - Add `ProductionConfig` class with PostgreSQL, S3, dynamic CORS
- `backend/requirements.txt` - Add `gunicorn`, `psycopg2-binary`, `boto3`
- `backend/app/__init__.py` - Dynamic CORS from config; add `/health` endpoint
- `backend/app/routes/auth.py` - Add S3 avatar upload path alongside local storage
- `backend/.env.example` - Add `DATABASE_URL`, `CORS_ORIGINS`, `S3_BUCKET`, `FLASK_ENV`
- `frontend/src/services/api.js` - Use `import.meta.env.VITE_API_URL` for API base URL

**New Files Needed**:
- `backend/Dockerfile` - Container image for backend
- `backend/wsgi.py` - Gunicorn entry point
- `frontend/.env.example` - Document `VITE_API_URL`
- `docker-compose.yml` - Local testing with PostgreSQL

---

## Target AWS Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Internet                          │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │   Route 53 (DNS)     │
         │  guardian.company... │
         └──────────┬───────────┘
                    │
        ┌───────────┴────────────┐
        │                        │
        ▼                        ▼
┌───────────────┐      ┌──────────────────┐
│  CloudFront   │      │ Application LB   │
│  (Frontend)   │      │  (Backend API)   │
│               │      │                  │
│  + ACM SSL    │      │  + ACM SSL       │
└───────┬───────┘      └────────┬─────────┘
        │                       │
        ▼                       ▼
┌───────────────┐      ┌──────────────────┐
│  S3 Bucket    │      │  EC2 t3.small    │
│  (React build)│      │  or ECS Fargate  │
│               │      │                  │
│  /index.html  │      │  + Docker        │
│  /assets/*    │      │  + Gunicorn      │
└───────────────┘      │  + Flask App     │
                       └────────┬─────────┘
                                │
                    ┌───────────┴──────────┐
                    │                      │
                    ▼                      ▼
          ┌──────────────────┐   ┌─────────────────┐
          │  RDS PostgreSQL  │   │   S3 Bucket     │
          │  db.t3.micro     │   │   (Avatars)     │
          │                  │   │                 │
          │  20GB storage    │   │  Private        │
          └──────────────────┘   └─────────────────┘
```

### Components Explained

| Component | Purpose | Specs | Cost/Month |
|-----------|---------|-------|------------|
| **CloudFront** | CDN for React frontend, HTTPS | Standard distribution | ~$1 |
| **S3 (frontend)** | Static file hosting | Standard storage, <1GB | ~$0.50 |
| **S3 (avatars)** | User avatar storage | Standard storage, <1GB | ~$0.50 |
| **Application Load Balancer** | Route traffic to backend, SSL termination | 1 ALB | ~$16 |
| **EC2 t3.small** | Run backend Docker container | 2 vCPU, 2GB RAM | ~$15 |
| **RDS db.t3.micro** | PostgreSQL database | 1 vCPU, 1GB RAM, 20GB | ~$15 |
| **ACM Certificates** | SSL/TLS certificates | 2 certificates (free) | $0 |
| **Route 53** | DNS management | 1 hosted zone | ~$0.50 |
| **Secrets Manager** | Store JWT secret, DB password | 2 secrets | ~$1 |
| **CloudWatch Logs** | Application logs | ~1GB/month | ~$0.50 |
| | | **TOTAL** | **~$50** |

---

## Questions for DevOps Team

**Before you start, schedule a 30-minute meeting with your DevOps team to ask these questions:**

### 1. Networking & Infrastructure
- [ ] **VPC**: "Do we have a standard VPC I should deploy into? Which VPC ID?"
- [ ] **Subnets**: "Which subnets should I use for the load balancer (public) and EC2/RDS (private)?"
- [ ] **Security Groups**: "Can you share a template security group for web applications, or should I create custom ones?"
- [ ] **NAT Gateway**: "Do our private subnets have NAT gateway access for outbound internet (for package downloads)?"

### 2. Access & Permissions
- [ ] **IAM Roles**: "Can you create an IAM role for my EC2/ECS with permissions for:
  - S3 read/write (for avatars)
  - Secrets Manager read (for JWT secret, DB password)
  - CloudWatch Logs write
  - ECR pull (if using ECS)"
- [ ] **AWS Console Access**: "What's my IAM user/role for deploying resources? Do I have permissions for EC2, RDS, S3, ALB?"
- [ ] **SSH Access**: "How do I get SSH access to EC2 instances? Which key pair should I use?"

### 3. Database
- [ ] **RDS**: "Do we have an existing RDS instance where I can create a new database, or should I provision a new db.t3.micro instance?"
- [ ] **Backups**: "What's our standard backup policy for RDS? Automated backups enabled?"
- [ ] **Monitoring**: "Are RDS instances automatically monitored? Should I set up CloudWatch alarms?"

### 4. Secrets Management
- [ ] **Secrets Manager vs Parameter Store**: "Which do you prefer for storing secrets like JWT keys and DB passwords?"
- [ ] **Secret Naming Convention**: "What's our naming pattern? e.g., `/prod/guardian/jwt-secret`?"

### 5. Domain & DNS
- [ ] **Subdomain**: "How do I request a subdomain like `guardian.styleseat.com` or `testmanagement.company.com`?"
- [ ] **Route 53**: "Do you manage Route 53, or can I create records myself?"
- [ ] **SSL Certificates**: "Can you provision ACM certificates for my domain, or should I request them?"

### 6. Deployment Preference
- [ ] **EC2 vs ECS**: "Do you prefer I deploy on EC2 with Docker, or use ECS/Fargate? What's standard for our team?"
- [ ] **Container Registry**: "Should I use ECR, or can I pull from Docker Hub?"
- [ ] **Deployment Method**: "For initial deployment, should I manually deploy, or do you have a CI/CD pipeline template?"

### 7. Monitoring & Logging
- [ ] **CloudWatch**: "What CloudWatch log group naming convention should I use?"
- [ ] **Dashboards**: "Do we have standard CloudWatch dashboards I should add my app to?"
- [ ] **Alerting**: "Should I set up alarms for error rates, or do you handle that centrally?"
- [ ] **Costs**: "Are there cost alerts configured? Should I set budgets for my resources?"

### 8. Compliance & Security
- [ ] **Data Retention**: "The app auto-deletes test runs after 30 days. Any compliance requirements I should know about?"
- [ ] **Encryption**: "Should RDS and S3 use encryption at rest? KMS keys?"
- [ ] **VPC Endpoints**: "Should I use VPC endpoints for S3/Secrets Manager, or go over public internet?"

---

## Phase 1: Code Preparation (Week 1-2)

### 1.1 Backend: Add Production Dependencies

**File**: `backend/requirements.txt`

Current dependencies already include `python-dotenv` and `APScheduler`. **Add these lines**:
```
gunicorn==23.0.0          # Production WSGI server
psycopg2-binary==2.9.10   # PostgreSQL adapter
boto3==1.35.0             # AWS SDK (for S3)
```

> **Note**: `python-dotenv==1.2.2` is already installed. `APScheduler==3.10.4` is already installed for scheduled jobs.

### 1.2 Backend: Create Environment-Based Configuration

**File**: `backend/config.py` (update existing)

The current `config.py` has a single `Config` class with SQLite, file-backed JWT secret (`_stable_jwt_secret()`), and CircleCI settings. It needs to be extended with production support.

**Changes needed** — add these settings to the existing `Config` class and add a `ProductionConfig` subclass:

```python
import os
import secrets
from datetime import timedelta
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, ".env"))


def _stable_jwt_secret():
    """Return a JWT secret that persists across restarts.
    Priority: env var → .jwt_secret file → generate + write to file.
    """
    key = os.environ.get("JWT_SECRET_KEY")
    if key:
        return key
    secret_path = os.path.join(basedir, ".jwt_secret")
    if os.path.exists(secret_path):
        with open(secret_path) as f:
            return f.read().strip()
    key = secrets.token_hex(32)
    with open(secret_path, "w") as f:
        f.write(key)
    return key


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or f"sqlite:///{os.path.join(basedir, 'app.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"timeout": 60},
        "pool_pre_ping": True,
    }
    JWT_SECRET_KEY = _stable_jwt_secret()
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_BLACKLIST_ENABLED = True
    JWT_BLACKLIST_TOKEN_CHECKS = ["access"]
    UPLOAD_FOLDER = os.path.join(basedir, "uploads", "avatars")
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB

    # Rate limiting
    RATELIMIT_STORAGE_URI = "memory://"

    # CORS — comma-separated origins, defaults to localhost for dev
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')

    # Data retention
    RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", 30))

    # CircleCI Integration
    CIRCLECI_API_TOKEN = os.environ.get("CIRCLECI_API_TOKEN")
    CIRCLECI_PROJECT_SLUG = os.environ.get("CIRCLECI_PROJECT_SLUG")

    # S3 Storage (production)
    USE_S3_STORAGE = os.environ.get('USE_S3_STORAGE', 'false').lower() == 'true'
    S3_BUCKET = os.environ.get('S3_BUCKET', 'guardian-avatars-prod')
    S3_REGION = os.environ.get('AWS_REGION', 'us-east-1')


class ProductionConfig(Config):
    """Production configuration — requires DATABASE_URL and JWT_SECRET_KEY env vars."""
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')  # must be PostgreSQL
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}       # no SQLite timeout
    USE_S3_STORAGE = True


config = {
    'development': Config,
    'production': ProductionConfig,
    'default': Config
}
```

> **Important**: The `_stable_jwt_secret()` function already handles JWT key persistence via file or env var. In production, always set `JWT_SECRET_KEY` as an environment variable (from AWS Secrets Manager). The `CORS_ORIGINS` config must also be updated in `__init__.py` to read from config instead of the current hardcoded list.

### 1.3 Backend: Add Health Check Endpoint

**File**: `backend/app/__init__.py`

The app factory already has security headers, global error handlers, rate limiting, and scheduled jobs. **Add this health check route** inside `create_app()`, after the blueprint registrations (around line 102):

```python
from sqlalchemy import text

@app.route('/health')
def health():
    """Health check endpoint for ALB target group — no auth required."""
    try:
        db.session.execute(text('SELECT 1'))
        return {'status': 'healthy', 'database': 'connected'}, 200
    except Exception as e:
        return {'status': 'unhealthy', 'error': str(e)}, 503
```

Also update the CORS configuration in `create_app()` to use config-driven origins instead of the current hardcoded list:

```python
# Replace this:
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}},
     supports_credentials=True)

# With this:
CORS(app, resources={r"/api/*": {"origins": app.config.get("CORS_ORIGINS", ["http://localhost:5173"])}},
     supports_credentials=True)
```

### 1.4 Backend: Create WSGI Entry Point

**File**: `backend/wsgi.py` (NEW FILE)

```python
"""WSGI entry point for Gunicorn"""
import os
from app import create_app

# Use production config
os.environ.setdefault('FLASK_ENV', 'production')
app = create_app()

if __name__ == '__main__':
    app.run()
```

### 1.5 Backend: Add S3 Avatar Storage

**File**: `backend/app/routes/auth.py`

The current `upload_avatar()` route already handles local storage with UUID filenames, magic-byte validation, and old-avatar cleanup. For production, add an S3 upload path that's selected based on the `USE_S3_STORAGE` config flag.

**Add S3 helper function** (at module level, after the existing imports):
```python
import boto3
from flask import current_app

def upload_avatar_to_s3(file_data, filename, content_type='image/jpeg'):
    """Upload avatar to S3 when USE_S3_STORAGE is enabled."""
    s3 = boto3.client('s3', region_name=current_app.config['S3_REGION'])
    key = f'avatars/{filename}'

    s3.put_object(
        Bucket=current_app.config['S3_BUCKET'],
        Key=key,
        Body=file_data,
        ContentType=content_type,
    )

    return f"https://{current_app.config['S3_BUCKET']}.s3.{current_app.config['S3_REGION']}.amazonaws.com/{key}"
```

**Then update `upload_avatar()`** to branch on config — after the existing validation and `saved_name` generation:
```python
    if current_app.config.get('USE_S3_STORAGE'):
        file_data = file.read()
        ext = saved_name.rsplit('.', 1)[1].lower()
        content_type = f'image/{ext}' if ext != 'jpg' else 'image/jpeg'
        s3_url = upload_avatar_to_s3(file_data, saved_name, content_type)
        user.avatar = saved_name  # still store filename for reference
        # Optionally store full S3 URL: user.avatar = s3_url
    else:
        file.save(os.path.join(upload_folder, saved_name))
        user.avatar = saved_name
```

> **Note**: The `serve_avatar()` endpoint will also need an S3 redirect for production. Consider returning a presigned S3 URL or proxying through CloudFront.

### 1.6 Backend: Add Structured Logging

**Status**: Partially done. The app already has:
- An audit logger (`app/audit.py`) imported by `dashboard.py`
- A `guardian.audit` logger configured in `__init__.py` with `StreamHandler`
- A `guardian.sync` logger for Cypress sync jobs
- Auth route logging (`routes/auth.py`) for failed login/registration attempts

**Remaining for production** — add Gunicorn-level access logging. This is handled by Gunicorn config, not Flask. Add to the Docker CMD or a `gunicorn.conf.py`:

```python
# backend/gunicorn.conf.py (NEW FILE)
bind = "0.0.0.0:5001"
workers = 2
timeout = 120
accesslog = "-"        # stdout — picked up by CloudWatch
errorlog = "-"         # stderr
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'
```

Then run with: `gunicorn -c gunicorn.conf.py wsgi:app`

### 1.7 Backend: Update Environment File Template

**File**: `backend/.env.example` (already exists — update it)

The current `.env.example` only has CircleCI, JWT, TestRail, and retention settings. **Add production variables**:

```bash
# CircleCI Integration
CIRCLECI_API_TOKEN=your_circleci_personal_api_token
CIRCLECI_PROJECT_SLUG=gh/styleseat/cypress

# JWT Secret (optional — auto-generated and persisted to .jwt_secret file if not set)
JWT_SECRET_KEY=

# Database (default: SQLite; set to PostgreSQL for production)
# DATABASE_URL=postgresql://username:password@rds-endpoint:5432/guardian

# CORS (comma-separated list; default: http://localhost:5173)
# CORS_ORIGINS=https://guardian.yourdomain.com

# AWS S3 Configuration (for production avatar storage)
# USE_S3_STORAGE=true
# S3_BUCKET=guardian-avatars-prod
# AWS_REGION=us-east-1

# Data Retention (days, default 30)
RETENTION_DAYS=30

# TestRail Integration (only needed for seed_testrail.py / seed_demo.py)
TESTRAIL_BASE_URL=https://styleseat.testrail.io/index.php?/api/v2
TESTRAIL_EMAIL=your_email@styleseat.com
TESTRAIL_PASSWORD=your_testrail_password
TESTRAIL_PROJECT_ID=23
```

### 1.8 Frontend: Add Environment Variable Support

**File**: `frontend/.env.example` (NEW FILE)

```bash
# API Configuration (default: http://localhost:5001/api for local dev)
VITE_API_URL=https://api.guardian.yourdomain.com/api
```

**File**: `frontend/src/services/api.js`

The current file has a hardcoded `baseURL`, JWT interceptor reading from both `localStorage` and `sessionStorage`, and an `X-Timezone` header. **Only the first line of `axios.create` needs to change**:

```javascript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api',
});
```

> **Note**: Do NOT remove the existing `getToken()`, `clearAuth()`, request interceptor (JWT + X-Timezone header), or response interceptor (401 handling). Only change the `baseURL` line.

### 1.9 Create Backend Dockerfile

**File**: `backend/Dockerfile` (NEW FILE)

```dockerfile
FROM python:3.13-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads/avatars

# Expose port
EXPOSE 5001

# Run with Gunicorn (uses gunicorn.conf.py from Phase 1.6)
CMD ["gunicorn", "-c", "gunicorn.conf.py", "wsgi:app"]
```

### 1.10 Create Frontend Dockerfile (Optional - for containerized deployment)

**File**: `frontend/Dockerfile` (NEW FILE)

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Nginx stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**File**: `frontend/nginx.conf` (NEW FILE)

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # React Router support
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 1.11 Create Docker Compose for Local Testing

**File**: `docker-compose.yml` (NEW FILE, root directory)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: guardian
      POSTGRES_USER: guardian
      POSTGRES_PASSWORD: guardianpass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "5001:5001"
    environment:
      DATABASE_URL: postgresql://guardian:guardianpass@postgres:5432/guardian
      JWT_SECRET_KEY: dev-jwt-secret
      CORS_ORIGINS: http://localhost:5173
      USE_S3_STORAGE: "false"
      RETENTION_DAYS: "30"
      CIRCLECI_API_TOKEN: ${CIRCLECI_API_TOKEN:-}
    depends_on:
      - postgres
    volumes:
      - ./backend:/app
      - ./backend/uploads:/app/uploads

volumes:
  postgres_data:
```

> **Note**: The `CIRCLECI_API_TOKEN` is passed through from the host environment if set. The backend's `seed.py` should be run once to bootstrap team accounts after first start: `docker-compose exec backend python seed.py`.

### 1.12 Update .gitignore

**Status**: Already up to date. The current `.gitignore` already includes:
- `.env`, `.env.local`, `.env.*.local`
- `*.db`, `*.db-shm`, `*.db-wal`
- `backend/uploads/avatars/`
- `backend/db_backup.json`, `**/secrets.*`, `**/credentials.*`
- `frontend/dist/`, `frontend/build/`
- `.jwt_secret` (via `.last-run.json.jwt_secret` pattern)

**Add these lines** for Docker support:
```
# Docker
docker-compose.override.yml
```

> **Note**: The `.jwt_secret` file (used by `_stable_jwt_secret()`) should also be explicitly gitignored if not already matched. Add `backend/.jwt_secret` to be safe.

---

## Phase 2: AWS Infrastructure Setup (Week 2)

### 2.1 Create RDS PostgreSQL Database

**Option A: Ask DevOps to provision (RECOMMENDED)**

Provide them with these specs:
```
Engine: PostgreSQL 15
Instance Class: db.t3.micro
Storage: 20 GB GP3
Multi-AZ: No (cost savings)
Backup Retention: 7 days
Database Name: guardian
Master Username: guardian_admin
Subnet Group: [Your VPC's private subnets]
Security Group: Allow TCP 5432 from backend security group
Encryption: Enabled
```

**Option B: Create manually via AWS Console**

1. Go to RDS → Create Database
2. Choose PostgreSQL, Free Tier template
3. Settings:
   - DB instance identifier: `guardian-prod-db`
   - Master username: `guardian_admin`
   - Auto-generate password (save it!)
4. Instance configuration: `db.t3.micro`
5. Storage: 20 GB, disable autoscaling
6. Connectivity:
   - VPC: [Your company VPC]
   - Subnet group: [Private subnets]
   - Public access: No
   - VPC security group: Create new `guardian-db-sg`
7. Additional configuration:
   - Initial database name: `guardian`
   - Backup retention: 7 days
8. Create database
9. **Save the endpoint**: `guardian-prod-db.xxxxx.us-east-1.rds.amazonaws.com`

### 2.2 Create S3 Buckets

**Frontend Bucket** (for React build):
```bash
aws s3 mb s3://guardian-frontend-prod
aws s3 website s3://guardian-frontend-prod --index-document index.html --error-document index.html
```

**Avatars Bucket** (for user uploads):
```bash
aws s3 mb s3://guardian-avatars-prod

# Block public access (we'll use signed URLs)
aws s3api put-public-access-block \
    --bucket guardian-avatars-prod \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 2.3 Store Secrets in AWS Secrets Manager

**JWT Secret**:
```bash
aws secretsmanager create-secret \
    --name /prod/guardian/jwt-secret \
    --secret-string "$(openssl rand -hex 32)"
```

**Database Password** (if you auto-generated it):
```bash
aws secretsmanager create-secret \
    --name /prod/guardian/db-password \
    --secret-string "your-rds-master-password"
```

### 2.4 Create IAM Role for Backend

**Ask DevOps to create a role with this policy**, or create manually:

**Role Name**: `GuardianBackendRole`

**Trust Policy** (for EC2):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ec2.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
```

**Permissions Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::guardian-avatars-prod/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:/prod/guardian/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/guardian/*"
    }
  ]
}
```

### 2.5 Create Security Groups

**Backend Security Group** (`guardian-backend-sg`):
- Inbound: TCP 5001 from ALB security group
- Inbound: TCP 22 from your office IP (for SSH)
- Outbound: All traffic

**Database Security Group** (`guardian-db-sg`):
- Inbound: TCP 5432 from backend security group
- Outbound: None needed

**ALB Security Group** (`guardian-alb-sg`):
- Inbound: TCP 443 from 0.0.0.0/0 (HTTPS)
- Inbound: TCP 80 from 0.0.0.0/0 (HTTP, redirect to HTTPS)
- Outbound: TCP 5001 to backend security group

### 2.6 Launch EC2 Instance for Backend

**Manual Launch via Console**:

1. Go to EC2 → Launch Instance
2. Settings:
   - Name: `guardian-backend-prod`
   - AMI: Amazon Linux 2023 (or Ubuntu 22.04)
   - Instance type: `t3.small`
   - Key pair: [Your company SSH key]
   - Network: [Your VPC]
   - Subnet: [Private subnet with NAT gateway]
   - Security group: `guardian-backend-sg`
   - IAM role: `GuardianBackendRole`
   - Storage: 20 GB GP3
3. Launch instance
4. Note the private IP address

**SSH Setup**:
```bash
# From bastion host or VPN
ssh -i your-key.pem ec2-user@<private-ip>
```

**Install Docker on EC2**:
```bash
# Amazon Linux 2023
sudo yum update -y
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Ubuntu 22.04
sudo apt update
sudo apt install -y docker.io
sudo systemctl enable docker
sudo usermod -aG docker ubuntu
```

### 2.7 Create Application Load Balancer

**Target Group** first:
1. Go to EC2 → Target Groups → Create
2. Settings:
   - Target type: Instance
   - Name: `guardian-backend-tg`
   - Protocol: HTTP, Port: 5001
   - VPC: [Your VPC]
   - Health check path: `/health`
   - Health check interval: 30 seconds
   - Healthy threshold: 2
   - Unhealthy threshold: 3
3. Register your EC2 instance as a target

**Load Balancer**:
1. Go to EC2 → Load Balancers → Create
2. Choose Application Load Balancer
3. Settings:
   - Name: `guardian-alb`
   - Scheme: Internet-facing
   - IP address type: IPv4
   - VPC: [Your VPC]
   - Subnets: Select 2+ public subnets
   - Security group: `guardian-alb-sg`
4. Listeners:
   - HTTP:80 → Redirect to HTTPS
   - HTTPS:443 → Forward to `guardian-backend-tg`
   - SSL certificate: [Request from ACM first]
5. Create load balancer
6. Note the DNS name: `guardian-alb-xxxxx.us-east-1.elb.amazonaws.com`

### 2.8 Request SSL Certificate (ACM)

**For Backend (ALB)**:
1. Go to ACM → Request Certificate
2. Domain: `api.guardian.yourdomain.com`
3. Validation: DNS (easier) or Email
4. Add CNAME records to Route53 for validation
5. Wait for "Issued" status
6. Attach to ALB HTTPS listener

**For Frontend (CloudFront)**:
1. **Switch to us-east-1 region** (CloudFront requires it)
2. Request certificate for `guardian.yourdomain.com`
3. Validate via DNS
4. Note the ARN

### 2.9 Create CloudFront Distribution

1. Go to CloudFront → Create Distribution
2. Settings:
   - Origin domain: `guardian-frontend-prod.s3.us-east-1.amazonaws.com`
   - Origin path: (leave empty)
   - Origin access: Origin Access Control
   - Create OAC → Save
   - Update S3 bucket policy (CloudFront will provide)
3. Default cache behavior:
   - Viewer protocol: Redirect HTTP to HTTPS
   - Allowed HTTP methods: GET, HEAD
   - Cache policy: CachingOptimized
4. Settings:
   - Alternate domain names: `guardian.yourdomain.com`
   - Custom SSL certificate: [Select your ACM cert]
   - Default root object: `index.html`
5. Create distribution
6. Note the CloudFront domain: `dxxxxx.cloudfront.net`

**Error Pages** (for React Router):
1. Go to distribution → Error Pages
2. Create custom error response:
   - HTTP error code: 403
   - Customize error response: Yes
   - Response page path: `/index.html`
   - HTTP response code: 200
3. Repeat for 404 error

### 2.10 Configure Route 53 DNS

1. Go to Route 53 → Hosted Zones → [Your domain]
2. Create Record for frontend:
   - Name: `guardian.yourdomain.com`
   - Type: A
   - Alias: Yes
   - Alias target: CloudFront distribution
3. Create Record for backend:
   - Name: `api.guardian.yourdomain.com`
   - Type: A
   - Alias: Yes
   - Alias target: Application Load Balancer

---

## Phase 3: Database Migration (Week 2-3)

### 3.1 Install Alembic for Migrations

**On your local machine**:
```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install alembic
pip freeze > requirements.txt  # Update requirements
```

**Initialize Alembic**:
```bash
alembic init migrations
```

**File**: `backend/alembic.ini`

Update the `sqlalchemy.url` line:
```ini
# Use environment variable
sqlalchemy.url =
```

**File**: `backend/migrations/env.py`

Update to use your models (all 11 models):
```python
from app import create_app, db
from app.models import (
    TokenBlocklist, User, Project, Suite, Section, TestCase,
    TestRun, TestResult, ResultHistory, SyncBaseline, SyncLog
)
import os

# Get database URL from environment
config.set_main_option(
    'sqlalchemy.url',
    os.environ.get('DATABASE_URL', 'sqlite:///app.db')
)

target_metadata = db.metadata
```

> **Important**: The current schema has evolved beyond the original design. Notable differences Alembic will detect:
> - `test_cases.suite_id` (FK to suites, with ON DELETE CASCADE)
> - `test_cases.updated_by` (FK to users)
> - `test_runs.run_date` is `String(10)` not `DateTime` — stores `"YYYY-MM-DD"` strings
> - `test_runs.circleci_workflow_id`, `commit_sha`, `triggered_by` columns
> - `test_results.case_id` is nullable with ON DELETE SET NULL
> - `test_results.error_message`, `artifacts` (JSON), `circleci_job_id`
> - `result_history.error_message`, `artifacts` (JSON)
> - `sync_logs.suites_processed`, `status`, `error_message`
>
> The lightweight migrations in `run.py` handle SQLite ALTER TABLE for development. For PostgreSQL, Alembic handles everything cleanly.

### 3.2 Create Initial Migration

**Generate migration from current schema**:
```bash
# Set local database URL
export DATABASE_URL="postgresql://guardian:guardianpass@localhost:5432/guardian"

# Create migration
alembic revision --autogenerate -m "Initial schema"

# Review the generated file in migrations/versions/
```

**Test locally with PostgreSQL**:
```bash
# Start local PostgreSQL via Docker Compose
docker-compose up -d postgres

# Run migration
alembic upgrade head

# Verify tables created
psql postgresql://guardian:guardianpass@localhost:5432/guardian -c "\dt"
```

### 3.3 Export Data from SQLite (Optional)

**If you have data to migrate**:

**File**: `backend/export_data.py` (NEW FILE)

```python
"""Export SQLite data to JSON"""
import json
from app import create_app, db
from app.models import User, Project, Suite, Section, TestCase, TestRun, TestResult, ResultHistory

app = create_app()

with app.app_context():
    data = {
        'users': [u.to_dict() for u in User.query.all()],
        'projects': [p.to_dict() for p in Project.query.all()],
        'suites': [s.to_dict() for s in Suite.query.all()],
        # ... add all models
    }

    with open('data_export.json', 'w') as f:
        json.dump(data, f, indent=2, default=str)

    print("Data exported to data_export.json")
```

Run: `python export_data.py`

### 3.4 Initialize Production Database

**Connect to RDS** (from EC2 instance or bastion):
```bash
# Get DB password from Secrets Manager
DB_PASSWORD=$(aws secretsmanager get-secret-value \
    --secret-id /prod/guardian/db-password \
    --query SecretString \
    --output text)

# Set DATABASE_URL
export DATABASE_URL="postgresql://guardian_admin:${DB_PASSWORD}@guardian-prod-db.xxxxx.us-east-1.rds.amazonaws.com:5432/guardian"

# Run migrations
alembic upgrade head
```

**Verify**:
```bash
psql "$DATABASE_URL" -c "\dt"

# Should see 11 tables:
# token_blocklist, users, projects, suites, sections, test_cases,
# test_runs, test_results, result_history, sync_baselines, sync_logs
```

### 3.5 Seed Initial Data (Optional)

The existing `backend/seed.py` creates team accounts and the "Automation Overview" project. For production, either run the seed script or create users manually.

**Option A: Run existing seed script** (after setting `DATABASE_URL`):
```bash
cd backend && DATABASE_URL="postgresql://..." python seed.py
```

**Option B: Create admin user manually**:
```python
from app import create_app, db
from app.models import User

app = create_app()
with app.app_context():
    admin = User(username='admin', email='admin@styleseat.com')
    admin.set_password('ChangeMe123!')
    db.session.add(admin)
    db.session.commit()
```

> **Note**: Email must be `@styleseat.com` to pass the domain restriction in `routes/auth.py`. Change `ALLOWED_EMAIL_DOMAIN` if your team uses a different domain.

---

## Phase 4: Application Deployment (Week 3)

### 4.1 Build and Push Backend Docker Image

**On your local machine**:
```bash
cd backend

# Build image
docker build -t guardian-backend:v1.0.0 .

# Test locally
docker run -p 5001:5001 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET_KEY="test-secret" \
  guardian-backend:v1.0.0
```

**Push to ECR (if using)**:
```bash
# Create ECR repository
aws ecr create-repository --repository-name guardian-backend

# Get login command
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Tag image
docker tag guardian-backend:v1.0.0 \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/guardian-backend:v1.0.0

# Push
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/guardian-backend:v1.0.0
```

**Or save and transfer to EC2**:
```bash
docker save guardian-backend:v1.0.0 | gzip > guardian-backend.tar.gz
scp guardian-backend.tar.gz ec2-user@<instance-ip>:~/
```

### 4.2 Deploy Backend to EC2

**SSH to EC2**:
```bash
ssh -i your-key.pem ec2-user@<private-ip>
```

**Load Docker image** (if transferred):
```bash
docker load < guardian-backend.tar.gz
```

**Create environment file**:
```bash
cat > /home/ec2-user/guardian.env << EOF
FLASK_ENV=production
DATABASE_URL=postgresql://guardian_admin:<password>@guardian-prod-db.xxxxx.us-east-1.rds.amazonaws.com:5432/guardian
JWT_SECRET_KEY=<from-secrets-manager>
CORS_ORIGINS=https://guardian.yourdomain.com
USE_S3_STORAGE=true
S3_BUCKET=guardian-avatars-prod
AWS_REGION=us-east-1
RETENTION_DAYS=30
EOF
```

**Better: Use AWS Secrets Manager** in container:
```bash
# Install AWS CLI in container or use entrypoint script
# For simplicity, fetch secrets before running container:

JWT_SECRET=$(aws secretsmanager get-secret-value \
    --secret-id /prod/guardian/jwt-secret \
    --query SecretString --output text)

DB_PASSWORD=$(aws secretsmanager get-secret-value \
    --secret-id /prod/guardian/db-password \
    --query SecretString --output text)

# Update env file
sed -i "s/<password>/${DB_PASSWORD}/" /home/ec2-user/guardian.env
sed -i "s/<from-secrets-manager>/${JWT_SECRET}/" /home/ec2-user/guardian.env
```

**Run container**:
```bash
docker run -d \
  --name guardian-backend \
  --restart unless-stopped \
  -p 5001:5001 \
  --env-file /home/ec2-user/guardian.env \
  guardian-backend:v1.0.0
```

**Check logs**:
```bash
docker logs -f guardian-backend
```

**Create systemd service** (for auto-restart on boot):
```bash
sudo tee /etc/systemd/system/guardian-backend.service > /dev/null << EOF
[Unit]
Description=Guardian Backend
After=docker.service
Requires=docker.service

[Service]
Restart=always
ExecStartPre=-/usr/bin/docker stop guardian-backend
ExecStartPre=-/usr/bin/docker rm guardian-backend
ExecStart=/usr/bin/docker run --rm \
  --name guardian-backend \
  -p 5001:5001 \
  --env-file /home/ec2-user/guardian.env \
  guardian-backend:v1.0.0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable guardian-backend
sudo systemctl start guardian-backend
```

### 4.3 Build and Deploy Frontend

**On your local machine**:
```bash
cd frontend

# Create production .env
cat > .env.production << EOF
VITE_API_URL=https://api.guardian.yourdomain.com/api
EOF

# Build
npm run build

# Output is in dist/ directory
```

**Deploy to S3**:
```bash
aws s3 sync dist/ s3://guardian-frontend-prod/ --delete

# Set cache headers
aws s3 cp s3://guardian-frontend-prod/ s3://guardian-frontend-prod/ \
  --recursive \
  --exclude "*" \
  --include "*.js" \
  --include "*.css" \
  --metadata-directive REPLACE \
  --cache-control "public, max-age=31536000, immutable"
```

**Invalidate CloudFront cache**:
```bash
aws cloudfront create-invalidation \
  --distribution-id <your-distribution-id> \
  --paths "/*"
```

### 4.4 Verify Deployment

**Backend health check**:
```bash
curl https://api.guardian.yourdomain.com/health

# Should return: {"status":"healthy","database":"connected"}
```

**Frontend**:
```bash
curl https://guardian.yourdomain.com

# Should return the index.html
```

**Full test**:
1. Open `https://guardian.yourdomain.com` in browser
2. Register new account
3. Login
4. Create project, suite, test case
5. Upload avatar
6. Check S3 bucket for avatar file
7. Check RDS for data: `psql "$DATABASE_URL" -c "SELECT * FROM users;"`

---

## Phase 5: Testing & Go-Live (Week 3-4)

### 5.1 Deployment Checklist

**Infrastructure**:
- [ ] RDS database created and accessible
- [ ] S3 buckets created (frontend, avatars)
- [ ] Secrets stored in Secrets Manager
- [ ] IAM role attached to EC2
- [ ] Security groups configured
- [ ] EC2 instance running
- [ ] ALB created and healthy
- [ ] CloudFront distribution active
- [ ] ACM certificates issued and attached
- [ ] Route 53 DNS records pointing correctly

**Application**:
- [ ] Database migrations run successfully
- [ ] Backend container running on EC2
- [ ] Health check endpoint returns 200
- [ ] Frontend deployed to S3
- [ ] CloudFront serving frontend correctly
- [ ] API CORS allows frontend domain
- [ ] Environment variables set correctly
- [ ] S3 avatar upload working

**Testing**:
- [ ] Can access frontend via HTTPS
- [ ] Can register new user
- [ ] Can login
- [ ] JWT token persists across page refresh
- [ ] Can create project
- [ ] Can create test suite
- [ ] Can create test case with steps
- [ ] Can upload avatar (check S3)
- [ ] Can create test run
- [ ] Can execute test and update status
- [ ] Test run statistics calculate correctly
- [ ] Data retention job runs (check logs)
- [ ] No CORS errors in browser console
- [ ] No mixed content warnings
- [ ] Mobile responsive layout works

### 5.2 Monitoring Setup

**CloudWatch Log Groups**:
```bash
# Create log group
aws logs create-log-group --log-group-name /aws/guardian/backend

# Configure Docker to send logs
# Update docker run command:
docker run -d \
  --name guardian-backend \
  --log-driver=awslogs \
  --log-opt awslogs-group=/aws/guardian/backend \
  --log-opt awslogs-region=us-east-1 \
  ...
```

**CloudWatch Alarms**:

**Backend Health Check Alarm**:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name guardian-backend-unhealthy \
  --alarm-description "Alert when backend is unhealthy" \
  --metric-name UnHealthyHostCount \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=TargetGroup,Value=<target-group-arn> \
  --alarm-actions <sns-topic-arn>
```

**RDS CPU Alarm**:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name guardian-rds-high-cpu \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DBInstanceIdentifier,Value=guardian-prod-db
```

**CloudWatch Dashboard**:

Create dashboard at CloudWatch → Dashboards → Create:
- ALB request count
- ALB target response time
- RDS CPU/memory/connections
- EC2 CPU/memory
- S3 request metrics

### 5.3 Performance Testing

**Load test with Apache Bench**:
```bash
# Test login endpoint
ab -n 100 -c 10 -p login.json -T application/json \
  https://api.guardian.yourdomain.com/api/auth/login

# Test health check
ab -n 1000 -c 50 \
  https://api.guardian.yourdomain.com/health
```

**Expected performance**:
- Health check: <100ms
- Login: <500ms
- Create test case: <300ms
- Load test suite page: <1s

### 5.4 Security Checklist

- [ ] All endpoints use HTTPS only
- [ ] HTTP redirects to HTTPS
- [ ] RDS not publicly accessible
- [ ] S3 avatars bucket blocks public access
- [ ] Security groups follow least privilege
- [ ] JWT secrets stored in Secrets Manager
- [ ] Database password rotated from default
- [x] Rate limiting enabled on auth endpoints (login: 5/min, register: 3/min, avatar: 10/min)
- [ ] CORS only allows production domain
- [x] Security headers enabled (X-Frame-Options DENY, X-Content-Type-Options nosniff, X-XSS-Protection, Referrer-Policy)
- [x] File upload size limits enforced (5MB, magic-byte validation)
- [x] SQL injection protected (using SQLAlchemy ORM)
- [x] Global error handlers prevent stack trace leaks (400, 404, 405, 413, 429, 500)
- [x] Email domain restriction on registration/login (`@styleseat.com`)
- [x] Avatar filenames use UUID (non-predictable, non-enumerable)
- [x] Audit logging on sensitive operations

### 5.5 Backup & Recovery

**RDS Automated Backups** (already enabled):
- Retention: 7 days
- Backup window: AWS chooses automatically
- Test restore to new instance

**Manual Snapshot**:
```bash
aws rds create-db-snapshot \
  --db-instance-identifier guardian-prod-db \
  --db-snapshot-identifier guardian-pre-launch-$(date +%Y%m%d)
```

**S3 Versioning** (for avatar protection):
```bash
aws s3api put-bucket-versioning \
  --bucket guardian-avatars-prod \
  --versioning-configuration Status=Enabled
```

**Disaster Recovery Plan**:
1. RDS failure → Restore from automated backup (~5 min)
2. EC2 failure → Launch new instance, pull Docker image, start container (~10 min)
3. S3 data loss → Restore from versioning
4. Region failure → Deploy to new region (requires multi-region setup)

---

## Deployment Checklist

Use this as your master checklist during deployment:

### Pre-Deployment
- [ ] Met with DevOps team and got answers to all questions
- [ ] Have AWS console access with appropriate permissions
- [ ] Have SSH key pair for EC2 access
- [ ] Know VPC ID and subnet IDs to use
- [ ] Domain name approved and available

### Week 1: Code Changes
- [ ] Added `gunicorn`, `psycopg2-binary`, `boto3` to `requirements.txt`
- [ ] Updated `config.py` with `ProductionConfig` class, `CORS_ORIGINS`, S3 settings
- [ ] Updated `__init__.py` CORS to read from config instead of hardcoded origins
- [ ] Added `/health` endpoint in `__init__.py`
- [ ] Created `wsgi.py` entry point
- [ ] Created `gunicorn.conf.py` with access logging
- [ ] Added S3 upload path in `routes/auth.py`
- [ ] Updated `backend/.env.example` with production variables
- [ ] Updated `frontend/src/services/api.js` to use `VITE_API_URL`
- [ ] Created `frontend/.env.example`
- [ ] Created `backend/Dockerfile`
- [ ] Created `docker-compose.yml` for local testing
- [ ] Added `docker-compose.override.yml` and `backend/.jwt_secret` to `.gitignore`
- [ ] Tested locally with Docker and PostgreSQL

### Week 2: AWS Infrastructure
- [ ] Created RDS PostgreSQL instance
- [ ] Created S3 buckets (frontend, avatars)
- [ ] Stored secrets in Secrets Manager
- [ ] Created IAM role for backend
- [ ] Created security groups
- [ ] Launched EC2 instance
- [ ] Installed Docker on EC2
- [ ] Created ALB and target group
- [ ] Requested ACM certificates
- [ ] Created CloudFront distribution
- [ ] Configured Route 53 DNS records

### Week 2-3: Database
- [ ] Installed Alembic
- [ ] Created initial migration
- [ ] Tested migration locally
- [ ] Ran migration on production RDS
- [ ] Verified all tables created
- [ ] Created initial admin user

### Week 3: Deployment
- [ ] Built backend Docker image
- [ ] Transferred image to EC2 (or pushed to ECR)
- [ ] Created environment file on EC2
- [ ] Deployed backend container
- [ ] Verified health check endpoint
- [ ] Created systemd service
- [ ] Built frontend production build
- [ ] Deployed frontend to S3
- [ ] Invalidated CloudFront cache
- [ ] Verified both frontend and backend accessible

### Week 3-4: Testing
- [ ] Completed all functional tests
- [ ] Set up CloudWatch logging
- [ ] Created CloudWatch alarms
- [ ] Created CloudWatch dashboard
- [ ] Performed load testing
- [ ] Completed security checklist
- [ ] Created database backup
- [ ] Documented deployment process
- [ ] Trained team on using production app

---

## Troubleshooting Guide

### Common Issues

**1. "502 Bad Gateway" from ALB**

**Cause**: Backend not responding on health check

**Fix**:
```bash
# SSH to EC2
ssh ec2-user@<instance-ip>

# Check container status
docker ps

# Check logs
docker logs guardian-backend

# Check if port 5001 is listening
sudo netstat -tlnp | grep 5001

# Test health check locally
curl http://localhost:5001/health
```

**2. CORS errors in browser**

**Cause**: Frontend domain not in CORS_ORIGINS

**Fix**:
```bash
# Update guardian.env on EC2
CORS_ORIGINS=https://guardian.yourdomain.com,https://www.guardian.yourdomain.com

# Restart container
docker restart guardian-backend
```

**3. Database connection timeout**

**Cause**: Security group not allowing EC2 to RDS connection

**Fix**:
```bash
# Verify RDS security group allows inbound from backend security group
# Test connection from EC2:
psql -h guardian-prod-db.xxxxx.us-east-1.rds.amazonaws.com -U guardian_admin -d guardian
```

**4. Avatar upload fails**

**Cause**: IAM role missing S3 permissions or wrong bucket name

**Fix**:
```bash
# Check IAM role attached to EC2
aws ec2 describe-instances --instance-ids <instance-id> --query 'Reservations[0].Instances[0].IamInstanceProfile'

# Test S3 access from EC2
aws s3 ls s3://guardian-avatars-prod/

# Check environment variable
docker exec guardian-backend env | grep S3_BUCKET
```

**5. Frontend shows blank page**

**Cause**: React Router not configured for CloudFront

**Fix**: Verify CloudFront error pages set to return `/index.html` for 403/404

**6. JWT token expired immediately**

**Cause**: Server time drift

**Fix**:
```bash
# SSH to EC2
sudo timedatectl set-ntp true
sudo timedatectl
```

**7. Database migration fails**

**Cause**: Schema mismatch or existing tables

**Fix**:
```bash
# Check current migration version
alembic current

# Manually stamp database
alembic stamp head

# Re-run migration
alembic upgrade head
```

**8. CloudFront serves old version of frontend**

**Cause**: Cache not invalidated

**Fix**:
```bash
aws cloudfront create-invalidation \
  --distribution-id <dist-id> \
  --paths "/*"
```

**9. Rate limiting not working**

**Cause**: In-memory storage doesn't persist across container restarts

**Solution**: For production, consider using Redis for rate limiting storage

**10. High RDS costs**

**Cause**: Instance running 24/7 in non-prod environment

**Fix**:
- Use db.t3.micro (free tier eligible)
- Stop non-prod instances when not in use
- Enable auto-pause for Aurora Serverless (if using Aurora)

---

## Maintenance Procedures

### Update Backend Code

```bash
# 1. Build new image locally
cd backend
docker build -t guardian-backend:v1.1.0 .

# 2. Save and transfer
docker save guardian-backend:v1.1.0 | gzip > guardian-backend-v1.1.0.tar.gz
scp guardian-backend-v1.1.0.tar.gz ec2-user@<ip>:~/

# 3. On EC2
ssh ec2-user@<ip>
docker load < guardian-backend-v1.1.0.tar.gz

# 4. Stop old container
docker stop guardian-backend
docker rm guardian-backend

# 5. Run new version
docker run -d \
  --name guardian-backend \
  --restart unless-stopped \
  -p 5001:5001 \
  --env-file /home/ec2-user/guardian.env \
  guardian-backend:v1.1.0

# 6. Verify
curl http://localhost:5001/health
docker logs -f guardian-backend
```

### Update Frontend

```bash
# 1. Build locally
cd frontend
npm run build

# 2. Deploy to S3
aws s3 sync dist/ s3://guardian-frontend-prod/ --delete

# 3. Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id <dist-id> \
  --paths "/*"
```

### Database Backup

```bash
# Create snapshot
aws rds create-db-snapshot \
  --db-instance-identifier guardian-prod-db \
  --db-snapshot-identifier guardian-backup-$(date +%Y%m%d-%H%M)

# Export to S3 (for long-term storage)
pg_dump "$DATABASE_URL" | gzip > guardian-backup-$(date +%Y%m%d).sql.gz
aws s3 cp guardian-backup-$(date +%Y%m%d).sql.gz s3://your-backup-bucket/
```

### Database Restore

```bash
# From RDS snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier guardian-prod-db-restored \
  --db-snapshot-identifier guardian-backup-20240315

# From pg_dump file
gunzip < guardian-backup-20240315.sql.gz | psql "$DATABASE_URL"
```

### Rotate Secrets

```bash
# Generate new JWT secret
NEW_JWT_SECRET=$(openssl rand -hex 32)

# Update Secrets Manager
aws secretsmanager update-secret \
  --secret-id /prod/guardian/jwt-secret \
  --secret-string "$NEW_JWT_SECRET"

# Update EC2 env file and restart container
# Note: This will invalidate all existing JWTs, requiring users to re-login
```

### Monitor Costs

```bash
# Check current month's costs
aws ce get-cost-and-usage \
  --time-period Start=2024-03-01,End=2024-03-31 \
  --granularity MONTHLY \
  --metrics "UnblendedCost" \
  --group-by Type=SERVICE

# Set up budget alert
aws budgets create-budget \
  --account-id <account-id> \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

### Scale Up/Down

**Scale EC2 (vertical)**:
```bash
# Stop instance
aws ec2 stop-instances --instance-ids <instance-id>

# Change instance type
aws ec2 modify-instance-attribute \
  --instance-id <instance-id> \
  --instance-type t3.medium

# Start instance
aws ec2 start-instances --instance-ids <instance-id>
```

**Scale RDS**:
```bash
# Modify instance class
aws rds modify-db-instance \
  --db-instance-identifier guardian-prod-db \
  --db-instance-class db.t3.small \
  --apply-immediately
```

### View Logs

**Backend logs**:
```bash
# From CloudWatch
aws logs tail /aws/guardian/backend --follow

# From EC2 (Docker)
ssh ec2-user@<ip>
docker logs -f guardian-backend --tail 100
```

**RDS logs**:
```bash
# List log files
aws rds describe-db-log-files \
  --db-instance-identifier guardian-prod-db

# Download log
aws rds download-db-log-file-portion \
  --db-instance-identifier guardian-prod-db \
  --log-file-name error/postgresql.log.2024-03-15
```

---

## Future Enhancements

### When you grow beyond 50 users

**Phase 1: Improve Resilience (50-200 users)**
1. **Multi-AZ RDS**: Enable for automatic failover
2. **Auto Scaling Group**: Replace single EC2 with ASG (min: 2, max: 4)
3. **Redis for Sessions**: Replace in-memory rate limiting
4. **Automated Backups**: Daily RDS snapshots to S3
5. **Error Tracking**: Add Sentry integration
6. **CI/CD Pipeline**: GitHub Actions for automated deployment

**Phase 2: Performance Optimization (200-500 users)**
1. **RDS Read Replicas**: Offload reporting queries
2. **CloudFront for API**: Add CDN in front of ALB
3. **ElastiCache Redis**: Cache frequently accessed data
4. **Database Indexing**: Optimize slow queries
5. **CDN for Assets**: Serve avatars via CloudFront
6. **Connection Pooling**: PgBouncer for database connections

**Phase 3: Enterprise Features (500+ users)**
1. **ECS/EKS**: Container orchestration
2. **Aurora Serverless**: Auto-scaling database
3. **Multi-Region Deployment**: Disaster recovery
4. **API Gateway**: Rate limiting, throttling, API keys
5. **WAF**: Web Application Firewall
6. **Compliance**: SOC2, HIPAA if needed

### Cost Optimization Ideas

**Immediate**:
- Use Spot Instances for dev/staging (70% savings)
- Enable RDS storage autoscaling
- Compress S3 objects (gzip)
- Use S3 Intelligent-Tiering for old data

**Long-term**:
- Reserved Instances for stable workloads (up to 72% savings)
- Savings Plans for EC2/Fargate
- RDS Reserved Instances
- CloudFront reserved capacity

**Monitoring**:
- AWS Cost Explorer for cost analysis
- AWS Budgets for alerts
- Tag all resources for cost allocation
- Regular review of unused resources

### Monitoring & Observability

**Current (Basic)**:
- CloudWatch Logs
- CloudWatch Metrics
- CloudWatch Alarms

**Enhanced**:
- **APM**: New Relic, DataDog, or Dynatrace
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **Tracing**: AWS X-Ray for request tracing
- **Metrics**: Prometheus + Grafana
- **Error Tracking**: Sentry
- **Uptime Monitoring**: Pingdom, UptimeRobot

### Security Enhancements

**Authentication**:
- SSO integration (Okta, Auth0)
- Multi-factor authentication
- OAuth2 integration
- SAML support

**Infrastructure**:
- VPC Flow Logs
- GuardDuty for threat detection
- Security Hub for compliance
- AWS WAF for DDoS protection
- Secrets rotation automation

**Application**:
- Regular dependency updates
- Automated vulnerability scanning
- Penetration testing
- Security code reviews

---

## Resources & References

### AWS Documentation
- [EC2 Best Practices](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-best-practices.html)
- [RDS Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html)
- [S3 Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html)
- [CloudFront Best Practices](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/best-practices.html)

### Flask Production
- [Gunicorn Documentation](https://docs.gunicorn.org/)
- [Flask Deployment Options](https://flask.palletsprojects.com/en/latest/deploying/)
- [SQLAlchemy Performance Tips](https://docs.sqlalchemy.org/en/latest/faq/performance.html)

### React/Vite
- [Vite Production Build](https://vitejs.dev/guide/build.html)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)

### DevOps
- [The Twelve-Factor App](https://12factor.net/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)

### Security
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [AWS Security Best Practices](https://aws.amazon.com/architecture/security-identity-compliance/)

---

## Support & Getting Help

### Internal Team
1. **DevOps Team**: Infrastructure questions, AWS access, deployments
2. **Security Team**: Security reviews, compliance questions
3. **Database Team**: RDS optimization, query performance

### AWS Support
- AWS Support Center (if you have support plan)
- AWS re:Post (community forum)
- AWS Documentation

### Community
- Flask Discord/Slack
- React Discord
- Stack Overflow
- Reddit: r/aws, r/flask, r/reactjs

---

## Appendix

### Appendix A: Common AWS CLI Commands

```bash
# List all EC2 instances
aws ec2 describe-instances --query 'Reservations[].Instances[].[InstanceId,State.Name,PrivateIpAddress]' --output table

# List all RDS instances
aws rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceStatus,Endpoint.Address]' --output table

# List S3 buckets
aws s3 ls

# List CloudFront distributions
aws cloudfront list-distributions --query 'DistributionList.Items[].[Id,DomainName,Status]' --output table

# Check ALB target health
aws elbv2 describe-target-health --target-group-arn <arn>

# Tail CloudWatch logs
aws logs tail /aws/guardian/backend --follow

# Get secret value
aws secretsmanager get-secret-value --secret-id /prod/guardian/jwt-secret --query SecretString --output text
```

### Appendix B: Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET_KEY` | Prod: Yes | Auto-generated to `.jwt_secret` file | JWT signing key. In production, set via AWS Secrets Manager |
| `DATABASE_URL` | Prod: Yes | `sqlite:///app.db` | PostgreSQL connection string for production |
| `CORS_ORIGINS` | Prod: Yes | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allowed origins |
| `USE_S3_STORAGE` | No | `false` | Enable S3 for avatar storage |
| `S3_BUCKET` | If S3 enabled | `guardian-avatars-prod` | S3 bucket name for avatars |
| `AWS_REGION` | If S3 enabled | `us-east-1` | AWS region |
| `RETENTION_DAYS` | No | `30` | Days to retain completed test runs |
| `CIRCLECI_API_TOKEN` | For imports | - | CircleCI personal API token |
| `CIRCLECI_PROJECT_SLUG` | For imports | - | CircleCI project slug (e.g. `gh/styleseat/cypress`) |
| `VITE_API_URL` | Prod: Yes | `http://localhost:5001/api` | Frontend API base URL (Vite build-time) |

### Appendix C: Port Reference

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| Backend API | 5001 | HTTP | Flask application |
| PostgreSQL | 5432 | TCP | Database connections |
| SSH | 22 | TCP | EC2 instance access |
| HTTP | 80 | HTTP | ALB listener (redirects to 443) |
| HTTPS | 443 | HTTPS | ALB listener (frontend traffic) |

### Appendix D: Security Group Rules

**guardian-alb-sg** (ALB):
```
Inbound:
- Type: HTTP, Port: 80, Source: 0.0.0.0/0
- Type: HTTPS, Port: 443, Source: 0.0.0.0/0

Outbound:
- Type: Custom TCP, Port: 5001, Destination: guardian-backend-sg
```

**guardian-backend-sg** (EC2):
```
Inbound:
- Type: Custom TCP, Port: 5001, Source: guardian-alb-sg
- Type: SSH, Port: 22, Source: Your-Office-IP/32

Outbound:
- Type: All traffic, Destination: 0.0.0.0/0
```

**guardian-db-sg** (RDS):
```
Inbound:
- Type: PostgreSQL, Port: 5432, Source: guardian-backend-sg

Outbound:
- (None needed)
```

---

**Document Version**: 1.1.0
**Last Updated**: March 2026
**Maintained By**: [Your Team Name]
**Contact**: [Your Email]

---

*This deployment guide is a living document. Please update it as you make changes to the infrastructure or discover new best practices.*
