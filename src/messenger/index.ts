import { RTMClient } from "@slack/client";
import SlackAPIClient from "../client/index";
import { SlackCurrentUser, IStore, IMessenger } from "../interfaces";

const RTMEvents = {
  AUTHENTICATED: "authenticated",
  MESSAGE: "message",
  ERROR: "unable_to_rtm_start"
};

const EventSubTypes = {
  EDITED: "message_changed",
  DELETED: "message_deleted"
};

class SlackMessenger implements IMessenger {
  rtmClient: RTMClient;

  constructor(private store: IStore) {
    // We can also use { useRtmConnect: false } for rtm.start
    // instead of rtm.connect, which has more fields in the payload
    this.rtmClient = new RTMClient(store.slackToken);
  }

  start = (): Promise<SlackCurrentUser> => {
    return new Promise((resolve, reject) => {
      this.rtmClient.once(RTMEvents.AUTHENTICATED, response => {
        const { ok, team, self } = response;
        if (ok) {
          const { id, name } = self;
          const { id: teamId, name: teamName } = team;
          return resolve({
            token: this.store.slackToken,
            id,
            name,
            teamId,
            teamName
          });
        }
      });

      this.rtmClient.once(RTMEvents.ERROR, error => {
        return reject(error);
      });

      this.rtmClient.start();
    });
  };

  updateCurrentChannel() {
    const { lastChannel: channel } = this.store;

    this.rtmClient.on(RTMEvents.MESSAGE, event => {
      if (channel.id === event.channel) {
        const { subtype } = event;
        let newMessages = {};

        switch (subtype) {
          case EventSubTypes.DELETED:
            const { deleted_ts } = event;
            newMessages[deleted_ts] = undefined;
            break;

          case EventSubTypes.EDITED:
            const { message } = event;
            newMessages[message.ts] = {
              userId: message.user,
              text: message.text,
              timestamp: message.ts,
              isEdited: !!message.edited
            };
            break;

          default:
            const { user: userId, text, ts: timestamp } = event;
            if (text) {
              // Some messages (like keep-alive) have no text, we ignore them
              newMessages[timestamp] = {
                userId,
                text,
                timestamp
              };
            }
        }

        this.store.updateMessages(newMessages);
      }
    });

    this.store.clearMessages();
    this.store.loadChannelHistory();
  }

  stripLinkSymbols = (text: string): string => {
    // To send out live share links and render them correctly,
    // we append </> to the link text. However, this is not
    // handled by normal Slack clients, and should be removed before
    // we actually send the message via the RTM API

    // This is hacky, and we will need a better solution - perhaps
    // we could make all rendering manipulations on the extension side
    // before sending the message to Vuejs for rendering
    if (text.startsWith("<") && text.endsWith(">")) {
      return text.substr(1, text.length - 2);
    } else {
      return text;
    }
  };

  sendMessage(text: string) {
    // The rtm gives an error while sending messages. Might be related to
    // https://github.com/slackapi/node-slack-sdk/issues/527
    // https://github.com/slackapi/node-slack-sdk/issues/550
    //
    // So we use the webclient instead of
    // this.rtmClient.sendMessage(cleanText, id)
    const cleanText = this.stripLinkSymbols(text);
    const { id } = this.store.lastChannel;
    const client = new SlackAPIClient(this.store.slackToken);
    return client
      .sendMessage({ channel: id, text: cleanText })
      .then((result: any) => {
        let newMessages = {};
        newMessages[result.ts] = {
          userId: this.store.currentUserInfo.id,
          text: text,
          timestamp: result.ts
        };
        this.store.updateMessages(newMessages);
      })
      .catch(error => console.error(error));
  }
}

export default SlackMessenger;
