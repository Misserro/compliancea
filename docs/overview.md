# ComplianceA - Document Analyzer Overview

> Project documentation for developers and maintainers

## What is ComplianceA?

ComplianceA is an AI-powered compliance document management and analysis platform. It helps organizations manage contracts, extract obligations, answer regulatory questionnaires, and maintain audit trails for compliance purposes.

## Key Capabilities

- **Document Library Management** - Upload, categorize, and search PDF/DOCX documents
- **Semantic Search** - Ask natural language questions across document library
- **Contract Management** - Extract and track contractual obligations with lifecycle management
- **Questionnaire Processing** - Auto-generate answers to regulatory questionnaires from library documents
- **Obligation Tracking** - Monitor due dates, owners, evidence, and compliance status
- **Google Drive Integration** - Sync documents from Google Drive folders
- **Audit Trail** - Complete action history for compliance traceability

## Quick Links

- [Architecture](./architecture.md) - System design and component overview
- [Features](./features.md) - Detailed feature descriptions and workflows
- [Tech Stack](./tech-stack.md) - Technologies and libraries used
- [Data Flow](./data-flow.md) - How data moves through the system
- [Database Schema](./database-schema.md) - Database tables and relationships
- [API Endpoints](./api-endpoints.md) - REST API reference

## Getting Started

**Prerequisites:**
- Node.js 18+
- Anthropic API key (Claude)
- Voyage AI API key (embeddings)

**Installation:**
```bash
npm install
cp .env.example .env
# Edit .env with your API keys
```

**Development:**
```bash
npm run dev
# Access at http://localhost:3000
```

**Production:**
```bash
npm run build
npm start
# Or deploy to Railway using railway.toml
```

## Project Structure

```
compliancea/
├── src/
│   ├── app/              # Next.js pages and routes
│   ├── components/       # React UI components
│   ├── lib/              # Database and business logic
│   └── hooks/            # React hooks
├── server.js             # Express backend API
├── public/               # Static assets
├── docs/                 # Documentation (you are here)
└── package.json
```

## Key Integrations

- **Anthropic Claude** - Document analysis, Q&A, obligation extraction
- **Voyage AI** - Text embeddings for semantic search
- **Google Drive** - Document sync (optional)

## Support

For questions or issues, refer to the detailed documentation linked above.
