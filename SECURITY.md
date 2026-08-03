# Security Policy

## Supported Versions

Currently, the latest version of XaCode on the `main` branch is supported for security updates.

## Security Considerations

XaCode incorporates several security measures:
- **Project and Global Permissions:** Restricts what directories the agent can read/write and what commands it can run.
- **Tool Argument Verification:** Ensures structured execution and limits argument spoofing.
- **VerificationPipeline & ProtectionSystem:** Prevents infinite loops and validates output safely.
- **Encrypted Storage:** API keys are encrypted using Electron `safeStorage` (backed by Windows DPAPI).
- **Data Isolation:** User data and project settings are stored securely outside the repository (in `%USERPROFILE%\.xacode`).

## Reporting a Vulnerability

**DO NOT report security vulnerabilities in public GitHub issues.**

If you discover a vulnerability, please use **GitHub Private Vulnerability Reporting** (if enabled on this repository) or contact the owner via their [GitHub Profile](https://github.com/Xani4kaGitHub).

### What to Include

Please provide the following information in your report:
- A description of the issue.
- The affected version(s).
- Detailed steps to reproduce the vulnerability.
- The potential impact.
- Relevant logs (with all secrets removed).
- A safe proof of concept (if applicable).
- A suggested fix or mitigation.

### Disclosure Policy

- Please do not publish details of the vulnerability until it has been resolved.
- **CRITICAL:** Do NOT publish API keys, access tokens, passwords, private user paths, personal data, user project contents, or dangerous working exploits in your report.

### Response Process

The repository owner will review the report, confirm the vulnerability, and work on a patch. A security advisory will be published once the issue is resolved.
