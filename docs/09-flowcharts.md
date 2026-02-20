# Flowcharts

## ASCII flow (portable)

```text
[Start]
   |
   v
[Inventory]
- VM: Firmware=EFI? Secure Boot enabled?
- Host: ESXi version/build
- VM origin/age: was the VM created on ESXi < 8.0.2? (KB 421593 risk)
   |
   v
{VM uses UEFI + Secure Boot?}
   |-- No --> [Out of scope (no UEFI CA 2023 rollout needed)]
   |
   `-- Yes --> [Run Windows guest rollout]
               - Set MicrosoftUpdateManagedOptIn=1
               - Run Scheduled Task: \Microsoft\Windows\PI\Secure-Boot-Update
               - Reboot
               - Verify: CA 2023 present + UEFICA2023Status OK
                         |
                         v
                   {Compliant?}
                     |-- Yes --> [Report COMPLIANT]
                     |
                     `-- No --> {Is KEK CA 2023 missing? (KB 421593)}
                                |-- Yes --> [Regenerate VM NVRAM]
                                |           - Power off
                                |           - Upgrade VM compatibility
                                |           - Rename *.nvram (backup)
                                |           - Power on (regen)
                                |           - Re-verify
                                |
                                `-- No --> {PK invalid / secure boot DB updates failing? (KB 423919)}
                                           |-- Yes --> [Manual PK update]
                                           |           - Snapshot
                                           |           - Attach FAT32 disk w/ WindowsOEMDevicesPK.der
                                           |           - Set uefi.allowAuthBypass="TRUE"
                                           |           - Enroll PK in EFI setup
                                           |           - Remove bypass + detach disk
                                           |           - Reboot + re-verify
                                           |
                                           `-- No --> [Generic persistence troubleshooting]
                                                      - Patch ESXi to latest build
                                                      - Validate datastore health/free space/snapshot chain
                                                      - Update server BIOS/UEFI firmware + BMC
                                                      - Prefer ESXi 8 for affected workloads

Notes:
- ESXi 7 has higher risk of UEFI variable persistence issues.
- ESXi 8 reduces risk but is not a guarantee (KB 421593/423919 cover ESXi 8 scenarios).
```

## Mermaid (optional)

```mermaid
flowchart TD
  A[Start] --> B["Inventory:<br/>
  VM Firmware = EFI + Secure Boot?<br/>
  Host ESXi version/build?<br/>
  VM created on ESXi &lt; 8.0.2? (KB 421593 risk)"]

  B --> C{"UEFI + Secure Boot enabled?"}
  C -- No --> Z1["Out of scope<br/>(UEFI CA 2023 not required)"]

  C -- Yes --> E["Windows guest rollout:<br/>
  Set MicrosoftUpdateManagedOptIn=1<br/>
  Run \\Microsoft\\Windows\\PI\\Secure-Boot-Update"]
  E --> F[Reboot VM]

  F --> G["Verify in Windows:<br/>
  CA 2023 present in DB<br/>
  UEFICA2023Status = OK"]
  G --> H{"Compliant?"}

  H -- Yes --> I[Report COMPLIANT]

  H -- No --> K{"KEK CA 2023 missing?<br/>(KB 421593)"}
  K -- Yes --> K1["Regenerate NVRAM:<br/>
  Power off VM<br/>
  Upgrade VM compatibility<br/>
  Rename *.nvram<br/>
  Power on VM"]
  K1 --> G

  K -- No --> M{"PK invalid or DB update failing?<br/>(KB 423919)"}
  M -- Yes --> M1["Manual PK recovery (KB 423919):<br/>
  Snapshot VM<br/>
  Attach FAT32 with WindowsOEMDevicesPK.der<br/>
  Set uefi.allowAuthBypass=TRUE<br/>
  Enroll PK in EFI setup<br/>
  Reboot"]
  M1 --> G

  M -- No --> T["Generic persistence troubleshooting:<br/>
  Patch ESXi host<br/>
  Validate datastore & snapshots<br/>
  Update server BIOS/UEFI + BMC<br/>
  Prefer ESXi 8.x"]
  T --> G

```
