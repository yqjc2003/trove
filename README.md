# CatchLinger

English | [简体中文](README.zh-CN.md)

CatchLinger is a personal knowledge-capture system. It consolidates links scattered across apps, GitHub stars, and Chrome/Edge bookmarks into a single library with tags, notes, archiving, and reading history.

- **Backend:** Supabase (Postgres, Auth, and RLS), the sole data and authentication backend
- **Web, API, and MCP:** Next.js 16 (App Router), deployed on Vercel
- **Capture:** the `catch-and-linger` Skill, an MCP server, and a REST API

## Core design

The web experience follows the “capture stream / review desk” model in [DESIGN.md](DESIGN.md): the review desk focuses on one unread link at a time; the capture stream groups saved content by its original collection date; the library supports shareable search views; and “My Language” manages each user’s tag vocabulary and Agent connection.

### Tags are the only category system

There is no separate category dimension. Each user has a completely isolated tag namespace.

- Store the tags produced by the AI Agent; do not apply semantic mappings or maintain a predefined category list.
- The web UI supports creating, renaming, and deleting tags, and editing the tags of any saved item.
- Tag filters support multiple selections with AND semantics.
- Tag limits vary by write channel, as described below.

An Agent normally chooses one or two broad, reusable tags, with a maximum of three. It should reuse an existing domain or technology tag where possible, adding a learning method or usage context only when needed. For example, an article about `HashMap` source code might use `java` and `source reading`; class names and API details belong in the title and summary. This policy is implemented in the Skill and MCP guidance, not as server-side tag-to-category mapping; existing tags are never rewritten automatically.

Items also have an automatically detected **content type** (article, video, repository, tool, social, document, or other). It is a technical dimension and never represents semantic categories such as work, life, or family.

### Manual capture in the web UI

The web UI is not read-only. Use `/items/new` to create a saved link with a URL, title, summary, and tags. The list’s empty state and page header both link to it. Tags can be created, removed, or changed later on the item detail page.

Tag limits are channel-specific:

| Channel | Entry point | Database role | Tag limit |
|---|---|---|---|
| Agent capture | MCP, Skill, or REST with an API key | `service_role` | ≤ **3** |
| Manual organization | Web UI through Server Actions and a session | `authenticated` | **Unlimited** |

Both safeguards apply:

- The application layer passes `ItemWriteOptions.maxTags`; use `null` to allow unlimited tags (the default is 3).
- The database layer branches on `auth.role()`: `service_role` is limited to 3 and `authenticated` is unrestricted.

> REST remains a programmatic channel and is limited to three tags even when a session cookie is present. Only the web UI’s Server Actions use the unrestricted path.

### AI interpretation stays with the Agent

The server has no LLM credentials and does not fetch page bodies, so it does not expose an SSRF surface. The flow is:

```
Agent obtains URLs → Agent fetches the page body → Agent creates title, summary, and ≤3 tags → API write
```

Skills and MCP therefore handle transport and validation; content interpretation belongs to the Agent.

For individual URLs, GitHub stars, and Chrome/Edge bookmark batches, the Skill uses the same rule: read each page first, then have the Agent generate a summary describing the topic, content, and usefulness. Derive no more than three normalized tags from that summary before saving. A `summary` must not be an import log such as “imported from Edge folder xx”; provenance belongs in `source`. Do not use the original folder name directly as a content tag. If a page cannot be read, state the limitation honestly and do not invent a summary or tags.

