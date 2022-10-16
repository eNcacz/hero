import { Helpers, Hero } from '@ulixee/hero-testing';
import { InternalPropertiesSymbol } from '@ulixee/hero/lib/internal';
import CoreSession from '@ulixee/hero/lib/CoreSession';

let koaServer: Helpers.ITestKoaServer;
beforeAll(async () => {
  koaServer = await Helpers.runKoaServer();
});
afterAll(() => Promise.all([Helpers.afterAll(), Helpers.afterAll()]));
afterEach(() => Promise.all([Helpers.afterEach(), Helpers.afterEach()]));

describe('basic snippets tests', () => {
  it('collects snippets for extraction', async () => {
    const [hero] = await openBrowser();
    await hero.goto(`${koaServer.baseUrl}/`);

    await hero.setData('data', { value: true });
    await hero.setData('text', 'string');
    await hero.setData('number', 1);

    await expect(hero.getData('data')).resolves.toMatchObject({ value: true });
    await expect(hero.getData('text')).resolves.toBe('string');
    await expect(hero.getData('number')).resolves.toBe(1);
  });
});

async function openBrowser(path?: string): Promise<[Hero, CoreSession]> {
  const hero = new Hero();
  const coreSession = await hero[InternalPropertiesSymbol].coreSessionPromise;
  Helpers.needsClosing.push(hero);
  if (path) {
    await hero.goto(`${koaServer.baseUrl}${path}`);
    await hero.waitForPaintingStable();
  }
  return [hero, coreSession];
}