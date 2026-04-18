#!/usr/bin/env python3
"""CSV-driven Ansible inventory for Secure Boot CA assessment.

On Linux/macOS, `inventory/vcenter_csv_inventory.sh` runs this file (Python 3 on PATH).

The CSV should come from vCenter/PowerCLI inventory export and include a column
that marks which machines to check. Only rows with check=true are emitted, unless
VCENTER_INCLUDE_ALL is set (useful for full PowerCLI exports without a check column).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path


TRUE_VALUES = {"1", "true", "yes", "y", "on", "check", "enabled"}
FALSE_VALUES = {"", "0", "false", "no", "n", "off", "skip", "disabled"}


def first_value(row: dict[str, str], names: list[str]) -> str:
    lowered = {key.strip().lower(): value for key, value in row.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def truthy(value: str) -> bool:
    normalized = str(value or "").strip().lower()
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    return False


def detect_os_family(row: dict[str, str]) -> str:
    explicit = first_value(row, ["ansible_os_family", "os_family", "target_os_family", "family"])
    text = " ".join(
        [
            explicit,
            first_value(row, ["guest_os", "guestos", "os", "os_name", "GuestFullName", "Guest OS"]),
            first_value(row, ["name", "vm_name", "vmname", "VM", "hostname"]),
        ]
    ).lower()
    if "windows" in text or explicit.lower() == "windows":
        return "windows"
    return "linux"


def row_to_host(row: dict[str, str]) -> tuple[str, dict[str, object]]:
    # PowerCLI/govc CSV samples use VMName, IP, Hostname, SecureBoot (see docs/02-inventory-powercli.md).
    name = first_value(
        row,
        ["ansible_host_name", "hostname", "fqdn", "dns_name", "DNSName", "name", "vm_name", "vmname", "VM"],
    )
    ansible_host = first_value(
        row,
        ["ansible_host", "ip", "ip_address", "IPAddress", "dns_name", "DNSName", "hostname", "fqdn"],
    )
    if ansible_host and "," in ansible_host:
        ansible_host = ansible_host.split(",")[0].strip()
    if not name and ansible_host:
        name = ansible_host
    if not name:
        raise ValueError(f"missing host name in row: {row}")

    os_family = detect_os_family(row)
    vars_: dict[str, object] = {
        "ansible_host": ansible_host or name,
        "target_os_family": os_family,
        "vcenter_vm_name": first_value(row, ["vm_name", "vmname", "VM", "name"]),
        "vcenter_guest_os": first_value(row, ["guest_os", "guestos", "os", "os_name", "GuestFullName", "Guest OS"]),
        "vcenter_power_state": first_value(row, ["power_state", "PowerState"]),
        "vcenter_secure_boot": first_value(row, ["secure_boot", "secureboot", "SecureBoot", "Secure Boot"]),
        "vcenter_firmware": first_value(row, ["firmware", "Firmware"]),
        "vcenter_cluster": first_value(row, ["cluster", "Cluster"]),
        "vcenter_host": first_value(row, ["esxi_host", "vmhost", "VMHost", "Host", "esxi"]),
    }

    ansible_user = first_value(row, ["ansible_user", "user", "username"])
    if ansible_user:
        vars_["ansible_user"] = ansible_user

    ansible_port = first_value(row, ["ansible_port", "port"])
    if ansible_port:
        try:
            vars_["ansible_port"] = int(ansible_port)
        except ValueError:
            vars_["ansible_port"] = ansible_port

    if os_family == "windows":
        vars_.setdefault("ansible_connection", first_value(row, ["ansible_connection"]) or "winrm")
        vars_.setdefault("ansible_shell_type", "powershell")
    else:
        vars_.setdefault("ansible_connection", first_value(row, ["ansible_connection"]) or "ssh")

    return name, vars_


def build_inventory(csv_path: Path, check_column: str, include_all: bool) -> dict[str, object]:
    inventory: dict[str, object] = {
        "all": {"children": ["windows", "linux"]},
        "windows": {"hosts": []},
        "linux": {"hosts": []},
        "_meta": {"hostvars": {}},
    }

    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError(f"CSV has no header: {csv_path}")

        for row in reader:
            check_value = first_value(row, [check_column, "check", "Check", "assess", "Assess", "secureboot_check"])
            if not include_all and not truthy(check_value):
                continue
            host, vars_ = row_to_host(row)
            group = "windows" if vars_["target_os_family"] == "windows" else "linux"
            inventory[group]["hosts"].append(host)  # type: ignore[index]
            inventory["_meta"]["hostvars"][host] = vars_  # type: ignore[index]

    return inventory


def main() -> int:
    # Default CSV path is next to the ansible/ tree (…/ansible/samples/…) so it works no matter
    # whether the shell cwd is repo root, ansible/, or inventory/ (relative paths like
    # "ansible/samples/..." would otherwise point at the wrong file and yield an empty inventory).
    ansible_dir = Path(__file__).resolve().parent.parent
    default_sample_csv = ansible_dir / "samples" / "vcenter_targets.csv"

    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true", help="Emit full inventory JSON")
    parser.add_argument("--host", help="Emit hostvars for one host")
    parser.add_argument(
        "--csv",
        default=os.environ.get("VCENTER_CSV") or str(default_sample_csv),
        help="Path to vCenter/PowerCLI CSV (default: $VCENTER_CSV if set, else ansible/samples/vcenter_targets.csv next to this repo layout)",
    )
    parser.add_argument("--check-column", default=os.environ.get("VCENTER_CHECK_COLUMN", "check"))
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(json.dumps({"_meta": {"hostvars": {}}, "all": {"children": []}}))
        return 0

    include_all = truthy(os.environ.get("VCENTER_INCLUDE_ALL", ""))
    inventory = build_inventory(csv_path, args.check_column, include_all)
    if args.host:
        print(json.dumps(inventory.get("_meta", {}).get("hostvars", {}).get(args.host, {}), indent=2))
        return 0
    if args.list:
        print(json.dumps(inventory, indent=2))
        return 0
    parser.print_help()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        raise SystemExit(1)
