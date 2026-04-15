# Security Policy

## Supported versions

Because this project manipulates local Codex session metadata, security and
data safety fixes should target the latest release first.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1   | No        |

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could expose local
session contents, backup data, or filesystem write paths.

Instead:

1. Prepare a minimal reproduction and impact summary.
2. Share the affected version, OS, and whether the issue requires local access.
3. Wait for a maintainer response before publishing details.

If private reporting is not available yet, open a public issue only after
redacting secrets and reducing the report to a non-exploitable description.

## Project-specific safety boundaries

- Write operations should always create restorable backups.
- Rollback paths must be deterministic and test-covered.
- Session content from local history should never be sent to remote services by default.
