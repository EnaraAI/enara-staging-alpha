export function stripMongoFields<T extends Record<string, unknown>>(obj: T) {
  const { _id, __v, createdAt, updatedAt, ...rest } = obj;
  return rest;
}

export function toPlainObject(doc: { toObject(): unknown }) {
  return stripMongoFields(doc.toObject() as Record<string, unknown>);
}
