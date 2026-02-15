import { remote, type Browser } from 'webdriverio';
import type { LaunchOptions } from '@zeitzeuge/utils';

export type { Browser } from 'webdriverio';

export async function launchBrowser(options: LaunchOptions = {}): Promise<Browser> {
  const { headless = true } = options;

  const browser = await remote({
    capabilities: {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: [
          ...(headless ? ['--headless=new'] : []),
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
        ],
      },
    },
    logLevel: 'warn',
  });

  return browser;
}

export async function closeBrowser(browser: Browser): Promise<void> {
  try {
    await browser.deleteSession();
  } catch {
    // Ignore cleanup errors
  }
}
