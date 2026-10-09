// @ts-check
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

/** Copy the bundled notification recording without changing its sound. */
export function buildNotificationSound(directory) {
  copyFileSync(
    new URL('../assets/notifications/notification-source.wav', import.meta.url),
    join(directory, 'notification.wav')
  );
}
