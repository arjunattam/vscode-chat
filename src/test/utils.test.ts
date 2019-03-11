import * as assert from "assert";
import { sanitiseTokenString } from "../utils";

suite("utility function tests", function() {
  setup(() => {});

  test("sanitise token works", function() {
    assert.equal(sanitiseTokenString('"token"'), "token");
    assert.equal(sanitiseTokenString(" token"), "token");
    assert.equal(sanitiseTokenString(' "token"'), "token");
  });
});
