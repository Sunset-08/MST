# SECUREX backend

## Environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL`: PostgreSQL/Supabase connection string used by Drizzle.
- `SUPABASE_URL`: project URL from the Supabase dashboard.
- `SUPABASE_ANON_KEY`: project publishable/anon key used for Supabase Auth.
- `PORT`: optional HTTP port (defaults to `4000`).

The backend does not need a service-role key for this flow. It uses the anon key for Supabase Auth and the database connection for SECUREX profile reads/writes. Never put a service-role key in a frontend or API response.

## Supabase Auth

Email/password registration and login are handled by Supabase Auth. The API validates access tokens with Supabase Auth's `getUser(token)` endpoint. User passwords are never stored by SECUREX. Registration stores username and display name in Supabase user metadata, then synchronizes a profile into the existing `users` table when a session is available. With email confirmation enabled, profile synchronization occurs at first successful login after confirmation.

In Supabase Authentication settings, enable Email provider and choose whether email confirmation is required. The `users.auth_user_id` column must be unique, as defined by the current schema.

## Start

From `backend/`:

```sh
npm install
npm run dev
```

Use `npm run build` for a production TypeScript build and `npm start` to run `dist/server.js`.

## API

All successful API responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "code": ..., "message": ... } }`.

- `POST /api/auth/register` JSON body: `{ "email", "password", "username", "displayName" }`.
- `POST /api/auth/login` JSON body: `{ "email", "password" }`.
- `POST /api/auth/logout` requires a Bearer access token and revokes the current Supabase session.
- `GET /api/auth/me` requires a Bearer access token and returns the SECUREX profile.

When Supabase email confirmation is enabled, registration returns HTTP 202 with `emailConfirmationRequired: true` and no session. Otherwise it returns HTTP 201 with the profile and the Supabase session. Login returns the profile and session. Send the session's `accessToken` on protected calls:

```http
Authorization: Bearer <accessToken>
```

The access and refresh tokens are returned only by the authentication endpoints for the client to use; they are never logged or included in error responses.
