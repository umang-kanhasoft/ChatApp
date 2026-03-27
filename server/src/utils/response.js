const attachRequestMeta = (res, meta) => {
  if (!res?.req?.requestId && !meta) {
    return undefined;
  }

  return {
    ...(meta || {}),
    ...(res?.req?.requestId ? { requestId: res.req.requestId } : {}),
  };
};

export const ok = (res, data, meta = undefined) => {
  res.status(200).json({ success: true, data, meta: attachRequestMeta(res, meta) });
};

export const created = (res, data, meta = undefined) => {
  res.status(201).json({ success: true, data, meta: attachRequestMeta(res, meta) });
};
