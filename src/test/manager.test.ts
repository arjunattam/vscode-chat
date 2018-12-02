import * as assert from "assert";
import { Store } from "../store";
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
      teams: [{ name: "team-name", id: "team-id" }],
      currentTeamId: "team-id",
      provider: Providers.slack
    };
  });

  test("Get initial state works", function() {
    const { provider, currentTeamId } = manager.getInitialState();
    assert.equal(provider, "slack");
    assert.equal(currentTeamId, "team-id");
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

  test("Add new slack workspace works", function() {
    const newTeamId = "new-team-id";
    manager.addWorkspaceById(newTeamId);

    verify(
      mockedStore.updateCurrentUser(
        deepEqual({
          id: "user-id",
          name: "user-name",
          token: "user-token",
          teams: [
            { name: "team-name", id: "team-id" },
            { name: "", id: "new-team-id" }
          ],
          currentTeamId: "new-team-id",
          provider: Providers.slack
        })
      )
    ).once();
  });

  test("Update current user works for slack workspaces", function() {
    const userInfo = {
      id: "user-id",
      name: "user-name",
      token: "user-token",
      // different team than what we have in the store, hence we
      // need to merge the two.
      teams: [{ name: "team-name-2", id: "team-id-2" }],
      currentTeamId: "team-id-2",
      provider: Providers.slack
    };
    manager.updateCurrentUser(userInfo);

    verify(
      mockedStore.updateCurrentUser(
        deepEqual({
          id: "user-id",
          name: "user-name",
          token: "user-token",
          teams: [
            { name: "team-name", id: "team-id" },
            { name: "team-name-2", id: "team-id-2" }
          ],
          currentTeamId: "team-id-2",
          provider: Providers.slack
        })
      )
    ).once();
  });

  test("Update current user works for undefined team id", function() {
    const userInfo = {
      id: "user-id",
      name: "user-name",
      token: "user-token",
      teams: [{ name: "team-name", id: "team-id" }],
      currentTeamId: undefined, // should be fixed to team-id
      provider: Providers.slack
    };
    manager.updateCurrentUser(userInfo);

    verify(
      mockedStore.updateCurrentUser(
        deepEqual({
          id: "user-id",
          name: "user-name",
          token: "user-token",
          teams: [{ name: "team-name", id: "team-id" }],
          currentTeamId: "team-id",
          provider: Providers.slack
        })
      )
    ).once();
  });
});
