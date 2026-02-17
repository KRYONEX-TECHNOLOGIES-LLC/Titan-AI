# Contributing to Titan AI

Thank you for your interest in contributing to Titan AI! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Rust (stable) for native modules
- Git

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Titan-AI.git
   cd Titan-AI
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Build packages:
   ```bash
   pnpm build
   ```

## Development Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation
- `refactor/` - Code refactoring
- `test/` - Test additions/fixes

### Commit Messages

We follow conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Maintenance

### Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Write/update tests
4. Run linting and tests:
   ```bash
   pnpm lint
   pnpm test
   pnpm typecheck
   ```
5. Create a pull request

## Project Structure

```
titan-ai/
├── packages/
│   ├── ai/           # AI-related packages
│   ├── core/         # Core editor packages
│   ├── indexer-native/ # Rust native modules
│   └── ...           # Other packages
├── apps/             # Applications
├── scripts/          # Build scripts
└── config/           # Shared configuration
```

## Testing

### Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm test --filter=@titan/ai-gateway

# Watch mode
pnpm test -- --watch
```

### Writing Tests

- Place tests in `__tests__` directories or `*.test.ts` files
- Use descriptive test names
- Test edge cases

## Code Style

- We use ESLint and Prettier
- Run `pnpm lint:fix` before committing
- TypeScript strict mode is enabled

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Include examples where helpful

## Native Modules (Rust)

For changes to `packages/indexer-native`:

1. Ensure Rust toolchain is installed
2. Run tests: `cargo test`
3. Build: `pnpm build:native`

## Questions?

Open an issue for questions or discussions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
