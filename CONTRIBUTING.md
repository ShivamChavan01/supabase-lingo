# Contributing to supabase-lingo

Thanks for your interest in contributing!

## Setup

```bash
git clone https://github.com/ShivamChavan01/supabase-lingo
cd supabase-lingo
npm install
cp .env.example .env
# Fill in your .env values
```

## Project Structure

See [AGENTS.md](./AGENTS.md) for a complete guide to the codebase.

## Running Locally

```bash
# Build the core package
npm run build

# Test the CLI
node packages/core/dist/cli.js scan

# Run the demo app
npm run dev
```

## Pull Request Guidelines

- Keep PRs focused on one thing
- Add tests for new features
- Update AGENTS.md if you change architecture
- Never hardcode API keys
- Never modify original user tables

## License

MIT
