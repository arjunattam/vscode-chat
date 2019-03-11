export interface IDNDStatus {
  dnd_enabled: boolean;
  next_dnd_start_ts: number;
  next_dnd_end_ts: number;

  // The following fields are only available for the
  // DND_UPDATED_SELF event.
  snooze_enabled?: boolean;
  snooze_endtime?: number;
  snooze_remaining?: number;
}

export interface IDNDStatusForUser {
  [userId: string]: IDNDStatus;
}
