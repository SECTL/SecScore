#!/usr/bin/env bash
set -euo pipefail

base_url="${BASE_URL:-http://127.0.0.1:8787}"
account="${DEV_USER_ID:-local-demo-user}"
student_id="${STUDENT_ID:-$(uuidgen | tr '[:upper:]' '[:lower:]')}"
device_a="${DEVICE_A:-$(uuidgen | tr '[:upper:]' '[:lower:]')}"
device_b="${DEVICE_B:-$(uuidgen | tr '[:upper:]' '[:lower:]')}"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

request() {
  curl --fail-with-body -sS \
    -H "Content-Type: application/json" \
    -H "X-Dev-User-Id: ${account}" \
    "$@"
}

echo "Health:"
request "${base_url}/health"
echo

op_a="$(uuidgen | tr '[:upper:]' '[:lower:]')"
op_b="$(uuidgen | tr '[:upper:]' '[:lower:]')"

echo "Device A uploads offline +5:"
request -X POST "${base_url}/v1/sync" --data "{\
  \"device_id\": \"${device_a}\", \"last_server_change_seq\": 0,
  \"operations\": [{\
    \"op_id\": \"${op_a}\", \"client_seq\": 1, \"lamport\": 1,
    \"entity_type\": \"student\", \"entity_id\": \"${student_id}\",
    \"operation_type\": \"score.adjust\",
    \"payload\": {\"score_delta\": 5, \"reward_delta\": 5},
    \"client_created_at\": \"${now}\"
  }]
}"
echo

echo "Device B uploads offline +3:"
request -X POST "${base_url}/v1/sync" --data "{\
  \"device_id\": \"${device_b}\", \"last_server_change_seq\": 0,
  \"operations\": [{\
    \"op_id\": \"${op_b}\", \"client_seq\": 1, \"lamport\": 1,
    \"entity_type\": \"student\", \"entity_id\": \"${student_id}\",
    \"operation_type\": \"score.adjust\",
    \"payload\": {\"score_delta\": 3, \"reward_delta\": 3},
    \"client_created_at\": \"${now}\"
  }]
}"
echo

echo "Expected merged balance: score=8, reward_points=8"
request "${base_url}/v1/students/${student_id}/balance"
echo

echo "Uploading the same operation again (idempotency):"
request -X POST "${base_url}/v1/sync" --data "{\
  \"device_id\": \"${device_a}\", \"last_server_change_seq\": 0,
  \"operations\": [{\
    \"op_id\": \"${op_a}\", \"client_seq\": 1, \"lamport\": 1,
    \"entity_type\": \"student\", \"entity_id\": \"${student_id}\",
    \"operation_type\": \"score.adjust\",
    \"payload\": {\"score_delta\": 5, \"reward_delta\": 5},
    \"client_created_at\": \"${now}\"
  }]
}"
echo

