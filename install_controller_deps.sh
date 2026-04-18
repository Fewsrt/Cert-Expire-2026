#!/usr/bin/env sh
# Wrapper so this works from repo root: ./install_controller_deps.sh
exec "$(dirname "$0")/ansible/install_controller_deps.sh" "$@"
