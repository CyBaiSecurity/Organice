// iOS reports a separate authorization number. 2 is authorized and 3 is provisional.
// Provisional means the notification is quiet until the person allows alerts.
// Expo's shared status field is not enough on iOS, so the number is checked too.
const IOS_AUTHORIZED = 2;
const IOS_PROVISIONAL = 3;

export type NotificationPlatform = 'ios' | 'android' | 'web';

export type NotificationAccess = {
  canSchedule: boolean;
  canAskAgain: boolean;
  channelOff: boolean;
};

export function notificationAccess(input: {
  platform: NotificationPlatform;
  status: string;
  iosStatus?: number;
  canAskAgain: boolean;
  channelOff?: boolean;
}): NotificationAccess {
  const canSchedule =
    input.platform === 'ios'
      ? input.iosStatus === IOS_AUTHORIZED || input.iosStatus === IOS_PROVISIONAL
      : input.platform === 'android' && input.status === 'granted';
  return {
    canSchedule,
    canAskAgain: input.canAskAgain,
    channelOff: canSchedule && input.channelOff === true,
  };
}
