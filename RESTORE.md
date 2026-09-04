# PostgreSQL Recovery

## Prerequisites

- Install PostgreSQL client tools (`pg_restore`, `psql`) and configure `DATABASE_URL` for the target database.
- Stop every application instance before restoring.
- Obtain a verified custom-format backup produced by `scripts/backup-pg.ps1`.

## Restore

1. Create an empty target database and configure `DATABASE_URL` to point at it.
2. Restore the dump:

```powershell
pg_restore --clean --if-exists --no-owner --dbname=$env:DATABASE_URL .\shop-YYYYMMDD-HHMMSS.dump
```

3. Verify key tables and data before starting the application:

```powershell
psql $env:DATABASE_URL -c "SELECT COUNT(*) FROM orders;"
psql $env:DATABASE_URL -c "SELECT COUNT(*) FROM payment_events;"
```

4. Start one application instance, check `/api/health`, then restore normal traffic.

## Backup Schedule

Schedule `powershell -ExecutionPolicy Bypass -File scripts\backup-pg.ps1` with Windows Task Scheduler. Configure `S3_BACKUP_URI` for an S3-compatible destination and use workload identity or a secure AWS credential source; never put cloud secrets in source control.

Point-in-time recovery requires PostgreSQL WAL archiving and a managed PostgreSQL service or a separately maintained archive configuration. Test restores at least quarterly.