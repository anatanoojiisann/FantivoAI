# Admin Service

Cloudflare Worker + D1 implementation for AuraX Control. Setup, local commands, username/password authentication, optional TOTP capability, security boundaries and production deployment are documented in [`../docs/ADMIN.md`](../docs/ADMIN.md).

Do not commit `.dev.vars`. Replace every `REPLACE_WITH_*` value in `wrangler.jsonc` before production deployment.
