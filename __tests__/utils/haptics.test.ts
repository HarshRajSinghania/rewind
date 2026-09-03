// NOTE: jest.resetModules() + require() below is deliberate. utils/haptics keeps
// module-level debounce state (lastAlignmentHaptic), so each test gets a fresh
// copy. After a reset, `import * as Haptics` at the top of this file would point
// at STALE mock fns — always assert via jest.requireMock (same instance the
// fresh utils/haptics is bound to).

let haptics: typeof import('@/utils/haptics').haptics;
let ExpoHaptics: {
  impactAsync: jest.Mock;
  notificationAsync: jest.Mock;
  selectionAsync: jest.Mock;
};
let now = 10_000;

beforeEach(() => {
  jest.resetModules();
  now = 10_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  haptics = require('@/utils/haptics').haptics;
  ExpoHaptics = jest.requireMock('expo-haptics');
  jest.clearAllMocks();
});

afterEach(() => {
  (Date.now as unknown as jest.Mock).mockRestore();
});

describe('haptics', () => {
  it('routes shutter/tap/success/warning/error to expo-haptics', () => {
    haptics.shutter();
    haptics.tap();
    haptics.success();
    haptics.warning();
    haptics.error();
    expect(ExpoHaptics.impactAsync).toHaveBeenCalledTimes(2);
    expect(ExpoHaptics.notificationAsync).toHaveBeenCalledTimes(3);
  });

  it('fires high alignment scores immediately via selection feedback', () => {
    haptics.alignment(0.9);
    haptics.alignment(0.95);
    expect(ExpoHaptics.selectionAsync).toHaveBeenCalledTimes(2);
  });

  it('debounces low scores at 400ms and mid scores at 200ms', () => {
    haptics.alignment(0.1); // fires (last=0, now=10000)
    expect(ExpoHaptics.impactAsync).toHaveBeenCalledTimes(1);

    now += 100;
    haptics.alignment(0.1); // suppressed
    expect(ExpoHaptics.impactAsync).toHaveBeenCalledTimes(1);

    now += 150; // 250ms since last → mid tier (200ms) fires
    haptics.alignment(0.5);
    expect(ExpoHaptics.impactAsync).toHaveBeenCalledTimes(2);

    now += 100;
    haptics.alignment(0.1); // only 100ms since last → suppressed
    expect(ExpoHaptics.impactAsync).toHaveBeenCalledTimes(2);
  });
});
