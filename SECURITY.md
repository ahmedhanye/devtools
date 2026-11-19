# Security policy

Responsible disclosure channels, supported release lines, and triage timelines for reporting security vulnerabilities in DevTools.

## Supported versions

Only the latest active minor release line receives security updates and patches. Older versions and unreleased tags are not supported.

| Version | Supported |
| :------ | :-------- |
| `0.1.x` | Yes       |
| `< 0.1` | No        |

## Reporting a vulnerability

> [!CAUTION]
> Report security vulnerabilities confidentially through private channels. Do not open public issues, discussions, or pull requests for undisclosed vulnerabilities.

### Primary disclosure channel

Submit vulnerability reports through [GitHub Private Vulnerability Reporting](https://github.com/AhmedHanye/devtools/security/advisories/new).

If you cannot access the GitHub Advisory interface, contact repository maintainer [@AhmedHanye](https://github.com/AhmedHanye) directly via GitHub.

### Required report details

1. **Type of issue.** Vulnerability class (for example, command injection, path traversal, privilege escalation, or credential exposure).
2. **Affected components.** Impacted packages, applications (`@devtools/cli`, `@devtools/api`, `@devtools/frontend`, `@devtools/core`, `@devtools/db`, `@devtools/browser`, `@devtools/lighthouse`), or workflows.
3. **Environment.** Operating system, CPU architecture, and Bun version (`bun --version`).
4. **Proof of concept.** Step-by-step reproduction instructions or minimal code.
5. **Impact assessment.** Plausible attack scenarios and consequences.
6. **Suggested remediation.** Recommended fixes, mitigations, or patches if available.

## Triage SLA and disclosure process

- **48-hour triage SLA.** Maintainers acknowledge receipt and begin initial triage within 48 hours.
- **Assessment and fix.** Maintainers collaborate with the reporter in the private GitHub advisory workspace to evaluate impact, develop a fix, and prepare a release.
- **Coordinated disclosure.** Advisories and patches follow a 90-day Coordinated Vulnerability Disclosure timeline, or publish earlier by mutual agreement once patches ship.
- **Credit and attribution.** Reporters receive credit in the published GitHub Security Advisory and release notes unless they request anonymity.
