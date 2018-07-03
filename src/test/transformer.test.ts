import * as assert from "assert";
import {
  markdownify,
  snippetBreaks,
  parseLinks
} from "../controller/transformers";

const getMessage = (text: string) => ({
  timestamp: {
    content: {
      text,
      author: "",
      footer: "",
      title: "",
      titleLink: "",
      pretext: ""
    },
    timestamp: "",
    userId: ""
  }
});

suite("Transformer tests", function() {
  test("Snippet line break works", function() {
    const INPUT = "```asd```";
    const OUTPUT = "```\nasd\n```";
    assert.deepEqual(snippetBreaks(getMessage(INPUT)), getMessage(OUTPUT));

    const INPUT_2 = "prefix ```asd```";
    const OUTPUT_2 = "prefix ```\nasd\n```";
    // TODO(arjun): fix this test
    // assert.deepEqual(snippetBreaks(getMessage(INPUT_2)), getMessage(OUTPUT_2));
  });

  test("Markdown transform works", function() {
    const INPUT = "```\nasd\n```";
    const OUTPUT = `<pre><code>asd\n</code></pre>\n`;
    assert.equal(
      markdownify(getMessage(INPUT)).timestamp.content.textHTML,
      OUTPUT
    );

    const INPUT_2 = "new\nline";
    const OUTPUT_2 = "<p>new<br>\nline</p>\n";
    assert.equal(
      markdownify(getMessage(INPUT_2)).timestamp.content.textHTML,
      OUTPUT_2
    );

    const INPUT_3 = "[link](href_value)";
    const OUTPUT_3 =
      '<p><a href="href_value" onclick="openLink(\'href_value\'); return false;">link</a></p>\n';
    assert.equal(
      markdownify(getMessage(INPUT_3)).timestamp.content.textHTML,
      OUTPUT_3
    );
  });

  test("Link parser works", function() {
    const INPUT_1 = "<https://markdown-it.github.io/markdown-it?query>";
    const OUTPUT_1 =
      "[https://markdown-it.github.io/markdown-it?query](https://markdown-it.github.io/markdown-it?query)";
    assert.equal(
      parseLinks(getMessage(INPUT_1)).timestamp.content.text,
      OUTPUT_1
    );

    const INPUT_2 =
      "prefix <https://markdown-it.github.io/markdown-it/#MarkdownIt.configure|2 new commits> suffix";
    const OUTPUT_2 =
      "prefix [2 new commits](https://markdown-it.github.io/markdown-it/#MarkdownIt.configure) suffix";
    assert.equal(
      parseLinks(getMessage(INPUT_2)).timestamp.content.text,
      OUTPUT_2
    );

    const INPUT_3 =
      "(<https://github.com/karigari/vscode-chat/compare/f4f68e2e4bd6...9b0b1df6df93|9b0b1df>)";
    const OUTPUT_3 =
      "([9b0b1df](https://github.com/karigari/vscode-chat/compare/f4f68e2e4bd6...9b0b1df6df93))";
    assert.equal(
      parseLinks(getMessage(INPUT_3)).timestamp.content.text,
      OUTPUT_3
    );

    const INPUT_4 =
      "Build <https://travis-ci.org/karigari/vscode-chat/builds/399150058?utm_source=slack&amp;utm_medium=notification|#56> (<https://github.com/karigari/vscode-chat/compare/f4f68e2e4bd6...9b0b1df6df93|9b0b1df>) of karigari/vscode-chat@master by Arjun Attam passed in 2 min 14 sec";
    const OUTPUT_4 =
      "Build [#56](https://travis-ci.org/karigari/vscode-chat/builds/399150058?utm_source=slack&amp;utm_medium=notification) ([9b0b1df](https://github.com/karigari/vscode-chat/compare/f4f68e2e4bd6...9b0b1df6df93)) of karigari/vscode-chat@master by Arjun Attam passed in 2 min 14 sec";
    assert.equal(
      parseLinks(getMessage(INPUT_4)).timestamp.content.text,
      OUTPUT_4
    );
  });
});
