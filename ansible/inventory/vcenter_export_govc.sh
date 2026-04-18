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
#   VCENTER_EXPORT_DEBUG — set to 1 to print find/vm.info diagnostics to stderr
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

# If only GOVC_DATACENTER is set, default search path to /<DC>/vm (common layout)
if [[ -z "${GOVC_VM_FIND:-}" && -n "${GOVC_DATACENTER:-}" ]]; then
  FIND_ROOT="/${GOVC_DATACENTER}/vm"
else
  FIND_ROOT="${GOVC_VM_FIND:-/}"
fi
OUT="${VCENTER_EXPORT_CSV:-secureboot_inventory_full.csv}"
DEBUG="${VCENTER_EXPORT_DEBUG:-0}"

tmp="$(mktemp)"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT

header='check,vm_name,ansible_host,os_family,guest_os,secure_boot,firmware,cluster,esxi_host,power_state,ansible_user'
printf '%s\n' "$header" >"$tmp"

vm_from_json() {
  local json="$1"
  [[ -z "$json" ]] && echo "" && return
  # govc vm.info -json wraps the VM in VirtualMachines[0]
  echo "$json" | jq -c '.VirtualMachines[0]? // empty' 2>/dev/null
}

paths_seen=0
rows_out=0
while IFS= read -r vm_path; do
  [[ -z "$vm_path" ]] && continue
  paths_seen=$((paths_seen + 1))

  json=""
  if json="$(govc vm.info -json "$vm_path" 2>/dev/null)"; then
    :
  else
    [[ "$DEBUG" == "1" ]] && echo "vcenter_export_govc: vm.info failed: $vm_path" >&2
  fi

  vm_json="$(vm_from_json "$json")"
  name=""
  if [[ -n "$vm_json" && "$vm_json" != "null" ]]; then
    name="$(echo "$vm_json" | jq -r '.Name // empty' 2>/dev/null || true)"
  fi
  # Fallback: inventory path basename (always have a row per govc find)
  if [[ -z "$name" ]]; then
    name="${vm_path##*/}"
  fi
  [[ -z "$name" ]] && continue

  # Prefer first reported guest IPv4; fall back to guest hostname, then VM name
  ip="$(govc vm.ip -esxi=false -wait=0 "$vm_path" 2>/dev/null | head -1 | tr -d '\r' || true)"
  guest_host=""
  if [[ -n "$vm_json" && "$vm_json" != "null" ]]; then
    guest_host="$(echo "$vm_json" | jq -r '.Guest.HostName // empty' 2>/dev/null || true)"
  fi
  if [[ -n "$ip" ]]; then
    ansible_host="$ip"
  elif [[ -n "$guest_host" ]]; then
    ansible_host="$guest_host"
  else
    ansible_host="$name"
  fi

  guest_os=""
  guest_id=""
  if [[ -n "$vm_json" && "$vm_json" != "null" ]]; then
    guest_os="$(echo "$vm_json" | jq -r '.Guest.GuestFullName // ""' 2>/dev/null || true)"
    guest_id="$(echo "$vm_json" | jq -r '.Config.GuestId // ""' 2>/dev/null || true)"
  fi
  # When Tools/guest is empty, GuestId still reflects the configured OS type (e.g. windows2019srv_64Guest)
  if [[ -z "${guest_os//[[:space:]]/}" && -n "$guest_id" ]]; then
    guest_os="$guest_id"
  fi
  [[ -z "${guest_os//[[:space:]]/}" ]] && guest_os="unknown"

  g_l="$(echo "$guest_os" | tr '[:upper:]' '[:lower:]')"
  id_l="$(echo "$guest_id" | tr '[:upper:]' '[:lower:]')"
  n_l="$(echo "$name" | tr '[:upper:]' '[:lower:]')"
  os_family="linux"
  if [[ "$g_l" == *windows* ]]; then
    os_family="windows"
  elif [[ "$id_l" == windows* || "$id_l" == winnet* || "$id_l" == winlonghorn* ]]; then
    os_family="windows"
  elif [[ "$id_l" =~ ^win[0-9] ]]; then
    os_family="windows"
  elif [[ "$n_l" == *windows* || "$n_l" == *win-serve* || "$n_l" == *win201* || "$n_l" == *win202* || "$n_l" == *ws20* ]]; then
    os_family="windows"
  fi

  sb_raw="false"
  if [[ -n "$vm_json" && "$vm_json" != "null" ]]; then
    sb_raw="$(echo "$vm_json" | jq -r '.Config.BootOptions.EfiSecureBootEnabled // false' 2>/dev/null || echo false)"
  fi
  if [[ "$sb_raw" == "true" ]]; then
    secure_boot="ON"
  else
    secure_boot="OFF"
  fi

  firmware="unknown"
  power_state=""
  if [[ -n "$vm_json" && "$vm_json" != "null" ]]; then
    firmware="$(echo "$vm_json" | jq -r '.Config.Firmware // "unknown"' 2>/dev/null || echo unknown)"
    power_state="$(echo "$vm_json" | jq -r '.Runtime.PowerState // ""' 2>/dev/null || true)"
  fi
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
  rows_out=$((rows_out + 1))
# Do not hide find errors (empty CSV is often a failed find or missing GOVC_* in this shell)
done < <(govc find "$FIND_ROOT" -type m || true)

mv -f "$tmp" "$OUT"
trap - EXIT

if [[ "$paths_seen" -eq 0 ]]; then
  echo "vcenter_export_govc: warning: govc find returned no paths (FIND_ROOT=${FIND_ROOT}). Check GOVC_URL/GOVC_USERNAME/GOVC_PASSWORD, GOVC_DATACENTER, GOVC_VM_FIND. Re-run with VCENTER_EXPORT_DEBUG=1" >&2
elif [[ "$rows_out" -eq 0 ]]; then
  echo "vcenter_export_govc: warning: 0 rows written despite ${paths_seen} paths (unexpected)" >&2
fi
echo "vcenter_export_govc: paths=${paths_seen} rows=${rows_out} -> ${OUT}" >&2

echo "Wrote $OUT"
echo "Next: export VCENTER_CSV=\"$OUT\" && ./inventory/vcenter_csv_inventory.sh --list"
