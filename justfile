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

# Run the forward feed
job-feed:
	npm run job:feed

# Run the unwrap step
job-unwrap:
	npm run job:unwrap

# Run the fetch step
job-fetch:
	npm run job:fetch

# Run the extract step
job-extract:
	npm run job:extract

# Score open company links at stage classify
job-classify:
	npm run job:classify

# Enqueue digests
job-digest:
	npm run job:digest

# Score installed chat models against the saved prompts
job-eval:
	npm run job:eval

# Contrast, then overflow, screenshots, and axe on a server reading COVERAGE_DB
ui-check:
	#!/usr/bin/env bash
	set -euo pipefail
	node tools/contrast.mjs
	export PORT=3999 BASE_URL=http://127.0.0.1:3999
	node --env-file=.env src/server/index.js > /dev/null &
	trap 'kill $!' EXIT
	for _ in {1..50}; do curl -sf "$BASE_URL/app.css" > /dev/null && break; sleep 0.1; done
	node tools/shoot.mjs
	node tools/axe.mjs

# Run every quality gate, stopping at the first failure
verify:
	npm run verify
