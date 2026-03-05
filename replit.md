# FinControl - Personal Financial Control App

## Overview
A comprehensive personal finance management application in Brazilian Portuguese, built with React + Express + PostgreSQL. Track debts, credit cards, subscriptions, set financial goals, and get intelligent insights.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Shadcn UI
- **Backend**: Express.js with session-based authentication (passport-local)
- **Database**: PostgreSQL with Drizzle ORM
- **Charts**: Recharts for financial reports and history
- **Routing**: Wouter (frontend), Express (backend)

## Features
- User authentication (register/login)
- People management with edit support (nome, tipo, telefone, observacao), duplicate name detection warning, and history sheet with Todos/Pendentes filter
- Structured installment debt tracking with per-parcela payment, anticipation, and auto-schedule generation
- Credit card management with installment purchases, next-invoice display, edit card/compra dialogs, reembolso status tracking, per-parcela tracking sheet (statusCartao + statusPessoa), and text/CSV/OFX invoice import with duplicate detection
- Divida edit dialog: change pessoa, tipo, valor, vencimento, forma, descricao; plus recalculate pending parcelas with new total while preserving paid ones
- Financial forecast (monthly area chart with cumulative balance)
- Services/subscriptions management with edit dialog and inline per-person valor editing in DivisaoPanel
- Monthly and weekly reports with charts
- Dashboard with financial health score (0-100), smart alerts, and auto-generated insights — includes Renda Mensal and Patrimônio Total stat cards
- **Financial Goals (Metas)**: Create goals with progress tracking and monthly savings calculator
- **Financial History (Historico)**: 6-month charts of income vs expenses, saldo evolution, and score history
- **Financial Simulator (Simulador)**: 3 tabs — Score Financeiro (what-if scenarios), Investimentos (compound interest calculator with presets + area chart), Independência Financeira (4% rule calculator)
- **Renda (Income)**: CRUD for income sources; tipo fixo/variável, dia recebimento, ativo toggle; summary totals
- **Patrimônio (Assets)**: CRUD for assets; tipos: conta bancária, dinheiro, poupança, investimento, outros; total + percentage breakdown
- Intelligent text import (natural language parsing → creates records automatically)
- Dark mode toggle with localStorage persistence
- Mobile bottom navigation bar (visible on small screens: Painel, Dívidas, Cartões, Renda, Patrimônio)
- **Brand Icons System**: Auto-matched visual icons for banks (Nubank, Itaú, BB, Caixa, Bradesco, Inter, Santander, Mercado Pago) and services (Netflix, Spotify, YouTube, Apple, Google, HBO Max, Disney+, PayPal, PicPay, PagSeguro) using react-icons/si + letter avatars; displayed in cartoes-page and servicos-page
- **Manage Pages (Gerenciar Telas)**: "Personalizar" button in sidebar footer opens a dialog to hide/show any page; preferences persist via localStorage ("fincontrol_ui_prefs")
- **Dashboard Customization**: "Personalizar Painel" button on dashboard opens dialog to hide/show individual stat cards and toggle compact mode; persists in same localStorage key
- **Interactive Onboarding Tutorial**: 8-step guided tour on first login; full-screen overlay with step dots, Próximo/Anterior/Pular navigation; localStorage key "fincontrol_tour_done"; "Refazer tutorial" button in Perfil page

## Project Structure
```
client/src/
  pages/
    auth-page.tsx       - Login/registration
    dashboard.tsx       - Main dashboard with score, alerts, insights
    pessoas-page.tsx    - People management with payment history sheet
    dividas-page.tsx    - Debt tracking with month filter
    cartoes-page.tsx    - Credit cards with installments
    previsao-page.tsx   - Financial forecast with area chart
    servicos-page.tsx   - Services/subscriptions
    relatorios-page.tsx - Reports with charts
    importar-page.tsx   - Natural language text import
    metas-page.tsx      - Financial goals with progress tracking
    historico-page.tsx  - 6-month financial history charts
    simulador-page.tsx  - Financial simulator (client-side, no data changes)
  components/
    app-sidebar.tsx     - Navigation sidebar with dark mode toggle
    theme-provider.tsx  - Dark/light mode context provider
  utils/
    financialEngine.ts  - Score 2.0 (0-100), insights generator, monthly history
    financialTextParser.ts - Natural language text → financial records parser
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
- users, pessoas, dividas, cartoes, compras_cartao, servicos, metas, rendas, patrimonios

## Routes
- / - Dashboard (6 stat cards incl. Renda Mensal and Patrimônio Total)
- /pessoas - People management
- /dividas - Debt tracking
- /cartoes - Credit cards
- /previsao - Financial forecast
- /servicos - Services
- /relatorios - Reports
- /importar - Text import
- /metas - Financial goals
- /historico - Financial history charts
- /simulador - Financial simulator (3 tabs: Score, Investimentos, Independência)
- /renda - Income management
- /patrimonio - Asset management

## API Endpoints
- /api/pessoas (CRUD)
- /api/dividas (CRUD + /pessoa/:id)
- /api/cartoes (CRUD)
- /api/compras-cartao (CRUD + /cartao/:id)
- /api/servicos (CRUD)
- /api/metas (CRUD)
- /api/rendas (CRUD) — userId added from session
- /api/patrimonios (CRUD) — userId added from session

## Demo Account
- Username: demo
- Password: demo123

## Score Algorithm (financialEngine.ts)
- Base: 60 points
- No overdue debts: +15
- Overdue debts: -8 per debt (max -30)
- Positive balance: +bonus (max +15)
- Negative balance: -20
- High card usage (>80%): -10 per card (max -20)
- Good card usage (<30%): +3
- Good payment history (>50% paid): +5
- Classifications: 80+ Otima, 60-79 Boa, 40-59 Atencao, <40 Risco

## Running
`npm run dev` starts both frontend and backend on port 5000.
