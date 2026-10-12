import streamDeck, { LogLevel } from "@elgato/streamdeck";
/** @typedef {import("@elgato/streamdeck").Logger} Logger */
/** @typedef {import("@elgato/streamdeck").SystemDidWakeUpEvent} SystemDidWakeUpEvent */

const logger = streamDeck.logger.createScope("Plugin");
// logger.setLevel(LogLevel.TRACE);

import { AVRTracker } from "./modules/tracker";
AVRTracker.setLogger(logger);

import { GlobalSettings } from "./modules/globals";
import { retryWaitingActions, setDefaultReceiver } from "./actions/action";

import { VolumeAction } from "./actions/volume";
import { PowerAction } from "./actions/power";
import { SourceAction } from "./actions/source";
import { DynVolAction } from "./actions/dynVol";
import { SubLevelAction } from "./actions/subLevel";
import { DynEQAction } from "./actions/dynEQ";


/** @typedef {import("./modules/connection").AVRConnection} AVRConnection */

/**
 * Plugin-level context for actions to access
 * @typedef {Object} PluginContext
 * @property {Record<ReceiverUUID, AVRConnection>} avrConnections - Maps receiver UUIDs to connections
 * @property {Logger} logger - Logger instance
 */

/** @typedef {string} ReceiverUUID */

/** @type {PluginContext} */
const plugin = {
    avrConnections: {},
    logger
};

streamDeck.actions.registerAction(new VolumeAction(plugin));
streamDeck.actions.registerAction(new PowerAction(plugin));
streamDeck.actions.registerAction(new SourceAction(plugin));
streamDeck.actions.registerAction(new DynVolAction(plugin));
streamDeck.actions.registerAction(new SubLevelAction(plugin));
streamDeck.actions.registerAction(new DynEQAction(plugin));

// Connect to the StreamDeck and kick-off the rest of the initialization
await streamDeck.connect();

// Load the default receiver and the receiver cache before actions try to connect
await GlobalSettings.load();
await AVRTracker.init();
retryWaitingActions();

// Retry waiting actions whenever discovery finds something
AVRTracker.on("updated", retryWaitingActions);
AVRTracker.on("scanned", () => {
    adoptOnlyReceiverAsDefault();
    retryWaitingActions();
});

// Follow receivers that moved to a new IP address
AVRTracker.on("ipChanged", (uuid, address) => {
    plugin.avrConnections[uuid]?.setHost(address);
});

/**
 * If no default receiver has been chosen yet and exactly one receiver is on the network,
 * use it, so that actions work without any setup.
 */
function adoptOnlyReceiverAsDefault() {
    if (GlobalSettings.get().defaultReceiver) return;

    const receivers = Object.entries(AVRTracker.getReceivers());
    if (receivers.length !== 1) return;

    const [uuid, receiver] = receivers[0];
    logger.info(`Using the only receiver found, ${receiver.name || receiver.currentIP}, as the default receiver.`);
    setDefaultReceiver({ uuid, name: receiver.name });
}

/**
 * Scan for receivers: a quick scan, followed by a longer one.
 * Between the two, that covers fast (wired) as well as slower (wireless) receivers.
 */
function scanForReceivers() {
    AVRTracker.searchForReceivers(1, 1)
        .then(() => AVRTracker.searchForReceivers(3, 3))
        .catch((error) => logger.error(`Receiver scan failed: ${error.message}`));
}

// Always scan on startup: it finds new receivers and refreshes the addresses of cached ones
scanForReceivers();

// When the system wakes up, re-connect to receivers and look for address changes
streamDeck.system.onSystemDidWakeUp(() => {
    logger.info("System woke up, refreshing connections.");
    Object.values(plugin.avrConnections).forEach(connection => connection.reconnect());
    scanForReceivers();
});
