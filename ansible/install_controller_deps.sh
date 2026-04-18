#!/usr/bin/env sh
# Install pywinrm/requests into every Python that might run ansible-playbook (RHEL often has
# both /usr/libexec/platform-python and /usr/bin/python3 with different site-packages).
set -eu

cd "$(dirname "$0")"
REQ="controller-pip-requirements.txt"

echo "install_controller_deps.sh: cwd=$(pwd)" >&2

python_from_shebang() {
  f="$1"
  [ -n "$f" ] && [ -r "$f" ] || return 0
  # Shebang may be "#! /usr/bin/python3.12" (space after #!) — trim so [ -x ] works.
  line="$(sed -n '1s/^#!//p' "$f" | tr -d '\r' | head -1)"
  line="$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  case "$line" in
    */python*|*/platform-python*)
      if [ -x "$line" ]; then
        echo "$line"
      fi
      ;;
  esac
  # Required: with `set -e`, a failed `[ -x ... ]` inside `case` would make the function
  # return non-zero and abort the script at: sh_py="$(python_from_shebang ...)"
  return 0
}

# Unique interpreters: ansible-playbook shebang + common RHEL paths
seen=""
add_py() {
  py="$1"
  case " $seen " in *" $py "*) return ;; esac
  if [ -z "$py" ] || [ ! -x "$py" ]; then
    return
  fi
  seen="$seen $py"
  echo "pip install -> $py" >&2
  "$py" -m pip install -r "$REQ"
}

# Do not use: AP=$(command -v ...) under plain `set -e` — if ansible is missing, some shells exit here.
AP=""
AQ=""
command -v ansible-playbook >/dev/null 2>&1 && AP="$(command -v ansible-playbook)"
command -v ansible >/dev/null 2>&1 && AQ="$(command -v ansible)"
for f in "$AP" "$AQ"; do
  sh_py="$(python_from_shebang "$f")"
  [ -n "$sh_py" ] && add_py "$sh_py"
done
add_py /usr/libexec/platform-python
add_py /usr/bin/python3
# Ansible RPMs often use /usr/bin/python3.12 (or .11) — separate site-packages from python3.
for _sfx in 12 11 10 9; do
  add_py "/usr/bin/python3.${_sfx}"
done

echo "ansible-playbook: ${AP:-?}" >&2
VERIFY="$(python_from_shebang "$AP")"
[ -z "$VERIFY" ] && VERIFY="/usr/libexec/platform-python"
[ -x "$VERIFY" ] || VERIFY="/usr/bin/python3"
echo "Verifying winrm with: $VERIFY (must match: head -1 \"\$(command -v ansible-playbook)\")" >&2
"$VERIFY" -c "import winrm; import requests; print('winrm + requests OK')"
echo "install_controller_deps.sh: done." >&2
