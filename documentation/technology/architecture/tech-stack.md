# Technology Stack

This document lists all technologies, libraries, and external services used in ComplianceA.

## Frontend

### Core Framework
| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 15.1.0 | React framework with SSR |
| React | 19.0.0 | UI library |
| React DOM | 19.0.0 | React renderer |
| TypeScript | 5.7.0 | Type safety |

### UI Components
| Library | Version | Purpose |
|---------|---------|---------|
| Radix UI | Various | Unstyled accessible components |
| @radix-ui/react-checkbox | 1.1.4 | Checkbox primitive |
| @radix-ui/react-collapsible | 1.1.3 | Collapsible sections |
| @radix-ui/react-dialog | 1.1.6 | Modal dialogs |
| @radix-ui/react-dropdown-menu | 2.1.6 | Dropdown menus |
| @radix-ui/react-label | 2.1.2 | Form labels |
| @radix-ui/react-radio-group | 1.2.3 | Radio buttons |
| @radix-ui/react-scroll-area | 1.2.3 | Custom scrollbars |
| @radix-ui/react-select | 2.1.6 | Select dropdowns |
| @radix-ui/react-separator | 1.1.2 | Visual separators |
| @radix-ui/react-slider | 1.2.3 | Range sliders |
| @radix-ui/react-slot | 1.1.2 | Slot composition |
| @radix-ui/react-switch | 1.1.3 | Toggle switches |
| @radix-ui/react-tooltip | 1.1.8 | Tooltips |
| Lucide React | 0.469.0 | Icon library |

### Styling
| Library | Version | Purpose |
|---------|---------|---------|
| Tailwind CSS | 4.0.0 | Utility-first CSS |
| @tailwindcss/postcss | 4.0.0 | Tailwind PostCSS plugin |
| tailwind-merge | 3.0.0 | Merge Tailwind classes |
| tw-animate-css | 1.2.0 | Animation utilities |
| class-variance-authority | 0.7.1 | Variant styling API |
| clsx | 2.1.1 | Conditional classnames |
| next-themes | 0.4.4 | Theme management |

### User Feedback
| Library | Version | Purpose |
|---------|---------|---------|
| Sonner | 1.7.2 | Toast notifications |

## Backend

### Runtime & Framework
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | >= 18.0.0 | JavaScript runtime |
| Express.js | - | Web framework |

### Document Processing
| Library | Purpose |
|---------|---------|
| pdf-parse | 1.1.1 | Parse PDF files |
| mammoth | 1.6.0 | Parse DOCX files |
| xlsx | 0.18.5 | Parse Excel files |
| multer | - | File upload handling |
| formidable | - | Form data parsing |

### Database
| Library | Purpose |
|---------|---------|
| sql.js | 1.10.0 | SQLite in-memory with file persistence |

### External APIs
| Library | Purpose |
|---------|---------|
| @anthropic-ai/sdk | 0.39.0 | Claude API client |
| googleapis | 144.0.0 | Google Drive API |

## External Services

### AI & ML Services
| Service | Model | Purpose |
|---------|-------|---------|
| Anthropic Claude | claude-sonnet-4-20250514 | Document analysis, Q&A, obligation extraction |
| Anthropic Claude | claude-3-haiku-20240307 | Fast metadata extraction (optional) |
| Voyage AI | voyage-3-lite | Text embeddings (1024 dimensions) |

**Configuration:**
- Claude API key: `ANTHROPIC_API_KEY` environment variable
- Voyage API key: `VOYAGE_API_KEY` environment variable
- Models configurable via `CLAUDE_MODEL` and `EMBEDDING_MODEL`

### Google Drive Integration
| Component | Purpose |
|-----------|---------|
| Google Drive API v3 | Document sync from shared folders |
| Service Account Auth | Authentication with service account credentials |

**Configuration:**
- Service account JSON stored in database (app_settings table)
- Folder ID and sync interval configurable in Settings

## Development Tools

### Build Tools
| Tool | Purpose |
|------|---------|
| PostCSS | CSS processing |
| @types/node | Node.js TypeScript definitions |
| @types/react | React TypeScript definitions |
| @types/react-dom | React DOM TypeScript definitions |

### Configuration Files
- `next.config.mjs` - Next.js configuration
- `tsconfig.json` - TypeScript configuration
- `postcss.config.mjs` - PostCSS configuration
- `tailwind.config.js` - Tailwind CSS configuration (implicit)
- `components.json` - Shadcn/ui configuration

## Deployment

### Hosting Platform
| Platform | Purpose |
|----------|---------|
| Railway | Production hosting |

**Configuration:**
- `railway.toml` - Railway deployment config
- Port: 3000 (configurable via `PORT` env var)

### Environment Variables
Required:
- `ANTHROPIC_API_KEY` - Claude API key
- `VOYAGE_API_KEY` - Voyage AI API key

Optional:
- `PORT` - Server port (default: 3000)
- `CLAUDE_MODEL` - Claude model name (default: claude-sonnet-4-20250514)
- `ALLOWED_ORIGIN` - CORS allowed origin (default: *)
- `EMBEDDING_MODEL` - Voyage model (default: voyage-3-lite)
- `GDRIVE_SYNC_INTERVAL_MINUTES` - GDrive sync interval (default: 30)

## Architecture Decisions

### Why Next.js?
- Server-side rendering for better SEO
- API routes for backend integration
- Built-in routing and code splitting
- React 19 support

### Why SQLite?
- Simple deployment (no separate database server)
- File-based persistence
- Fast for single-server architecture
- Sufficient for current scale

### Why Radix UI?
- Unstyled primitives (full styling control)
- Accessibility built-in
- Composable components
- Works well with Tailwind CSS

### Why Voyage AI for Embeddings?
- High-quality embeddings
- Cost-effective
- 1024-dimensional vectors (good balance)
- Simple API

### Why Claude for Analysis?
- Strong reasoning capabilities
- Long context window (important for contracts)
- JSON mode for structured extraction
- Reliable citation support
