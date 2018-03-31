.PHONY: build
build:
	docker-compose build

.PHONY: test
test:
	docker-compose run --rm --no-deps app yarn test

.PHONY: sh
sh:
	docker-compose run --rm app bash
