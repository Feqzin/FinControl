# FinControl - Personal Financial Control App

## Overview
A comprehensive personal finance management application built with React + Express + PostgreSQL. Allows users to track debts, credit cards, subscriptions, and generate financial reports.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Shadcn UI
- **Backend**: Express.js with session-based authentication (passport-local)
- **Database**: PostgreSQL with Drizzle ORM
- **Charts**: Recharts for financial reports
- **Routing**: Wouter (frontend), Express (backend)

## Features
- User authentication (register/login)
- People management (who owes you / who you owe)
- Debt tracking with payment history
- Credit card management with installment purchases
- Financial forecast (monthly income vs expenses)
- Services/subscriptions management
- Monthly and weekly reports with charts
- Dashboard with overview stats

## Project Structure
```
client/src/
  pages/
    auth-page.tsx       - Login/registration
    dashboard.tsx       - Main dashboard with stats
    pessoas-page.tsx    - People management
    dividas-page.tsx    - Debt tracking
    cartoes-page.tsx    - Credit cards
    previsao-page.tsx   - Financial forecast
    servicos-page.tsx   - Services/subscriptions
    relatorios-page.tsx - Reports with charts
  components/
    app-sidebar.tsx     - Navigation sidebar
  hooks/
    use-auth.ts         - Authentication hook

server/
  auth.ts     - Passport.js auth setup
  db.ts       - Database connection
  routes.ts   - API endpoints
  seed.ts     - Demo data seeder
  storage.ts  - Data access layer

shared/
  schema.ts   - Drizzle schema + Zod types
```

## Database Tables
- users, pessoas, dividas, cartoes, compras_cartao, servicos

## Demo Account
- Username: demo
- Password: demo123

## Running
`npm run dev` starts both frontend and backend on port 5000.
