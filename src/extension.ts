import * as vscode from "vscode";
import * as vsls from "vsls";
import ViewController from "./controller";
import Manager from "./manager";
import Logger from "./logger";
import { Store } from "./store";
import * as str from "./strings";
import {
    SelfCommands,
    SLACK_OAUTH,
    DISCORD_OAUTH,
    LIVE_SHARE_BASE_URL,
    CONFIG_ROOT,
    CONFIG_AUTO_LAUNCH,
    TRAVIS_SCHEME,
    VSLS_SPACES_EXTENSION_ID
} from "./constants";
import travis from "./bots/travis";
import { ExtensionUriHandler } from "./uriHandler";
import * as utils from "./utils";
import { askForAuth } from "./onboarding";
import { ConfigHelper } from "./config";
import TelemetryReporter from "./telemetry";
import IssueReporter from "./issues";
import { VSLS_CHAT_CHANNEL, userFromContact } from "./vslsChat/utils";

let store: Store;
let manager: Manager;
let controller: ViewController;
let telemetry: TelemetryReporter;
let typingTimers: {[key: string]: NodeJS.Timer | undefined} = {};

// Auto-start chat window config -> persists per activation
let autoLaunchVslsChatInSession = true;

export function activate(context: vscode.ExtensionContext) {
    Logger.log("Activating vscode-chat");
    store = new Store(context);
    manager = new Manager(store);
    telemetry = new TelemetryReporter(manager);
    // telemetry.record(
    //     EventType.activationStarted,
    //     undefined,
    //     undefined,
    //     undefined
    // );

    controller = new ViewController(
        context,
        (provider, source) => onUIDispose(provider, source),
        provider => {
            if (provider) {
                const lastChannelId = manager.store.getLastChannelId(provider);

                if (lastChannelId) {
                    return manager.loadChannelHistory(provider, lastChannelId);
                }
            }
        },
        provider =>
            !!provider ? manager.updateReadMarker(provider) : undefined
    );

    const setupFreshInstall = () => {
        const installationId = manager.store.generateInstallationId();
        telemetry.setUniqueId(installationId);
        telemetry.record(
            EventType.extensionInstalled,
            undefined,
            undefined,
            undefined
        );
    };

    const handleNoToken = (canPromptForAuth: boolean) => {
        const hasVsls =
            utils.hasVslsExtension() || utils.hasVslsExtensionPack();

        if (canPromptForAuth && !hasVsls) {
            askForAuth();
        }

        throw new Error(str.TOKEN_NOT_FOUND);
    };

    const initializeToken = async (
        canPromptForAuth: boolean,
        newInitialState: InitialState | undefined
    ) => {
        await manager.initializeToken(newInitialState);

        if (!manager.isTokenInitialized) {
            setTimeout(() => handleNoToken(canPromptForAuth), 5 * 1000);
        }
    };

    const setup = async (
        canPromptForAuth: boolean,
        newInitialState: InitialState | undefined
    ): Promise<any> => {
        await store.runStateMigrations();
        const isFreshInstall = !manager.store.installationId;

        if (isFreshInstall) {
            setupFreshInstall();
        }

        if (!manager.isTokenInitialized || !!newInitialState) {
            // We force initialization if we are provided a newInitialState
            await initializeToken(canPromptForAuth, newInitialState);
        }

        await manager.initializeProviders();

        if (manager.isProviderEnabled("discord")) {
            if (!manager.getCurrentTeamIdFor("discord")) {
                await askForWorkspace("discord");
            }
        }

        // TODO: In discord, user preferences are available after channels are fetched
        manager.updateUserPrefsForAll(); // async update
        await manager.initializeStateForAll();
        manager.subscribePresenceForAll();
        return manager.initializeVslsContactProvider();
    };

    const sendMessage = (
        providerName: string,
        text: string,
        parentTimestamp: string | undefined
    ) => {
        const lastChannelId = manager.store.getLastChannelId(providerName);
        telemetry.record(
            EventType.messageSent,
            undefined,
            lastChannelId,
            providerName
        );
        manager.updateReadMarker(providerName);

        if (!!lastChannelId) {
            // lastChannelId should always exist since this will only be
            // called after loading the webview (which requires lastChannelId)
            return manager.sendMessage(
                providerName,
                text,
                lastChannelId,
                parentTimestamp
            );
        }
    };

    const askForChannel = async (
        providerName: string | undefined
    ): Promise<{ channel: Channel; providerName: string } | undefined> => {
        // This can be called with an undefined providerName, in which
        // case we show channels from all available providers.
        let channelList = manager
            .getChannelLabels(providerName)
            .sort((a, b) => b.unread - a.unread);

        const quickpickItems: vscode.QuickPickItem[] = channelList.map(
            channelLabel => {
                const description = providerName === 'vsls' ? 
                    channelLabel.teamName : `${channelLabel.providerName} · ${channelLabel.teamName}`;
                return {
                    label: channelLabel.label,
                    detail: channelLabel.channel.categoryName,
                    description
                }
            }
        );
        const finalList = providerName === 'vsls' ?
            quickpickItems : [...quickpickItems, { label: str.RELOAD_CHANNELS }];
        const selected = await vscode.window.showQuickPick(
            finalList,
            {
                placeHolder: str.CHANGE_CHANNEL_TITLE,
                matchOnDetail: true,
                matchOnDescription: true
            }
        );

        if (!!selected) {
            if (selected.label === str.RELOAD_CHANNELS) {
                let currentProvider = providerName;

                if (!currentProvider) {
                    const providers = manager.store
                        .getCurrentUserForAll()
                        .map(userInfo => userInfo.provider);
                    currentProvider = await askForProvider(providers);
                }

                if (!!currentProvider) {
                    await manager.fetchUsers(currentProvider);
                    await manager.fetchChannels(currentProvider);
                    return askForChannel(providerName);
                }
            }

            const selectedChannelLabel = channelList.find(
                x =>
                    x.label === selected.label &&
                    x.channel.categoryName === selected.detail
            );

            if (!!selectedChannelLabel) {
                const { channel, providerName } = selectedChannelLabel;
                return { channel, providerName: providerName.toLowerCase() };
            }
        }
    };

    const openChatWebview = async (chatArgs?: ChatArgs) => {
        let provider = !!chatArgs ? chatArgs.providerName : undefined;
        let channelId = !!chatArgs ? chatArgs.channelId : undefined;
        const source = !!chatArgs ? chatArgs.source : EventSource.command;

        if (!chatArgs) {
            const selected = await askForChannel(undefined);

            if (!!selected) {
                provider = selected.providerName;
                channelId = selected.channel.id;
            }
        }

        if (!!provider && !!channelId) {
            controller.updateCurrentState(provider, channelId, source);
            controller.loadUi();

            await setup(true, undefined);
            await manager.updateWebviewForProvider(provider, channelId);
            telemetry.record(EventType.viewOpened, source, channelId, provider);
            manager.loadChannelHistory(provider, channelId);
        }
    };

    const onUIDispose = (
        provider: string | undefined,
        openSource: EventSource | undefined
    ) => {
        if (provider === "vsls" && openSource === EventSource.vslsStarted) {
            autoLaunchVslsChatInSession = false;
        }
    };

    const askForWorkspace = async (
        provider: string
    ): Promise<Team | undefined> => {
        const currentUserInfo = manager.store.getCurrentUser(provider);

        if (!!currentUserInfo) {
            const { teams } = currentUserInfo;
            const labels = teams.map(team => team.name);

            const selected = await vscode.window.showQuickPick([...labels], {
                placeHolder: str.CHANGE_WORKSPACE_TITLE
            });

            if (!!selected) {
                return teams.find(team => team.name === selected);
            }
        }
    };

    const changeWorkspace = async (providerAndTeam?: any) => {
        let provider: string | undefined, team;

        if (!providerAndTeam) {
            const currentUsers = manager.store.getCurrentUserForAll();
            const withMultipleTeams = currentUsers.filter(
                userInfo => userInfo.teams.length > 1
            );
            provider = await askForProvider(
                withMultipleTeams.map(userInfo => userInfo.provider)
            );

            if (!provider) {
                return;
            }

            const userInfo = withMultipleTeams.find(
                userInfo => userInfo.provider === provider
            );

            if (!!userInfo) {
                const teamNames = userInfo.teams.map(team => team.name);
                const selection = await vscode.window.showQuickPick(teamNames, {
                    placeHolder: str.CHANGE_PROVIDER_TITLE
                });

                if (selection) {
                    team = userInfo.teams.find(team => team.name === selection);
                }
            }
        } else {
            provider = providerAndTeam.provider;
            team = providerAndTeam.team;
        }

        if (provider && team) {
            const isDifferentTeam =
                team.id !== manager.getCurrentTeamIdFor(provider);

            if (isDifferentTeam) {
                manager.updateCurrentWorkspace(provider, team);
                await manager.clearOldWorkspace(provider);
                await setup(false, { provider, teamId: team.id });
            }
        }
    };

    const changeChannel = async (args?: ChatArgs) => {
        const provider = args ? args.providerName : undefined;
        telemetry.record(
            EventType.channelChanged,
            !!args ? args.source : EventSource.command,
            undefined,
            provider
        );

        const selected = await askForChannel(provider);

        if (!!selected) {
            let chatArgs: any = { ...args };
            chatArgs.channelId = selected.channel.id;
            chatArgs.providerName = selected.providerName;
            return openChatWebview(chatArgs);
        }
    };

    const shareVslsLink = async (chatArgs: ChatArgs) => {
        // This method can assume chatArgs to have one of channel and user
        const { providerName } = chatArgs;
        const liveshare = await vsls.getApi();

        if (!!liveshare) {
            const vslsUri = await liveshare.share({
                suppressNotification: true
            });
            let channelId = chatArgs.channelId;
            const user = chatArgs.user;

            if (!channelId && user) {
                const newChannel = await manager.createIMChannel(
                    chatArgs.providerName,
                    user
                );

                if (!!newChannel) {
                    channelId = newChannel.id;
                }
            }

            telemetry.record(
                EventType.vslsShared,
                EventSource.activity,
                channelId,
                providerName
            );

            if (vslsUri && channelId) {
                manager.sendMessage(
                    providerName,
                    vslsUri.toString(),
                    channelId,
                    undefined
                );
            }
        }
    };

    const startOAuth = (args?: any) => {
        const hasArgs = !!args && !!args.source;
        const provider = "slack"; // Only Slack OAuth is supported
        const urls = {
            slack: SLACK_OAUTH,
            discord: DISCORD_OAUTH
        };
        telemetry.record(
            EventType.authStarted,
            hasArgs ? args.source : EventSource.command,
            undefined,
            provider
        );
        return utils.openUrl(urls[provider]);
    };

    const reset = async () => {
        // Reset clears all state from local storage (except for vsls chat
        // related state, since that does not get affected via call paths to reset)
        manager.clearAll();
        manager.updateAllUI();
        await setup(false, undefined);
    };

    const signout = async () => {
        await manager.signout();
    };

    const updateSelfPresence = async (
        provider: string,
        presence: UserPresence
    ) => {
        const isSlack = provider === "slack";
        let durationInMinutes = 0;

        if (presence === UserPresence.doNotDisturb && isSlack) {
            // Ask for duration for dnd.snooze for slack implementation
            const options: { [label: string]: number } = {
                "20 minutes": 20,
                "1 hour": 60,
                "2 hours": 120,
                "4 hours": 240,
                "8 hours": 480,
                "24 hours": 1440
            };
            const selected = await vscode.window.showQuickPick(
                Object.keys(options),
                {
                    placeHolder: str.SELECT_DND_DURATION
                }
            );
            durationInMinutes = !!selected ? options[selected] : 0;
        }

        manager.updateSelfPresence(provider, presence, durationInMinutes);
    };

    const askForSelfPresence = async () => {
        // Called when user triggers a change for self presence
        // using manual command.
        const enabledProviders = manager.getEnabledProviders();
        const providerNames = enabledProviders.map(element => element.provider);
        const provider = providerNames.find(provider => provider !== "vsls");

        if (!!provider) {
            const isSlack = provider === "slack";
            const currentPresence = manager.getCurrentUserPresence(provider);
            const presenceChoices = [
                UserPresence.available,
                UserPresence.doNotDisturb,
                UserPresence.invisible
            ];

            if (!isSlack) {
                // Slack does not have the idle option
                presenceChoices.push(UserPresence.idle);
            }

            const items: vscode.QuickPickItem[] = presenceChoices.map(
                choice => {
                    const isCurrent = currentPresence === choice;
                    return {
                        label: utils.camelCaseToTitle(choice),
                        description: isCurrent ? "current" : ""
                    };
                }
            );
            const status = await vscode.window.showQuickPick(items, {
                placeHolder: str.SELECT_SELF_PRESENCE
            });

            if (!!status) {
                const presence = utils.titleCaseToCamel(
                    status.label
                ) as UserPresence;
                updateSelfPresence(provider, presence);
            }
        }
    };

    const fetchReplies = (provider: string, parentTimestamp: string) => {
        manager.fetchThreadReplies(provider, parentTimestamp);
    };

    const resetConfiguration = (event: vscode.ConfigurationChangeEvent) => {
        const affectsExtension = event.affectsConfiguration(CONFIG_ROOT);

        if (affectsExtension) {
            // We can have a tighter check here to prevent losing slack/discord setup
            // whenever the config changes.
            const needsReset = !event.affectsConfiguration(CONFIG_AUTO_LAUNCH);

            if (needsReset) {
                reset();
            }
        }
    };

    const setVslsContext = () => {
        const isEnabled = utils.hasVslsExtension();
        utils.setVsContext("chat:vslsEnabled", isEnabled);
    };

    const askForProvider = async (enabledProviders: string[]) => {
        const values = enabledProviders.map(name => utils.toTitleCase(name));
        const selection = await vscode.window.showQuickPick(values, {
            placeHolder: str.CHANGE_PROVIDER_TITLE
        });
        return !!selection ? selection.toLowerCase() : undefined;
    };

    const configureToken = async () => {
        const provider = await askForProvider(["slack", "discord"]);
        telemetry.record(
            EventType.tokenConfigured,
            EventSource.command,
            undefined,
            provider
        );

        if (!!provider) {
            const inputToken = await vscode.window.showInputBox({
                placeHolder: str.TOKEN_PLACEHOLDER,
                password: true
            });

            if (!!inputToken) {
                const sanitisedToken = utils.sanitiseTokenString(inputToken);

                try {
                    const tokenUser = await manager.validateToken(
                        provider,
                        sanitisedToken
                    );

                    if (!!tokenUser) {
                        const teamId =
                            provider === "slack"
                                ? tokenUser.currentTeamId
                                : undefined;
                        return ConfigHelper.setToken(
                            sanitisedToken,
                            provider,
                            teamId
                        );
                    }
                } catch (error) {
                    const actionItems = [str.REPORT_ISSUE];
                    const messageResult = await vscode.window.showErrorMessage(
                        str.INVALID_TOKEN(utils.toTitleCase(provider)),
                        ...actionItems
                    );

                    if (!!messageResult && messageResult === str.REPORT_ISSUE) {
                        const issue = `[${provider}] Invalid token`;
                        IssueReporter.openNewIssue(issue, "");
                    }

                    return;
                }
            }
        }
    };

    const getContactFromItem = async (item: any) => {
        let contact: vsls.Contact | undefined;

        if (!!item.space) {
            // This is a space member, we need to convert to an LS contact
            const { email } = item;
            const api = (await vsls.getApi())!;
            const { contacts } = await api.getContacts([email]);
            contact = contacts[email]
        } else {
            contact = item.contactModel.contact;
        }

        return contact;
    }

    const chatWithVslsContact = async (item: any) => {
        const contact = await getContactFromItem(item);

        if (contact) {
            const user = userFromContact(contact);
            const providerName = 'vsls';
            let imChannel = manager.getIMChannel(providerName, user)

            if (!imChannel) {
                imChannel = await manager.createIMChannel(providerName, user)
            }

            // Adding this user to the store so we can use in the UI
            manager.store.updateUser(providerName, user.id, user)

            if (imChannel) {
                manager.store.updateLastChannelId(providerName, imChannel.id)
                openChatWebview({
                    providerName, channelId: imChannel.id, user, source: EventSource.vslsContacts
                })
            }
        }
    };

    const openVslsSpaceChat = async (spaceName: string) => {
        const api = utils.getExtension(VSLS_SPACES_EXTENSION_ID)!.exports;
        const { name, email } = api.getUserInfo();
        await manager.store.updateCurrentUser("vslsSpaces", {
            id: email,
            name,
            teams: [],
            currentTeamId: undefined,
            provider: Providers.vslsSpaces
        });
        return openChatWebview({
            providerName: "vslsSpaces",
            channelId: spaceName,
            source: EventSource.command
        });
    };

    // Setup real-time messenger and updated local state
    setup(true, undefined);

    // Setup context for conditional views
    setVslsContext();

    const uriHandler = new ExtensionUriHandler();
    context.subscriptions.push(
        vscode.commands.registerCommand(
            SelfCommands.OPEN_WEBVIEW,
            openChatWebview
        ),
        vscode.commands.registerCommand(
            SelfCommands.CHANGE_WORKSPACE,
            changeWorkspace
        ),
        vscode.commands.registerCommand(
            SelfCommands.CHANGE_CHANNEL,
            changeChannel
        ),
        vscode.commands.registerCommand(SelfCommands.SIGN_IN, startOAuth),
        vscode.commands.registerCommand(SelfCommands.SIGN_OUT, signout),
        vscode.commands.registerCommand(SelfCommands.RESET_STORE, reset),
        vscode.commands.registerCommand(
            SelfCommands.SETUP_NEW_PROVIDER,
            ({ newInitialState }) => setup(false, newInitialState)
        ),
        vscode.commands.registerCommand(
            SelfCommands.CONFIGURE_TOKEN,
            configureToken
        ),
        vscode.commands.registerCommand(
            SelfCommands.SEND_MESSAGE,
            ({ text, provider }) => sendMessage(provider, text, undefined)
        ),
        vscode.commands.registerCommand(
            SelfCommands.SEND_THREAD_REPLY,
            ({ text, parentTimestamp, provider }) =>
                sendMessage(provider, text, parentTimestamp)
        ),
        vscode.commands.registerCommand(
            SelfCommands.LIVE_SHARE_FROM_MENU,
            (item: ChatTreeNode) => {
                return shareVslsLink({
                    channelId: item.channel ? item.channel.id : undefined,
                    user: item.user,
                    providerName: item.providerName,
                    source: EventSource.activity
                });
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.LIVE_SHARE_SLASH,
            ({ provider }) => {
                const channelId = manager.store.getLastChannelId(provider);
                shareVslsLink({
                    channelId,
                    user: undefined,
                    providerName: provider,
                    source: EventSource.slash
                });
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.LIVE_SHARE_SESSION_CHANGED,
            async ({ isSessionActive, currentUser }) => {
                if (!currentUser) {
                    // If the currentUser is undefined, don't launch the window
                    return;
                }

                const enabledProviders = manager
                    .getEnabledProviders()
                    .map(e => e.provider);

                const eventType = isSessionActive
                    ? EventType.vslsStarted
                    : EventType.vslsEnded;
                telemetry.record(eventType, undefined, undefined, undefined);

                if (enabledProviders.indexOf("vsls") >= 0) {
                    manager.store.updateCurrentUser("vsls", currentUser);

                    // Re-fetch channels so that we can add/remove the session channel
                    const vslsProvider = manager.chatProviders.get('vsls' as Providers);
                    await vslsProvider!.fetchChannels()

                    // Now that we have teams for vsls chat -> we initialize status item
                    manager.initializeViewsManager();
                    manager.updateAllUI();

                    // Auto-start the chat window for discoverability
                    const autoLaunchVslsChatConfig = ConfigHelper.getAutoLaunchLiveShareChat();
                    const isChatVisible = controller.ui ? controller.ui.isVisible() : false;
                    const autoLaunchVslsChat =
                        autoLaunchVslsChatInSession && autoLaunchVslsChatConfig;

                    if (isSessionActive && autoLaunchVslsChat && !isChatVisible) {
                        openChatWebview({
                            providerName: "vsls",
                            channelId: VSLS_CHAT_CHANNEL.id,
                            source: EventSource.vslsStarted
                        });
                    }
                }
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.FETCH_REPLIES,
            ({ parentTimestamp, provider }) =>
                fetchReplies(provider, parentTimestamp)
        ),
        vscode.commands.registerCommand(
            SelfCommands.UPDATE_MESSAGES,
            ({ channelId, messages, provider }) => {
                manager.updateMessages(provider, channelId, messages);
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.CLEAR_MESSAGES,
            ({ channelId, provider }) => {
                manager.clearMessages(provider, channelId);
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.ADD_MESSAGE_REACTION,
            ({ userId, msgTimestamp, channelId, reactionName, provider }) => {
                manager.addReaction(
                    provider,
                    channelId,
                    msgTimestamp,
                    userId,
                    reactionName
                );
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.REMOVE_MESSAGE_REACTION,
            ({ userId, msgTimestamp, channelId, reactionName, provider }) => {
                manager.removeReaction(
                    provider,
                    channelId,
                    msgTimestamp,
                    userId,
                    reactionName
                );
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.UPDATE_PRESENCE_STATUSES,
            ({ userId, presence, provider }) => {
                manager.updatePresenceForUser(provider, userId, presence);
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.UPDATE_SELF_PRESENCE,
            askForSelfPresence
        ),
        vscode.commands.registerCommand(
            SelfCommands.UPDATE_SELF_PRESENCE_VIA_VSLS,
            ({ presence, provider }) => {
                // Disabled to test auto-away fix
                // updateSelfPresence(provider, presence)
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.CHAT_WITH_VSLS_CONTACT,
            item => chatWithVslsContact(item)
        ),
        vscode.commands.registerCommand(
            SelfCommands.CHANNEL_MARKED,
            ({ channelId, readTimestamp, unreadCount, provider }) => {
                return manager.updateChannelMarked(
                    provider,
                    channelId,
                    readTimestamp,
                    unreadCount
                );
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.UPDATE_MESSAGE_REPLIES,
            ({ provider, channelId, parentTimestamp, reply }) => {
                manager.updateMessageReply(
                    provider,
                    parentTimestamp,
                    channelId,
                    reply
                );
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.HANDLE_INCOMING_LINKS,
            ({ uri, senderId, provider }) => {
                if (uri.authority === LIVE_SHARE_BASE_URL) {
                    const currentUser = manager.getCurrentUserFor(provider);
                    const isSomeoneElse = !!currentUser
                        ? currentUser.id !== senderId
                        : false;

                    if (!!manager.vslsContactProvider && isSomeoneElse) {
                        manager.vslsContactProvider.notifyInviteReceived(
                            senderId,
                            uri
                        );
                    }
                }
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.SEND_TYPING,
            ({ provider, channelId }) => {
                if (provider === 'vsls') {
                    const vslsProvider = manager.chatProviders.get('vsls' as Providers)

                    if (vslsProvider) {
                        vslsProvider.sendTyping(channelId);
                    }
                }
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.SHOW_TYPING,
            ({ provider, typingUserId, channelId }) => {
                manager.updateWebviewForProvider(provider, channelId, typingUserId);
                const key = `${channelId}:${typingUserId}`;

                if (typingTimers[key]) {
                    clearTimeout(typingTimers[key] as NodeJS.Timer);
                    typingTimers[key] = undefined;
                }

                const newTimer = setTimeout(() => {
                    // This removes typing status --> this timeout should be larger than
                    // the time period between typing events sent from the wire + the time
                    // it takes to transfer them over the wire.
                    manager.updateWebviewForProvider(provider, channelId, undefined);
                }, 3000)

                typingTimers[key] = newTimer;
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.SEND_TO_WEBVIEW,
            ({ uiMessage }) => controller.sendToUI(uiMessage)
        ),
        vscode.commands.registerCommand(
            SelfCommands.CHAT_WITH_VSLS_SPACE,
            ({ space }) => {
                const { name: spaceName } = space;
                return openVslsSpaceChat(spaceName);
            }
        ),
        vscode.commands.registerCommand(
            SelfCommands.VSLS_SPACE_JOINED,
            async ({ name }) => {
                // Update store and launch the webview
                await manager.fetchUsers("vslsSpaces");
                await manager.fetchChannels("vslsSpaces");
                return openVslsSpaceChat(name);
            }
        ),
        vscode.workspace.onDidChangeConfiguration(resetConfiguration),
        vscode.workspace.registerTextDocumentContentProvider(
            TRAVIS_SCHEME,
            travis
        ),
        vscode.window.registerUriHandler(uriHandler),
        manager,
        telemetry
    );

    // telemetry.record(
    //     EventType.activationEnded,
    //     undefined,
    //     undefined,
    //     undefined
    // );
}

export function deactivate() {}
