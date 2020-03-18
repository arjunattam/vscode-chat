import * as EmojiConvertor from "emoji-js";

export const parseUsernames = (uiMessage: UIMessage): UIMessage => {
    // Find and replace names like <@UBCQ8LF28>
    // TODO: fix this for channel names, which show up as <#C8A187ZRQ|general>
    const { messages, users } = uiMessage;
    let newMessages: ChannelMessages = {};

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
    // allow_native. If this changes, we might have to use emoji sheets (through CDN?)
    emoji.replace_mode = "unified";
    let emojifiedMessages: ChannelMessages = {};

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

const parseSimpleLinks = (messages: ChannelMessages): ChannelMessages => {
    let parsed: ChannelMessages = {};

    Object.keys(messages).forEach(key => {
        const { content, text } = messages[key];
        let newContent: MessageContent | undefined = undefined;
        const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=;\^]*)/;
        const re = new RegExp(`${URL_REGEX.source}`, "g");

        if (!!content) {
            newContent = {
                ...content,
                text: content.text
                ? content.text.replace(re, function(a, b, c, d, e) {
                    return `[${a}](${a})`;
                })
                : "",
                footer: content.footer
                ? content.footer.replace(re, function(a, b, c, d, e) {
                    return `[${a}](${a})`;
                })
                : ""
            };
        }

        parsed[key] = {
            ...messages[key],
            text: text
            ? text.replace(re, function(a, b, c, d, e) {
                return `[${a}](${a})`;
            })
            : "",
            content: newContent
        };
    });
    return parsed;
}

export const parseSlackLinks = (messages: ChannelMessages): ChannelMessages => {
    // Looks for <url|title> pattern, and replaces them with normal markdown
    // The |pattern can be optional
    let parsed: ChannelMessages = {};

    Object.keys(messages).forEach(key => {
        const { content, text } = messages[key];
        let newContent: MessageContent | undefined = undefined;
        const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=;\^]*)/;
        const SLACK_MODIFIER = /(|.[^><]+)/;
        const re = new RegExp(`<(${URL_REGEX.source})(${SLACK_MODIFIER.source})>`, "g");

        if (!!content) {
            newContent = {
                ...content,
                text: content.text
                ? content.text.replace(re, function(a, b, c, d, e) {
                    return e ? `[${e.substr(1)}](${b})` : `[${b}](${b})`;
                })
                : "",
                footer: content.footer
                ? content.footer.replace(re, function(a, b, c, d, e) {
                    return e ? `[${e.substr(1)}](${b})` : `[${b}](${b})`;
                })
                : ""
            };
        }

        parsed[key] = {
            ...messages[key],
            text: text
            ? text.replace(re, function(a, b, c, d, e) {
                return e ? `[${e.substr(1)}](${b})` : `[${b}](${b})`;
            })
            : "",
            content: newContent
        };
    });
    return parsed;
};

const transformChain = (uiMessage: UIMessage): UIMessage => {
    const { messages } = parseUsernames(uiMessage);
    const linkParser = uiMessage.provider === "vslsSpaces" ? parseSimpleLinks : parseSlackLinks;
    return {
        ...uiMessage,
        messages: linkParser(emojify(messages))
    };
};

export default transformChain;
