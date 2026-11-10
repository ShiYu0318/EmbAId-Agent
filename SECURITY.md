# Security reporting

Do not publish credentials, personal documents, conversation records, or exploit instructions in a
public Issue or PR.

If this repository offers **Security → Report a vulnerability**, use that private reporting channel.
If it is unavailable, request a private channel from [@ShiYu0318](https://github.com/ShiYu0318).
If no private contact is listed, open an Issue titled "Request private security contact" containing
only that request, without vulnerability details. No response-time or support-window commitment is
currently published.

Once a private channel is established, include the affected revision, deployment conditions,
expected and actual behavior, impact, and a minimal reproduction using synthetic data. Redact
tokens, keys, account identifiers, and uploaded content. Coordinate disclosure with the maintainer.

## What the software defends against

The README's [security model](README.md#security-model) lists the controls that ship with the
code: key scoping and origin allowlists, rate limits per key and per address, checks that stop
crawl sources and webhooks reaching internal addresses, upload and filename handling, response
headers, and tenant isolation. Known limits are stated there too: the outbound address check does
not pin the connection to the address it checked, and the rate limiter counts per process.

Settings that widen the attack surface are off by default and should stay off unless you need
them: `ALLOW_PRIVATE_NETWORK_TARGETS`, `API_DOCS_ENABLED` in production, and wildcard CORS origins.

## Scope and support

The project is under active development. Use the current `main` revision when reproducing an issue;
there is no separate long-term support branch. Deployment operators are responsible for secrets,
access controls, model endpoints, backups and upgrades. A passing test suite is not a security audit.
