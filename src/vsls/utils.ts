import * as vsls from "vsls/vscode";
import * as gravatar from "gravatar-api";
import { User, Message } from "../types";

export const VSLS_SERVICE_NAME = "vsls-chat-1";

export const VSLS_CHANNEL = {
  id: "vsls-channel-id",
  name: "Live Share Chat"
};

export type VslsChatMessage = {
  userId: string;
  text: string;
  timestamp: string;
};

export const toBaseMessage = (raw: VslsChatMessage): Message => {
  return { ...raw, content: undefined, reactions: [], replies: {} };
};

export const toBaseUser = (peer: vsls.Peer): User => {
  const { peerNumber } = peer;
  const { displayName, emailAddress } = peer.user;
  const avatar = gravatar.imageUrl({
    email: emailAddress,
    parameters: { size: "200", d: "retro" },
    secure: true
  });

  return {
    id: peerNumber.toString(),
    name: displayName,
    fullName: displayName,
    imageUrl: avatar,
    smallImageUrl: avatar,
    isOnline: true
  };
};

export const REQUEST_NAME = {
  message: "message",
  fetchUsers: "fetch_users",
  fetchUserInfo: "fetch_user_info",
  fetchMessages: "fetch_messages"
};

export const NOTIFICATION_NAME = {
  message: "message"
};
