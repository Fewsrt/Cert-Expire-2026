# Flowcharts

## ASCII flow (portable)

```text
[Start]
   |
   v
[Inventory]
- VM: Firmware=EFI? Secure Boot enabled?
- Host: ESXi version/build
   |
   v
{VM uses UEFI + Secure Boot?}
   |-- No --> [Out of scope (no UEFI CA 2023 rollout needed)]
   |
   `-- Yes --> {Host is ESXi 8.x?}
               |-- Yes --> [Inside Windows guest]
               |           - Opt-in MicrosoftUpdateManagedOptIn=1
               |           - Run Scheduled Task: \Microsoft\Windows\PI\Secure-Boot-Update
               |           - Reboot
               |           - Verify: CA 2023 in db + UEFICA2023Status OK
               |           - Report COMPLIANT
               |
               `-- No (ESXi 7.x) --> [Higher risk: UEFI variables may not persist]
                                     - Patch ESXi 7 to latest build
                                     - Retry Windows guest steps
                                     - If still failing: update server BIOS/UEFI firmware + BMC
                                     - If still failing: migrate to ESXi 8 + upgrade VM compatibility

Failure path (anywhere verification fails):
- Retry task + reboot
- Collect evidence (status, logs)
- Escalate per remediation list above
```

## Mermaid (optional)

```mermaid
flowchart TD
  A[Start] --> B["Inventory:<br/>VM Firmware = EFI + Secure Boot?<br/>Host ESXi version/build?"]
  B --> C{VM uses UEFI<br/>+ Secure Boot?}
  C -- No --> Z1["Out of scope<br/>(no UEFI CA 2023 required)"]
  C -- Yes --> D{Host ESXi 8.x?}

  D -- Yes --> E["Inside Windows guest:<br/>Set MicrosoftUpdateManagedOptIn=1<br/>Run Secure-Boot-Update task"]
  E --> F[Reboot VM]
  F --> G["Verify in Windows:<br/>CA 2023 present in db<br/>UEFICA2023Status = OK"]
  G --> H{Compliant?}
  H -- Yes --> I[Report COMPLIANT]
  H -- No --> J["Retry task + reboot<br/>Collect logs"]

  D -- No --> K["ESXi 7.x detected:<br/>UEFI variables may not persist"]
  K --> L["Patch ESXi 7 to latest build"]
  L --> E

  J --> M{Persistent failure?}
  M -- No --> H
  M -- Yes --> N["Update server BIOS/UEFI firmware<br/>+ BMC (iDRAC / iLO)"]
  N --> O{Still failing on ESXi 7?}
  O -- No --> E
  O -- Yes --> P["Migrate VM to ESXi 8<br/>Upgrade VM compatibility"]
  P --> E
```
