# Think Agri – Farmer Community API

## Setup
1. Copy `.env.example` to `.env` and fill in your private credentials.
2. Install dependencies with `npm ci`.
3. Run `npm run dev` for local development.
4. Run `npm run build` before deployment.

Keep the Supabase service-role key, WhatsApp access token, JWT secret and admin password hash on the backend only.

## Database migrations
Run `supabase/migrations/001_initial_schema.sql` on a new database, then run `supabase/migrations/002_content_management.sql` to add the website content management module. The second migration is additive and seeds the Step 2 copy in English, Telugu, Kannada and Hindi.

The admin PUT body has a `translations` array. Each item contains `language_code`, `content_key`, `content_value`, and optional `is_published`. The public endpoint returns published content for the requested language and fills missing keys from English.
