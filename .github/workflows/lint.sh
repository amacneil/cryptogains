#!/bin/bash
set -euo pipefail

if [[ ! -f config.js ]]; then
  cp config.js.example config.js
fi

set -x
yarn
yarn run lint
