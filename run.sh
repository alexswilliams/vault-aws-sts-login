#!/usr/bin/env bash

set -e

# e.g. ./run.sh "https://my-vault-service.io/" "aws/aws-account-prefix-" "www.my-org-token-issuer.com" "eu-west-1"
npx ts-node aws/index.ts $@
