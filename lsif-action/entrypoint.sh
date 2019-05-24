#!/bin/sh -l

npm install
npm install -g lsif-tsc
lsif-tsc --projectRoot tsconfig.json
