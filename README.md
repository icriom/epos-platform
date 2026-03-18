# EPoS Platform

Hospitality Point of Sale Solution — Isle of Man & UK

## Project Structure
```
epos-platform/
├── apps/
│   ├── api/          # Node.js / Fastify backend API
│   ├── pos/          # React Native PoS application
│   ├── backoffice/   # React back-office web portal
│   └── kds/          # Kitchen Display System app
├── packages/
│   └── shared/       # Shared types, utilities and constants
├── infrastructure/
│   ├── docker/       # Docker configuration
│   └── scripts/      # Deployment and utility scripts
└── docs/             # Project documentation
```

## Tech Stack

- **PoS App:** React Native (TypeScript) — Android
- **Back-Office:** React (TypeScript) — Web
- **API:** Node.js / Fastify (TypeScript)
- **Database:** PostgreSQL (cloud) + SQLite (on-device)
- **AI:** Anthropic Claude API
- **Payments:** StringIQ / Swipen SoftPoS
- **Hosting:** AWS

## Documents

Specification documents are in `/docs`

## Getting Started

See setup instructions in the development guide.
