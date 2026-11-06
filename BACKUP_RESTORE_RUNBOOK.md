# MongoDB backup and restore runbook

Staging and production need an authenticated private replica set, encrypted backups, restricted operator access, and a documented recovery point/time objective. Never test restore over a live database. Deleted tenant data remains in retained backups until those backups expire.

## Backup

1. Confirm the target environment, database name, replica set health, storage capacity, and access scope. Record the backup time and MongoDB version. Use a database user with only the permissions needed for the operation; keep credentials out of shell history and logs.
2. Take an encrypted replica-set snapshot or a `mongodump` archive to restricted storage. For a consistent logical backup during writes, use a replica-set-aware method and review `--oplog` requirements. Protect the archive in transit and at rest. Do not copy customer data to developer laptops.
3. Verify the backup file exists, has expected size, and has a recorded checksum. These checks do not prove it can be restored.

## Isolated restore rehearsal

1. Provision a separate, private authenticated MongoDB replica set with different credentials and no outbound OpenAI or SMTP access. Use a unique database name. Never run `mongorestore --drop` against staging or production.
2. Restore the selected archive into that isolated target. Check command exit status, collection counts, indexes (including unique tenant and idempotency indexes), organization membership boundaries, and representative conversation/message records. Validate `/health/ready` and application reads against the isolated target.
3. Record recovery point, duration, counts, index check, and any errors. Delete the isolated target only after the rehearsal is reviewed and backup retention requirements are satisfied.

## Automated local proof and limits

`npm run test:backup:restore -w apps/api` creates an ephemeral MongoDB replica set with two synthetic tenants, runs `mongodump` and `mongorestore` using the local `mongo:8` Docker image, and restores four representative collections and checks organizations, tenant-scoped assistants/conversations/messages, and a unique index. It dumps the source database but does not rehearse every collection in the archive. It does not test a production backup, encryption, authentication, point-in-time recovery, or restore at production scale. Those remain staging release gates.
