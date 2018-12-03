import * as assert from "assert";
import { Store } from "../store";
import Manager from "../manager";
import { mock, instance, verify, deepEqual, when } from "ts-mockito";
import { ChatProviderManager } from "../manager/chatManager";
import { SlackChatProvider } from "../slack";

let mockedStore = mock(Store);
let store = instance(mockedStore);
let manager: Manager = new Manager(store);

let slackProvider = new SlackChatProvider("test-token", manager);
let slackManager = new ChatProviderManager(
  store,
  "slack",
  slackProvider,
  manager
);

suite("Manager tests", function() {
  setup(() => {
    const currentUser = {
      id: "user-id",
      name: "user-name",
      teams: [],
      currentTeamId: "team-id",
      provider: Providers.slack
    };
    when(mockedStore.getCurrentUserForAll()).thenReturn([{ ...currentUser }]);
    when(mockedStore.getCurrentUser("slack")).thenReturn({ ...currentUser });
    manager.initializeToken();
  });

  test("Get enabled providers works", function() {
    const enabledProviders = manager.getEnabledProviders();
    assert.equal(enabledProviders.indexOf("slack") >= 0, true);
  });

  test("Clear all works", function() {
    manager.clearAll();
    // TODO: enable this after we figure out sign out flow
    // verify(mockedStore.updateCurrentUser(undefined)).once();
    // verify(mockedStore.updateLastChannelId(undefined)).once();
    // verify(mockedStore.updateChannels(deepEqual([]))).once();
    // verify(mockedStore.updateUsers(deepEqual({}))).once();
  });

  test("Authentication check works", function() {
    assert.equal(slackManager.isAuthenticated(), true);
    when(mockedStore.getCurrentUser("slack")).thenReturn(undefined);
    assert.equal(slackManager.isAuthenticated(), false);
  });
});
