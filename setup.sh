#!/bin/bash

set -e

yarn install
forge install
chmod +x patch-oz-version.sh
./patch-oz-version.sh
yarn hardhat compile
