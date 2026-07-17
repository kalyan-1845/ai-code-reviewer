const ALLOWED_NOTIFICATION_PRIORITIES = ['low', 'medium', 'high', 'critical'];

function validateNotificationPriority(priority) {
  if (priority === undefined || priority === null) {
    return { valid: true, value: 'medium' };
  }
  if (typeof priority !== 'string') {
    return { valid: false, error: 'Notification priority must be a string.' };
  }
  const normalized = priority.toLowerCase().trim();
  if (!ALLOWED_NOTIFICATION_PRIORITIES.includes(normalized)) {
    return {
      valid: false,
      error: `Invalid notification priority "${priority}". Must be one of: ${ALLOWED_NOTIFICATION_PRIORITIES.join(', ')}`
    };
  }
  return { valid: true, value: normalized };
}

export { validateNotificationPriority, ALLOWED_NOTIFICATION_PRIORITIES };
