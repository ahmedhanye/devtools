---
trigger:
  - "*"
description: Secret handling invariants, synthetic credentials, and TruffleHog suppression.
---

# Secret handling invariants

Rules to prevent credential leakage, structure test fixtures, and suppress false positives.

## Invariants

1. Commit zero production secrets, private tokens, API keys, certificates, or private keys across any file or branch.
2. Store runtime credentials exclusively in local `.env` files or secure runtime secret managers. Never check `.env` into git.

## Test fixtures and mock credentials

1. Use synthetic test fixtures that follow standard prefix conventions: `mock_sk_test_...` or all zeros `00000000000000000000000000000000`.
2. When a synthetic token matches real secret regex heuristics (AWS access key format `AKIA...` or GitHub token prefix `ghp_...`), append the inline suppression comment on the exact line:
   - TypeScript and JavaScript: `// trufflehog:ignore`
   - YAML, Shell, and Python: `# trufflehog:ignore`
3. Never use actual leaked or revoked keys for test assertions.
