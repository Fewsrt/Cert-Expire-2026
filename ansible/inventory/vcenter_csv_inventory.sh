#!/usr/bin/env sh
# Linux/macOS helper: runs vcenter_csv_inventory.py (same CLI as Python).
# Usage (from ansible/):  ./inventory/vcenter_csv_inventory.sh --list
# Optional: ANSIBLE_INVENTORY_PYTHON=/usr/bin/python3

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SCRIPT_PY="${SCRIPT_DIR}/vcenter_csv_inventory.py"

if [ ! -f "$SCRIPT_PY" ]; then
  echo "Missing: $SCRIPT_PY" >&2
  exit 2
fi

if [ -n "${ANSIBLE_INVENTORY_PYTHON}" ]; then
  PYTHON="${ANSIBLE_INVENTORY_PYTHON}"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "python3 or python not found in PATH (set ANSIBLE_INVENTORY_PYTHON)" >&2
  exit 127
fi

exec "$PYTHON" "$SCRIPT_PY" "$@"
