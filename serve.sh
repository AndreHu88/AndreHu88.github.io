#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
site_destination="${TMPDIR:-/tmp}/blog-jekyll-site"

cd "$script_directory"

if command -v rbenv >/dev/null 2>&1; then
  set -- rbenv exec bundle
else
  set -- bundle
fi

if ! "$@" check; then
  "$@" install
fi
exec "$@" exec jekyll serve \
  --livereload \
  --disable-disk-cache \
  --destination "$site_destination"
