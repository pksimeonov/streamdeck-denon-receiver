import streamDeck, { action } from "@elgato/streamdeck";
/** @typedef {import("@elgato/streamdeck").Action} Action */
/** @typedef {import("@elgato/streamdeck").WillAppearEvent} WillAppearEvent */
/** @typedef {import("@elgato/streamdeck").SendToPluginEvent} SendToPluginEvent */
/** @typedef {import("@elgato/streamdeck").DialRotateEvent} DialRotateEvent */
/** @typedef {import("@elgato/streamdeck").DialDownEvent} DialDownEvent */
/** @typedef {import("@elgato/streamdeck").KeyDownEvent} KeyDownEvent */
/** @typedef {import("@elgato/streamdeck").TouchTapEvent} TouchTapEvent */

import { PluginAction } from "./action";
/** @typedef {import("./action").ActionSettings} ActionSettings */

/** @typedef {import("../modules/connection").AVRConnection} AVRConnection */
/** @typedef {import("../modules/connection").ReceiverEvent} ReceiverEvent */

/** Smaller variants of the icons for the dial's circle */
const circleImages = {
	unmuted: "imgs/actions/volume/circle-unmuted",
	muted: "imgs/actions/volume/circle-muted"
};

const images = {
	unmuted: "imgs/actions/volume/dial-unmuted",
	muted: "imgs/actions/volume/dial-muted"
};

/**
 * The image last set on each dial's circle, so it is only sent when it changes.
 * Stream Deck doesn't reliably use the manifest's Encoder.Icon, so the plugin sets it.
 * @type {Map<string, string>}
 */
const dialImages = new Map();

/**
 * Set the image in a dial's circle, if it changed.
 * @param {Action} action - The dial action.
 * @param {string} image - The image path, without the file extension.
 */
function setDialImage(action, image) {
	if (dialImages.get(action.id) === image) return;
	dialImages.set(action.id, image);
	action.setImage(`${image}.svg`);
}

/**
 * The Volume action class.
 * @extends {PluginAction}
 */
@action({ UUID: "com.pksimeonov.denon-receiver.volume" })
export class VolumeAction extends PluginAction {
	/**
	 * Redraw the action from its receiver's current state.
	 * @param {Action} action - The action object.
	 */
	refreshActionState(action) {
		updateActionState(action, this.getConnection(action.id));
	}

	/**
	 * Adjust the volume when the dial is rotated.
	 * @param {DialRotateEvent} ev - The event object.
	 */
	onDialRotate(ev) {
		/** @type {ActionSettings} */
		const settings = ev.payload.settings;
		const stepSize = settings.stepSize || 0.5;
		const delta = ev.payload.ticks * stepSize;

		this.getConnection(ev.action.id)?.changeVolume(delta, settings.zone) || ev.action.showAlert();
	}

	/**
	 * Toggle mute when the dial is pressed.
	 * @param {DialDownEvent} ev - The event object.
	 */
	onDialDown(ev) {
		/** @type {ActionSettings} */
		const settings = ev.payload.settings;

		this.getConnection(ev.action.id)?.setMute(undefined, settings.zone) || ev.action.showAlert();
	}

	/**
	 * Toggle mute when the touch screen is tapped.
	 * @param {TouchTapEvent} ev - The event object.
	 */
	onTouchTap(ev) {
		/** @type {ActionSettings} */
		const settings = ev.payload.settings;

		this.getConnection(ev.action.id)?.setMute(undefined, settings.zone) || ev.action.showAlert();
	}

	/**
	 * Change the volume when the key is pressed.
	 * @param {KeyDownEvent} ev - The event object.
	 */
	onKeyDown(ev) {
		const connection = this.getConnection(ev.action.id);
		if (!connection) {
			ev.action.showAlert();
			return;
		}

		/** @type {ActionSettings} */
		const settings = ev.payload.settings;

		// Default to "toggleMute" if no volume action is set
		const volumeAction = settings.volumeAction || "toggleMute";

		switch (volumeAction) {
			case "set":
				if (settings.volumeLevel !== undefined && settings.volumeLevel > 0) {
					connection.changeVolumeAbsolute(settings.volumeLevel, settings.zone) || ev.action.showAlert();
				} else {
					ev.action.showAlert();
				}
				break;
			case "up":
				connection.changeVolumeUp(settings.zone) || ev.action.showAlert();
				break;
			case "down":
				connection.changeVolumeDown(settings.zone) || ev.action.showAlert();
				break;
			case "toggleMute":
				connection.setMute(undefined, settings.zone) || ev.action.showAlert();
				break;
			case "mute":
				connection.setMute(true, settings.zone) || ev.action.showAlert();
				break;
			case "unmute":
				connection.setMute(false, settings.zone) || ev.action.showAlert();
				break;
		}
	}

	/**
	 * Handle a receiver volume changing.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverVolumeChanged(ev) {
		if (!ev.actions) return;

		Promise.all(ev.actions.map((action) => updateActionState(action, ev.connection, ev.zone)));
	}

	/**
	 * Handle a receiver mute status changing.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverMuteChanged(ev) {
		if (!ev.actions) return;

		Promise.all(ev.actions.map((action) => updateActionState(action, ev.connection, ev.zone)));
	}

	/**
	 * Handle a receiver power status changing, update actions accordingly.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverPowerChanged(ev) {
		if (!ev.actions) return;

		Promise.all(ev.actions.map((action) => updateActionState(action, ev.connection, ev.zone)));
	}
}

/**
 * Update the state of an action based on the receiver's volume & mute status.
 * @param {Action} action - The action object.
 * @param {AVRConnection} [connection] - The receiver connection object.
 * @param {number} [zone] - The zone that the volume status changed for
 */
async function updateActionState(action, connection, zone) {
	/** @type {ActionSettings} */
	const settings = await action.getSettings();
	const actionZone = settings.zone || 0;
	if (zone !== undefined && zone !== actionZone) { return; }

	const { muted, volume, maxVolume, power } = connection !== undefined
		? connection.status.zones[actionZone] : {};

	if (action.isDial()) {
		const indicatorValue = volume !== undefined && maxVolume !== undefined
			? muted || !power ? 0 : (volume / maxVolume) * 100 : 0;

		const value = power !== undefined ? !power ? "Off" : muted ? "Muted" : `Vol: ${volume}` : "";

		const icon = power !== undefined ? muted || !power ? images.muted : images.unmuted : images.muted;

		action.setFeedback({
			indicator: { value: indicatorValue },
			value: value,
			icon: icon
		});
		setDialImage(action, muted || !power ? circleImages.muted : circleImages.unmuted);
	} else if (action.isKey()) {
		const volumeAction = settings.volumeAction || "toggleMute";

		let state = 0;

		switch(volumeAction) {
			case "up":
				state = 2;
				break;
			case "down":
				state = 3;
				break;
			default:
				if (power === undefined || !power || muted) {
					state = 1;
				}
		}

		action.setState(state);

		// Show the current volume on the button display
		const title = power !== undefined
			? !power ? "Off" : muted ? "Muted" : `${volume}`
			: "";
		action.setTitle(title);
	}
}
