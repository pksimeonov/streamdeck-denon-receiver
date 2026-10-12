import net from "net";
import streamDeck, { SingletonAction } from "@elgato/streamdeck";
/** @typedef {import("@elgato/streamdeck").Action} Action */
/** @typedef {import("@elgato/streamdeck").Logger} Logger */
/** @typedef {import("@elgato/streamdeck").ActionContext} ActionContext */
/** @typedef {import("@elgato/streamdeck").WillAppearEvent} WillAppearEvent */
/** @typedef {import("@elgato/streamdeck").WillDisappearEvent} WillDisappearEvent */
/** @typedef {import("@elgato/streamdeck").DidReceiveSettingsEvent} DidReceiveSettingsEvent */
/** @typedef {import("@elgato/streamdeck").PropertyInspectorDidAppearEvent} PropertyInspectorDidAppearEvent */
/** @typedef {import("@elgato/streamdeck").SendToPluginEvent} SendToPluginEvent */

/** @typedef {import("../plugin").PluginContext} PluginContext */
/** @typedef {import("../modules/connection").ReceiverEvent} ReceiverEvent */

import { AVRConnection } from "../modules/connection";
import { AVRTracker } from "../modules/tracker";
import { GlobalSettings } from "../modules/globals";
/** @typedef {import("../modules/tracker").ReceiverList} ReceiverList */
/** @typedef {import("../modules/tracker").ReceiverInfo} ReceiverInfo */

/**
 * @typedef {Object} ReceiverDetail
 * @property {ReceiverUUID} uuid - The receiver UUID
 * @property {number} [zone] - The zone to control on the receiver
 */
/** @typedef {string} ActionUUID */
/** @typedef {string} ReceiverUUID */
/** @typedef {Record<ActionUUID, ReceiverDetail>} ActionReceiverMap */

/**
 * @typedef {Object} ActionSettings
 * @property {string} [uuid] - The receiver UUID to associate with this action
 * @property {string} [manualIp] - A manually configured IP address for the receiver
 * @property {string} [name] - The name of the receiver to display in the PI
 * @property {string} [statusMsg] - The connection status message to display in the PI
 * @property {number} [zone] - The zone to control on the receiver
 * @property {string} [volumeAction] - The volume action to perform on the receiver
 * @property {number} [volumeLevel] - The target volume level to set on the receiver
 * @property {string} [powerAction] - The power action to perform on the receiver
 * @property {string} [sourceAction] - The source action to perform on the receiver
 * @property {string} [source] - The source to set on the receiver
 * @property {number} [stepSize] - The step size for dial adjustments (in dB)
 */

/**
 * Actions that couldn't be connected to a receiver yet, keyed by action instance ID.
 * Shared by all action types so that one discovery or default change retries them all.
 * @type {Map<string, {owner: PluginAction, action: Action}>}
 */
const waitingActions = new Map();

/**
 * Retry connecting every action that is still waiting for a receiver.
 */
export function retryWaitingActions() {
	const waiting = [...waitingActions.values()];
	waitingActions.clear();
	for (const { owner, action } of waiting) {
		action.getSettings()
			.then((settings) => owner.attachAction(action, /** @type {ActionSettings} */ (settings)))
			.catch((error) => owner.logger.warn(`Failed to retry receiver for ${action.id}: ${error.message}`));
	}
}

/**
 * Make a receiver selection the default for new actions, and hand it to any waiting actions.
 * @param {ActionSettings} settings - Settings holding a discovered receiver UUID or a manual IP.
 */
export async function setDefaultReceiver(settings) {
	const manualIp = settings.manualIp?.trim();
	const uuid = settings.uuid?.toString();

	/** @type {import("../modules/globals").DefaultReceiver} */
	const defaultReceiver = manualIp
		? { manualIp, name: manualIp }
		: { uuid, name: (uuid && AVRTracker.getReceivers()[uuid]?.name) || settings.name };

	const current = GlobalSettings.get().defaultReceiver;
	if (current?.uuid !== defaultReceiver.uuid || current?.manualIp !== defaultReceiver.manualIp || current?.name !== defaultReceiver.name) {
		await GlobalSettings.update({ defaultReceiver });
	}

	retryWaitingActions();
}

/**
 * Base action class for the plugin
 * @extends SingletonAction
 */
export class PluginAction extends SingletonAction {
	/** @type {PluginContext} - Plugin-level context */
	plugin;

