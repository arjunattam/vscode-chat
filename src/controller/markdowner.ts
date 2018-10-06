import * as EmojiConvertor from "emoji-js";
import { UIMessage, ChannelMessages } from "../types";
import * as str from "../strings";
const MarkdownIt = require("markdown-it");
const markdownItSlack = require("markdown-it-slack");

export const parseUsernames = (uiMessage: UIMessage): UIMessage => {
  // Find and replace names like <@UBCQ8LF28>
  const { messages, users } = uiMessage;
  let newMessages = {};
  Object.keys(messages).map(ts => {
    const message = messages[ts];
    let { text } = message;
    const matched = text.match(/<@([A-Z0-9]+)>/);

    if (matched && matched.length > 0) {
      const userId = matched[1];
      if (userId in users) {
        const { name } = users[userId];
        text = text.replace(matched[0], `@${name}`);
      }
    }

    newMessages[ts] = {
      ...message,
      text
    };
  });
  return {
    ...uiMessage,
    messages: newMessages
  };
};

export const emojify = (messages: ChannelMessages): ChannelMessages => {
  // Even though we are using markdown-it-slack, it does not support
  // emoji skin tones. If that changes, we can remove this method.
  const emoji = new EmojiConvertor();
  emoji.allow_native = true;
  // We have added node_modules/emoji-datasource to vscodeignore since we use
  // allow_native. If this changes, we might have to emoji sheeets (through CDN?)
  emoji.replace_mode = "unified";
  let emojifiedMessages = {};

  Object.keys(messages).forEach(key => {
    const message = messages[key];
    const { text, reactions } = message;
    emojifiedMessages[key] = {
      ...message,
      reactions: reactions
        ? reactions.map(reaction => ({
            ...reaction,
            name: emoji.replace_colons(reaction.name)
          }))
        : [],
      text: emoji.replace_colons(text ? text : "")
    };
  });

  return emojifiedMessages;
};

export const parseLinks = (messages: ChannelMessages): ChannelMessages => {
  // Looks for <url|title> pattern, and replaces them with normal markdown
  // The |pattern can be optional
  let parsed = {};
  Object.keys(messages).forEach(key => {
    const { content, text } = messages[key];
    const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=;\^]*)/;
    const SLACK_MODIFIER = /(|.[^><]+)/;
    const re = new RegExp(
      `<(${URL_REGEX.source})(${SLACK_MODIFIER.source})>`,
      "g"
    );
    parsed[key] = {
      ...messages[key],
      text: text
        ? text.replace(re, function(a, b, c, d, e) {
            return e ? `[${e.substr(1)}](${b})` : `[${b}](${b})`;
          })
        : "",
      content: {
        ...content,
        text:
          content && content.text
            ? content.text.replace(re, function(a, b, c, d, e) {
                return e ? `[${e.substr(1)}](${b})` : `[${b}](${b})`;
              })
            : "",
        footer:
          content && content.footer
            ? content.footer.replace(re, function(a, b, c, d, e) {
                return e ? `[${e.substr(1)}](${b})` : `[${b}](${b})`;
              })
            : ""
      }
    };
  });
  return parsed;
};

const getAttachmentLink = ({ name, permalink }) => {
  return `[${name}](${permalink})`;
};

export const markdownify = (messages: ChannelMessages): ChannelMessages => {
  let markdowned = {};
  const md = new MarkdownIt({ breaks: true }).use(markdownItSlack);

  // Override renderer for link_open --> this adds an onclick attribute
  // on links, so that we can open them via message passing. This relies
  // on method `openLink` inside src/ui/static.js
  var defaultRender =
    md.renderer.rules.link_open ||
    function(tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.link_open = function(tokens, idx, options, env, self) {
    const index = tokens[idx].attrIndex("href");
    const value = tokens[idx].attrs[index][1];
    tokens[idx].attrPush(["onclick", `openLink('${value}'); return false;`]);
    tokens[idx].attrPush(["tabindex", "-1"]);
    return defaultRender(tokens, idx, options, env, self);
  };

  const replyParser = reply => {
    const { attachment: replyAttachment, text: replyText } = reply;
    // Replies might not have both attachment and text
    if (!!replyAttachment) {
      const attachmentLink = getAttachmentLink(replyAttachment);
      return {
        ...reply,
        textHTML: md.renderInline(str.UPLOADED_FILE(attachmentLink))
      };
    } else if (!!replyText) {
      return { ...reply, textHTML: md.renderInline(replyText) };
    } else {
      return reply;
    }
  };

  Object.keys(messages).forEach(key => {
    const { content, attachment, text, replies } = messages[key];
    let parsedReplies = {};

    Object.keys(replies).forEach(replyTs => {
      const reply = replies[replyTs];
      parsedReplies[replyTs] = replyParser(reply);
    });

    const link = attachment ? getAttachmentLink(attachment) : ``;
    markdowned[key] = {
      ...messages[key],
      replies: parsedReplies,
      textHTML: attachment
        ? md.render(str.UPLOADED_FILE(link))
        : md.render(text),
      content: {
        ...content,
        textHTML: content && content.text ? md.render(content.text) : ``,
        footerHTML:
          content && content.footer ? md.renderInline(content.footer) : ``
      }
    };
  });

  return markdowned;
};

const transformChain = (uiMessage: UIMessage): UIMessage => {
  const { messages } = parseUsernames(uiMessage);
  return {
    ...uiMessage,
    messages: markdownify(parseLinks(emojify(messages)))
  };
};

export default transformChain;
