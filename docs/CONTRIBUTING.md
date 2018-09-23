# Contributing

The repo is actively developed, and you are welcome to [submit feature requests](https://github.com/karigari/vscode-chat/issues/new) and pull requests. [Issues](https://github.com/karigari/vscode-chat/issues) are the best place to look for contribution ideas.

If you want to work on something, just create a discussion thread (on PRs/issues) and we will help you get started.

## Repo structure

The repo has three parts:

1. Main extension code in TypeScript, in `src/**`
2. Webview UI code, written with Vue.js, in `src/webview/**`
3. OAuth service, built with the Serverless framework, in `oauth-service/**`

## Building

Open the project inside VS Code, and start debugging (F5). This will launch a new VS Code window (the extension development host) with the development code. See [this guide](https://code.visualstudio.com/docs/extensions/developing-extensions) to get started with development.

When you run a debug session, the `npm run watch` task starts up. This watches for file changes, recompiles, and you can reload the extension development host window to get the new code.

## Known issue

The watch command does not watch for CSS file changes. This means if you make changes to the `src/ui/static.css` file, you need to restart the `npm run watch` command manually. Best to make CSS changes live, with the Chrome dev tools, and then make file changes.

## Styling

The code is styled with [Prettier](https://prettier.io).

## Tests

`npm run test`

Tests can only be run when VS Code is not running. If you want to run tests alongside development, use VS Code Insiders for development.