	/** @type {Logger} */
	logger;

	get avrConnections() { return this.plugin.avrConnections; }

	/**
	 * Get the receiver connection associated with an action, if any.
	 * @param {string} actionId - The action instance ID
	 * @returns {AVRConnection | undefined}
	 */
	getConnection(actionId) {
		const receiverId = this.actionReceiverMap[actionId]?.uuid;
		return receiverId !== undefined ? this.avrConnections[receiverId] : undefined;
	}

	/**
	 * Map of actions to their associated receiver UUIDs.
	 * Note: This is also used as a list of connections that this class instance is already listening to.
	 * @type {ActionReceiverMap}
	 */
	actionReceiverMap = {};

	/**
	 * @param {PluginContext} plugin - Plugin-level context to bind to this class
	 */
	constructor(plugin) {
		super();

		// Assign the plugin context to the class, if it wasn't already
		if (!this.plugin) {
			this.plugin = plugin;
			this.logger = plugin.logger.createScope(this.constructor.name);
		}
	}

	/**
	 * Normalize a manually configured IP address from settings.
	 * @param {string | undefined} manualIp
	 * @returns {string | undefined}
	 */
	normalizeManualIp(manualIp) {
		const trimmed = manualIp?.trim();
		return trimmed ? trimmed : undefined;
	}

	/**
	 * Build the synthetic receiver ID used for manual IP connections.
	 * @param {string} manualIp
	 * @returns {ReceiverUUID}
	 */
	getManualReceiverId(manualIp) {
		return `manual:${manualIp}`;
	}

	/**
	 * Resolve the receiver selection for an action's settings.
	 * Manual IP takes precedence over tracker discovery.
	 * @param {ActionSettings} settings
	 * @returns {{ receiverId?: ReceiverUUID, host?: string, isManual: boolean }}
	 */
	resolveReceiverSelection(settings) {
		const manualIp = this.normalizeManualIp(settings.manualIp);
		if (manualIp) {
			return {
				receiverId: this.getManualReceiverId(manualIp),
				host: manualIp,
				isManual: true
			};
		}

		const receiverId = settings.uuid?.toString();
		if (!receiverId) {
			return { isManual: false };
		}

		return {
			receiverId,
			host: AVRTracker.getReceivers()[receiverId]?.currentIP,
			isManual: false
		};
	}

	/**
	 * Whether the settings select a receiver (discovered or manual IP).
	 * @param {ActionSettings} settings
	 * @returns {boolean}
	 */
	hasReceiverSelection(settings) {
		return !!(settings.uuid?.toString() || this.normalizeManualIp(settings.manualIp));
	}

	/**
	 * Handle the PI appearing
	 * @param {PropertyInspectorDidAppearEvent} ev - The event object.
	 */
	onPropertyInspectorDidAppear(ev) {
		this.syncConnectionStatusToAction();
	}

	/**
	 * Connect an appearing action to its receiver.
	 * @param {WillAppearEvent} ev - The event object.
	 */
	async onWillAppear(ev) {
		await this.attachAction(ev.action, /** @type {ActionSettings} */ (ev.payload.settings));
	}

	/**
	 * Stop retrying an action that is no longer visible.
	 * @param {WillDisappearEvent} ev - The event object.
	 */
	onWillDisappear(ev) {
		waitingActions.delete(ev.action.id);
	}

	/**
	 * Pick up settings changed in the PI (e.g. the zone).
	 * @param {DidReceiveSettingsEvent} ev - The event object.
	 */
	onDidReceiveSettings(ev) {
		const entry = this.actionReceiverMap[ev.action.id];
		if (entry) {
			entry.zone = /** @type {number} */ (ev.payload.settings.zone) || 0;
			this.refreshActionState(ev.action);
		}
	}

