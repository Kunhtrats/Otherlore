// The application has no accounts: never expose this listener publicly.
process.env.HOST = '127.0.0.1';
process.env.PORT ||= '4321';
await import('../dist/server/entry.mjs');