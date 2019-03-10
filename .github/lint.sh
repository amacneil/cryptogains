#!/bin/bash
set -euxo pipefail

time yarn
time yarn run lint
