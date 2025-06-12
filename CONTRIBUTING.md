# Contributing to Olympian AI Lightweight

We love your input! We want to make contributing to Olympian AI Lightweight as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## We Develop with Github

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

## We Use [Github Flow](https://guides.github.com/introduction/flow/index.html)

Pull requests are the best way to propose changes to the codebase.

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. Issue that pull request!

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same [MIT License](LICENSE) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using Github's [issues](https://github.com/CristobalNavarroSchanentgen/olympian-ai-lightweight/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/CristobalNavarroSchanentgen/olympian-ai-lightweight/issues/new); it's that easy!

## Write bug reports with detail, background, and sample code

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can.
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## Development Process

### Prerequisites

- Node.js 18+
- MongoDB (local or remote)
- Ollama installed

### Setup

```bash
# Clone the repository
git clone https://github.com/CristobalNavarroSchanentgen/olympian-ai-lightweight.git
cd olympian-ai-lightweight

# Install dependencies
npm install

# Copy environment variables
cp packages/server/.env.example packages/server/.env

# Start development servers
npm run dev
```

### Project Structure

```
olympian-ai-lightweight/
├── packages/
│   ├── client/          # React frontend
│   ├── server/          # Express backend
│   └── shared/          # Shared types
└── docs/                # Documentation
```

### Code Style

- We use ESLint and Prettier for code formatting
- Run `npm run lint` to check for linting errors
- Run `npm run format` to auto-format code

### Testing

- Write tests for new features
- Run `npm test` to run the test suite
- Ensure all tests pass before submitting PR

## License

By contributing, you agree that your contributions will be licensed under its MIT License.