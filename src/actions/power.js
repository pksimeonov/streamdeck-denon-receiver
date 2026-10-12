import streamDeck, { action } from "@elgato/streamdeck";
/** @typedef {import("@elgato/streamdeck").Action} Action */
/** @typedef {import("@elgato/streamdeck").KeyDownEvent} KeyDownEvent */
/** @typedef {import("@elgato/streamdeck").WillAppearEvent} WillAppearEvent */

import { PluginAction } from "./action";
/** @typedef {import("./action").ActionSettings} ActionSettings */

/** @typedef {import("../modules/connection").AVRConnection} AVRConnection */
/** @typedef {import("../modules/connection").ReceiverEvent} ReceiverEvent */

/**
 * The Power action class.
 * @extends {PluginAction}
 */
@action({ UUID: "com.pksimeonov.denon-receiver.power" })
export class PowerAction extends PluginAction {
	/**
	 * Redraw the action from its receiver's current state.
	 * @param {Action} action - The action object.
	 */
	refreshActionState(action) {
		updateActionState(action, this.getConnection(action.id));
	}

	/**
	 * Perform the configured power action when the key is pressed.
	 * @param {KeyDownEvent} ev - The event object.
	 */
	onKeyDown(ev) {
		const connection = this.getConnection(ev.action.id);
		if (!connection) {
			ev.action.showAlert();
			return;
		}

		const settings = ev.payload.settings;
		const zone = /** @type {number} */ (settings.zone) || 0;
		const powerAction = settings.powerAction || "toggle";

		const actionMap = {
			toggle: undefined,
			on: true,
			off: false,
		};

		connection.setPower(actionMap[powerAction], zone) || ev.action.showAlert();
	}

	/**
	 * Handle a receiver power status changing, update actions accordingly.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverPowerChanged(ev) {
		if (!ev.actions) return;

		Promise.all(ev.actions.map(async (action) => updateActionState(action, ev.connection, ev.zone)));
	}
}

/**
 * Update the state of an action based on the receiver's power status.
 * @param {Action} action - The action object.
 * @param {AVRConnection} [connection] - The receiver connection object.
 * @param {number} [zone] - The zone that the power status changed for
 */
async function updateActionState(action, connection, zone) {
	const actionZone = (/** @type {ActionSettings} */ (await action.getSettings())).zone || 0;
	if (zone !== undefined && zone !== actionZone) { return; }

	const { power } = connection !== undefined ? connection.status.zones[actionZone] : {};

	const state = power !== undefined ? power ? 0 : 1 : 1;
	if (action.isKey()) {
		action.setState(state);
	}
}