# Changelog

All notable changes to the vscode-chat extension will be documented in this file. This follows the [Keep a Changelog](http://keepachangelog.com/) format.

## [0.4.0] - 2017-07-06

### Added

- Adds "reverse initiation" for VS Live Share: a user can ask another user to host a Live Share session by sending the `/live request` command. The recipient can choose to accept the request, which would kickstart the shared session.

## [0.3.4] - 2017-07-04

### Fixed

- Fixes a bug that showed new messages sent via the extension as blank

## [0.3.3] - 2017-07-03

### Added

- Support for rendering file attachments, code snippets, multi-line messages
- Support for rendering Slack app messages, with author, title, coloured border, and footer
- Support for rendering message edits and deletions

### Fixed

- Fixed click behaviour for links inside messages
