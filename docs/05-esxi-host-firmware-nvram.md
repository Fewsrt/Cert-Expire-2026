# ESXi host firmware + NVRAM/UEFI variables

## Do we need to update host BIOS/UEFI firmware?

Usually: **no hard requirement** just because you’re rolling out Windows UEFI CA 2023.
The update is performed inside Windows (guest) and updates the VM’s UEFI variables (db/KEK/dbx).

That said, staying current on vendor firmware is recommended when troubleshooting UEFI variable/NVRAM persistence issues.

## NVRAM / UEFI variables — why it matters

In VMware VMs, UEFI configuration and Secure Boot databases are stored as UEFI variables persisted into the VM’s **NVRAM file** (commonly `*.nvram`).

When Windows runs the Secure Boot update task, it attempts to write updated UEFI variables. If those writes don’t persist, you’ll see “update ran but after reboot nothing changed”.

### Symptoms
- Update task runs, reboot, but CA 2023 not present
- `UEFICA2023Status` doesn’t reach expected value
- State appears to reset after reboot

### Remediation order (practical)
1. Patch ESXi to latest build in your major version
2. Ensure datastore is healthy/writable; watch for snapshot chain issues
3. Update server BIOS/UEFI firmware + BMC (iDRAC/iLO)
4. Prefer ESXi 8 for affected workloads

### ESXi 8 note
ESXi 8 is generally better, but **NVRAM/UEFI persistence problems can still exist**.

Broadcom KB notes two ESXi 8-relevant NVRAM/PK/KEK failure patterns:
- **KB 421593**: VMs originally created on ESXi versions earlier than 8.0.2 may have a legacy `*.nvram` that does not include the expected **Microsoft Corporation KEK CA 2023** until the NVRAM is regenerated.
- **KB 423919**: VMs with an invalid **Platform Key (PK)** signature can fail automated updates to Secure Boot databases (DB/DBX/KEK) on ESXi 7.x/8.x.

Treat ESXi 8 as a risk reducer, not a guarantee.

Refs:
- https://knowledge.broadcom.com/external/article/421593/missing-microsoft-corporation-kek-ca-202.html
- https://knowledge.broadcom.com/external/article/423919/manual-update-of-the-secure-boot-platfor.html

## Can we dump host BIOS PK/KEK/db/dbx from ESXi?
Not in a standard, portable way from ESXi/vCenter. Use vendor tooling (iDRAC/iLO/XCC) or BIOS setup UI.
