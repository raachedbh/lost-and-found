# Security

## Reporting

Please report security issues privately to the repository owner. Do not include credentials, identity documents, private messages, or exact locations in a public issue.

## Deployment requirements

- Serve L9itha only over HTTPS in production.
- Set one exact `L9ITHA_ALLOWED_ORIGIN`; do not use a wildcard.
- Keep Firebase Admin credentials server-side. Never add a service-account JSON file to Git.
- Enable `L9ITHA_TRUST_PROXY=1` only when a trusted proxy replaces `X-Forwarded-For`.
- Mount `.data/` on encrypted persistent storage and restrict filesystem access to the app user.
- Back up and protect the `cases.sqlite` database and uploaded files as personal data.

Document images are intentionally rejected. Users can publish only a general, non-identifying description for IDs and passports.
