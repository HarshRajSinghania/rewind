import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasPin, savePin, verifyPin, getAttemptInfo, clearPin } from '@/utils/pin';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('pin', () => {
  it('reports no PIN initially and after clearing', async () => {
    expect(await hasPin()).toBe(false);
    await savePin('1234');
    expect(await hasPin()).toBe(true);
    await clearPin();
    expect(await hasPin()).toBe(false);
  });

  it('does not store the plaintext PIN', async () => {
    await savePin('1234');
    const raw = await AsyncStorage.getItem('@rewind/app-pin');
    expect(raw).not.toBe('1234');
    expect(raw).not.toBeNull();
  });

  it('verifies the correct PIN and resets attempts', async () => {
    await savePin('1234');
    await verifyPin('0000'); // one failed attempt
    const ok = await verifyPin('1234');
    expect(ok).toEqual({ success: true });
    const info = await getAttemptInfo();
    expect(info).toEqual({ locked: false, remainingAttempts: 5 });
  });

  it('counts down remaining attempts on failure', async () => {
    await savePin('1234');
    expect(await verifyPin('0000')).toEqual({ success: false, remainingAttempts: 4 });
    expect(await verifyPin('0000')).toEqual({ success: false, remainingAttempts: 3 });
  });

  it('locks out after 5 failed attempts', async () => {
    await savePin('1234');
    for (let i = 0; i < 4; i++) await verifyPin('0000');
    const fifth = await verifyPin('0000');
    expect(fifth).toEqual({ success: false, locked: true });

    const info = await getAttemptInfo();
    expect(info.locked).toBe(true);
    expect(info.lockoutUntil).toBeGreaterThan(Date.now());

    // Correct PIN is rejected while locked
    expect(await verifyPin('1234')).toEqual({ success: false, locked: true });
  });

  it('clears a legacy plaintext PIN instead of accepting it', async () => {
    await AsyncStorage.setItem('@rewind/app-pin', 'plaintext');
    expect(await hasPin()).toBe(false);
    expect(await AsyncStorage.getItem('@rewind/app-pin')).toBeNull();
  });
});
