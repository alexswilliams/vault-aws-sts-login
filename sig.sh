#!/usr/bin/env bash

# Usage: ./sig.sh  keys|console  [account  [role]]
npx ts-node aws/index.ts $1 "https://vault.platformservices.io" "aws/aws-isp-" "https://www.skybet.com/" "eu-west-1" ${@:2}
