# Contributing to XaCode

Welcome! We are excited that you want to contribute to XaCode. This document provides guidelines for contributing to this open-source project.

## How to Contribute

There are several ways to contribute:
- Reporting bugs
- Suggesting new features
- Submitting pull requests to fix issues or add features
- Improving documentation

## Code of Conduct

Please treat all community members with respect. Constructive feedback is welcome, but personal attacks or harassment will not be tolerated. Keep communication professional and focused on improving the project.

## Reporting Bugs

If you find a bug, please use the provided Bug Report issue template. Ensure you:
- Check existing issues to avoid duplicates.
- Provide the exact version of XaCode and your Windows version.
- Include clear steps to reproduce the issue.
- **NEVER** publish API keys, access tokens, passwords, or personal data in your logs or bug reports.

## Suggesting New Features

If you have an idea for a new feature, use the Feature Request issue template. Explain what problem your feature solves, your proposed solution, and any potential alternatives.

## Development Setup

1. Create a fork of the repository.
2. Clone your fork locally.
3. Install dependencies:
   ```powershell
   npm.cmd install
   ```
4. Run the project in development mode:
   ```powershell
   npm.cmd run dev
   ```

## Creating a Branch

Always create a new branch for your work. Use descriptive branch names:
- `feature/model-provider` (for new features)
- `fix/settings-layout` (for bug fixes)
- `docs/update-readme` (for documentation)

## Running Tests

Before submitting a Pull Request, ensure that all checks pass:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:ui
npm.cmd run test:storage
npm.cmd run test:verification
```

## Pull Request Guidelines

- Ensure your code follows the existing style.
- Keep your changes focused on a single issue or feature.
- Use clear and descriptive commit messages (e.g., `feat: add model provider settings`, `fix: prevent duplicate tool execution`, `docs: improve installation instructions`, `test: add verification pipeline coverage`).
- Fill out the Pull Request template completely.
- **CRITICAL:** Ensure absolutely no secrets, API keys, or sensitive environment files are included in your commits.