	/**
	 * Associate an action with its receiver, connecting to it if needed.
	 * Actions without a receiver of their own pick up the default receiver.
	 * If the receiver can't be resolved yet (nothing configured, or not discovered yet), the action
	 * waits and is retried when receivers are discovered or a default receiver is chosen.
	 * @param {Action} action - The action instance.
	 * @param {ActionSettings} settings - The action's settings.
	 * @returns {Promise<AVRConnection | undefined>}
	 */
	async attachAction(action, settings) {
		waitingActions.delete(action.id);

		if (!this.hasReceiverSelection(settings)) {
			const defaultReceiver = GlobalSettings.get().defaultReceiver;
			if (defaultReceiver && this.hasReceiverSelection(defaultReceiver)) {
				settings = {
					...settings,
					uuid: defaultReceiver.uuid || "",
					manualIp: defaultReceiver.manualIp || "",
					name: defaultReceiver.name
				};
				await action.setSettings(settings);
				this.logger.info(`Assigned default receiver ${defaultReceiver.name || defaultReceiver.manualIp || defaultReceiver.uuid} to ${action.id}.`);
			}
		}

		const { receiverId } = this.resolveReceiverSelection(settings);
		const connection = receiverId !== undefined
			? this.avrConnections[receiverId] ?? await this.connectReceiver(settings)
			: undefined;

		if (receiverId === undefined || connection === undefined) {
			delete this.actionReceiverMap[action.id];
			waitingActions.set(action.id, { owner: this, action });
			this.refreshActionState(action);
			return;
		}

		this.actionReceiverMap[action.id] = {
			uuid: receiverId,
			zone: /** @type {number} */ (settings.zone) || 0
		};

		// Set up or refresh the listener for receiver events
		if (this.manifestId) {
			connection.on(this.routeReceiverEvent.bind(this), this.manifestId);
		}

		this.refreshActionState(action);
		return connection;
	}

	/**
	 * Redraw an action from its receiver's current state. Overridden by actions that show state.
	 * @param {Action} action - The action instance.
	 */
	refreshActionState(action) {}

	/**
	 * Handle events from the Property Inspector.
	 * @param {SendToPluginEvent} ev - The event object.
	 */
	onSendToPlugin(ev) {
		const { event } = ev.payload;

		switch (event) {
			case "userChoseReceiver":
			case "userConfiguredReceiver":
				this.onUserConfiguredReceiver(ev);
				break;
			case "refreshReceiverList":
				this.onRefreshReceiversForPI(ev);
				break;
		}
	}

	/**
	 * Handle a user choosing a receiver from the PI.
	 * A successful choice also becomes the default receiver for new actions.
	 * @param {SendToPluginEvent} ev - The event object.
	 */
	async onUserConfiguredReceiver(ev) {
		/** @type {ActionSettings} */
		const settings = {
			...(await ev.action.getSettings()),
			...(ev.payload.settings || {})
		};
		const { receiverId, host, isManual } = this.resolveReceiverSelection(settings);

		let statusMsg = "";

		if (isManual && host && net.isIP(host) === 0) {
			delete this.actionReceiverMap[ev.action.id];
			statusMsg = "Invalid IP address";
		} else if (receiverId) {
			// Persist the choice first, so that attaching doesn't substitute the default receiver
			await ev.action.setSettings(settings);

			const connection = await this.attachAction(ev.action, settings);
			if (connection !== undefined) {
				statusMsg = connection.status.statusMsg;
				await setDefaultReceiver(settings);
			} else {
				statusMsg = isManual ? "Can't connect to receiver" : "Can't find receiver";
			}
		} else {
			// Ensure the receiver association is cleared if no receiver is selected
			delete this.actionReceiverMap[ev.action.id];
			statusMsg = "No receiver selected";
		}

		this.updateStatusMessage(statusMsg);
	}

	/**
	 * Handle a request from the PI to refresh the receiver list
	 * @param {SendToPluginEvent} ev 
	 */
	async onRefreshReceiversForPI(ev) {
		/** @type {ReceiverList} */
		let receivers = AVRTracker.getReceivers();

		/** @type {Array<{label: string, value: ReceiverUUID}>} */
		let options;

		// If the user wants a refresh, or if there are no receivers cached,
		// actively attempt to scan for receivers now.
		const settings = await ev.action.getSettings();
		if (ev.payload.isRefresh === true || (!settings.uuid && !this.normalizeManualIp(settings.manualIp) && Object.keys(receivers).length === 0)) {
			// Perform a short scan for receivers
			receivers = await AVRTracker.searchForReceivers(1, 2);
		}

		// Convert the dict stricture into options
		options = [
			{
				label: receivers && Object.keys(receivers).length > 0
					? "Select a receiver"
					: "No receivers detected",
				value: ""
			},
			...Object.entries(receivers).map(([uuid, receiver]) => ({
				label: receiver.name ? `${receiver.name} (${receiver.currentIP})` : receiver.currentIP,
				value: uuid
			}))
		];

		streamDeck.ui.current?.sendToPropertyInspector({
			event: "refreshReceiverList",
			items: options
		});

		this.syncConnectionStatusToAction();
	}

