export type RepeatFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export const getRepeatFrequency = (repeatRule: string | undefined): RepeatFrequency | null => {
  const frequency = repeatRule?.match(/(?:^|;)(?:RRULE:)?FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(?:;|$)/)?.[1];
  return frequency === "DAILY" || frequency === "WEEKLY" || frequency === "MONTHLY" || frequency === "YEARLY"
    ? frequency
    : null;
};

export const getRepeatUntil = (repeatRule: string | undefined): string | null => {
  const value = repeatRule?.match(/(?:^|;)UNTIL=(\d{4})-?(\d{2})-?(\d{2})(?:T\d{6}Z)?(?:;|$)/);
  return value ? `${value[1]}-${value[2]}-${value[3]}` : null;
};

export const buildRepeatRule = (frequency: RepeatFrequency | null, until: string | null): string => {
  if (!frequency) {
    return "";
  }

  return `RRULE:FREQ=${frequency}${until ? `;UNTIL=${until.replace(/-/g, "")}` : ""}`;
};
