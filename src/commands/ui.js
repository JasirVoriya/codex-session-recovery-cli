import { launchTui } from '../tui/app.js';

export async function runUi(options = {}) {
  await launchTui(options);
}
