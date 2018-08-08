import * as EmojiConvertor from "emoji-js";
import { UiMessage, SlackChannelMessages } from "../interfaces";
import * as str from "../strings";
const MarkdownIt = require("markdown-it");
const markdownItSlack = require("markdown-it-slack");

export const emojify = (
  messages: SlackChannelMessages
): SlackChannelMessages => {
  // Even though we are using markdown-it-slack, it does not
  // support emoji skin tones. If that changes, we can remove this method
  const emoji = new EmojiConvertor();
  emoji.allow_native = true;
  emoji.replace_mode = "unified";

  let emojifiedMessages = {};
  Object.keys(messages).forEach(key => {
    const message = messages[key];
    const { text } = message;
    emojifiedMessages[key] = {
      ...message,
      text: emoji.replace_colons(text ? text : "")
    };
  });

  return emojifiedMessages;
};

export const parseLinks = (
  messages: SlackChannelMessages
): SlackChannelMessages => {
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

export const markdownify = (
  messages: SlackChannelMessages
): SlackChannelMessages => {
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
    return defaultRender(tokens, idx, options, env, self);
  };

  Object.keys(messages).forEach(key => {
    const { content, attachment, text } = messages[key];
    const link = attachment
      ? `[${attachment.name}](${attachment.permalink})`
      : ``;
    markdowned[key] = {
      ...messages[key],
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

const transformChain = (uiMessage: UiMessage): UiMessage => {
  const { messages } = uiMessage;
  return {
    ...uiMessage,
    messages: markdownify(parseLinks(emojify(messages)))
  };
};

export default transformChain;
