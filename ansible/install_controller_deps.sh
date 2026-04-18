#!/usr/bin/env sh
# Install pywinrm/requests into every Python that might run ansible-playbook (RHEL often has
# both /usr/libexec/platform-python and /usr/bin/python3 with different site-packages).
set -eu

cd "$(dirname "$0")"
REQ="controller-pip-requirements.txt"

python_from_shebang() {
  f="$1"
  [ -n "$f" ] && [ -r "$f" ] || return 0
  line="$(sed -n '1s/^#!//p' "$f" | tr -d '\r' | head -1)"
  case "$line" in
    */python*|*/platform-python*) [ -x "$line" ] && echo "$line" ;;
  esac
}

# Unique interpreters: ansible-playbook shebang + common RHEL paths
seen=""
add_py() {
  py="$1"
  case " $seen " in *" $py "*) return ;; esac
  [ -z "$py" ] || [ ! -x "$py" ] && return
  seen="$seen $py"
  echo "pip install -> $py" >&2
  "$py" -m pip install -r "$REQ"
}

AP="$(command -v ansible-playbook)"
AQ="$(command -v ansible 2>/dev/null || true)"
for f in "$AP" "$AQ"; do
  sh_py="$(python_from_shebang "$f")"
  [ -n "$sh_py" ] && add_py "$sh_py"
done
add_py /usr/libexec/platform-python
add_py /usr/bin/python3

echo "ansible-playbook: ${AP:-?}" >&2
VERIFY="$(python_from_shebang "$AP")"
[ -z "$VERIFY" ] && VERIFY="/usr/libexec/platform-python"
[ -x "$VERIFY" ] || VERIFY="/usr/bin/python3"
echo "Verifying winrm with: $VERIFY" >&2
"$VERIFY" -c "import winrm; import requests; print('winrm + requests OK')"
