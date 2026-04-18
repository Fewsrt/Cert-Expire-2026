#!/usr/bin/env sh
# Pretty-print key fields for ONE VM (govc + jq). Same env as vcenter_export_govc.sh.
#
# Usage:
#   export GOVC_URL GOVC_USERNAME GOVC_PASSWORD
#   export GOVC_INSECURE=1   # if needed
#   ./inventory/vcenter_inspect_vm.sh /SSGLAB_Datacenter/vm/Folder/.../VMName
#
# If you only know the VM name, find the full path first (VMs are often nested):
#   govc find /SSGLAB_Datacenter/vm -type m | grep -i 'SL-6-17$'

set -eu

if [ -z "${1:-}" ]; then
  echo "Usage: $0 /Datacenter/vm/.../VMName" >&2
  echo "Example: $0 /SSGLAB_Datacenter/vm/Secureboot/esx8/win2019esx8secure" >&2
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
govc vm.info "$VM_PATH" 2>&1 || {
  echo "govc vm.info failed — check path (use: govc find / -type m | grep -i 'Name\$')" >&2
  exit 1
}

echo ""
echo "=== JSON fields (inventory-relevant) ==="
json=$(govc vm.info -json "$VM_PATH" 2>/dev/null) || {
  echo "govc vm.info -json failed — check path and GOVC_*" >&2
  exit 1
}

n=$(echo "$json" | jq -r '.VirtualMachines | length // 0')
if [ "$n" = "0" ]; then
  echo "VirtualMachines is empty — path may be wrong (VMs are often under subfolders) or object is not a VM." >&2
  echo "Try: govc find /SSGLAB_Datacenter/vm -type m | grep -i \"$(basename "$VM_PATH")\"" >&2
  exit 1
fi

echo "$json" | jq '.VirtualMachines[0] | {
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
# Do not use -esxi / -wait: older govc builds omit these flags on vm.ip
govc vm.ip "$VM_PATH" 2>&1 || true
