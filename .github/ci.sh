#!/bin/bash
set -euxo pipefail

docker version
docker-compose version

time docker-compose build
time docker-compose run --rm --no-deps app yarn test
