import { removeSessionCache } from './sessionStore';
import { uninstallTowerIntegration } from './towerSetup';

async function main(): Promise<void> {
  await runStep('remove the Tower integration', uninstallTowerIntegration);
  await runStep('remove the session cache', removeSessionCache);
}

async function runStep(description: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (err) {
    console.error(`Delta Flow: could not ${description} — ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

void main();
