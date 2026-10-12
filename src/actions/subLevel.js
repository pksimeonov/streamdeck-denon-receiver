import { action } from "@elgato/streamdeck";
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

const CHANNEL = "SW";
const ICON = "imgs/actions/sublevel/dial";

/**
 * The Subwoofer Level action class.
 * Controls the subwoofer channel level (Options → Channel Level),
 * which is a runtime offset that does not affect MultEQ calibration.
 *
 * Can be placed on:
 * - A dial for direct adjustment (rotate to adjust, press to reset to 0dB)
 * - A key as a companion display (shows current level, press to reset to 0dB)
 * @extends {PluginAction}
 */
@action({ UUID: "com.pksimeonov.denon-receiver.sublevel" })
export class SubLevelAction extends PluginAction {
	/**
	 * Redraw the action from its receiver's current state.
	 * @param {Action} action - The action object.
	 */
	refreshActionState(action) {
		updateActionState(action, this.getConnection(action.id));
	}

	/**
	 * Adjust the subwoofer level when the dial is rotated.
	 * @param {DialRotateEvent} ev - The event object.
	 */
	onDialRotate(ev) {
		/** @type {ActionSettings} */
		const settings = ev.payload.settings;
		const stepSize = settings.stepSize || 0.5;
		const delta = ev.payload.ticks * stepSize;

		this.getConnection(ev.action.id)?.changeChannelLevel(CHANNEL, delta) || ev.action.showAlert();
	}

	/**
	 * Reset subwoofer level to 0dB when the dial is pressed.
	 * @param {DialDownEvent} ev - The event object.
	 */
	onDialDown(ev) {
		this.getConnection(ev.action.id)?.setChannelLevel(CHANNEL, 50) || ev.action.showAlert();
	}

	/**
	 * Reset subwoofer level to 0dB when the touch screen is tapped.
	 * @param {TouchTapEvent} ev - The event object.
	 */
	onTouchTap(ev) {
		this.getConnection(ev.action.id)?.setChannelLevel(CHANNEL, 50) || ev.action.showAlert();
	}

	/**
	 * Reset subwoofer level to 0dB when the button is pressed (companion display mode).
	 * @param {KeyDownEvent} ev - The event object.
	 */
	onKeyDown(ev) {
		this.getConnection(ev.action.id)?.setChannelLevel(CHANNEL, 50) || ev.action.showAlert();
	}

	/**
	 * Handle a receiver channel level changing.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverChannelLevelChanged(ev) {
		if (!ev.actions) return;

		Promise.all(ev.actions.map((action) => updateActionState(action, ev.connection)));
	}

	/**
	 * Handle a receiver power status changing.
	 * @param {ReceiverEvent} ev - The event object.
	 */
	onReceiverPowerChanged(ev) {
		if (!ev.actions) return;

		Promise.all(ev.actions.map((action) => updateActionState(action, ev.connection)));
	}
}

/**
 * Format the dB offset as a display string.
 * @param {number|undefined} dbOffset - The dB offset from 0
 * @param {boolean|undefined} power - Whether the receiver is powered on
 * @returns {string}
 */
function formatLevel(dbOffset, power) {
	if (power === undefined) return "";
	if (!power) return "Off";
	if (dbOffset === undefined) return "--";
	const sign = dbOffset >= 0 ? "+" : "";
	return `${sign}${dbOffset}dB`;
}

/**
 * Update the state of an action based on the receiver's subwoofer channel level.
 * @param {Action} action - The action object.
 * @param {AVRConnection} [connection] - The receiver connection object.
 */
async function updateActionState(action, connection) {
	const { power, channelLevels } = connection !== undefined
		? connection.status.zones[0] : {};

	const rawLevel = channelLevels?.[CHANNEL];
	const dbOffset = rawLevel !== undefined ? rawLevel - 50 : undefined;

	if (action.isDial()) {
		const value = formatLevel(dbOffset, power);

		// Map the -12 to +12 dB range to 0-100 for the indicator
		const indicatorValue = rawLevel !== undefined && power
			? ((rawLevel - 38) / (62 - 38)) * 100
			: 0;

		action.setFeedback({
			indicator: {
				value: indicatorValue
			},
			value: value,
			icon: ICON
		});
	} else if (action.isKey()) {
		// Companion display button — show the current level as the title
		action.setTitle(formatLevel(dbOffset, power));
	}
}
