import * as EmojiConvertor from "emoji-js";
import { UiMessage, SlackMessages } from "../interfaces";
import { REVERSE_SLASH_COMMANDS } from "../constants";
import { getCommand } from "./index";
import * as str from "../strings";
const MarkdownIt = require("markdown-it");

export const emojify = (messages: SlackMessages): SlackMessages => {
  const emoji = new EmojiConvertor();
  emoji.allow_native = true;
  emoji.replace_mode = "unified";

  let emojifiedMessages = {};
  Object.keys(messages).forEach(key => {
    const message = messages[key];
    const { content } = message;
    emojifiedMessages[key] = {
      ...message,
      content: {
        ...content,
        text: emoji.replace_colons(content && content.text ? content.text : "")
      }
    };
  });

  return emojifiedMessages;
};

export const snippetBreaks = (messages: SlackMessages): SlackMessages => {
  // When we use ``` (backticks) to denote a snippet, we need to ensure
  // that the backticks are followed with a newline, because our
  // markdown renderer assumes anything next to the ``` is a language
  // eg, ```python
  let correctedMessages = {};
  Object.keys(messages).forEach(key => {
    const message = messages[key];
    const { content } = message;
    const { text } = content;
    const ticks = "```";
    const leftCorrected =
      text.startsWith(`${ticks}`) && !text.startsWith(`${ticks}\n`)
        ? text.replace(new RegExp(`^${ticks}`), `${ticks}\n`)
        : text;
    const rightCorrected =
      text.endsWith(`${ticks}`) && !text.endsWith(`\n${ticks}`)
        ? leftCorrected.replace(new RegExp(`${ticks}$`), `\n${ticks}`)
        : leftCorrected;
    correctedMessages[key] = {
      ...message,
      content: {
        ...content,
        text: rightCorrected
      }
    };
  });
  return correctedMessages;
};

export const strongAsterix = (messages: SlackMessages): SlackMessages => {
  // TODO(arjun): slack uses * for bolding, but markdown follows **
  return messages;
};

export const parseLinks = (messages: SlackMessages): SlackMessages => {
  // Look for <url|title> pattern. The |pattern can be optional
  let parsed = {};
  Object.keys(messages).forEach(key => {
    const { content } = messages[key];
    const { text, footer } = content;
    const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=;\^]*)/;
    const SLACK_MODIFIER = /(|.[^><]+)/;
    const re = new RegExp(
      `<(${URL_REGEX.source})(${SLACK_MODIFIER.source})>`,
      "g"
    );
    parsed[key] = {
      ...messages[key],
      content: {
        ...content,
        text: text.replace(re, function(a, b, c, d, e) {
          return e ? `[${e.substr(1)}](${b})` : `[${b}](${b})`;
        }),
        footer: footer
          ? footer.replace(re, function(a, b, c, d, e) {
              return e ? `[${e.substr(1)}](${b})` : `[${b}](${b})`;
            })
          : ""
      }
    };
  });
  return parsed;
};

export const markdownify = (messages: SlackMessages): SlackMessages => {
  let markdowned = {};
  const md = new MarkdownIt({ breaks: true });

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
    const { content, attachment } = messages[key];
    const { text, footer } = content;
    const link = attachment
      ? `[${attachment.name}](${attachment.permalink})`
      : ``;
    markdowned[key] = {
      ...messages[key],
      content: {
        ...content,
        textHTML: attachment
          ? md.render(str.UPLOADED_FILE(link))
          : md.render(text),
        footerHTML: footer ? md.renderInline(footer) : ``
      }
    };
  });

  return markdowned;
};

const handleReverseCommands = (messages: SlackMessages): SlackMessages => {
  const handled = {};

  Object.keys(messages).forEach(ts => {
    const { content } = messages[ts];
    let textHTML = content.textHTML;
    const matched = getCommand(content.text);
    if (matched) {
      const { namespace, text } = matched;

      if (namespace in REVERSE_SLASH_COMMANDS) {
        const isValid =
          Object.keys(REVERSE_SLASH_COMMANDS[namespace]).indexOf(text) >= 0;
        if (isValid) {
          // Here we have a valid reverse slash command
          textHTML = `override text html. <a href="#" onclick="sendCommand('/live share'); return false;">Accept</a>`;
        }
      }
    }

    handled[ts] = {
      ...messages[ts],
      content: {
        ...content,
        textHTML
      }
    };
  });

  return handled;
};

const transformChain = (uiMessage: UiMessage): UiMessage => {
  const { messages } = uiMessage;
  return {
    ...uiMessage,
    // IMP: parseLinks must happen before markdownify
    messages: handleReverseCommands(
      markdownify(parseLinks(strongAsterix(snippetBreaks(emojify(messages)))))
    )
  };
};

export default transformChain;
