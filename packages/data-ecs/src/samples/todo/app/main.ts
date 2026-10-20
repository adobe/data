import { createApp, defineElements } from "./app.js";

/** The todo sample's page: its markup holds the fixed elements, and the app's world drives them. */

defineElements();
createApp(document.body);
