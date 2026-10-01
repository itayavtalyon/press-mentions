# Optional wrappers around the npm scripts. Node and npm are the required toolchain.

# Show available recipes
default:
	@just --list

# Install from the lockfile and create .env if it is missing
setup:
	npm ci
	@[ -f .env ] || cp .env.example .env

# Start the HTTP server
start:
	npm start

# Run the one-time backfill
job-backfill:
	npm run job:backfill

# Run the daily job
job-daily:
	npm run job:daily

# Score installed chat models against the saved prompts
job-eval:
	npm run job:eval

# Run every quality gate, stopping at the first failure
verify:
	npm run verify
