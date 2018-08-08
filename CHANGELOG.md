# Changelog

All notable changes to the vscode-chat extension will be documented in this file. This follows the [Keep a Changelog](http://keepachangelog.com/) format.

## [0.4.6] - 2018-08-08

### Added

- Added support for marking messages as read
- Improved how multi-party DM group name are shown in the UI

## [0.4.5] - 2018-07-21

### Added

- Added support for network connections via proxies. To setup, add the `chat.proxyUrl` configuration.

## [0.4.4] - 2018-07-17

### Fixed

- Fixed demo gif on the Visual Studio Marketplace

## [0.4.3] - 2018-07-17

### Added

- Open Travis CI logs inside the editor, with the new extensible Providers support. New providers can be create for other Slack bots and integrations.
- New demo gifs and examples in the README.

### Fixed

- Fixed an issue where messages from a previously opened Slack channel would show up in the current view.

## [0.4.2] - 2018-07-15

### Fixed

- Fixed the change channel quick-pick prompt for workspaces that invite guest users.

## [0.4.1] - 2018-07-06

### Added

- Add a "reload channels" option to the channel switcher which refreshes the user/channels list from Slack API.

## [0.4.0] - 2018-07-06

### Added

- Adds "reverse initiation" for VS Live Share: a user can ask another user to host a Live Share session by sending the `/live request` command. The recipient can choose to accept the request, which would kickstart the shared session.

## [0.3.4] - 2018-07-04

### Fixed

- Fixes a bug that showed new messages sent via the extension as blank

## [0.3.3] - 2018-07-03

### Added

- Support for rendering file attachments, code snippets, multi-line messages
- Support for rendering Slack app messages, with author, title, coloured border, and footer
- Support for rendering message edits and deletions

### Fixed

- Fixed click behaviour for links inside messages
