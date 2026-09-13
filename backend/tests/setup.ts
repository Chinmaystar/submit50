// Runs before all tests (vitest setupFiles). Must set env BEFORE app imports.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
process.env.ADMIN_EMAILS = "admin@test.vnit.ac.in";
process.env.FRONTEND_URL = "http://localhost:5173";
// The suite performs many password logins (one per test user); the production
// limit of 20/15min would 429 mid-run. Raise it under test.
process.env.AUTH_RATE_MAX = "10000";
