# Security Policy

The DevTools project takes repository, dependency, and software security seriously. We appreciate the responsible disclosure of security vulnerabilities by researchers and contributors.

## Supported Versions

Only the latest active minor release line receives security updates and patches. Older versions and unreleased tags are not supported.

| Version        | Supported          |
| -------------- | ------------------ |
| >= 0.0.1 < 0.1 | :white_check_mark: |
| < 0.0.1        | :x:                |

## Reporting a Vulnerability

**DO NOT file public GitHub issues, discussions, or pull requests for security vulnerabilities.** Public disclosure exposes users before a fix is prepared and verified.

### Primary Disclosure Channel: Private Vulnerability Reporting (PVR)

Submit all vulnerability reports through GitHub Private Vulnerability Reporting:

> **[Submit Security Advisory](https://github.com/AhmedHanye/devtools/security/advisories/new)**

If you are unable to use the GitHub Advisory interface, contact repository maintainer **[@AhmedHanye](https://github.com/AhmedHanye)** directly via GitHub.

### Required Report Details

Please include the following information in your report:

1. **Type of Issue:** Vulnerability type (e.g. command injection, path traversal, privilege escalation, credential exposure).
2. **Affected Components:** Affected packages or services (`@devtools/cli`, `@devtools/api`, `@devtools/frontend`, `@devtools/core`, `@devtools/db`, or repository workflows).
3. **Environment:** OS, architecture, and Bun version (`bun --version`).
4. **Proof of Concept (PoC):** Step-by-step instructions or minimal code reproducing the vulnerability.
5. **Impact Assessment:** Plausible attack scenarios and consequences.
6. **Suggested Remediation:** Any recommended fixes, mitigations, or patches (if available).

## Triage SLA & Disclosure Process

- **48-Hour Triage SLA:** The maintainer will acknowledge receipt of the report and begin initial triage assessment within **48 hours**.
- **Assessment & Fix:** We will collaborate with the reporter in the private GitHub security advisory workspace to evaluate impact, develop a fix, and prepare a release candidate.
- **Coordinated Disclosure:** Security advisories and patches are coordinated under a standard 90-day Coordinated Vulnerability Disclosure (CVD) timeline, or earlier upon mutual agreement once patches are published.
- **Credit & Attribution:** Reporters are credited in the published GitHub Security Advisory and release notes, unless they request to remain anonymous.
