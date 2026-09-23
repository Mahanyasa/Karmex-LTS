const same = (a, b) => a == null && b == null || String(a?._id || a) === String(b?._id || b);
function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((part) => matches(document, part));
    const parts = key.split(".");
    let actual = document[parts[0]];
    if (parts.length > 1 && Array.isArray(actual)) return actual.some((entry) => matches(entry, { [parts.slice(1).join(".")]: value }));
    if (value && typeof value === "object" && !(value instanceof Date) && !value._bsontype) {
      if (value.$elemMatch) return (actual || []).some((entry) => matches(entry, value.$elemMatch));
      if (value.$in) return value.$in.some((entry) => same(actual, entry));
      if (value.$gt) return actual > value.$gt;
      if (value.$ne !== undefined) return !same(actual, value.$ne);
    }
    return same(actual, value);
  });
}
function query(value) {
  return { populate() { return this; }, select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
}
module.exports = { matches, query };
