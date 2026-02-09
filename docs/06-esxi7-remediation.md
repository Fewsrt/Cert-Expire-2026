# ESXi remediation guidance (7.x/8.x)

## NVRAM / KEK CA 2023 missing (ESXi < 8.0.2 origin)

If a Windows VM only shows **Microsoft Corporation KEK CA 2011** and is missing **KEK CA 2023**, Broadcom notes a common cause:
- The VM’s `*.nvram` was generated when the VM was created on ESXi **earlier than 8.0.2**, and retains legacy certificates even after host upgrade.

**Fix (summary from Broadcom KB 421593):**
1. Power off the VM
2. Upgrade VM compatibility (hardware version) to latest supported
3. Rename the `*.nvram` file on the datastore (keep a backup name)
4. Power on the VM to regenerate a new NVRAM containing the updated certificate list

Ref:
- https://knowledge.broadcom.com/external/article/421593/missing-microsoft-corporation-kek-ca-202.html

## Invalid Platform Key (PK) blocks automated DB/DBX/KEK updates

If automated Secure Boot database updates fail due to invalid PK signature, Broadcom recommends manually updating the VM Platform Key.

**High-level (see KB for full steps + cautions):**
- Shutdown VM, take snapshot
- Add FAT32 disk containing Microsoft PK certificate
- Temporarily set VM advanced param: `uefi.allowAuthBypass = "TRUE"`
- Force EFI setup and enroll PK from the disk
- Remove the bypass param and detach the disk

Important caution:
- If vTPM + BitLocker/LUKS is used, take recovery steps first (recovery key/snapshot/temporarily disable) because changing Secure Boot keys can affect TPM-sealed disk encryption.

Ref:
- https://knowledge.broadcom.com/external/article/423919/manual-update-of-the-secure-boot-platfor.html

## General recommendations

1. Patch ESXi to latest build in your major version
2. Prefer migrating high-risk workloads from ESXi 7 → ESXi 8
3. For persistent failures: validate datastore health, firmware versions, then apply the KB-specific procedures above
