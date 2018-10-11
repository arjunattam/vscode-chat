import * as vsls from "vsls/vscode";
import { User, Message } from "../types";

export const VSLS_SERVICE_NAME = "vsls-chat-1";

export const VSLS_CHANNEL_ID = "vsls-channel-id";

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
  const { displayName } = peer.user;
  const avatarId = `${displayName}${peerNumber.toString()}`;
  const avatar = `http://tinygraphs.com/squares/${avatarId}?theme=seascape&numcolors=3&size=220&fmt=svg`;
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
  message: "message"
};

export const NOTIFICATION_NAME = {
  message: "message"
};
