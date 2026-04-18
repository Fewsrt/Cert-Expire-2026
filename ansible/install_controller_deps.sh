#!/usr/bin/env sh
# Install pywinrm/requests into the SAME Python interpreter that runs ansible-playbook.
# On RHEL, pip often targets /usr/bin/python3 while ansible uses /usr/libexec/platform-python.
set -eu

cd "$(dirname "$0")"
REQ="controller-pip-requirements.txt"

pick_python() {
  AP="$(command -v ansible-playbook)"
  if [ -n "${AP:-}" ] && [ -r "$AP" ]; then
    first="$(sed -n '1s/^#!//p' "$AP" | tr -d '\r' | head -1)"
    case "$first" in
      */python*|*/platform-python*)
        if [ -x "$first" ]; then
          echo "$first"
          return
        fi
        ;;
    esac
  fi
  for try in /usr/libexec/platform-python /usr/bin/python3 /usr/bin/python; do
    if [ -x "$try" ]; then
      echo "$try"
      return
    fi
  done
  echo "Could not find a Python interpreter" >&2
  exit 1
}

PY="$(pick_python)"
echo "ansible-playbook: $(command -v ansible-playbook)" >&2
echo "Installing into: $PY" >&2
"$PY" -m pip install -r "$REQ"
"$PY" -c "import winrm; import requests; print('winrm + requests OK')"
