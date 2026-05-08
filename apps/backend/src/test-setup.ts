// Set required env vars before any module is imported in tests
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/meditrack_test'
process.env.JWT_SECRET = 'test-secret-min-32-chars-for-testing-only'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-for-testing'
process.env.NODE_ENV = 'test'
