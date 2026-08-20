-- Performance indexes — generated from AppDbContext changes
-- Run once against the target database, or let EF Core generate the migration.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_Clients_Zone"        ON "Clients"        ("Zone");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_Clients_Status"      ON "Clients"        ("Status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_Payments_RegisteredAt" ON "Payments"     ("RegisteredAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_SupportTickets_CreatedAt"  ON "SupportTickets" ("CreatedAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_SupportTickets_ResolvedAt" ON "SupportTickets" ("ResolvedAt");
