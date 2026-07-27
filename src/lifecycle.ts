import { uninstallTowerIntegration } from './towerSetup';

async function main(): Promise<void> {
  try {
    await uninstallTowerIntegration();
  } catch (err) {
    console.error(`Delta Flow: could not remove the Tower integration — ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

void main();
