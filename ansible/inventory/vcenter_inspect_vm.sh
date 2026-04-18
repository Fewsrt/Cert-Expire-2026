#!/usr/bin/env sh
# Pretty-print key fields for ONE VM (govc + jq). Same env as vcenter_export_govc.sh.
#
# Usage:
#   export GOVC_URL GOVC_USERNAME GOVC_PASSWORD
#   export GOVC_INSECURE=1   # if needed
#   ./inventory/vcenter_inspect_vm.sh /SSGLAB_Datacenter/vm/Folder/.../VMName
#
# If you only know the VM name, find the full path first (VMs are often under subfolders):
#   govc find /SSGLAB_Datacenter/vm -type m | grep -i 'SL-6-17$'

set -eu

if [ -z "${1:-}" ]; then
  echo "Usage: $0 /Datacenter/vm/.../VMName" >&2
  echo "Example: $0 /SSGLAB_Datacenter/vm/Secureboot/esx8/win2019esx8secure" >&2
  exit 2
fi

VM_PATH="$1"
VM_BN=$(basename "$VM_PATH")

command -v govc >/dev/null 2>&1 || { echo "govc not found" >&2; exit 127; }
command -v jq >/dev/null 2>&1 || { echo "jq not found" >&2; exit 127; }

if [ -z "${GOVC_URL:-}" ]; then
  echo "Set GOVC_URL (and credentials)" >&2
  exit 2
fi

echo "=== govc vm.info (summary) ==="
VM_SUMMARY=$(govc vm.info "$VM_PATH" 2>&1) || {
  echo "govc vm.info failed — check path (use: govc find / -type m | grep -i 'Name\$')" >&2
  exit 1
}
printf '%s\n' "$VM_SUMMARY"

UUID=$(printf '%s\n' "$VM_SUMMARY" | sed -n 's/^[[:space:]]*UUID:[[:space:]]*//p' | head -1)

echo ""
echo "=== JSON fields (inventory-relevant) ==="
# vm.info -json sometimes returns VirtualMachines: [] while text output works; try ipath, uuid, name, then object.collect.
json=""
n=0

# 1) inventory path
case "$VM_PATH" in
  /*/vm/*)
    json=$(govc vm.info -json=true -vm.ipath="$VM_PATH" 2>/dev/null) || json=""
    ;;
esac
n=$(printf '%s' "${json:-}" | jq -r '(.VirtualMachines // .virtualMachines // []) | length' 2>/dev/null || echo 0)

# 2) positional
if [ -z "${json:-}" ] || [ "$n" = "0" ]; then
  json=$(govc vm.info -json=true "$VM_PATH" 2>/dev/null) || json=$(govc vm.info -json "$VM_PATH" 2>/dev/null) || json=""
  n=$(printf '%s' "${json:-}" | jq -r '(.VirtualMachines // .virtualMachines // []) | length' 2>/dev/null || echo 0)
fi

# 3) BIOS/inventory UUID (from summary — avoids empty \$VM in manual one-liners)
if [ "$n" = "0" ] && [ -n "${UUID:-}" ]; then
  json=$(govc vm.info -json=true -vm.uuid="$UUID" 2>/dev/null) || json=$(govc vm.info -json -vm.uuid="$UUID" 2>/dev/null) || json=""
  n=$(printf '%s' "${json:-}" | jq -r '(.VirtualMachines // .virtualMachines // []) | length' 2>/dev/null || echo 0)
fi

# 4) short name only
if [ "$n" = "0" ]; then
  json=$(govc vm.info -json=true "$VM_BN" 2>/dev/null) || json=$(govc vm.info -json "$VM_BN" 2>/dev/null) || json=""
  n=$(printf '%s' "${json:-}" | jq -r '(.VirtualMachines // .virtualMachines // []) | length' 2>/dev/null || echo 0)
fi

if [ "$n" != "0" ]; then
  # govc / REST may emit VirtualMachines (PascalCase) or virtualMachines (camelCase); same for Config vs config.
  echo "$json" | jq '(.VirtualMachines[0] // .virtualMachines[0]) | {
  Name: (.Name // .name),
  GuestId: (.Config.GuestId // .config.guestId),
  guest_os: (
    (.Guest.GuestFullName // .guest.guestFullName // .Config.guestFullName // .config.guestFullName) //
    (.Config.GuestId // .config.guestId) // null
  ),
  HostName: (.Guest.HostName // .guest.hostName // null),
  firmware: (.Config.Firmware // .config.firmware // null),
  PowerState: (.Runtime.PowerState // .runtime.powerState // null),
  secure_boot: (.Config.BootOptions.EfiSecureBootEnabled // .config.bootOptions.efiSecureBootEnabled // null)
}'
else
  echo "vm.info -json returned no VirtualMachines; using object.collect (PropertyCollector)..." >&2
  oc=$(govc object.collect -json "$VM_PATH" name guest config runtime 2>/dev/null || true)
  if [ -z "$oc" ]; then
    oc=$(govc collect -json "$VM_PATH" name guest config runtime 2>/dev/null || true)
  fi
  if [ -z "$oc" ] || ! printf '%s' "$oc" | jq -e . >/dev/null 2>&1; then
    echo "Could not read VM via object.collect. Try: govc version; export GOVC_DATACENTER=<DC>" >&2
    exit 1
  fi
  printf '%s' "$oc" | jq '
    (if type == "array" then . else [] end) |
    (map(select((.Name//.name)=="name"))[0] | (.Val//.val)) as $vname |
    (map(select((.Name//.name)=="guest"))[0] | (.Val//.val)) as $guest |
    (map(select((.Name//.name)=="config"))[0] | (.Val//.val)) as $config |
    (map(select((.Name//.name)=="runtime"))[0] | (.Val//.val)) as $runtime |
    {
      Name: ($vname | if type == "string" then . else null end),
      GuestId: ($config | .guestId // .GuestId // null),
      guest_os: (($guest | .guestFullName // .GuestFullName // null) // ($config | .guestId // .GuestId // null)),
      HostName: ($guest | .hostName // .HostName // null),
      firmware: ($config | .firmware // .Firmware // null),
      PowerState: ($runtime | .powerState // .PowerState // null),
      secure_boot: (
        $config
        | (.bootOptions // .BootOptions)
        | if . then (.efiSecureBootEnabled // .EfiSecureBootEnabled // null) else null end
      )
    }
  '
fi

echo ""
echo "=== Guest IPv4 (govc vm.ip) ==="
# Do not use -esxi / -wait: older govc builds omit those flags on vm.ip
govc vm.ip "$VM_PATH" 2>&1 || true
