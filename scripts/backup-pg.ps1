param(
  [string]$BackupDirectory = $env:PG_BACKUP_DIRECTORY
)

if (-not $env:DATABASE_URL) { throw 'DATABASE_URL is required.' }
if (-not $BackupDirectory) { $BackupDirectory = Join-Path $PSScriptRoot '..\backups' }

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupFile = Join-Path $BackupDirectory "shop-$timestamp.dump"
New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
& pg_dump --format=custom --file=$backupFile $env:DATABASE_URL
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }

if ($env:S3_BACKUP_URI) {
  & aws s3 cp $backupFile $env:S3_BACKUP_URI.TrimEnd('/')/
  if ($LASTEXITCODE -ne 0) { throw 'S3 upload failed.' }
}

Write-Output "Backup created: $backupFile"