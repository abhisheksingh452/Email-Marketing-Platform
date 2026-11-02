// Runs before any test file is loaded, so ConfigModule sees these values at import time.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://x:x@localhost:5432/x';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.WEB_BASE_URL = 'http://localhost:3000';
