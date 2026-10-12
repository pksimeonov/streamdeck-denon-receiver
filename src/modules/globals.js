import streamDeck from "@elgato/streamdeck";

/** @typedef {import("./tracker").ReceiverList} ReceiverList */

/**
 * The receiver that new (unconfigured) actions use automatically.
 * Either a discovered receiver (uuid) or a manually configured IP address.
 * @typedef {Object} DefaultReceiver
 * @property {string} [uuid] - The UUID of a discovered receiver
 * @property {string} [manualIp] - A manually configured IP address
 * @property {string} [name] - The display name of the receiver
 */

/**
 * @typedef {Object} PluginGlobalSettings
 * @property {ReceiverList} [receiverList] - Cache of receivers found via SSDP
 * @property {DefaultReceiver} [defaultReceiver] - The receiver new actions use automatically
 */

/** @type {PluginGlobalSettings | undefined} */
let cache;

/**
 * Writes are chained so that concurrent updates never overwrite each other.
 * @type {Promise<void>}
 */
let writeChain = Promise.resolve();

/**
 * In-memory copy of the plugin's global settings, written back serially.
 */
export const GlobalSettings = {
	/**
	 * Load the global settings from Stream Deck. Call once after connecting.
	 * @returns {Promise<PluginGlobalSettings>}
	 */
	async load() {
		cache = /** @type {PluginGlobalSettings} */ (await streamDeck.settings.getGlobalSettings()) || {};
		return cache;
	},

	/**
	 * Get the cached global settings.
	 * @returns {PluginGlobalSettings}
	 */
	get() {
		return cache || {};
	},

	/**
	 * Merge a patch into the global settings and persist it.
	 * @param {Partial<PluginGlobalSettings>} patch
	 * @returns {Promise<void>}
	 */
	update(patch) {
		cache = { ...(cache || {}), ...patch };
		const snapshot = cache;
		writeChain = writeChain
			.then(() => streamDeck.settings.setGlobalSettings(snapshot))
			.catch((error) => streamDeck.logger.error(`Failed to write global settings: ${error}`));
		return writeChain;
	}
};
