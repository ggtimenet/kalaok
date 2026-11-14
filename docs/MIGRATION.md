# KalaOK migration plan

## Confirmed source inventory
- `OnlineKalaOK/API`: classic ASP.NET Web API 2 on .NET Framework 4.7.2, Entity Framework 6 and Microsoft SQL Server.
- `OnlineKalaOK/Web`: 2020-era HTML, CSS, jQuery, legacy SignalR client and static assets.
- `ClearRSongList`: .NET Framework 4.5.2 utility.
- `TransPlayListItem` and `VerifyCodeProcess`: .NET Framework 4.7.2 Windows executables.
- `data20240326`: approximately 1 GB SQL Server backup (never commit to Git).
- Original checkout is NOT a Git repository. It is deliberately retained untouched.

## High-priority security tasks
1. Revoke and rotate the legacy hardcoded Basic authentication token from `Web/Scripts/common.js`. Browser-visible secrets cannot be kept confidential.
2. Inventory and rotate all credentials from Web.config, App.config and deployment settings before any public commit.
3. Remove hardcoded HTTP URL `http://www.ezbooking.com.tw/api/` and replace with a controlled HTTPS API endpoint.
4. Audit all proprietary media, video sources, personal information and licensing before use.
5. Enforce access controls and avoid publicly publishing customer data or old binaries.

## Staged roadmap
1. Deploy minimal static preview with Nginx and healthcheck in Coolify (NO production behavior).
2. Build a new ASP.NET Core API incrementally, preserving and testing request/response contracts.
3. Restore a scrubbed copy of the SQL Server database to isolated storage, validate schema and stored procedures; plan backups and resource limits.
4. Replace old account, access-token, SignalR and frontend integrations with modern secure flows.
5. Port the three Windows utilities only after determining their operational role.
6. Conduct integration tests, vulnerability review, data protection and usability checks before any production exposure.

The repository intentionally contains no original Web.config, database backup, tokens, music, or third-party binaries.
