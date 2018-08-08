import { RTMClient, RTMClientOptions } from "@slack/client";
import * as HttpsProxyAgent from "https-proxy-agent";
import ConfigHelper from "../configuration";
import SlackAPIClient, { getMessage } from "../client";
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
    let options: RTMClientOptions = {};
    const proxyUrl = ConfigHelper.getProxyUrl();

    if (proxyUrl) {
      options.agent = new HttpsProxyAgent(proxyUrl);
    }

    this.rtmClient = new RTMClient(store.slackToken, options);

    this.rtmClient.on(RTMEvents.MESSAGE, event => {
      const { subtype } = event;
      let newMessages = {};

      switch (subtype) {
        case EventSubTypes.DELETED:
          const { deleted_ts } = event;
          newMessages[deleted_ts] = undefined;
          break;

        case EventSubTypes.EDITED:
          const { message } = event;
          newMessages = { ...getMessage(message) };
          break;

        default:
          const { text } = event;
          if (text) {
            // Some messages (like keep-alive) have no text, we ignore them
            newMessages = {
              ...newMessages,
              ...getMessage(event)
            };
          }
      }

      this.store.updateMessages(event.channel, newMessages);
    });
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
    const { slackToken, lastChannelId: channelId } = this.store;
    const lastTimestamp = this.store.getLastTimestamp();
    const client = new SlackAPIClient(slackToken);

    if (this.store.hasOldReadMarker()) {
      // Mark previous messages as read
      const channel = this.store.getChannel(channelId);

      if (channel) {
        client.markChannel({ channel, ts: lastTimestamp }).then(response => {
          const { ok } = response;
          if (ok) {
            this.store.updateReadMarker(lastTimestamp);
          }
        });
      }
    }

    return client
      .sendMessage({ channel: channelId, text: cleanText })
      .then((result: any) => {
        let newMessages = {};
        newMessages[result.ts] = {
          userId: this.store.currentUserInfo.id,
          timestamp: result.ts,
          text
        };
        this.store.updateMessages(channelId, newMessages);
      })
      .catch(error => console.error(error));
  }
}

export default SlackMessenger;
