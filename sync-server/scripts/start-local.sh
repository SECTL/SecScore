#!/usr/bin/env bash
set -euo pipefail

docker compose -f "$(dirname "$0")/../docker-compose.yml" up -d postgres

export DATABASE_URL="${DATABASE_URL:-postgres://secscore:secscore@127.0.0.1:54329/secscore}"
export DEV_AUTH="${DEV_AUTH:-true}"
export BIND_ADDR="${BIND_ADDR:-127.0.0.1:8787}"

cargo run --manifest-path "$(dirname "$0")/../Cargo.toml"

