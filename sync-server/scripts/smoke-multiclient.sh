#!/usr/bin/env bash
set -euo pipefail

base_url="${BASE_URL:-http://127.0.0.1:8787}"
account="${DEV_USER_ID:-multiclient-$(uuidgen | tr '[:upper:]' '[:lower:]')}"
student="${STUDENT_NAME:-自动化学生-$(uuidgen | cut -c1-8)}"
device_a="$(uuidgen | tr '[:upper:]' '[:lower:]')"
device_b="$(uuidgen | tr '[:upper:]' '[:lower:]')"
op_a="$(uuidgen | tr '[:upper:]' '[:lower:]')"
op_b="$(uuidgen | tr '[:upper:]' '[:lower:]')"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

request() {
  curl --fail-with-body -sS \
    -H "Content-Type: application/json" \
    -H "X-Dev-User-Id: ${account}" \
    "$@"
}

snapshot_a="$(jq -nc --arg name "$student" --arg now "$now" '{version:1,students:[{name:$name,group_name:"A",score:0,reward_points:0}],reasons:[{content:"自动化理由",category:"测试",delta:1,updated_at:$now}],reward_settings:[{name:"自动化奖励",cost_points:2,created_at:$now,updated_at:$now}],tags:[{name:"自动化标签",created_at:$now,updated_at:$now}],student_tags:[{student_name:$name,tag_name:"自动化标签",created_at:$now}],score_events:[],reward_redemptions:[],settlements:[],board_configs:[],settings:{mobile_bottom_nav_items:["home"]}}')"
snapshot_b="$(jq -nc --arg name "$student" --arg now "$now" '{version:1,students:[{name:$name,group_name:"B",score:0,reward_points:0}],reasons:[{content:"自动化理由B",category:"测试",delta:2,updated_at:$now}],reward_settings:[{name:"自动化奖励B",cost_points:3,created_at:$now,updated_at:$now}],tags:[{name:"自动化标签B",created_at:$now,updated_at:$now}],student_tags:[{student_name:$name,tag_name:"自动化标签B",created_at:$now}],score_events:[],reward_redemptions:[],settlements:[],board_configs:[],settings:{mobile_bottom_nav_items:["home","students"]}}')"

request -X POST "${base_url}/v1/snapshot" --data "$(jq -nc --arg d "$device_a" --argjson s "$snapshot_a" '{device_id:$d,snapshot:$s}')" >/tmp/secscore-multiclient-a.json
merged="$(request -X POST "${base_url}/v1/snapshot" --data "$(jq -nc --arg d "$device_b" --argjson s "$snapshot_b" '{device_id:$d,snapshot:$s}')")"

test "$(printf '%s' "$merged" | jq '[.snapshot.students,.snapshot.reasons,.snapshot.reward_settings,.snapshot.tags,.snapshot.student_tags] | map(length) | add')" -ge 6

upload() {
  local device="$1" op="$2" seq="$3" delta="$4"
  request -X POST "${base_url}/v1/sync" --data "$(jq -nc --arg d "$device" --arg op "$op" --arg student "$student" --arg now "$now" --argjson delta "$delta" --argjson seq "$seq" '{device_id:$d,last_server_change_seq:0,operations:[{op_id:$op,client_seq:$seq,lamport:$seq,entity_type:"student",entity_id:"00000000-0000-5000-8000-000000000001",operation_type:"score.adjust",payload:{student_name:$student,score_delta:$delta,reward_delta:$delta},client_created_at:$now}],limit:500}')"
}

upload "$device_a" "$op_a" 1 5 >/tmp/secscore-multiclient-op-a.json
upload "$device_b" "$op_b" 1 3 >/tmp/secscore-multiclient-op-b.json
balance="$(request "${base_url}/v1/students/00000000-0000-5000-8000-000000000001/balance")"
test "$(printf '%s' "$balance" | jq -r '.score')" = 8

printf 'multiclient_sync_ok account=%s student=%s score=%s\n' "$account" "$student" "$(printf '%s' "$balance" | jq -r '.score')"
