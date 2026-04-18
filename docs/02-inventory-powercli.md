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

### 1) Export (script in this repo)

From the repo’s `ansible` folder (or any path to the script):

```powershell
cd ansible
# Lab / self-signed vCenter TLS:
.\inventory\vcenter_export_powercli.ps1 -VIServer vcenter.example.com -OutCsv C:\exports\secureboot_inventory_full.csv -IgnoreInvalidCertificate

# Or with explicit credentials:
$cred = Get-Credential
.\inventory\vcenter_export_powercli.ps1 -VIServer 192.168.100.141 -Credential $cred -OutCsv .\secureboot_inventory_full.csv -IgnoreInvalidCertificate
```

`ansible/inventory/vcenter_export_powercli.ps1` writes the **same column layout** as `vcenter_export_govc.sh` (`check`, `vm_name`, `ansible_host`, `os_family`, `guest_os`, …) so you can swap tools without changing Ansible. Each row has `check=true`; edit the CSV and set `check` to `false` for VMs to skip.

If you cannot run scripts, you can still use `Connect-VIServer` / `Get-VM` / `Export-Csv` manually; align column names with `ansible/samples/vcenter_targets.csv` and `vcenter_csv_inventory.py`.

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

- **`jq`:** `dnf install jq` (RHEL/Fedora).
- **`govc`:** usually install the binary from [govmomi releases](https://github.com/vmware/govmomi/releases) (there is no standard RHEL package). Example for **x86_64**:

```bash
cd /tmp
curl -fL -o govc.tar.gz "https://github.com/vmware/govmomi/releases/download/v0.53.0/govc_Linux_x86_64.tar.gz"
tar -xzf govc.tar.gz govc
sudo install -m 0755 govc /usr/local/bin/govc
govc version
```

For **aarch64**, use `govc_Linux_arm64.tar.gz` instead. Pick the matching asset from the release page if you use a different version.

**TLS / certificate:** If you connect by IP and see `x509: ... doesn't contain any IP SANs`, either use `export GOVC_INSECURE=1` in lab environments or connect with the **hostname** that matches the vCenter certificate and fix DNS/`/etc/hosts`.

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

**Troubleshooting (CSV only has a header row, `wc -l` is 1):** Usually `govc find` returned nothing in that shell — set `GOVC_URL`, credentials, `GOVC_INSECURE` if needed, and scope the search, e.g. `export GOVC_DATACENTER='YourDC'` and `export GOVC_VM_FIND='/YourDC/vm'`. Run `govc find "$GOVC_VM_FIND" -type m | head` manually first. For more detail from the export script: `VCENTER_EXPORT_DEBUG=1 ./inventory/vcenter_export_govc.sh`.

---

## After export (both paths)

- **Narrow scope:** Edit the CSV so only VMs you want assessed have `check=true`, or use a smaller file and set `VCENTER_CSV` accordingly.
- **Field notes:** IP and hostname work best when **VMware Tools** is running in the guest. If `GuestFullName` is empty, the govc export uses **`Config.GuestId`** (e.g. `windows2019srv_64Guest`) and VM name hints so **Windows VMs are not misclassified as Linux**. Secure Boot / firmware in the CSV come from vSphere config; powered-off or template VMs may show `unknown` until Tools report guest details; the assessment playbook still verifies on the guest.

---

## References

| Artifact | Role |
|----------|------|
| `ansible/inventory/vcenter_export_govc.sh` | vCenter → CSV (govc; Path B) |
| `ansible/inventory/vcenter_export_powercli.ps1` | vCenter → CSV (PowerCLI; Path A) |
| `ansible/inventory/vcenter_csv_inventory.sh` | Run dynamic inventory CLI on Linux/macOS (`python3` → `vcenter_csv_inventory.py`) |
| `ansible/inventory/vcenter_csv_inventory.py` | Column aliases and `VCENTER_*` variables |
| [18-ansible-secureboot-ca-assessment.md](18-ansible-secureboot-ca-assessment.md) | Run the Secure Boot CA assessment playbook |
