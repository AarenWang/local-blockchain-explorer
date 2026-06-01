#!/usr/bin/env bash
set -euo pipefail

SQLITE_PATH="${SQLITE_PATH:-./data/indexer.db}"
CHAIN_ID="${CHAIN_ID:-solana-local}"
CLEAR_SPL_TOKENS="${CLEAR_SPL_TOKENS:-false}"
SQLITE3_BIN="${SQLITE3_BIN:-sqlite3}"
REDIS_CLI="${REDIS_CLI:-}"

if [[ -z "${REDIS_CLI}" ]]; then
  if command -v redis-cli >/dev/null 2>&1; then
    REDIS_CLI="$(command -v redis-cli)"
  elif [[ -x "/Users/wangrenjun/dev/software/redis-7.0.4/src/redis-cli" ]]; then
    REDIS_CLI="/Users/wangrenjun/dev/software/redis-7.0.4/src/redis-cli"
  else
    echo "redis-cli not found" >&2
    exit 1
  fi
fi

if [[ ! -f "${SQLITE_PATH}" ]]; then
  echo "SQLite database not found: ${SQLITE_PATH}" >&2
  exit 1
fi

tmpfile="$(mktemp)"
trap 'rm -f "${tmpfile}"' EXIT

{
  echo "begin;"
  echo "delete from solana_slots where chain_id='${CHAIN_ID}';"
  echo "delete from solana_txs where chain_id='${CHAIN_ID}';"
  echo "delete from spl_transfers where chain_id='${CHAIN_ID}';"
  if [[ "${CLEAR_SPL_TOKENS}" == "1" || "${CLEAR_SPL_TOKENS}" == "true" ]]; then
    echo "delete from spl_tokens where chain_id='${CHAIN_ID}';"
  fi
  echo "commit;"
} > "${tmpfile}"

"${SQLITE3_BIN}" "${SQLITE_PATH}" < "${tmpfile}"

keys=()
patterns=(
  "solana:slot:${CHAIN_ID}:*"
  "solana:tx:${CHAIN_ID}:*"
  "recent:solana:slot:${CHAIN_ID}"
  "recent:solana:tx:${CHAIN_ID}"
)

for pattern in "${patterns[@]}"; do
  while IFS= read -r key; do
    [[ -n "${key}" ]] && keys+=("${key}")
  done < <("${REDIS_CLI}" --scan --pattern "${pattern}")
done

if [[ "${#keys[@]}" -gt 0 ]]; then
  "${REDIS_CLI}" DEL "${keys[@]}" >/dev/null
fi

echo "Cleared SQLite Solana history for ${CHAIN_ID}"
echo "Cleared ${#keys[@]} Solana Redis key(s)"
