#!/usr/bin/env bash
# Export a CSV from vCenter (via govc) for use with vcenter_csv_inventory.py / .sh
#
# Prerequisites: govc (https://github.com/vmware/govmomi/govc), jq
#
# Required env:
#   GOVC_URL       — vCenter SDK URL, e.g. https://vcenter.example.com/sdk
#   GOVC_USERNAME  — SSO or local user
#   GOVC_PASSWORD  — password (or use ~/.govmomi/session; see govc docs)
#
# Optional env:
#   GOVC_DATACENTER, GOVC_INSECURE (self-signed TLS)
#   GOVC_VM_FIND   — root path for "govc find" (default: /)
#   VCENTER_EXPORT_CSV — output file (default: secureboot_inventory_full.csv in cwd)
#
# Output columns align with ansible/inventory/vcenter_csv_inventory.py (check, vm_name,
# ansible_host, guest_os, secure_boot, firmware, esxi_host, …).

set -euo pipefail

command -v govc >/dev/null 2>&1 || {
  echo "govc not found. Install: https://github.com/vmware/govmomi/releases" >&2
  exit 127
}
command -v jq >/dev/null 2>&1 || {
  echo "jq not found (required for JSON parsing)." >&2
  exit 127
}

if [[ -z "${GOVC_URL:-}" ]]; then
  echo "Set GOVC_URL (e.g. export GOVC_URL='https://vcenter.example.com/sdk')" >&2
  exit 2
fi

FIND_ROOT="${GOVC_VM_FIND:-/}"
OUT="${VCENTER_EXPORT_CSV:-secureboot_inventory_full.csv}"

tmp="$(mktemp)"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT

header='check,vm_name,ansible_host,os_family,guest_os,secure_boot,firmware,cluster,esxi_host,power_state,ansible_user'
printf '%s\n' "$header" >"$tmp"

while IFS= read -r vm_path; do
  [[ -z "$vm_path" ]] && continue
  json="$(govc vm.info -json "$vm_path" 2>/dev/null)" || continue
  vm_json="$(echo "$json" | jq '.VirtualMachines[0] // empty')"
  [[ -z "$vm_json" || "$vm_json" == "null" ]] && continue

  name="$(echo "$vm_json" | jq -r '.Name // empty')"
  [[ -z "$name" ]] && continue

  # Prefer first reported guest IPv4; fall back to guest hostname, then VM name
  ip="$(govc vm.ip -esxi=false -wait=0 "$vm_path" 2>/dev/null | head -1 | tr -d '\r' || true)"
  guest_host="$(echo "$vm_json" | jq -r '.Guest.HostName // empty')"
  if [[ -n "$ip" ]]; then
    ansible_host="$ip"
  elif [[ -n "$guest_host" ]]; then
    ansible_host="$guest_host"
  else
    ansible_host="$name"
  fi

  guest_os="$(echo "$vm_json" | jq -r '.Guest.GuestFullName // .Config.Version // ""')"
  gl="$(echo "$guest_os" | tr '[:upper:]' '[:lower:]')"
  if [[ "$gl" == *windows* ]]; then
    os_family="windows"
  else
    os_family="linux"
  fi

  sb_raw="$(echo "$vm_json" | jq -r '.Config.BootOptions.EfiSecureBootEnabled // false')"
  if [[ "$sb_raw" == "true" ]]; then
    secure_boot="ON"
  else
    secure_boot="OFF"
  fi

  firmware="$(echo "$vm_json" | jq -r '.Config.Firmware // "unknown"')"
  power_state="$(echo "$vm_json" | jq -r '.Runtime.PowerState // ""')"
  cluster=""

  esxi_host="$(govc vm.info "$vm_path" 2>/dev/null | sed -n 's/^[[:space:]]*Host:[[:space:]]*//p' | head -1 || true)"

  check="true"
  ansible_user=""

  jq -nr \
    --arg check "$check" \
    --arg vm_name "$name" \
    --arg ansible_host "$ansible_host" \
    --arg os_family "$os_family" \
    --arg guest_os "$guest_os" \
    --arg secure_boot "$secure_boot" \
    --arg firmware "$firmware" \
    --arg cluster "$cluster" \
    --arg esxi_host "$esxi_host" \
    --arg power_state "$power_state" \
    --arg ansible_user "$ansible_user" \
    '[$check,$vm_name,$ansible_host,$os_family,$guest_os,$secure_boot,$firmware,$cluster,$esxi_host,$power_state,$ansible_user] | @csv' >>"$tmp"
done < <(govc find "$FIND_ROOT" -type m 2>/dev/null || true)

mv -f "$tmp" "$OUT"
trap - EXIT
echo "Wrote $OUT"
echo "Next: export VCENTER_CSV=\"$OUT\" && ./inventory/vcenter_csv_inventory.sh --list"