Generate summaries and topic tags in the language requested by the user. When no language is specified, use the established conversation preference or request language. Keep technical names such as Java and React unchanged. Tag normalization receives `--locale` so English labels are not replaced with Chinese synonyms; see [Skill output language](docs/skill.md#输出语言).

### Capture GitHub stars without a token

The star list uses GitHub’s public `GET /users/{username}/starred` endpoint, so no `GITHUB_TOKEN` is required. When a user signs in through GitHub OAuth, Supabase already stores their GitHub metadata in `auth.users`; `GET /api/trove/account` exposes the username to the Skill when it has an API key:

```
node scripts/github-stars.mjs --limit 50
→ { mode: "public-user", user: "…", username_source: "catchlinger-account", stars: [...] }
```

As a result, capturing stars needs only `CATCHLINGER_API_BASE` and `CATCHLINGER_API_KEY`. `GITHUB_TOKEN` is optional: it raises the GitHub API quota from 60 to 5,000 requests per hour and can access stars for a private profile. For a private profile, an unauthenticated public request may return an empty list rather than a 404; an empty result therefore includes a warning.

### Duplicate captures are upserts

Repeated capture of the same URL always maps to one item:

| Field | When omitted | When supplied |
|---|---|---|
| `title` / `summary` | Retain the old value | Replace it (only non-empty values replace) |
| `tags` | Preserve all existing tags | Replace the whole tag set |
| `notes` | Do not append | Append one new note |
| `collected_at`, archive state, read state, click count | Unchanged | Still unchanged |

Importing the same bookmarks repeatedly therefore does not make old items perpetually fresh or revive an item the user archived.

### Click tracking

Links in the web UI open through `/r/{id}`. The route reads the current user’s item, validates an HTTP(S) target, and immediately returns a **302** redirect. A post-response background task records the click, increments the click count, and marks the item as read on its first click in one database transaction.

Tracking failures or timeouts never block the destination from opening; the server writes only diagnostic logs without sensitive request data. Unauthenticated requests, inaccessible items, or unsafe targets return to the in-app list without revealing the saved URL. Opening an item through MCP or the Skill marks it as read but does not create a click event.

### Overdue reminders

Items collected more than N days ago (14 by default, configurable) and never read (`read_at IS NULL`) appear in the “to read” list, shown on the dashboard and `/reminders` page.

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment variables
cp .env.example .env.local     # Fill in Supabase URL, publishable key, secret key, and pooler connection string

# 3. Initialize the database
pnpm db:push                   # Reads SUPABASE_DB_URL from .env.local and applies db/migrations/*.sql transactionally
# Or paste db/migrations/0001_init.sql into Supabase Dashboard → SQL Editor (idempotent; safe to rerun)

# 4. Start the local server
pnpm dev
```

Open http://localhost:3000 and create an account. Registration creates a profile and an **empty** tag namespace; no tags are pre-populated.

> Docker and `supabase start` are not available in this project; use the hosted Supabase project for schema changes. `db.<ref>.supabase.co` is IPv6-only, so migrations use a pooler connection string whose username includes the project ref.

## Registration and sign-in

The sign-in page provides four entry points:

| Entry point | Use it when | Details |
|---|---|---|
| **Create account** | First visit | Email + password → **sign in immediately**, without a confirmation email |
| **Password sign-in** | Existing account | Sign in directly; a wrong password suggests creating an account |
| **Email verification code** | You do not want to remember a password | Sends a one-time sign-in link; constrained by Supabase’s free SMTP quota (about 2 per hour) |
| **Sign in with GitHub** | Optional | Enable the GitHub provider in Supabase first; otherwise the button is disabled with an explanation |

The database trigger `trove_handle_new_user` (`trg_on_auth_user_created`) creates the `profiles` row and the empty personal tag namespace.

### “Create account” signs in immediately

The primary registration path uses a service-role client to call `admin.createUser` with a confirmed email. It sends no confirmation mail, avoiding Supabase’s free SMTP limit of roughly two messages per hour. Public `signUp` can otherwise return `429 over_email_send_rate_limit` and prevent new registrations.

**Trade-off:** email ownership is not verified, so anyone can register any email address. This is acceptable for a personal bookmarking tool. To require email confirmation later, replace the primary path in `src/lib/auth/signup.ts`.

- Registration requires `SUPABASE_SERVICE_ROLE_KEY`, used only on the server. If it is absent, the app falls back to public signup and email confirmation rather than failing hard.
- Passwords shorter than six characters are rejected by the application before Supabase is called.
- If an email already exists, the correct password signs in; an incorrect password reports that the account already exists without replacing or exposing it.
- An existing, unconfirmed account left by an earlier email-rate-limit failure is confirmed and signed in automatically.

### Enable GitHub sign-in

The GitHub provider is disabled by default in Supabase. Until configured, the application disables its button and explains why. To enable it:

1. **Create a GitHub OAuth App** — GitHub Settings → Developer settings → OAuth Apps → New OAuth App.
   - Homepage URL: your site URL
   - Authorization callback URL: `https://sqpmotynmrpglsqvkmht.supabase.co/auth/v1/callback`
   - Save the Client ID and Client Secret.
2. **Enable the provider in Supabase** — Dashboard → Authentication → Providers → GitHub, then enter the Client ID and Client Secret.
3. **Allow callback URLs in Supabase** — Dashboard → Authentication → URL Configuration.
   - Add `http://localhost:3000/auth/callback` for local development.
   - Add `https://<your-production-domain>/auth/callback` for production.
   - Set Site URL to the production domain.

The application callback is `GET /auth/callback`. Browser OAuth with PKCE returns only `?code=`; the server must exchange that code for a session and write the cookie.

## Deploy to Vercel

Import the GitHub repository, configure these variables in the Vercel project, and deploy:

| Variable | Value | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` | Publishable key; safe for the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` | **Server-only** key from Dashboard → Project Settings → API Keys; required for the primary registration path |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-production-domain>` | Production site URL for MCP, Skill callbacks, and absolute links |
| `CATCHLINGER_AGENT_API_BASE` | `https://catchlinger.sxyicheng.tech/api/trove` | Public REST API base used in the Agent installation prompt; never use localhost here |

> Never commit keys. Keep local values in `.env.local` (ignored by Git), or retrieve them from Dashboard → Project Settings → API Keys.

`SUPABASE_DB_URL` is not needed in Vercel; it is only used by local `pnpm db:push`.

## Project layout

```
db/migrations/0001_init.sql   Tables, RLS, triggers, and RPCs
scripts/db-push.mjs           Transactional, idempotent migration runner
src/app/                      Dashboard, stream, items, details, archive, reminders, settings, API routes, and MCP
src/app/r/[id]/route.ts       302 redirect and click tracking
src/app/actions/auth.ts       Registration Server Action (create user and auto-confirm email)
src/lib/auth/                 Credential resolution, API keys, and registration orchestration
src/lib/domain/               Pure URL, content-type, tag, and reminder logic
src/lib/db/trove-db.ts        The only business-data access entry point (enforces user_id scope)
src/lib/services/             Shared business logic for REST, MCP, and Server Actions
src/lib/mcp/server.ts         MCP tool registration
skills/catch-and-linger/      Skill: SKILL.md plus 7 zero-dependency Node scripts
tests/                        Offline Vitest unit tests and opt-in integration tests
docs/                         API, MCP, Skill, and acceptance documentation
```

## Security model

- Both credential types resolve to `user_id + scopes`:
  - **Supabase session** (web UI): cookie plus RLS
  - **CatchLinger API key** (Skill, MCP, CLI): `trv_` prefix; only a SHA-256 hash is stored server-side
- Supabase JWTs are not used for MCP because access tokens expire in about an hour while MCP headers are static; MCP uses a long-lived API key instead.
- All service-role access to business data goes through `TroveDb`, whose constructor requires `userId`. A unit test scans `src/` to ensure business-table `.from()` calls appear nowhere else.

## Common commands

```bash
pnpm dev            # Development server
pnpm build          # Production build
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest unit tests
pnpm db:push        # Apply database migrations
pnpm skill:install  # Install the Skill into ~/.agents/skills/ (the Codex user-level directory)
```

## Integration endpoints

| Channel | Endpoint | Authentication |
|---|---|---|
| Web | `https://<your-production-domain>/`, `/stream`, `/items`, `/items/new`, `/items/[id]`, `/archive`, `/reminders`, `/settings` | Supabase session |
| REST | `https://<your-production-domain>/api/trove/*` | `Authorization: Bearer <trv_key>` |
| MCP | `https://<your-production-domain>/api/mcp` | `Authorization: Bearer <trv_key>` |

See [docs/api.md](docs/api.md), [docs/mcp.md](docs/mcp.md), and [docs/skill.md](docs/skill.md).

## Chrome / Edge extension

Pushing an `extension-v*` tag triggers GitHub Actions to package `catchlinger-extension.zip` and attach it to the matching GitHub Release. Download and extract the archive, then load the extracted `extension` directory:

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge. Enable Developer mode, choose **Load unpacked**, and select the repository’s `extension` directory. Reload the extension and refresh open pages after code changes.
2. Open the extension’s login/settings screen. Enter the CatchLinger site URL, sign in to that site, then create an API key under **Settings → Agent connection** and paste it into the extension. If the key expires, create or provide a valid replacement.
3. Optionally choose an AI provider and enter its API key, Chat Completions endpoint, and model name. Saving verifies the CatchLinger key; the AI key is verified only when content is interpreted. Manual capture works without AI.
4. On ordinary HTTP(S) pages, use the CatchLinger button on the right (it can be dragged vertically), or select **Capture current page** from the extension popup. Review or edit the title, summary, and up to three tags before saving. Browser-internal and extension-restricted pages cannot receive the injected button.

The extension stores its keys in browser-local extension storage. Its CatchLinger API key is sent to the configured CatchLinger service only when validating the connection or saving an item; the service stores only a hash. When AI is enabled, the page URL, title, and captured page text are sent to the selected AI provider. Use it only if you are willing to share that page content with the provider. If AI interpretation fails, manual entry remains available. The extension uses the API-key channel, so duplicate capture follows the existing upsert rules.

## License

Apache-2.0
