
# VPS Deployment Guide

## Cloning the Repository

1. **SSH into your VPS server**:
```bash
ssh user@your-vps-ip
```

2. **Clone the repository**:
```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
```

3. **Checkout the production branch** (if you created one):
```bash
git checkout production
```

## Environment Variables

Set these on your VPS server:

```bash
export NODE_ENV=production
export PRODUCTION_DATABASE_URL="postgresql://user:password@host:port/database"
```

## Running Migrations on VPS

### Method 1: Automatic Migration (Recommended)
Migrations run automatically when the server starts. Just deploy and start your app:

```bash
npm start
```

### Method 2: Manual Migration
If you want to run migrations separately:

```bash
# Set the production database URL
export PRODUCTION_DATABASE_URL="your_vps_database_url"

# Run migrations
node migrate-production.js
```

## Creating New Migrations

On your development environment (Replit):

```bash
# Make changes to db/schema.ts first, then:
./generate-migration.sh "description_of_changes"

# Or manually:
npx drizzle-kit generate --name "description_of_changes"
```

This creates a new SQL file in `./migrations/` folder.

## Deploying Migrations to VPS

1. Commit your changes (including new migration files)
2. Pull changes on VPS: `git pull`
3. Restart your application (migrations run automatically)

OR

Run migrations manually: `node migrate-production.js`

## Migration Files Location

All migrations are stored in: `./migrations/`

These SQL files can be:
- Auto-applied by the server on startup
- Manually run using `migrate-production.js`
- Applied directly to PostgreSQL if needed