	/**
	 * Create a new receiver connection (if necessary) and return it.
	 * @param {ActionSettings} settings - The action settings containing either a discovered receiver or manual IP.
	 * @returns {Promise<AVRConnection | undefined>}
	 */
	async connectReceiver(settings) {
		const { receiverId, host } = this.resolveReceiverSelection(settings);
		if (!receiverId || !host) {
			return;
		}

		// Check for an existing connection before creating a new one
		if (receiverId in this.avrConnections === false) {
			const receiverInfo = AVRTracker.getReceivers()[receiverId];
			const targetName = receiverInfo?.name || host;

			this.logger.info(`Creating new receiver connection to ${targetName}.`);
			const connection = new AVRConnection(this.plugin, receiverId, host);
			this.avrConnections[receiverId] = connection;
		}

		return this.avrConnections[receiverId];
	}

	/**
	 * Route a receiver event to the appropriate handler.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	routeReceiverEvent(ev) {
		// Get the list of actions to inform of the event and add them to the event object
		ev.actions = this.actions.toArray().filter((action) =>
			this.actionReceiverMap[action.id]?.uuid === ev.connection.uuid &&
			this.actionReceiverMap[action.id]?.zone === ev.zone
		);

		switch (ev.type) {
			case "connected":
				this.onReceiverConnected(ev);
				break;
			case "closed":
				this.onReceiverDisconnected(ev);
				break;
			case "powerChanged":
				this.onReceiverPowerChanged(ev);
				break;
			case "volumeChanged":
				this.onReceiverVolumeChanged(ev);
				break;
			case "muteChanged":
				this.onReceiverMuteChanged(ev);
				break;
			case "dynamicVolumeChanged":
				this.onReceiverDynamicVolumeChanged(ev);
				break;
			case "dynamicEQChanged":
				this.onReceiverDynamicEQChanged(ev);
				break;
			case "channelLevelChanged":
				this.onReceiverChannelLevelChanged(ev);
				break;
			case "status":
				this.onReceiverStatusChange(ev);
				break;
		}
	}

	/**
	 * Update the status message for an action's PI.
	 * @param {string} newStatusMsg - The new status message.
	 */
	updateStatusMessage(newStatusMsg) {
		const action = streamDeck.ui.current?.action;
		if (action) {
			action.getSettings().then((settings) => {
				settings.statusMsg = newStatusMsg;
				action.setSettings(settings);
			});
		}
	}

	/**
	 * Sync the connection status to an action's PI.
	 */
	syncConnectionStatusToAction() {
		const action = streamDeck.ui.current?.action;
		let statusMsg = "";

		if (action && action.id in this.actionReceiverMap) {
			statusMsg = this.getConnection(action.id)?.status.statusMsg || "";
		}

		this.updateStatusMessage(statusMsg);
	}

	/**
	 * Fires when the receiver's status changes and updates the action's PI status message.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverStatusChange(ev) {
		this.updateStatusMessage(ev.connection.status.statusMsg);
	}

	/**
	 * Fires when the receiver connects and updates the action's PI status message.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverConnected(ev) {
		this.updateStatusMessage(ev.connection.status.statusMsg);
		ev.actions?.forEach((action) => this.refreshActionState(action));
	}

	/**
	 * Fires when the receiver disconnects and updates the action's PI status message.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverDisconnected(ev) {
		this.updateStatusMessage(ev.connection.status.statusMsg);

		// If the receiver is disconnected, show an alert on the actions that are associated with it
		ev.actions?.forEach((action) => {
			action.showAlert();
		});
	}

	/**
	 * Fires when the receiver's power state changes.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverPowerChanged(ev) {}

	/**
	 * Fires when the receiver's volume changes.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverVolumeChanged(ev) {}

	/**
	 * Fires when the receiver's dynamic volume state changes.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverDynamicVolumeChanged(ev) {}

	/**
	 * Fires when the receiver's mute state changes.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverMuteChanged(ev) {}

	/**
	 * Fires when a channel level changes (Options → Channel Level).
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverChannelLevelChanged(ev) {}

	/**
	 * Fires when the receiver's Dynamic EQ state changes.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverDynamicEQChanged(ev) {}
}
