.PHONY: build
build:
	docker-compose build

.PHONY: test
test:
	docker-compose run --rm app yarn test

.PHONY: sh
sh:
	docker-compose run --rm app bash
