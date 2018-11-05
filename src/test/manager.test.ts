import * as assert from "assert";
import { Store } from "../store";
import { Providers } from "../types";
import Manager from "../manager";
import { mock, instance, verify, deepEqual } from "ts-mockito";

let mockedStore = mock(Store);
let store = instance(mockedStore);
let manager: Manager = new Manager(store);

suite("Manager tests", function() {
  setup(() => {
    store.currentUserInfo = {
      id: "user-id",
      name: "user-name",
      // token: "user-token",
      teams: [],
      currentTeamId: "team-id",
      provider: Providers.slack
    };
  });

  test("Get provider works", function() {
    assert.equal(manager.getSelectedProvider(), "slack");
  });

  test("Clear all works", function() {
    manager.clearAll();
    verify(mockedStore.updateCurrentUser(undefined)).once();
    verify(mockedStore.updateLastChannelId(undefined)).once();
    verify(mockedStore.updateChannels(deepEqual([]))).once();
    verify(mockedStore.updateUsers(deepEqual({}))).once();
  });

  test("Authentication check works", function() {
    assert.equal(manager.isAuthenticated(), true);
    store.currentUserInfo = undefined;
    assert.equal(manager.isAuthenticated(), false);
  });
});
