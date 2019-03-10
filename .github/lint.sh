#!/bin/bash
set -euo pipefail

if [[ ! -f config.js ]]; then
  cp config.js.example config.js
fi

set -x
time yarn
time yarn run lint
