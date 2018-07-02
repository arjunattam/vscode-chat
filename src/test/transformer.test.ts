import * as assert from "assert";
import {
  markdownify,
  snippetBreaks,
  parseLinks
} from "../controller/transformers";

suite("Transformer tests", function() {
  test("Snippet line break works", function() {
    const INPUT = {
      timestamp: { text: "```asd```", timestamp: "", userId: "" }
    };
    const OUTPUT = {
      timestamp: { text: "```\nasd\n```", timestamp: "", userId: "" }
    };
    assert.deepEqual(snippetBreaks(INPUT), OUTPUT);

    const INPUT_2 = {
      timestamp: { text: "prefix ```asd```", timestamp: "", userId: "" }
    };
    const OUTPUT_2 = {
      timestamp: { text: "prefix ```\nasd\n```", timestamp: "", userId: "" }
    };

    // TODO(arjun): fix this test
    // assert.deepEqual(snippetBreaks(INPUT_2), OUTPUT_2);
  });

  test("Markdown transform works", function() {
    const INPUT = {
      timestamp: { text: "```\nasd\n```", timestamp: "", userId: "" }
    };
    const OUTPUT = `<code>asd</code>`;
    assert.equal(markdownify(INPUT).timestamp.textHTML, OUTPUT);

    const INPUT_2 = {
      timestamp: { text: "new\nline", timestamp: "", userId: "" }
    };
    const OUTPUT_2 = "new<br>\nline";
    assert.equal(markdownify(INPUT_2).timestamp.textHTML, OUTPUT_2);
  });

  test("Link parser works", function() {
    const INPUT_1 = {
      timestamp: {
        text: "<https://markdown-it.github.io/markdown-it?query>",
        timestamp: "",
        userId: ""
      }
    };
    const OUTPUT_1 =
      "[https://markdown-it.github.io/markdown-it?query](https://markdown-it.github.io/markdown-it?query)";
    assert.equal(parseLinks(INPUT_1).timestamp.text, OUTPUT_1);

    const INPUT_2 = {
      timestamp: {
        text:
          "prefix <https://markdown-it.github.io/markdown-it/#MarkdownIt.configure|2 new commits> suffix",
        timestamp: "",
        userId: ""
      }
    };
    const OUTPUT_2 =
      "prefix [2 new commits](https://markdown-it.github.io/markdown-it/#MarkdownIt.configure) suffix";
    assert.equal(parseLinks(INPUT_2).timestamp.text, OUTPUT_2);

    const INPUT_3 = {
      timestamp: {
        text:
          "(<https://github.com/karigari/vscode-chat/compare/f4f68e2e4bd6...9b0b1df6df93|9b0b1df>)",
        timestamp: "",
        userId: ""
      }
    };
    const OUTPUT_3 =
      "([9b0b1df](https://github.com/karigari/vscode-chat/compare/f4f68e2e4bd6...9b0b1df6df93))";
    assert.equal(parseLinks(INPUT_3).timestamp.text, OUTPUT_3);

    const INPUT_4 = {
      timestamp: {
        text:
          "Build <https://travis-ci.org/karigari/vscode-chat/builds/399150058?utm_source=slack&amp;utm_medium=notification|#56> (<https://github.com/karigari/vscode-chat/compare/f4f68e2e4bd6...9b0b1df6df93|9b0b1df>) of karigari/vscode-chat@master by Arjun Attam passed in 2 min 14 sec",
        timestamp: "",
        userId: ""
      }
    };
    const OUTPUT_4 =
      "Build [#56](https://travis-ci.org/karigari/vscode-chat/builds/399150058?utm_source=slack&amp;utm_medium=notification) ([9b0b1df](https://github.com/karigari/vscode-chat/compare/f4f68e2e4bd6...9b0b1df6df93)) of karigari/vscode-chat@master by Arjun Attam passed in 2 min 14 sec";
    assert.equal(parseLinks(INPUT_4).timestamp.text, OUTPUT_4);
  });
});
