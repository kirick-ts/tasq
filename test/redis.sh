#!/bin/sh

docker run --rm -p 6379:6379 --name tasq-redis redis:6.2-alpine
