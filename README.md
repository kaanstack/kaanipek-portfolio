# KaaniPek — Personal Portfolio

A personal portfolio and technical publishing site for **Veysel Kaan İpek**, a Computer Engineering student at KTO Karatay University.

The project brings together a personal profile, selected projects, technical reading feed, blog, and a small support-ticket workflow. It is built as a lightweight static frontend with Supabase-backed features.

**Website:** [kaanipek.net.tr](https://kaanipek.net.tr)

## Features

- **Responsive portfolio:** profile, technical focus areas, experience, skills, and selected projects.
- **Technical blog:** searchable and category-filtered posts, featured article presentation, article details, and an authenticated authoring workflow.
- **Tech Radar:** technology stories sourced from Hacker News, category filtering, incremental loading, and individual story pages. Story metadata and discussion links lead back to their original sources.
- **Support tickets:** public ticket submission and ticket-status lookup through restricted Supabase RPC functions.
- **Admin dashboard:** authenticated ticket management, search and status filters, pagination, ticket archive/restore, and a site-version log.
- **UI details:** responsive layouts, light/dark theme support, Turkish/English portfolio copy, and accessibility-minded interaction states.

## Technology

| Area | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend services | Supabase |
| Database | PostgreSQL (through Supabase) |
| Authentication | Supabase Auth |
| File storage | Supabase Storage (blog cover images) |
| Hosting / deployment | Netlify |
| External data | Hacker News API |
| Translation helper | MyMemory API (best-effort story-title translation) |

The portfolio is intentionally framework-free. The repository's frontend does **not** use a Node.js build step.

> ASP-based enterprise software is also part of the author's learning and practical experience, but it is separate from the technology stack used to build this portfolio.

## Repository layout

```text
.
├── frontend/
│   ├── index.html          # Main portfolio page
│   ├── style.css           # Shared site styles
│   ├── script.js           # Portfolio interactions, Tech Radar, ticket form
│   ├── blog.html           # Public blog and authoring interface
│   ├── supabase-blog.js    # Supabase blog data and admin workflow
│   ├── admin.html          # Private administration interface
│   ├── admin.css           # Admin dashboard styles
│   ├── admin.js            # Ticket and version management
│   ├── news.html           # Individual Tech Radar story page
│   ├── news-detail.js      # Story detail rendering
│   └── _redirects          # Netlify route redirects
└── supabase/
    ├── ticket-system.sql   # Initial ticket tables, policies, and RPC functions
    ├── admin-uid-fix.sql   # Admin policy UUID correction
    └── admin-panel-v2.sql  # Ticket archive and site-version migration
```

## Supabase setup

The frontend expects a Supabase project with the required database objects, authentication, and Storage configuration.

1. Create a Supabase project.
2. Run the SQL files in the `supabase/` directory in the intended order:
   - `ticket-system.sql`
   - `admin-uid-fix.sql`
   - `admin-panel-v2.sql`
3. Configure the blog data tables and the `blog-covers` Storage bucket for the blog feature.
4. Create/enable the administrator account in Supabase Auth and ensure the admin user ID used by the project's access policies matches that account.
5. Review Row Level Security (RLS), Storage policies, and RPC permissions before exposing the site publicly.

The browser uses a **publishable/anonymous** Supabase key. This key is designed for client-side use and is not a secret; access must be protected by RLS and least-privilege policies. **Never put a Supabase service-role key, database password, or other private credential in frontend files or commit them to this repository.**

The SQL migrations are database setup instructions; running them is separate from deploying the static website.

## Local development

Because this is a static HTML/CSS/JavaScript project, you can serve the `frontend/` directory with any local static web server. For example, with Python installed:

```bash
cd frontend
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Supabase-backed functionality requires a correctly configured Supabase project. Some external APIs may also require an internet connection.

## Deployment

The site is hosted with Netlify. The deployed site should serve the contents of `frontend/` as the static site directory and apply the redirects in `frontend/_redirects`.

Development work is carried out on the `redesign/dark-portfolio` branch and reviewed through a Netlify Deploy Preview. Changes should only be merged into the production branch after review and explicit approval.

## Current scope and notes

- Tech Radar presents story information and links to the original publisher/Hacker News discussion; it does not reproduce full third-party articles.
- Automatic translation is best-effort and may fall back to the original headline.
- Public ticket lookup is intentionally limited to ticket status metadata; personal contact details and message contents must remain private.
- Keep credentials, personal data, and production-only configuration out of commits.

## Author

**Veysel Kaan İpek**  
Computer Engineering Student · KTO Karatay University

- Website: [kaanipek.net.tr](https://kaanipek.net.tr)
- GitHub: [kaanstack](https://github.com/kaanstack)
- LinkedIn: [Profile](https://www.linkedin.com/)

---

*Built as a continuously evolving personal engineering portfolio.*
