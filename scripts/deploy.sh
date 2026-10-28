#!/bin/sh
set -eu
[ "$#" -eq 1 ] || { printf 'Usage: %s ARTIFACT_DIRECTORY\n' "$0" >&2; exit 2; }
exec /usr/bin/python3 -I /usr/local/lib/tashome/release.py deploy "$1"
