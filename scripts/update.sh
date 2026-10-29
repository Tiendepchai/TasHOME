#!/bin/sh
set -eu
[ "$#" -eq 0 ] || exit 2
exec /usr/bin/python3 -I /usr/local/lib/tashome/release.py update
