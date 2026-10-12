import streamDeck, { action } from "@elgato/streamdeck";
/** @typedef {import("@elgato/streamdeck").KeyDownEvent} KeyDownEvent */
/** @typedef {import("@elgato/streamdeck").WillAppearEvent} WillAppearEvent */
/** @typedef {import("@elgato/streamdeck").Action} Action */
/** @typedef {import("@elgato/streamdeck").SendToPluginEvent} SendToPluginEvent */

import { PluginAction } from "./action";
/** @typedef {import("./action").ActionSettings} ActionSettings */

/** @typedef {import("../modules/connection").AVRConnection} AVRConnection */
/** @typedef {import("../modules/connection").ReceiverEvent} ReceiverEvent */
/** @typedef {import("../modules/connection").DynamicVolume} DynamicVolume */

const dynVolStates = {
	OFF: 1,
	LIT: 2,
	MED: 3,
	HEV: 4
};

@action({ UUID: "com.pksimeonov.denon-receiver.dynvol" })
export class DynVolAction extends PluginAction {
	/**
	 * Redraw the action from its receiver's current state.
	 * @param {Action} action - The action object.
	 */
	refreshActionState(action) {
		updateActionStatus(action, this.getConnection(action.id));
	}

	/**
	 * Perform the configured dynamic volume action when the key is pressed.
	 * @param {KeyDownEvent} ev - The event object.
	 */
	onKeyDown(ev) {
		const connection = this.getConnection(ev.action.id);
		if (!connection) {
			ev.action.showAlert();
			return;
		}

		const currentDynamicVolumeState = dynVolStates[connection.status.zones[0].dynamicVolume || "OFF"];
		let newDynamicVolumeState = currentDynamicVolumeState + 1;
		if (newDynamicVolumeState > 4) newDynamicVolumeState = 1;
		let newDynamicVolume = /** @type {DynamicVolume} */ (Object.keys(dynVolStates)[newDynamicVolumeState - 1]);

		connection.setDynamicVolume(newDynamicVolume) || ev.action.showAlert();
	}

	/**
	 * Handle a receiver dynamic volume status changing, update actions accordingly.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverDynamicVolumeChanged(ev) {
		if (!ev.actions) return;

		Promise.all(ev.actions.map(async (action) => updateActionStatus(action, ev.connection)));
	}
}

/**
 * Update the state of an action based on the receiver's dynamic volume status.
 * @param {Action} action - The action object.
 * @param {AVRConnection} [connection] - The receiver connection object.
 */
async function updateActionStatus(action, connection) {
	/** @type {DynamicVolume} */
	const dynamicVolume = connection !== undefined ? connection.status.zones[0].dynamicVolume : undefined;

	if (action.isKey() === false) return;

	if (dynamicVolume === undefined) {
		action.setState(0); // Unknown state
		return;
	}

	action.setState(dynVolStates[dynamicVolume]);
}