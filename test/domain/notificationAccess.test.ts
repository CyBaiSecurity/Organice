import assert from 'node:assert/strict';
import { test } from 'node:test';

import { notificationAccess } from '../../src/domain/notificationAccess.ts';

test('Android can schedule only when the permission status is granted', () => {
  assert.equal(notificationAccess({ platform: 'android', status: 'granted', canAskAgain: true }).canSchedule, true);
  assert.equal(notificationAccess({ platform: 'android', status: 'denied', canAskAgain: false }).canSchedule, false);
  assert.equal(notificationAccess({ platform: 'android', status: 'undetermined', canAskAgain: true }).canSchedule, false);
});

test('iOS can schedule when authorized or provisional, and not when the choice is still open', () => {
  assert.equal(notificationAccess({ platform: 'ios', status: 'granted', iosStatus: 2, canAskAgain: true }).canSchedule, true);
  assert.equal(notificationAccess({ platform: 'ios', status: 'granted', iosStatus: 3, canAskAgain: true }).canSchedule, true);
  assert.equal(notificationAccess({ platform: 'ios', status: 'undetermined', iosStatus: 0, canAskAgain: true }).canSchedule, false);
  assert.equal(notificationAccess({ platform: 'ios', status: 'denied', iosStatus: 1, canAskAgain: false }).canSchedule, false);
  assert.equal(notificationAccess({ platform: 'ios', status: 'granted', iosStatus: 4, canAskAgain: true }).canSchedule, false);
});

test('a web target cannot schedule, and a blocked channel matters only after permission is granted', () => {
  assert.equal(notificationAccess({ platform: 'web', status: 'granted', canAskAgain: false }).canSchedule, false);
  const blocked = notificationAccess({ platform: 'android', status: 'granted', canAskAgain: true, channelOff: true });
  assert.equal(blocked.canSchedule, true);
  assert.equal(blocked.channelOff, true);
  const denied = notificationAccess({ platform: 'android', status: 'denied', canAskAgain: false, channelOff: true });
  assert.equal(denied.channelOff, false);
});
