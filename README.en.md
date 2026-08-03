[Русский](README.md) | English

# XaCode

![GitHub stars](https://img.shields.io/github/stars/Xani4kaGitHub/XaCodeApp)
![GitHub forks](https://img.shields.io/github/forks/Xani4kaGitHub/XaCodeApp)
![Release XaCode](https://github.com/Xani4kaGitHub/XaCodeApp/actions/workflows/release.yml/badge.svg)
![GitHub release](https://img.shields.io/github/v/release/Xani4kaGitHub/XaCodeApp)
![GitHub license](https://img.shields.io/github/license/Xani4kaGitHub/XaCodeApp)
![GitHub issues](https://img.shields.io/github/issues/Xani4kaGitHub/XaCodeApp)
![GitHub last commit](https://img.shields.io/github/last-commit/Xani4kaGitHub/XaCodeApp)

XaCode is an actively developed open-source project. Public adoption metrics will be added as the community grows.

## Overview

XaCode is a local desktop AI coding agent for Windows. The application is capable of working with project files, utilizing the terminal, executing HTTP requests, interacting with SQLite databases, and managing Docker containers. Access to tools, files, commands, and network can be explicitly configured globally or on a per-project basis.

## Key Features

- **Project and Global Permissions:** Robust permission system with explicit inheritance. Full access can be enabled globally for all projects or selectively for a specific project.
- **Strict Tool Argument Verification:** Ensures structured execution results and tool argument validation.
- **VerificationPipeline:** Automatically validates the result before successfully concluding a task.
- **ProtectionSystem:** Prevents infinite loops and limits the maximum number of tool executions to maintain stability.
- **Persistent Memory:** Saves useful context, task history, decisions, and errors across sessions.
- **Multiple Models:** Supports connecting to multiple models for diverse reasoning.
- **Model Team & Multi-agent Mode:** Allows organizing a team of 2 to 4 AI agents with dedicated roles (Coordinator, Architect, Executor, Reviewer).
- **Secure Storage:** API keys are protected using Electron `safeStorage` and Windows DPAPI.

## System Requirements

- OS: Windows
- Node.js 20 or newer (for development and source installation)

## User Interface

### Main Window

![XaCode Main Window](docs/screenshots/main-window.png)

### Model Team

![XaCode Model Team](docs/screenshots/model-team.png)

### Permission Settings

![Project Permissions](docs/screenshots/permissions.png)

## Installation from Release (Recommended)

To install the latest pre-built Windows version:

1. Go to the [GitHub Releases](https://github.com/Xani4kaGitHub/XaCodeApp/releases) page.
2. Select the latest stable release.
3. Download the Windows installer `.exe` file.
4. Run the installer.
5. If Windows SmartScreen displays a warning, verify the publisher and file source, then proceed.
6. After installation, launch XaCode.
7. Open settings and add your own API key.
8. **Important:** Never publish your API key in Issues or logs.

*Note: The installed application automatically checks for updates via GitHub Releases.*

## Installation from Source

```powershell
npm.cmd install
```

## Running in Development Mode

```powershell
npm.cmd run dev
```

## Building the Windows Installer

```powershell
npm.cmd run dist:win
```

The compiled installer will be created in the `release` directory. This directory is generated locally during the build process and should not be added to Git.

## Running Tests

Basic verification checks can be triggered with the following commands:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:ui
npm.cmd run test:storage
npm.cmd run test:verification
```

## Security and Permission System

XaCode features a dual-layer permission system (global and project-level). Each tool invocation is checked against the configured permissions to prevent unauthorized file access or command execution. To report a vulnerability, please see [SECURITY.md](SECURITY.md).

## User Data Storage

All user data is stored safely outside of the repository, typically in `%USERPROFILE%\.xacode` (e.g., `C:\Users\username\.xacode`). You can override this location by setting the `XACODE_HOME` environment variable. This folder contains configuration, chat history, memories, task backups, and isolated project environments.

## API Key Management

API keys are not stored in plaintext. They are encrypted securely using Windows DPAPI via Electron's `safeStorage`, ensuring that only the Windows user who saved the key can decrypt it.

## Model Team and Multi-Agent Mode

In the "Model Team" settings, you can select between two to four model connections and assign them specific roles: Coordinator, Architect, Executor, Reviewer, or Specialist. The team is launched via `/team` or `@team`.

The models discuss the task sequentially via a shared log. The Coordinator formulates a unified plan, and only the Executor role is granted access to tools and file modifications, preventing race conditions and conflicting edits.

## Contributing

We welcome contributions to XaCode! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting Pull Requests to us.

## Reporting Vulnerabilities

Please do not open a public issue if you find a security vulnerability. Check our [SECURITY.md](SECURITY.md) for detailed instructions on safe disclosure.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
