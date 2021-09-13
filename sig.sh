#!/usr/bin/env bash

export AWS_REGION=eu-west-1

# Usage: ./sig.sh  keys|console  [account  [role]]
npx ts-node aws/index.ts $1 "https://vault.platformservices.io" "aws/aws-isp-" "https://www.skybet.com/" "eu-west-1" ${@:2}

export AWS_PROFILE=`cat ./current_aws_account`;
rm ./current_aws_account
if [ -z ${AWS_PROFILE} ]; then
  unset AWS_PROFILE
fi

exec $SHELL -i
