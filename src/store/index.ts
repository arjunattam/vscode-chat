/**
 * Stores state around users, channels, messages.
 */
import { SlackChannel, SlackCurrentUser, SlackUsers } from "./interfaces";

export default class Store {
  constructor(
    public slackToken: string,
    public lastChannel: SlackChannel,
    public channels: SlackChannel[],
    public currentUserInfo: SlackCurrentUser,
    public users: SlackUsers
  ) {}
}
