# Analyst Pro - Enterprise Data Entry & Analytics Suite

A modern enterprise analytics platform built with Supabase and Vanilla JavaScript. Features a premium "Informed Monolith" design system with real-time data synchronization, project management, and comprehensive analytics dashboards.

## Features

- **Real-time Dashboard** - Live KPI tracking, data ingestion trends, and project analytics
- **Data Entry Forms** - Comprehensive project initiation with financial and personnel tracking
- **Authentication** - User sign-up, sign-in, and session management via Supabase Auth
- **Design System** - Premium "Metric Foundry" design with tonal layering and glassmorphism
- **Responsive** - Mobile-friendly layouts with adaptive components
- **Chart.js Integration** - Beautiful data visualizations and trend analysis

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript, HTML5, CSS3 |
| Backend | Supabase (PostgreSQL, Auth, Real-time) |
| Bundler | Vite |
| Charts | Chart.js |
| Icons | Material Symbols |
| Fonts | Inter, Manrope |

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A [Supabase](https://supabase.com) account (free tier works)

### Setup

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd stitch-wesm
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Supabase:**
   - Create a new project at [supabase.com](https://supabase.com)
   - Run the SQL from `supabase-setup.sql` in the Supabase SQL Editor
   - Enable real-time for the `projects` table (Database -> Replication)

4. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and add your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   The app will open at `http://localhost:3000`

### Building for Production

```bash
npm run build
```

The production files will be in `dist/`. Deploy to any static hosting (Vercel, Netlify, etc.).

## Project Structure

```
stitch-wesm/
├── src/
│   ├── index.html          # Main HTML entry point
│   ├── styles/
│   │   └── main.css        # Complete design system CSS
│   └── js/
│       ├── main.js         # Application bootstrap
│       ├── config.js       # Environment configuration
│       ├── state.js        # Global state management
│       ├── events.js       # Custom event system
│       ├── router.js       # Hash-based router
│       ├── supabase.js     # Supabase client & DB helpers
│       ├── auth.js         # Authentication module
│       ├── ui.js           # UI utilities (toasts, modals)
│       └── pages/
│           ├── dashboard.js    # Analytics dashboard
│           ├── data-entry.js   # Project initiation form
│           ├── reports.js      # Reports center
│           ├── settings.js     # User settings
│           └── login.js        # Authentication page
├── supabase-setup.sql      # Database setup script
├── package.json
├── vite.config.js
├── .env.example
└── README.md
```

## Design System

The UI follows the "Metric Foundry" design specification:
- **Primary Color:** `#003d9b` (Deep Blue)
- **Typography:** Manrope (headlines) + Inter (body)
- **Philosophy:** "Borders are design failures" - uses tonal layering for separation
- **Components:** Glassmorphism modals, gradient CTAs, no-line data tables

## Database Schema

### `projects` Table
Stores project data including title, category, financial allocation, ROI projections, and status.

### `unit_distribution` Table
Tracks personnel allocation per project (engineering, design, QA, data governance).

### `profiles` Table
Links to Supabase Auth users for profile management.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |

## License

Private - All rights reserved