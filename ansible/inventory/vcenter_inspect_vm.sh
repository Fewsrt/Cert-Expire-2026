#!/usr/bin/env sh
# Pretty-print key fields for ONE VM (govc + jq). Same env as vcenter_export_govc.sh.
#
# Usage:
#   export GOVC_URL GOVC_USERNAME GOVC_PASSWORD
#   export GOVC_INSECURE=1   # if needed
#   ./inventory/vcenter_inspect_vm.sh /SSGLAB_Datacenter/vm/MyVM
#
# If you only know the VM name, find the path first:
#   govc find / -type m | grep -i 'MyVM$'

set -eu

if [ -z "${1:-}" ]; then
  echo "Usage: $0 /Datacenter/vm/FolderOrVmName" >&2
  echo "Example: $0 /SSGLAB_Datacenter/vm/SL-6-17" >&2
  exit 2
fi

VM_PATH="$1"

command -v govc >/dev/null 2>&1 || { echo "govc not found" >&2; exit 127; }
command -v jq >/dev/null 2>&1 || { echo "jq not found" >&2; exit 127; }

if [ -z "${GOVC_URL:-}" ]; then
  echo "Set GOVC_URL (and credentials)" >&2
  exit 2
fi

echo "=== govc vm.info (summary) ==="
govc vm.info "$VM_PATH" 2>&1 || exit 1

echo ""
echo "=== JSON fields (inventory-relevant) ==="
govc vm.info -json "$VM_PATH" | jq '.VirtualMachines[0] | {
  Name,
  GuestId: .Config.GuestId,
  GuestFullName: .Guest.GuestFullName,
  HostName: .Guest.HostName,
  Firmware: .Config.Firmware,
  PowerState: .Runtime.PowerState,
  EfiSecureBootEnabled: .Config.BootOptions.EfiSecureBootEnabled
}'

echo ""
echo "=== Guest IPv4 (govc vm.ip) ==="
govc vm.ip -esxi=false -wait=0 "$VM_PATH" 2>&1 || true
