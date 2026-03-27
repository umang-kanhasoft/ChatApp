export const decodeCursor = (cursor) => {
  if (!cursor) return null;
  try {
    return new Date(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

export const encodeCursor = (date) => {
  if (!date) return null;
  return Buffer.from(new Date(date).toISOString()).toString('base64url');
};
