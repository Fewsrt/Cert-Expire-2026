# vCenter inventory export (PowerShell or shell)

Goal: produce a **CSV** that lists VMs from vCenter with enough fields for SSH/WinRM and for Secure Boot context. Ansible reads that file via `VCENTER_CSV` and `ansible/inventory/vcenter_csv_inventory.py` (on Linux/macOS you can use the wrapper `ansible/inventory/vcenter_csv_inventory.sh`, which calls the same Python CLI).

This repo does **not** connect to vCenter from Ansible inventory itself: you **export CSV once** on a jump host (Windows with PowerShell **or** Linux with `sh`/`bash`), then point the controller at the file.

Pick **one** path below — both are supported.

---

## What the CSV must provide

At minimum the dynamic inventory needs a **resolvable target** per VM (`ansible_host` or `ip` / `hostname` / `VMName` — see `vcenter_csv_inventory.py` aliases) and a way to split **Windows vs Linux** (`guest_os` / `os_family`). Optional columns (`secure_boot`, `firmware`, cluster, ESXi host, `PowerState`) become hostvars for context.

The bundled sample shape is `ansible/samples/vcenter_targets.csv`.

---

## Path A — Windows: PowerShell + PowerCLI

Use a Windows host with [VMware PowerCLI](https://developer.broadcom.com/powercli) installed and network access to vCenter.

### 1) Connect and export

```powershell
# Requires: VMware PowerCLI, access to vCenter
Connect-VIServer vcenter.example.com

$report = Get-VM | ForEach-Object {
  $vm = $_
  $guest = $vm.ExtensionData.Guest

  $ips = @()
  if ($guest -and $guest.Net) {
    foreach ($net in $guest.Net) {
      if ($net.IpConfig -and $net.IpConfig.IpAddress) {
        $ips += $net.IpConfig.IpAddress | ForEach-Object { $_.IpAddress }
      }
    }
  }
  $ips = $ips | Where-Object { $_ -and ($_ -notmatch ':') } | Sort-Object -Unique

  $dns = @()
  try {
    if ($guest -and $guest.DnsConfig -and $guest.DnsConfig.IpAddress) {
      $dns += $guest.DnsConfig.IpAddress
    }
  } catch {}
  $dns = $dns | Where-Object { $_ } | Sort-Object -Unique

  [pscustomobject]@{
    check        = "true"
    VMName       = $vm.Name
    IP           = ($ips -join ',')
    OS           = $guest.GuestFullName
    DNS          = ($dns -join ',')
    Hostname     = $guest.HostName
    ToolsStatus  = $guest.ToolsRunningStatus
    Firmware     = $vm.ExtensionData.Config.Firmware
    SecureBoot   = $vm.ExtensionData.Config.BootOptions.EfiSecureBootEnabled
    HWVersion    = $vm.Version
    ESXi         = $vm.VMHost.Version
    ESXiBuild    = $vm.VMHost.Build
    PowerState   = $vm.PowerState
  }
}

$report | Export-Csv -Path secureboot_inventory_full.csv -NoTypeInformation -Encoding utf8
```

`check = "true"` on every row matches what `vcenter_csv_inventory.py` expects; you can later edit the CSV and set `check` to `false` for VMs to skip.

### 2) Move the CSV to your Ansible controller

Copy `secureboot_inventory_full.csv` to the machine where you run Ansible (e.g. scp to RHEL). Then on that controller:

```bash
cd ansible
export VCENTER_CSV=/path/to/secureboot_inventory_full.csv
python3 inventory/vcenter_csv_inventory.py --list
# or, on Linux/macOS:
# ./inventory/vcenter_csv_inventory.sh --list
# ansible-inventory --list
```

---

## Path B — Linux / RHEL: `sh` + `govc`

Use [govc](https://github.com/vmware/govmomi/tree/master/govc) on RHEL or any Linux host that can reach vCenter over HTTPS. The repo ships `ansible/inventory/vcenter_export_govc.sh` (bash) to build the CSV.

### 1) Install `govc` and `jq`

- `govc`: [govmomi releases](https://github.com/vmware/govmomi/releases) on `PATH`, or distro package if available.
- `jq`: e.g. `dnf install jq`.

### 2) Point at vCenter

```bash
export GOVC_URL='https://vcenter.example.com/sdk'
export GOVC_USERNAME='administrator@vsphere.local'
export GOVC_PASSWORD='***'

# Optional: self-signed lab vCenter
# export GOVC_INSECURE=1

# Optional: limit search root
# export GOVC_DATACENTER='DC1'
# export GOVC_VM_FIND='/DC1/vm'
```

### 3) Run the export script (from the `ansible` directory)

```bash
cd ansible
chmod +x inventory/vcenter_export_govc.sh inventory/vcenter_csv_inventory.sh

export VCENTER_EXPORT_CSV=/root/secureboot_inventory_full.csv
./inventory/vcenter_export_govc.sh
```

### 4) Validate inventory

```bash
export VCENTER_CSV=/root/secureboot_inventory_full.csv
./inventory/vcenter_csv_inventory.sh --list
# or: ansible-inventory --list
```

If your CSV has **no** `check` column (older exports), use `export VCENTER_INCLUDE_ALL=true` (see `vcenter_csv_inventory.py`).

---

## After export (both paths)

- **Narrow scope:** Edit the CSV so only VMs you want assessed have `check=true`, or use a smaller file and set `VCENTER_CSV` accordingly.
- **Field notes:** IP and hostname work best when **VMware Tools** is running in the guest. OS family is inferred from guest OS text (`windows` → Windows inventory group). Secure Boot / firmware in the CSV come from vSphere config; the assessment playbook still verifies on the guest.

---

## References

| Artifact | Role |
|----------|------|
| `ansible/inventory/vcenter_export_govc.sh` | vCenter → CSV (govc; Path B) |
| `ansible/inventory/vcenter_csv_inventory.sh` | Run dynamic inventory CLI on Linux/macOS (`python3` → `vcenter_csv_inventory.py`) |
| `ansible/inventory/vcenter_csv_inventory.py` | Column aliases and `VCENTER_*` variables |
| [18-ansible-secureboot-ca-assessment.md](18-ansible-secureboot-ca-assessment.md) | Run the Secure Boot CA assessment playbook |
