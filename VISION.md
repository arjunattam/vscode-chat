# Vision

This doc outlines our vision and product roadmap. The goal is to crystallize the driving ideas: for our community of users and contributors. On a tactical level, this will also help us prioritize feature requests.

Suggestions to update this document are very welcome. Feel free to raise an issue or a pull request! My DMs are also open at [@arjunattam](http://twitter.com/arjunattam).

## The goal

Editors have been historically built to maximize the productivity of one developer. In addition to their editor, developers working in teams use version control tools, and many other services: for project management, continuous integration, and real-time bug tracking.

Personified as bots on Slack, these services have evolved to become our peers in shipping quality code: our services and our teammates now work in tandem. But there is one gap: this collaboration happens one step away from our code, and that leads to context switches, and consequently knowledge falling through the cracks.

This extension is an experiment to see how the editor can evolve to become the center of collaboration for engineering teams. Perhaps like an IDE for our teams, to maximize team productivity.

## Use-cases

I think of collaboration on an axis of real-time: there are synchronous use-cases on one end (like pair programming), and asynchronous ones on the other (reviewing pull requests). The target use-cases for this extension are to cover the area from the mid-point to the sync extreme. This might imply that the extension would not work for teams that collaborate only asynchronously, such as some open source projects that might have longer development cycles.

### Sync collaboration

Chat is a natural fit for synchronous collaboration, and therefore these use-cases will be a focus. Integration with the excellent [VS Live Share extension](https://aka.ms/vsls) is and will continue to be a focus area.

### Pseudo-sync collaboration

Engineering teams that run on Slack often collaborate in a pseudo-synchronous level, where collaboration is close to real-time, except when developers are deep in their code. Slack assists this, and the goal is to improve that experience.

For example, the following frequent tasks should take just a click

- Open a failed build log from your remote CI tool, and go to the failed tests in the code
- Open a teammate's commit diff for a quick code review on chat
- Open a Sentry crash report inside the VS Code debugger, to show state of the call stack and variable values at the time of the crash

And you will have your teammates alongside for a quick question for any of the above. Pseudo-sync use-cases are also a good place for teams to start sync sessions, and the extension will assist that transition.

## Chat providers

While Slack offered us an excellent API to kick-start the above, there is no reason for this extension to be tied to just Slack. The goal is to support other chat providers that teams use. See [PROVIDERS](docs/PROVIDERS.md) for more details on how that works.

## Healthy notifications

Chat notifications can be unhealthy: we need our focused time to think deeply about the code we write. The extension will always prioritize this need, and strive for a healthy balance between collaboration and focused solo time.
